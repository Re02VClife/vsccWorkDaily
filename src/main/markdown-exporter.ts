import type { ReportContent } from '../shared/types'

/**
 * 将日报内容导出为飞书兼容的 Markdown 文件
 */
export function markdownExporter(reportJson: string): string {
  const report: ReportContent = JSON.parse(reportJson)

  const lines: string[] = []

  // 标题
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
  lines.push(`# 📅 ${today} 工作日报`)
  lines.push('')

  // 概览
  const { overview } = report
  lines.push('## 📊 概览')
  lines.push('')
  lines.push('| 指标 | 数值 |')
  lines.push('|------|------|')
  lines.push(`| 项目数 | ${overview.projectCount} |`)
  lines.push(`| AI 对话轮次 | ${overview.totalSessions} |`)
  lines.push(`| 代码变更 | ${overview.totalCodeChanges} 处 |`)
  lines.push(`| 总 Token | ${(overview.totalTokens / 1000).toFixed(0)}K |`)
  lines.push(`| 缓存命中 | ${(overview.cacheHitTokens / 1000).toFixed(0)}K (${overview.cacheHitRate}%) |`)
  lines.push(`| 费用 | ¥${overview.totalCostRmb.toFixed(2)} |`)
  lines.push(`| 缓存节省 | ¥${overview.costSavedRmb.toFixed(2)} |`)
  lines.push(`| 待解决问题 | ${overview.issuesUnsolvedCount} |`)
  lines.push('')

  // 各项目详情
  for (const project of report.projects) {
    lines.push(`## 🔧 ${project.projectName}`)
    lines.push('')

    // 今日进展
    if (project.progress.length > 0) {
      lines.push('### 📝 今日进展')
      lines.push('')
      for (const p of project.progress) {
        lines.push(`- ${p.content}`)
      }
      lines.push('')
    }

    // 代码产出
    if (project.codeChanges.length > 0) {
      lines.push('### 💻 代码产出')
      lines.push('')
      for (const cc of project.codeChanges) {
        const icon = cc.changeType === 'added' ? '✚' : cc.changeType === 'modified' ? '✎' : '✖'
        lines.push(
          `- ${icon} \`${cc.filePath}\` (+${cc.linesAdded}/-${cc.linesRemoved}行)  \n  → ${cc.description}`
        )
      }
      lines.push('')
    }

    // 问题与解决方案
    if (project.issues.length > 0) {
      lines.push('### ⚠️ 遇到的问题')
      lines.push('')
      for (const issue of project.issues) {
        lines.push(`- [${issue.isSolved ? 'x' : ' '}] ${issue.content}${issue.isSolved ? ' ✅' : ''}`)
      }
      lines.push('')
    }

    if (project.solutions.length > 0) {
      lines.push('### 💡 解决方案')
      lines.push('')
      for (const sol of project.solutions) {
        lines.push(`- ${sol.content}`)
      }
      lines.push('')
    }

    // AI 对话摘要
    if (project.aiConversations.length > 0) {
      lines.push('### 🤖 AI 对话摘要')
      lines.push('')
      for (const conv of project.aiConversations) {
        lines.push(`- **${conv.timeRange}** — ${conv.topic}`)
        lines.push(`  - ${conv.roundCount} 轮 ┃ ${(conv.tokens / 1000).toFixed(0)}K token ┃ 命中 ${conv.cacheHitRate}% ┃ ¥${conv.costRmb.toFixed(2)}`)
      }
      lines.push('')
    }

    // Token 汇总
    lines.push('### 📈 Token 消耗')
    lines.push('')
    lines.push('| 总计 | 缓存命中 | 命中率 | 费用 |')
    lines.push('|------|----------|--------|------|')
    lines.push(
      `| ${(project.tokenSummary.total / 1000).toFixed(0)}K | ${(project.tokenSummary.cacheHit / 1000).toFixed(0)}K | ${project.tokenSummary.cacheHitRate}% | ¥${project.tokenSummary.costRmb.toFixed(2)} |`
    )
    lines.push('')
  }

  // 页脚
  lines.push('---')
  lines.push(`*此日报由 AI 自动生成于 ${new Date().toLocaleString('zh-CN')}*`)

  return lines.join('\n')
}
