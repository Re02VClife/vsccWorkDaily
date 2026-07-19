import { getDatabase } from './db'
import { parseJsonlFile, getDedupedUsage, extractSessionMeta, scanRecentSessions } from './jsonl-parser'
import { autoCommit, scanCodeChanges } from './git-collector'
import { join } from 'path'
import { readFileSync } from 'fs'
import { generateDailyReport, generateMicroSummary, calculateCost } from './ai-engine'
import { loadConfig } from './config'
import type {
  ProjectConfig,
  Session,
  SessionSummary,
  WorkSnippet,
  CodeChange,
  DailyReport,
  ReportContent,
  EditFeedback
} from '../shared/types'

/**
 * 计算某天的日期字符串 (YYYY-MM-DD)，考虑工作日开始时间
 */
function getWorkDate(now: Date = new Date()): string {
  const config = loadConfig()
  const adjusted = new Date(now)
  // 如果在凌晨 0 ~ workdayStartHour 之间，算作前一天
  if (adjusted.getHours() < config.workdayStartHour) {
    adjusted.setDate(adjusted.getDate() - 1)
  }
  return adjusted.toISOString().slice(0, 10)
}

/**
 * 一键生成日报的完整流程
 */
export async function generateReport(
  projectId?: number,
  onProgress?: (msg: string) => void,
  chunkSize: number = 100
): Promise<{ reports: DailyReport[]; errors: string[] }> {
  const progress = (msg: string) => {
    console.log('[report-gen]', msg)
    onProgress?.(msg)
  }
  const db = getDatabase()
  const config = loadConfig()
  const today = getWorkDate()
  const errors: string[] = []

  // 检查 API Key
  if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
    return {
      reports: [],
      errors: ['未配置 API Key，请在设置页面添加 AI API Key 后再生成日报']
    }
  }

  // 获取要处理的项目列表
  let projects: ProjectConfig[]
  if (projectId) {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any
    projects = row ? [rowToProject(row)] : []
  } else {
    const rows = db.prepare('SELECT * FROM projects').all() as any[]
    projects = rows.map(rowToProject)
  }

  // 扫描最近 7 天的 JSONL 会话（不只今天）
  const todayStart = new Date(`${today}T00:00:00`)
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000)
  progress('🔍 正在扫描 Claude Code 对话记录...')
  const recentSessions = await scanRecentSessions(weekAgo)

  progress(`📂 找到 ${recentSessions.length} 个最近会话文件`)
  console.log(`[report-gen] 找到 ${recentSessions.length} 个最近会话文件`)

  // 按项目匹配会话
  const projectSessions = new Map<number, typeof recentSessions>()

  // 收集所有编辑反馈（AI 学习用）
  const feedbackRows = db
    .prepare('SELECT * FROM edit_feedback ORDER BY created_at DESC LIMIT 20')
    .all() as any[]
  const editFeedback = feedbackRows
    .map((r: any) => `字段: ${r.field_path}\n原文: ${r.original}\n修改后: ${r.edited}\n`)
    .join('\n---\n')

  const reports: DailyReport[] = []

  for (const project of projects) {
    try {
      progress(`\n📋 正在处理项目: ${project.name}`)

      // 1. 匹配该项目相关的 JSONL 会话
      // Claude Code slug: 路径分隔符和非 ASCII 字符都变成 -
      // 例如 c:/Users/xx/vscode/工作日报 → c--Users-xx-vscode-----
      // 计算该项目预期 slug，精确匹配（不同项目 dash 数不同）
      const expectedSlug = project.rootPath
        .replace(/^[A-Z]:[\\\/]?/i, '')
        .replace(/[\\\/:]/g, '-')
        .replace(/[^\x00-\x7F]/g, '-')  // 中文等非 ASCII → 单个 -（保留数量以区分不同中文项目名）
        .toLowerCase()

      const matched = recentSessions.filter((s) => {
        const slug = s.projectSlug.toLowerCase()
        // 精确匹配：slug 必须以此结尾（同一父目录下不同中文项目名 dash 数不同）
        return slug.endsWith(expectedSlug) || slug.includes(expectedSlug)
      })

      progress(`  匹配到 ${matched.length} 个对话会话`)
      console.log(`[report-gen] 项目 "${project.name}" slug="${expectedSlug}" → ${matched.length} 个会话`)
      if (matched.length === 0) {
        console.log(`  可用 slugs: ${recentSessions.map(s => s.projectSlug).slice(0, 5).join(', ')}`)
      }

      // 2. 解析会话并生成微摘要
      progress(`  🤖 正在生成对话摘要（${matched.length} 个会话）...`)
      let conversationSummaries = ''
      let sessionIdx = 0
      for (const sessionFile of matched) {
        sessionIdx++
        const entries = parseJsonlFile(sessionFile.filePath)
        const meta = extractSessionMeta(entries)

        if (!meta) continue

        // 每 100 轮切一段摘要（平衡速度与细节）
        const chunks = chunkRounds(entries, chunkSize)
        progress(`    会话 ${sessionIdx}/${matched.length}: ${meta.roundCount} 轮 → ${chunks.length} 段`)

        for (const chunk of chunks) {
          const content = chunk
            .filter((e) => e.type === 'user' || e.type === 'assistant')
            .map((e) => {
              const role = e.type === 'user' ? '用户' : '助手'
              const msg = e.message
              let text = ''
              if (typeof msg?.content === 'string') text = msg.content
              else if (Array.isArray(msg?.content)) {
                text = msg.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join(' ')
              }
              return `[${role}] ${text.substring(0, 300)}`
            })
            .join('\n')
            .substring(0, 10000)

          // 计算这段对话的 token（按比例分配）
          const chunkTokens = meta.roundCount > 0
            ? Math.round((meta.totalInputTokens + meta.totalOutputTokens) / chunks.length)
            : 0
          const chunkCacheHit = meta.roundCount > 0
            ? Math.round(meta.totalCacheHit / chunks.length)
            : 0

          try {
            const safeContent = sanitizeContent(content)
            const summary = await generateMicroSummary(safeContent)
            progress(`      ✓ ${summary.topic.substring(0, 60)}`)
            conversationSummaries += `时间: ${chunk[0]?.timestamp || meta.startTime || '未知'}\n`
            conversationSummaries += `模型: ${meta.model}\n`
            conversationSummaries += `Token: input=${meta.totalInputTokens} output=${meta.totalOutputTokens} cache_hit=${meta.totalCacheHit}\n`
            conversationSummaries += `主题: ${summary.topic}\n`
            conversationSummaries += `结论: ${summary.conclusion}\n`
            if (summary.problem) conversationSummaries += `遇到的问题: ${summary.problem}\n`
            if (summary.solution) conversationSummaries += `解决方案: ${summary.solution}\n`
            conversationSummaries += `---\n`
          } catch (e: any) {
            progress(`      ⚠ 摘要生成失败: ${e.message?.substring(0, 120)}`)
          }
        }

        // 保存会话记录
        const existingSession = db
          .prepare('SELECT id FROM sessions WHERE session_id = ?')
          .get(meta.sessionId) as any

        if (!existingSession) {
          db.prepare(
            `INSERT INTO sessions (project_id, session_id, model, started_at, ended_at, round_count)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            project.id,
            meta.sessionId,
            meta.model,
            meta.startTime || meta.endTime || new Date().toISOString(),
            meta.endTime || meta.startTime || new Date().toISOString(),
            meta.roundCount
          )
        }
      }

      // 3. 自动提交未保存的改动 → 扫描代码变更
      progress(`  📝 自动提交未保存改动...`)
      const commitResult = await autoCommit(project.rootPath, today)
      if (commitResult.committed) {
        progress(`    ✓ ${commitResult.message}`)
      }
      const codeChanges = await scanCodeChanges(project.rootPath, today, project.id)
      if (codeChanges.length > 0) progress(`  发现 ${codeChanges.length} 处代码变更`)

      // 构建代码变更文本（不再逐文件调 AI，由日报 AI 统一生成描述）
      const codeChangesText: string[] = []
      for (const cc of codeChanges) {
        codeChangesText.push(
          `${cc.changeType === 'added' ? '✚' : cc.changeType === 'modified' ? '✎' : '✖'} ${cc.filePath} (+${cc.linesAdded}/-${cc.linesRemoved})`
        )
        // 保存到数据库
        db.prepare(
          `INSERT INTO code_changes (project_id, date, file_path, change_type, lines_added, lines_removed, description, commit_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(project.id, today, cc.filePath, cc.changeType, cc.linesAdded, cc.linesRemoved, cc.description || '', cc.commitHash)
      }

      // 4. 读取 MD 文件内容
      let mdContent = ''
      for (const mdFile of project.mdFiles) {
        const fullPath = join(project.rootPath, mdFile)
        try {
          const content = readFileSync(fullPath, 'utf-8')
          mdContent += `\n=== ${mdFile} ===\n${content.substring(0, 3000)}\n`
        } catch {
          console.warn(`[report-gen] 无法读取 MD 文件: ${fullPath}`)
        }
      }

      // 5. 构建项目上下文
      const projectContext = [
        `项目名称: ${project.name}`,
        `路径: ${project.rootPath}`,
        mdContent ? `\n项目文档内容:\n${mdContent}` : ''
      ].join('\n')

      // 6. 本地计算 Token（按 assistant 条目去重，按会话统计）
      // 注意：cache_read_input_tokens 每轮都会上报同一段缓存前缀，不能直接累加
      // 取每轮的最大值作为该会话的有效缓存量（去重）
      // 使用 message.id 去重（thinking + text 同属一轮，共享相同 id）
      let totalInput = 0
      let totalCacheHit = 0
      let totalOutput = 0
      let totalCostRmb = 0
      let sessionModel = config.defaultModel  // 记录使用的模型
      const perSessionTokens: Array<{
        timeRange: string; topic: string; roundCount: number
        inputTokens: number; cacheHit: number; outputTokens: number; cacheHitRate: number; costRmb: number
      }> = []

      for (const sessionFile of matched) {
        const entries = parseJsonlFile(sessionFile.filePath)
        const meta = extractSessionMeta(entries)
        const deduped = getDedupedUsage(entries)
        if (!meta || deduped.length === 0) continue
        if (meta.model) sessionModel = meta.model  // 记录第一个有效会话的模型

        let sInput = 0; let sOutput = 0; let sCachePeak = 0; let sCost = 0
        for (const { usage: u, model } of deduped) {
          sInput += u.input_tokens || 0
          sOutput += u.output_tokens || 0
          // 取最大值而非累加——同一段缓存前缀多轮命中
          sCachePeak = Math.max(sCachePeak, u.cache_read_input_tokens || 0)
          if (model) {
            sCost += calculateCost(model, u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0)
          }
        }
        totalInput += sInput
        totalOutput += sOutput
        totalCacheHit += sCachePeak
        totalCostRmb += sCost

        // 命中率取每轮最大值（代表缓存稳态效率）
        let sMaxRate = 0
        for (const { cacheHitRate } of deduped) {
          if (cacheHitRate > sMaxRate) sMaxRate = cacheHitRate
        }
        const hitRate = Math.min(99, Math.round(sMaxRate * 100))

        const startTime = meta.startTime?.substring(11, 16) || ''
        const endTime = meta.endTime?.substring(11, 16) || ''

        // 从摘要中提取主题（去重后的轮数可能和原始条目不同，这是对的）
        const firstSummary = conversationSummaries.split('---').find(s => s.includes(meta.startTime || ''))
        const topicMatch = firstSummary?.match(/主题: (.+)/)
        const topic = topicMatch?.[1] || `${meta.model} 对话`

        perSessionTokens.push({
          timeRange: startTime && endTime ? `${startTime}-${endTime}` : startTime || meta.startTime?.substring(0, 10) || '',
          topic: topic.substring(0, 60),
          roundCount: deduped.length,
          inputTokens: sInput,
          cacheHit: sCachePeak,
          outputTokens: sOutput,
          cacheHitRate: hitRate,
          costRmb: Math.round(sCost * 100) / 100
        })
      }

      const cacheMiss = totalInput
      // 最终缓存命中率取所有去重轮次的最大值
      let maxHitRate = 0
      for (const sessionFile of matched) {
        const entries = parseJsonlFile(sessionFile.filePath)
        for (const { cacheHitRate } of getDedupedUsage(entries)) {
          if (cacheHitRate > maxHitRate) maxHitRate = cacheHitRate
        }
      }
      const finalHitRate = Math.min(99, Math.round(maxHitRate * 100))

      // 7. 构建预计算数据（对话摘要 + Token 指标）

      const precomputedData = JSON.stringify({
        aiConversations: perSessionTokens,
        tokenOverview: {
          totalInput: totalInput,
          cacheHit: totalCacheHit,
          cacheMiss: totalInput,
          totalOutput: totalOutput,
          cacheHitRate: finalHitRate,
          totalCostRmb: Math.round(totalCostRmb * 100) / 100
        }
      }, null, 2)

      // 8. 调用 AI 生成日报
      progress(`  🧠 正在调用 AI 生成日报...（可能需要 30-60 秒）`)
      const reportContent = await generateDailyReport(
        projectContext,
        conversationSummaries || '(今日无 AI 对话)',
        codeChangesText.join('\n') || '(今日无代码变更)',
        editFeedback,
        precomputedData // 传入预计算数据（对话 + Token 指标）
      )

      // 9. 用本地计算的准确 Token 数据覆盖 AI 生成的部分
      // AI 擅长定性分析（进展、问题、方案），不擅长精确的数字统计
      const totalRounds = perSessionTokens.reduce((s, x) => s + x.roundCount, 0)
      const modelUsed = sessionModel

      // 安全注入 — 确保 AI 返回了必要的结构
      if (reportContent.overview) {
        reportContent.overview.tokenDashboard = {
          model: modelUsed,
          totalInput,
          totalOutput,
          cacheHitRate: finalHitRate,
          totalCostRmb: Math.round(totalCostRmb * 100) / 100,
          avgCostPerRound: totalRounds > 0 ? totalCostRmb / totalRounds : 0,
          totalRounds
        }
      }

      // 覆盖每个项目的 tokenSummary 和 aiConversations
      if (Array.isArray(reportContent.projects)) {
        for (const pr of reportContent.projects) {
          pr.tokenSummary = {
            total: totalInput + totalOutput,
            inputTokens: totalInput,
            cacheHit: totalCacheHit,
            outputTokens: totalOutput,
            cacheHitRate: finalHitRate,
            costRmb: Math.round(totalCostRmb * 100) / 100,
            avgCostPerRound: totalRounds > 0 ? totalCostRmb / totalRounds : 0,
            totalRounds,
            model: modelUsed
          }
          // 覆盖 AI 对话摘要为本地准确数据
          pr.aiConversations = perSessionTokens.map(s => ({
            timeRange: s.timeRange,
            topic: s.topic,
            model: modelUsed,
            roundCount: s.roundCount,
            inputTokens: s.inputTokens,
            cacheHit: s.cacheHit,
            outputTokens: s.outputTokens,
            tokens: s.inputTokens + s.outputTokens,
            cacheHitRate: s.cacheHitRate,
            costRmb: s.costRmb
          }))
        }
      }

      const issuesUnsolved = reportContent.projects.flatMap((p) =>
        p.issues.filter((i) => !i.isSolved).map((i) => i.content)
      )

      // 7. 保存日报到数据库
      const rawJson = JSON.stringify(reportContent)

      // 检查是否已存在今日日报
      const existing = db
        .prepare('SELECT id FROM daily_reports WHERE project_id = ? AND date = ?')
        .get(project.id, today) as any

      if (existing) {
        db.prepare(
          `UPDATE daily_reports SET
            raw_json = ?, token_total = ?, token_cache_hit = ?,
            cost_rmb = ?, issues_unsolved = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(rawJson, totalInput + totalOutput, totalCacheHit, totalCostRmb, JSON.stringify(issuesUnsolved), existing.id)
      } else {
        db.prepare(
          `INSERT INTO daily_reports (project_id, date, raw_json, token_total, token_cache_hit, cost_rmb, issues_unsolved, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`
        ).run(project.id, today, rawJson, totalInput + totalOutput, totalCacheHit, totalCostRmb, JSON.stringify(issuesUnsolved))
      }

      // 返回生成的日报
      const report: DailyReport = {
        id: existing?.id || 0,
        projectId: project.id,
        date: today,
        rawJson: reportContent,
        editedJson: null,
        tokenTotal: totalInput + totalOutput,
        tokenCacheHit: totalCacheHit,
        costRmb: totalCostRmb,
        issuesUnsolved,
        status: 'draft',
        exportedFeishuDocId: null,
        exportedFeishuBaseId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      reports.push(report)
    } catch (err) {
      const msg = `项目 ${project.name} 日报生成失败: ${err}`
      console.error(msg)
      errors.push(msg)
    }
  }

  return { reports, errors }
}

// ==================== 辅助函数 ====================

function rowToProject(row: any): ProjectConfig {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    mdFiles: JSON.parse(row.md_files || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * 清理文本中的问题字符，避免 API JSON 解析失败
 * 去掉控制字符（除了换行/制表），保证 UTF-8 有效性
 */
function sanitizeContent(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // 去掉控制字符（保留 \n \t）
    .replace(/\\(?=[^"\\\/bfnrtu])/g, '\\\\')           // 非标准 JSON 转义：\x \u 等前加反斜杠
}

/**
 * 将 JSONL 条目按轮次切分
 */
function chunkRounds(entries: any[], size: number): any[][] {
  const chunks: any[][] = []
  let current: any[] = []
  let count = 0

  for (const entry of entries) {
    current.push(entry)
    if (entry.type === 'assistant') {
      count++
      if (count % size === 0) {
        chunks.push(current)
        current = []
      }
    }
  }

  // 收尾
  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}
