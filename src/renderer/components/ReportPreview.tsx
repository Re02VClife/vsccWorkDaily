import { Card, Descriptions, Tag, Timeline, Typography, Empty, Spin, Button } from '@arco-design/web-react'
import { IconClockCircle, IconExclamationCircle, IconCheckCircle, IconDown, IconUp } from '@arco-design/web-react/icon'
import { useState, useEffect } from 'react'
import type { ReportContent, WorkSnippet } from '../../shared/types'
import GanttChart from './GanttChart'

const { Text, Title } = Typography

interface Props {
  trackedIds?: Set<number>
}

export default function ReportPreview(_props: Props) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportContent | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [projectSnippetMap, setProjectSnippetMap] = useState<Map<string, WorkSnippet[]>>(new Map())
  const [ganttExpanded, setGanttExpanded] = useState(false)

  // 尝试从后端加载今日日报 + 余额
  useEffect(() => {
    const loadReport = async () => {
      setLoading(true)
      try {
        // 查最近 3 天的日报，取最新的一条（兼容工作日跨凌晨的情况）
        const today = new Date()
        const endDate = today.toISOString().slice(0, 10)
        const startDate = new Date(today.getTime() - 3 * 86400000).toISOString().slice(0, 10)
        const reports = await window.electronAPI.invoke('get-reports-by-date-range', startDate, endDate)
        if (reports && reports.length > 0) {
          // 取最新的一条
          const latest = reports.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]
          const content = latest.editedJson || latest.rawJson
          if (content && content.overview) {
            setReport(content)
          }
          // 加载甘特图片段（按项目分组）
          const map = new Map<string, WorkSnippet[]>()
          for (const r of reports) {
            if (r.projectId && r.projectName) {
              try {
                const snips = await window.electronAPI.invoke('get-work-snippets', r.projectId, r.date) as WorkSnippet[]
                if (snips.length > 0) {
                  map.set(r.projectName, snips)
                }
              } catch { /* skip */ }
            }
          }
          setProjectSnippetMap(map)
        }
        // 同时查询 DeepSeek 余额
        try {
          const bal = await window.electronAPI.invoke('get-deepseek-balance')
          if (bal.available && bal.infos?.length > 0) {
            const info = bal.infos.find((i: any) => i.currency === 'CNY') || bal.infos[0]
            const total = parseFloat(info.total_balance)
            if (!isNaN(total)) {
              setBalance(`${info.currency === 'CNY' ? '¥' : '$'}${total.toFixed(2)}`)
            }
          }
        } catch { /* 余额获取失败不影响主流程 */ }
      } catch (e) {
        console.log('加载日报失败:', e)
      }
      setLoading(false)
    }
    loadReport()
  }, [])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size={40} tip="正在加载..." />
      </div>
    )
  }

  if (!report) {
    return (
      <div style={{ textAlign: 'center', marginTop: 80 }}>
        <Empty description="暂无今日日报" />
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          请确保已添加项目，然后点击「🔄 一键生成日报」
        </Text>
      </div>
    )
  }

  return (
    <div>
      {/* 概览卡片 */}
      <Card style={{ marginBottom: 24 }} className="overview-card">
        <Title heading={5}>📊 今日概览</Title>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
          {report.overview.tokenDashboard && (
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-1)' }}>
              {report.overview.tokenDashboard.model}
            </span>
          )}
          <Descriptions
            column={5}
            size="small"
            data={[
              { label: '项目数', value: report.overview.projectCount },
              { label: '对话轮数', value: `${report.overview.tokenDashboard?.totalRounds || report.overview.totalSessions} 轮` },
              { label: '花费', value: `¥${(report.overview.tokenDashboard?.totalCostRmb || report.overview.totalCostRmb || 0).toFixed(2)}` },
              { label: '待解决问题', value: report.overview.issuesUnsolvedCount },
              { label: '代码变更', value: `${report.overview.totalCodeChanges} 处` }
            ]}
            style={{ marginBottom: 0 }}
          />
        </div>
      </Card>

      {/* 甘特图 */}
      {projectSnippetMap.size > 0 && (() => {
        const totalCount = Array.from(projectSnippetMap.values()).reduce((s, v) => s + v.length, 0)
        return (
          <Card
            style={{ marginBottom: 24 }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>📊 甘特图（{projectSnippetMap.size} 个项目 · {totalCount} 个片段 · 15分钟/格）</span>
                <Button
                  type="text"
                  size="small"
                  icon={ganttExpanded ? <IconUp /> : <IconDown />}
                  onClick={() => setGanttExpanded(!ganttExpanded)}
                >
                  {ganttExpanded ? '收起' : '展开'}
                </Button>
              </div>
            }
          >
            {ganttExpanded ? (
              <GanttChart projectMap={projectSnippetMap} />
            ) : (
              <Text type="secondary">共 {projectSnippetMap.size} 个项目、{totalCount} 个片段，点击展开查看甘特图</Text>
            )}
          </Card>
        )
      })()}

      {/* 各项目日报 */}
      {report.projects.map((project, idx) => (
        <Card key={idx} style={{ marginBottom: 20 }} title={`🔧 ${project.projectName}`}>
          {/* 今日进展 */}
          {project.progress.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Title heading={6}>📝 今日进展</Title>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {project.progress.map((p, i) => (
                  <li key={i} style={{ marginBottom: 6, lineHeight: 1.8 }}>{p.content}</li>
                ))}
              </ol>
            </div>
          )}

          {/* 代码产出 */}
          {project.codeChanges.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Title heading={6}>💻 代码产出</Title>
              <div style={{ background: 'var(--color-fill-1)', borderRadius: 8, padding: 12 }}>
                {project.codeChanges.map((cc, i) => (
                  <div key={i} style={{
                    marginBottom: i < project.codeChanges.length - 1 ? 12 : 0,
                    fontFamily: 'monospace', fontSize: 13
                  }}>
                    <Tag
                      color={cc.changeType === 'added' ? 'green' : cc.changeType === 'modified' ? 'orange' : 'red'}
                      size="small"
                    >
                      {cc.changeType === 'added' ? '✚' : cc.changeType === 'modified' ? '✎' : '✖'}
                    </Tag>
                    <Text code style={{ marginLeft: 6 }}>{cc.filePath}</Text>
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      (+{cc.linesAdded}/-{cc.linesRemoved}行)
                    </Text>
                    <div style={{ marginTop: 4, marginLeft: 28, color: 'var(--color-text-2)', fontSize: 13 }}>
                      → {cc.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 问题与解决方案 */}
          {(project.issues.length > 0 || project.solutions.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <Title heading={6}>⚠️ 遇到的问题</Title>
                {project.issues.length > 0 ? (
                  <div style={{ background: 'var(--color-danger-light-1)', borderRadius: 8, padding: 12 }}>
                    {project.issues.map((issue, i) => (
                      <div key={i} style={{ marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <IconExclamationCircle style={{ color: 'var(--color-danger-6)', marginTop: 2 }} />
                        <Text>{issue.content}</Text>
                        <Tag size="small" color={issue.isSolved ? 'green' : 'red'}>
                          {issue.isSolved ? '已解决' : '未解决'}
                        </Tag>
                      </div>
                    ))}
                  </div>
                ) : <Text type="secondary">无</Text>}
              </div>
              <div>
                <Title heading={6}>💡 解决方案</Title>
                {project.solutions.length > 0 ? (
                  <div style={{ background: 'var(--color-success-light-1)', borderRadius: 8, padding: 12 }}>
                    {project.solutions.map((sol, i) => (
                      <div key={i} style={{ marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <IconCheckCircle style={{ color: 'var(--color-success-6)', marginTop: 2 }} />
                        <Text>{sol.content}</Text>
                      </div>
                    ))}
                  </div>
                ) : <Text type="secondary">无</Text>}
              </div>
            </div>
          )}

          {/* AI 对话摘要 — 简洁版 */}
          {project.aiConversations.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Title heading={6}>🤖 AI 对话摘要</Title>
              <Timeline>
                {project.aiConversations.map((conv, i) => (
                  <Timeline.Item key={i} label={conv.timeRange} dot={<IconClockCircle />}>
                    <div style={{ background: 'var(--color-fill-1)', borderRadius: 8, padding: '8px 12px' }}>
                      <Text bold>{conv.topic}</Text>
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {conv.roundCount} 轮
                      </Text>
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            </div>
          )}

        </Card>
      ))}

      {report.projects.length === 0 && (
        <Empty description="今日暂无工作记录" />
      )}
    </div>
  )
}
