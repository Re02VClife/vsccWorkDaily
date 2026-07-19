import { useState, useEffect } from 'react'
import { Table, Tag, Button, Message, Empty, Spin, DatePicker, Modal } from '@arco-design/web-react'
import type { DailyReport, ReportContent } from '../../shared/types'
import ReportPreview from './ReportPreview'

const { RangePicker } = DatePicker

interface ReportRow extends DailyReport {
  projectName?: string
}

export default function HistoryPage() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [viewReport, setViewReport] = useState<ReportContent | null>(null)
  const [viewTitle, setViewTitle] = useState('')

  const loadReports = async (start?: string, end?: string) => {
    setLoading(true)
    try {
      const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const endDate = end || new Date().toISOString().slice(0, 10)
      const result = await window.electronAPI.invoke('get-reports-by-date-range', startDate, endDate)
      setReports(result || [])
    } catch (e) {
      Message.error('加载失败: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReports() }, [])

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.invoke('delete-report', id)
      Message.success('已删除')
      setReports(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      Message.error('删除失败: ' + String(e))
    }
  }

  const handleView = (r: ReportRow) => {
    const content = r.editedJson || r.rawJson
    if (content) {
      setViewReport(content)
      setViewTitle(`${r.date} — ${r.projectName || '未知项目'}`)
    } else {
      Message.warning('该日报内容为空')
    }
  }

  const handleDateChange = (_: unknown, dateStrings: string[]) => {
    if (dateStrings[0] && dateStrings[1]) {
      loadReports(dateStrings[0], dateStrings[1])
    }
  }

  const columns = [
    { title: '日期', dataIndex: 'date', width: 110 },
    { title: '项目', dataIndex: 'projectName', width: 140, render: (v: string) => v || '-' },
    {
      title: 'Tokens', width: 100,
      render: (_: unknown, r: ReportRow) => `${((r.tokenTotal || 0) / 1000).toFixed(0)}K`
    },
    {
      title: '缓存命中', width: 90,
      render: (_: unknown, r: ReportRow) => {
        // 用 rawJson 里的真实 overview 数据
        const ov = r.rawJson?.overview || r.editedJson?.overview
        if (ov) return `${ov.cacheHitRate || 0}%`
        const rate = r.tokenTotal > 0 ? Math.min(100, Math.round((r.tokenCacheHit || 0) / r.tokenTotal * 100)) : 0
        return `${rate}%`
      }
    },
    {
      title: '费用', width: 90,
      render: (_: unknown, r: ReportRow) => `¥${(r.costRmb || 0).toFixed(2)}`
    },
    {
      title: '状态', width: 90,
      render: (_: unknown, r: ReportRow) => (
        <Tag color={r.status === 'published' ? 'green' : r.status === 'exported' ? 'blue' : 'orange'} size="small">
          {r.status === 'published' ? '已发布' : r.status === 'exported' ? '已导出' : '草稿'}
        </Tag>
      )
    },
    {
      title: '操作', width: 130,
      render: (_: unknown, r: ReportRow) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type="text" size="small" onClick={() => handleView(r)}>查看</Button>
          <Button type="text" status="danger" size="small" onClick={() => handleDelete(r.id)}>删除</Button>
        </div>
      )
    }
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <RangePicker onChange={handleDateChange} style={{ width: 260 }} />
        <Button onClick={() => loadReports()}>🔄 刷新</Button>
      </div>
      {loading ? (
        <Spin style={{ display: 'block', marginTop: 60 }} />
      ) : reports.length === 0 ? (
        <Empty description="暂无历史日报" style={{ marginTop: 80 }} />
      ) : (
        <Table columns={columns} data={reports} rowKey="id" />
      )}

      {/* 查看日报弹窗 */}
      <Modal
        title={viewTitle}
        visible={!!viewReport}
        onCancel={() => setViewReport(null)}
        footer={null}
        style={{ width: 900, maxHeight: '80vh', overflow: 'auto' }}
      >
        {viewReport && (
          <div style={{ maxHeight: '65vh', overflow: 'auto', padding: '8px 0' }}>
            {/* 概览 */}
            <div style={{ marginBottom: 16 }}>
              <h4>📊 概览</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 13 }}>
                <div>项目数: {viewReport.overview?.projectCount || 0}</div>
                <div>AI对话: {viewReport.overview?.totalSessions || 0}轮</div>
                <div>代码变更: {viewReport.overview?.totalCodeChanges || 0}处</div>
                <div>待解决: {viewReport.overview?.issuesUnsolvedCount || 0}</div>
                <div>Token: {((viewReport.overview?.totalTokens || 0)/1000).toFixed(0)}K</div>
                <div>缓存命中: {viewReport.overview?.cacheHitRate || 0}%</div>
                <div>费用: ¥{(viewReport.overview?.totalCostRmb || 0).toFixed(2)}</div>
                <div>节省: ¥{(viewReport.overview?.costSavedRmb || 0).toFixed(2)}</div>
              </div>
            </div>
            {/* 各项目 */}
            {viewReport.projects?.map((p: any, i: number) => (
              <div key={i} style={{ marginBottom: 16, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <h4>🔧 {p.projectName}</h4>
                {p.progress?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>📝 进展</strong>
                    <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
                      {p.progress.map((pg: any, j: number) => <li key={j}>{pg.content}</li>)}
                    </ol>
                  </div>
                )}
                {p.issues?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>⚠️ 问题</strong>
                    {p.issues.map((iss: any, j: number) => (
                      <div key={j} style={{ fontSize: 13, marginLeft: 8 }}>
                        [{iss.isSolved ? '✅' : '❌'}] {iss.content}
                      </div>
                    ))}
                  </div>
                )}
                {p.solutions?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>💡 解决方案</strong>
                    {p.solutions.map((sol: any, j: number) => (
                      <div key={j} style={{ fontSize: 13, marginLeft: 8 }}>• {sol.content}</div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                  Token: {((p.tokenSummary?.total || 0)/1000).toFixed(0)}K |
                  缓存: {p.tokenSummary?.cacheHitRate || 0}% |
                  费用: ¥{(p.tokenSummary?.costRmb || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
