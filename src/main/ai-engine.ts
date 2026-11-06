import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import { loadConfig } from './config'
import type { ReportContent, ManualInput } from '../shared/types'

// ==================== API 客户端 ====================

// 缓存
let anthropicClient: Anthropic | null = null
let lastKey = ''
// 存储已探测成功的 API 完整路径
let knownGoodPath = ''

/**
 * 检测 API 类型：Anthropic key 以 sk-ant- 开头，OpenAI 兼容 key 以 sk- 开头
 */
function detectApiType(apiKey: string): 'anthropic' | 'openai' {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic'
  return 'openai'
}

/**
 * 获取 API 路径列表（按优先级尝试）
 */
function getApiPaths(config: ReturnType<typeof loadConfig>): string[] {
  if (config.apiBaseUrl) return [config.apiBaseUrl]
  if (knownGoodPath) return [knownGoodPath]
  // DeepSeek 的两种可能路径
  return ['https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/v1/chat/completions']
}

// ==================== 底层调用 ====================

interface AIMessage {
  role: 'user' | 'assistant'
  content: string | any[]  // string for text-only, any[] for Anthropic multimodal
}

interface AIResponse {
  text: string
}

/**
 * 统一的 AI 调用接口 — 根据 key 类型自动选择 Anthropic SDK 或 OpenAI 兼容 API
 */
async function callAI(
  messages: AIMessage[],
  options: { model: string; maxTokens: number; temperature: number }
): Promise<AIResponse> {
  const config = loadConfig()
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || ''

  if (!apiKey) {
    throw new Error('未配置 API Key，请在设置页面添加 AI API Key')
  }

  const type = detectApiType(apiKey)
  const model = options.model || config.defaultModel

  // 重建 Anthropic 客户端（如果 key 变了）
  if (type === 'anthropic' && lastKey !== apiKey) {
    lastKey = apiKey
    anthropicClient = null
  }

  if (type === 'anthropic') {
    // ===== Anthropic SDK =====
    if (!anthropicClient) {
      anthropicClient = new Anthropic({ apiKey, baseURL: config.apiBaseUrl || undefined })
    }
    const response = await anthropicClient.messages.create({
      model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as any }))
    })
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
    return { text }
  } else {
    // ===== OpenAI 兼容 API (DeepSeek 等) =====

    if (lastKey !== apiKey) {
      knownGoodPath = ''
      lastKey = apiKey
    }

    const paths = config.apiBaseUrl
      ? [config.apiBaseUrl]
      : (knownGoodPath ? [knownGoodPath] : getApiPaths(config))

    let lastError: Error | null = null

    for (const baseUrl of paths) {
      const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/v1/chat/completions`
      try {
        const response = await axios.post(url, {
          model,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          messages: messages.map(m => ({ role: m.role, content: m.content }))
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        })
        const text = response.data?.choices?.[0]?.message?.content || ''
        if (!text) {
          // 尝试获取更详细的错误信息
          const finishReason = response.data?.choices?.[0]?.finish_reason || 'unknown'
          const errDetail = JSON.stringify(response.data).substring(0, 500)
          throw new Error(`AI 返回内容为空 (finish_reason: ${finishReason})——${errDetail}`)
        }
        // 记住成功的路径，下次直接用
        knownGoodPath = url
        return { text }
      } catch (e: any) {
        lastError = e
        // 记录第一个失败的详细错误
        if (e.response?.data) {
          console.error('[AI] API 响应错误:', JSON.stringify(e.response.data).substring(0, 500))
        }
      }
    }

    // 所有路径都失败
    const statusCode = (lastError as any)?.response?.status || (lastError as any)?.status || '?'
    const body = (lastError as any)?.response?.data || (lastError as any)?.data
    const errMsg = (lastError as any)?.error?.message || lastError?.message || String(lastError)
    throw new Error(
      `API 请求失败 (HTTP ${statusCode}): ` +
      `${errMsg?.substring(0, 300)}\n` +
      (body ? `响应体: ${JSON.stringify(body).substring(0, 500)}` : '')
    )
  }
}

// ==================== Prompt 模板 ====================

const MICRO_SUMMARY_PROMPT = `请总结以下 AI 编程助手对话片段的核心内容。

要求：
1. topic（1-2句话）：讨论了什么问题 / 做了什么任务
2. conclusion（1-2句话）：有什么产出、结论或进展
3. problem（可选）：过程中遇到了什么困难/错误（没有则省略此字段）
4. solution（可选）：是如何解决的（没有则省略此字段）
5. 严格输出 JSON，不要加 markdown 代码块：{"topic":"...","conclusion":"..."}

对话内容：
{content}`

const CODE_CHANGE_PROMPT = `请为以下 Git 代码变更写一句简洁的中文功能描述（20字以内）。

文件路径: {filePath}
变更类型: {changeType} (added=新增, modified=修改, deleted=删除)
行数变化: +{linesAdded}/-{linesRemoved}

Diff 摘要:
{diff}

仅输出描述文本，不要多余内容。`

const DAILY_REPORT_PROMPT = `你是一个工作日报助手。请根据以下信息生成一份详细的工作日报。

## 用户工作方向
机械臂 VLA（Vision-Language-Action）、机器人控制、嵌入式开发

## 项目信息
{projectContext}

## AI 对话记录（今日）
{conversationSummaries}

## 代码变更记录
{codeChanges}

## 用户编辑偏好（请参考这些编辑历史来调整描述的详细程度和风格）
{editFeedback}

## 用户手动补充的工作内容

{manualInput}

## 预计算数据（JSON — 直接复制到对应的 report 字段，不要修改任何数值）
{precomputedData}

请生成以下格式的 JSON 日报。严格按照 JSON Schema，所有字段必须存在：

{reportSchema}

注意：
- **overview 的 token 字段直接复制「预计算数据」中 tokenOverview 的值，一字不改**
- **aiConversations 字段直接复制「预计算数据」中 aiConversations 数组，一字不改**
- **codeChanges 字段直接使用下面「代码变更记录」中的每一条，只改 description，文件路径/行数不变**
- 如果代码变更记录为空或无 AI 对话，对应字段填空数组，不要编造数据
- 今日进展：从项目文档和对话摘要中提取
- 问题与解决方案：从项目文档和对话摘要中提取
- 语言：中文，技术名词可保留英文`

// ==================== 公开 API ====================

export async function generateMicroSummary(
  conversationContent: string,
  model?: string
): Promise<{ topic: string; conclusion: string; problem?: string; solution?: string }> {
  const config = loadConfig()
  const prompt = MICRO_SUMMARY_PROMPT.replace('{content}', conversationContent)

  const response = await callAI(
    [{ role: 'user', content: prompt }],
    { model: model || config.defaultModel, maxTokens: 1000, temperature: 0.3 }
  )

  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.topic && parsed.conclusion !== undefined) {
        return {
          topic: String(parsed.topic).substring(0, 100),
          conclusion: String(parsed.conclusion || '').substring(0, 200),
          problem: parsed.problem ? String(parsed.problem).substring(0, 200) : undefined,
          solution: parsed.solution ? String(parsed.solution).substring(0, 200) : undefined
        }
      }
    }
  } catch {
    // JSON 解析失败，用全文做 topic
  }
  return { topic: response.text.replace(/\n/g, ' ').substring(0, 100), conclusion: '' }
}

export async function generateCodeDescription(
  filePath: string,
  changeType: string,
  linesAdded: number,
  linesRemoved: number,
  diff: string,
  model?: string
): Promise<string> {
  const config = loadConfig()
  const prompt = CODE_CHANGE_PROMPT
    .replace('{filePath}', filePath)
    .replace('{changeType}', changeType)
    .replace('{linesAdded}', String(linesAdded))
    .replace('{linesRemoved}', String(linesRemoved))
    .replace('{diff}', diff.substring(0, 2000))

  const response = await callAI(
    [{ role: 'user', content: prompt }],
    { model: model || config.defaultModel, maxTokens: 3000, temperature: 0.3 }
  )

  return response.text.trim()
}

export async function generateDailyReport(
  projectContext: string,
  conversationSummaries: string,
  codeChanges: string,
  editFeedback: string,
  precomputedData?: string,
  manualInput?: ManualInput,
  model?: string
): Promise<ReportContent> {
  const config = loadConfig()
  const reportSchema = JSON.stringify(
    {
      overview: {
        projectCount: 'number | 项目数',
        totalSessions: 'number | 对话总轮数',
        totalCodeChanges: 'number | 代码变更数',
        totalInput: 'number | 总计输入 token',
        cacheHit: 'number | 缓存命中 token',
        cacheMiss: 'number | 缓存未命中 token',
        totalOutput: 'number | 总计输出 token',
        cacheHitRate: 'number | 缓存命中率(百分比)',
        totalCostRmb: 'number | 总费用(RMB)',
        issuesUnsolvedCount: 'number | 未解决问题数'
      },
      projects: [
        {
          projectName: 'string',
          progress: [{ content: 'string | 进展描述' }],
          codeChanges: [
            {
              filePath: 'string',
              changeType: "'added'|'modified'|'deleted'",
              linesAdded: 'number',
              linesRemoved: 'number',
              description: 'string | 功能描述'
            }
          ],
          issues: [{ content: 'string | 问题描述', isSolved: 'boolean' }],
          solutions: [{ content: 'string | 解决方案', relatedIssue: 'string | 对应的问题' }],
          aiConversations: [
            {
              timeRange: 'string | 时间范围 如"09:15-09:45"',
              topic: 'string | 讨论主题',
              roundCount: 'number | 轮数',
              tokens: 'number | 消耗 token',
              cacheHit: 'number | 缓存命中',
              cacheHitRate: 'number | 缓存命中率',
              costRmb: 'number | 费用'
            }
          ],
          tokenSummary: { total: 'number', cacheHit: 'number', cacheHitRate: 'number', costRmb: 'number' }
        }
      ]
    },
    null,
    2
  )

  // 构建手动输入文本
  let manualInputText = '无'
  if (manualInput && (manualInput.text.trim() || manualInput.images.length > 0)) {
    const parts: string[] = []
    if (manualInput.text.trim()) {
      parts.push(`文字描述：\n${manualInput.text.trim()}`)
    }
    if (manualInput.images.length > 0) {
      parts.push(`用户上传了 ${manualInput.images.length} 张参考图片，请结合图片内容理解用户的工作场景。`)
    }
    manualInputText = parts.join('\n\n')
  }

  const prompt = DAILY_REPORT_PROMPT
    .replace('{projectContext}', projectContext)
    .replace('{conversationSummaries}', conversationSummaries)
    .replace('{codeChanges}', codeChanges)
    .replace('{editFeedback}', editFeedback || '无历史编辑记录')
    .replace('{manualInput}', manualInputText)
    .replace('{precomputedData}', precomputedData || '{}')
    .replace('{reportSchema}', reportSchema)

  // 构建消息：Anthropic 支持多模态图片
  const apiType = detectApiType(config.apiKey)
  let messages: { role: 'user' | 'assistant'; content: any }[]

  if (apiType === 'anthropic' && manualInput?.images?.length) {
    // Anthropic 多模态：text + image 混合 content
    const contentBlocks: any[] = [{ type: 'text', text: prompt }]
    for (const img of manualInput.images) {
      // 解析 base64 data URI: data:image/png;base64,xxxxx
      const match = img.match(/^data:(image\/\w+);base64,(.+)$/)
      if (match) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: match[1],
            data: match[2]
          }
        })
      }
    }
    messages = [{ role: 'user', content: contentBlocks }]
  } else {
    messages = [{ role: 'user', content: prompt }]
  }

  const response = await callAI(
    messages,
    { model: model || config.defaultModel, maxTokens: 32768, temperature: 0.5 }
  )

  const jsonMatch = response.text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as ReportContent
    } catch (e: any) {
      throw new Error(`AI 返回的 JSON 格式有误: ${e.message}。原始内容前200字符: ${response.text.substring(0, 200)}`)
    }
  }

  throw new Error(`AI 返回内容无法解析为 JSON。原始内容前200字符: ${response.text.substring(0, 200)}`)
}

/**
 * 计算 Token 费用
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheHitTokens?: number
): number {
  const config = loadConfig()
  const pricing = config.modelPricing[model]
  if (!pricing) return 0

  const cacheHit = cacheHitTokens || 0
  const cacheMiss = Math.max(0, inputTokens - cacheHit)

  return (
    (cacheMiss / 1_000_000) * pricing.inputPerMTok +
    (cacheHit / 1_000_000) * (pricing.cacheHitPerMTok ?? 0) +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  )
}
