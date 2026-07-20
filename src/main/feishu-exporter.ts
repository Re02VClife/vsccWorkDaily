import axios from 'axios'
import { loadConfig } from './config'
import type { WorkSnippet } from '../shared/types'

const FEISHU_API = 'https://open.feishu.cn/open-apis'

// 缓存 token
let cachedToken = ''
let tokenExpiry = 0

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  try {
    const res = await axios.post(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
      app_id: appId,
      app_secret: appSecret
    }, { timeout: 10000 })

    if (res.data.code !== 0) {
      throw new Error(`飞书认证失败(code=${res.data.code}): ${res.data.msg}`)
    }

    cachedToken = res.data.tenant_access_token
    tokenExpiry = Date.now() + (res.data.expire - 60) * 1000
    console.log('[feishu] 获取 token 成功')
    return cachedToken
  } catch (e: any) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message
    throw new Error(`飞书认证请求失败: ${detail}`)
  }
}

export async function exportToFeishu(reportJson: string): Promise<{ url: string; docId: string }> {
  const config = loadConfig()
  if (!config.feishu.appId || !config.feishu.appSecret) {
    throw new Error('飞书未配置，请在设置页面填写 App ID 和 App Secret')
  }

  const token = await getAccessToken(config.feishu.appId, config.feishu.appSecret)

  // 1. 创建文档
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const title = `${today} 工作日报`

  console.log('[feishu] 创建文档:', title)
  let docId: string, url: string
  try {
    const body: any = { title }
    if (config.feishu.docFolderToken) body.folder_token = config.feishu.docFolderToken

    const res = await axios.post(`${FEISHU_API}/docx/v1/documents`, body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000
    })

    if (res.data.code !== 0) {
      throw new Error(`创建文档失败(code=${res.data.code}): ${res.data.msg}`)
    }

    docId = res.data.data.document.document_id
    url = res.data.data.document.url || `https://bytedance.feishu.cn/docx/${docId}`
    console.log('[feishu] 文档创建成功:', docId, url)
  } catch (e: any) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message
    throw new Error(`创建飞书文档失败: ${detail}`)
  }

  // 2. 生成文档内容（直接用 JSON 格式转换的纯文本块）
  const report = JSON.parse(reportJson)
  const blocks: Array<{ type: string; text: string }> = []

  blocks.push({ type: 'h1', text: `${today} 工作日报` })
  blocks.push({ type: 'text', text: '' })

  // 概览
  const ov = report.overview || {}
  blocks.push({ type: 'h2', text: '📊 概览' })
  blocks.push({ type: 'text', text: `项目数: ${ov.projectCount || 0} | AI对话: ${ov.totalSessions || 0}轮 | 代码变更: ${ov.totalCodeChanges || 0}处` })
  blocks.push({ type: 'text', text: `总Token: ${((ov.totalTokens || 0) / 1000).toFixed(0)}K | 缓存命中: ${((ov.cacheHitTokens || 0) / 1000).toFixed(0)}K (${ov.cacheHitRate || 0}%)` })
  blocks.push({ type: 'text', text: `费用: ¥${(ov.totalCostRmb || 0).toFixed(2)} | 缓存节省: ¥${(ov.costSavedRmb || 0).toFixed(2)}` })

  // 各项目
  for (const proj of report.projects || []) {
    blocks.push({ type: 'h2', text: `🔧 ${proj.projectName || '未命名项目'}` })

    if (proj.progress?.length) {
      blocks.push({ type: 'h3', text: '📝 今日进展' })
      for (const p of proj.progress) {
        blocks.push({ type: 'bullet', text: p.content?.substring(0, 500) || '' })
      }
    }

    if (proj.codeChanges?.length) {
      blocks.push({ type: 'h3', text: '💻 代码产出' })
      for (const cc of proj.codeChanges) {
        const icon = cc.changeType === 'added' ? '✚' : cc.changeType === 'modified' ? '✎' : '✖'
        blocks.push({ type: 'bullet', text: `${icon} ${cc.filePath} (+${cc.linesAdded}/-${cc.linesRemoved}) → ${cc.description?.substring(0, 100)}` })
      }
    }

    // 问题与解决方案 — 两列对照
    if (proj.issues?.length || proj.solutions?.length) {
      blocks.push({ type: 'h3', text: '⚠️ 遇到的问题与解决方案' })
      const maxLen = Math.max(proj.issues?.length || 0, proj.solutions?.length || 0)
      for (let i = 0; i < maxLen; i++) {
        const issue = proj.issues?.[i]
        const solution = proj.solutions?.[i]
        const status = issue?.isSolved ? '✅已解决' : '❌未解决'
        const issueText = issue ? `${status} ${issue.content?.substring(0, 200)}` : ''
        const solutionText = solution ? `💡 ${solution.content?.substring(0, 200)}` : ''
        const combined = [issueText, solutionText].filter(Boolean).join('  |  ')
        if (combined) blocks.push({ type: 'bullet', text: combined })
      }
    }

    if (proj.tokenSummary) {
      blocks.push({ type: 'h3', text: '📈 Token 消耗' })
      const ts = proj.tokenSummary
      blocks.push({ type: 'text', text: `总计: ${((ts.total || 0) / 1000).toFixed(0)}K | 缓存命中: ${((ts.cacheHit || 0) / 1000).toFixed(0)}K | 命中率: ${ts.cacheHitRate || 0}% | 费用: ¥${(ts.costRmb || 0).toFixed(2)}` })
    }
  }

  // 3. 逐块写入文档
  console.log('[feishu] 写入', blocks.length, '个内容块')
  let failCount = 0
  for (let i = 0; i < blocks.length && failCount < 5; i++) {
    const block = blocks[i]
    const blockTypeMap: Record<string, string> = {
      h1: '3', h2: '4', h3: '5', text: '2', bullet: '12'
    }

    const body: any = {
      children: [{
        block_type: parseInt(blockTypeMap[block.type] || '2'),
        text: {
          elements: [{ text_run: { content: block.text || ' ', text_element_style: {} } }],
          style: {}
        }
      }]
    }

    // 标题块需要不同结构（Feishu 用 heading1/heading2/heading3，不是 h1/h2/h3）
    if (['h1', 'h2', 'h3'].includes(block.type)) {
      const headingMap: Record<string, { bt: number; key: string }> = {
        h1: { bt: 3, key: 'heading1' },
        h2: { bt: 4, key: 'heading2' },
        h3: { bt: 5, key: 'heading3' }
      }
      const h = headingMap[block.type]
      body.children[0] = {
        block_type: h.bt,
        [h.key]: {
          elements: [{ text_run: { content: block.text, text_element_style: {} } }],
          style: {}
        }
      }
    }

    // 列表块
    if (block.type === 'bullet') {
      body.children[0] = {
        block_type: 12,
        bullet: {
          elements: [{ text_run: { content: block.text, text_element_style: {} } }],
          style: {}
        }
      }
    }

    try {
      await axios.post(
        `${FEISHU_API}/docx/v1/documents/${docId}/blocks/${docId}/children`,
        body,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 10000
        }
      )
    } catch (e: any) {
      failCount++
      const errData = e.response?.data ? JSON.stringify(e.response.data).substring(0, 300) : e.message?.substring(0, 200)
      console.warn(`[feishu] 块 ${i} 写入失败:`, errData)
    }
  }

  if (failCount >= 5) {
    console.warn('[feishu] 部分内容写入失败，但文档已创建')
  }

  console.log('[feishu] 导出完成:', url)
  return { url, docId }
}

/**
 * 导出工作片段到飞书多维表格（甘特图）
 */
export async function exportToFeishuBitable(
  snippets: WorkSnippet[],
  projectName: string
): Promise<{ url: string; tableId: string }> {
  const config = loadConfig()
  if (!config.feishu.appId || !config.feishu.appSecret) {
    throw new Error('飞书未配置，请在设置页面填写 App ID 和 App Secret')
  }
  if (!config.feishu.baseAppToken || !config.feishu.baseTableId) {
    throw new Error('未配置飞书多维表格，请在设置页面填写 Base App Token 和 Table ID')
  }

  const token = await getAccessToken(config.feishu.appId, config.feishu.appSecret)
  const { baseAppToken, baseTableId } = config.feishu
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 1. 确保表格字段存在
  console.log('[feishu-bitable] 确保表格字段...')
  await ensureBitableFields(baseAppToken, baseTableId, token)

  // 2. 映射片段到记录
  const snippetTypeMap: Record<string, string> = {
    coding: '编码',
    discussion: '讨论',
    debug: '调试',
    docs: '文档'
  }

  const records = snippets.map(s => ({
    fields: {
      '工作内容': s.title?.substring(0, 300) || '',
      '项目名称': projectName,
      '开始时间': new Date(s.startTime).getTime(),
      '结束时间': new Date(s.endTime).getTime(),
      '工作类型': snippetTypeMap[s.snippetType] || s.snippetType,
      '详细描述': s.description?.substring(0, 800) || '',
      '状态': s.snippetType === 'debug' ? '卡住' : s.snippetType === 'discussion' ? '已完成' : '进行中'
    }
  }))

  // 3. 批量插入（每批最多 500 条）
  console.log('[feishu-bitable] 插入', records.length, '条记录...')
  const res = await axios.post(
    `${FEISHU_API}/bitable/v1/apps/${baseAppToken}/tables/${baseTableId}/records/batch_create`,
    { records },
    { headers, timeout: 30000 }
  )

  if (res.data.code !== 0) {
    throw new Error(`插入记录失败(code=${res.data.code}): ${res.data.msg}`)
  }

  const url = `https://bytedance.feishu.cn/base/${baseAppToken}?table=${baseTableId}`
  console.log('[feishu-bitable] 导出完成:', url)
  return { url, tableId: baseTableId }
}

/**
 * 确保多维表格中存在所需字段，缺失则创建
 */
async function ensureBitableFields(appToken: string, tableId: string, token: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 列出已有字段
  const listRes = await axios.get(
    `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { headers, timeout: 10000 }
  )

  if (listRes.data.code !== 0) {
    console.warn('[feishu-bitable] 无法列出字段:', listRes.data.msg)
    return // 跳过字段创建，直接尝试插入
  }

  const existingNames = new Set((listRes.data.data?.items || []).map((f: any) => f.field_name))

  const neededFields = [
    { field_name: '工作内容', type: 1 },
    { field_name: '项目名称', type: 1 },
    { field_name: '开始时间', type: 5 },   // datetime
    { field_name: '结束时间', type: 5 },   // datetime
    { field_name: '工作类型', type: 1 },
    { field_name: '详细描述', type: 1 },
    { field_name: '状态', type: 1 },
  ]

  for (const field of neededFields) {
    if (!existingNames.has(field.field_name)) {
      try {
        await axios.post(
          `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
          field,
          { headers, timeout: 10000 }
        )
        console.log('[feishu-bitable] 创建字段:', field.field_name)
      } catch (e: any) {
        console.warn('[feishu-bitable] 创建字段失败:', field.field_name, e.message)
      }
    }
  }
}
