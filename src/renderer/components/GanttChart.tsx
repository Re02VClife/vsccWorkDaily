import { useState } from 'react'
import { Tag, Empty } from '@arco-design/web-react'
import type { WorkSnippet } from '../../shared/types'

interface GanttChartProps {
  projectMap: Map<string, WorkSnippet[]>
}

const COLORS: Record<string, string> = {
  coding: '#00b42a',
  discussion: '#165dff',
  debug: '#f53f3f',
  docs: '#722ed1'
}

const LABELS: Record<string, string> = {
  coding: '编码',
  discussion: '讨论',
  debug: '调试',
  docs: '文档'
}

const SLOT_MINUTES = 15
const SLOT_MS = SLOT_MINUTES * 60 * 1000
const CELL_W = 10 // 每格像素宽度
const LABEL_W = 140 // 项目名宽度

function fmtHHMM(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr.substring(11, 16) || isoStr
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return isoStr
  }
}

function floorToSlot(ms: number): number {
  return Math.floor(ms / SLOT_MS) * SLOT_MS
}

/** cell 颜色由 active 片段混合决定 */
function cellColor(active: WorkSnippet[]): string | null {
  if (active.length === 0) return null
  const types = new Set(active.map(s => s.snippetType))
  if (types.size === 1) return COLORS[active[0].snippetType] || '#86909c'
  return '#ff7d00' // 混合=橙色
}

export default function GanttChart({ projectMap }: GanttChartProps) {
  const [hoveredCell, setHoveredCell] = useState<{ rowIdx: number; col: number } | null>(null)

  const allSnippets: WorkSnippet[] = []
  projectMap.forEach(v => allSnippets.push(...v))
  if (allSnippets.length === 0) return <Empty description="暂无工作片段" />

  // ---- 时间范围 ----
  const times = allSnippets.map(s => ({ start: new Date(s.startTime).getTime(), end: new Date(s.endTime).getTime() }))
  const minTime = floorToSlot(Math.min(...times.map(t => t.start)))
  const maxTime = Math.max(...times.map(t => t.end))
  const slotCount = Math.ceil((maxTime - minTime) / SLOT_MS)
  const projectNames = Array.from(projectMap.keys())

  // ---- 预计算每个项目每个 cell 的 active 片段 ----
  const cellCache = new Map<string, WorkSnippet[]>()
  const getCellKey = (proj: string, col: number) => `${proj}::${col}`
  const getCell = (proj: string, col: number): WorkSnippet[] => {
    const key = getCellKey(proj, col)
    if (cellCache.has(key)) return cellCache.get(key)!
    const slotStart = minTime + col * SLOT_MS
    const slotEnd = slotStart + SLOT_MS
    const active = (projectMap.get(proj) || []).filter(s => {
      const ss = new Date(s.startTime).getTime()
      const se = new Date(s.endTime).getTime()
      return ss < slotEnd && se > slotStart
    })
    cellCache.set(key, active)
    return active
  }

  // ---- 时间轴标签 ----
  const hourLabels: { col: number; label: string }[] = []
  for (let c = 0; c <= slotCount; c++) {
    const ms = minTime + c * SLOT_MS
    const d = new Date(ms)
    if (d.getMinutes() === 0) {
      hourLabels.push({ col: c, label: `${String(d.getHours()).padStart(2, '0')}:00` })
    }
  }

  // ---- 项目统计 ----
  const projectStats = new Map<string, { total: number; types: Record<string, number> }>()
  projectNames.forEach(name => {
    const snips = projectMap.get(name) || []
    const types: Record<string, number> = { coding: 0, discussion: 0, debug: 0, docs: 0 }
    snips.forEach(s => { types[s.snippetType] = (types[s.snippetType] || 0) + 1 })
    projectStats.set(name, { total: snips.length, types })
  })

  return (
    <div style={{ fontSize: 13, userSelect: 'none' }}>
      {/* 图例 */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(COLORS).map(([type, color]) => (
          <Tag key={type} color={color} style={{ color: '#fff', border: 'none', fontSize: 11 }}>
            {LABELS[type]}
          </Tag>
        ))}
        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          {fmtHHMM(new Date(minTime).toISOString())} — {fmtHHMM(new Date(maxTime).toISOString())}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {/* 网格总宽度 */}
        <div style={{ minWidth: LABEL_W + slotCount * CELL_W + 40 }}>

          {/* ===== 时间轴行 ===== */}
          <div style={{ display: 'flex', marginLeft: LABEL_W, height: 22, position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
            {hourLabels.map((hl, i) => (
              <span key={i} style={{
                position: 'absolute',
                left: hl.col * CELL_W,
                fontSize: 10,
                color: 'var(--color-text-3)',
                transform: 'translateX(-50%)',
                top: 2
              }}>
                {hl.label}
              </span>
            ))}
          </div>

          {/* ===== 项目行 ===== */}
          {projectNames.map((proj, rowIdx) => {
            const stat = projectStats.get(proj)
            const snips = projectMap.get(proj) || []

            return (
              <div key={proj} style={{ marginBottom: 4 }}>
                {/* 项目名 + 统计 */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0, fontSize: 12, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    paddingRight: 8, color: 'var(--color-text-1)'
                  }} title={proj}>
                    🔧 {proj}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--color-text-3)' }}>
                    {Object.entries(stat?.types || {}).filter(([_, c]) => c > 0).map(([t, c]) => (
                      <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[t] || '#ccc' }} />
                        {LABELS[t] || t}×{c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 时间格行（flex 布局，与时间轴 label 共用 CELL_W 单位） */}
                <div style={{ display: 'flex', marginLeft: LABEL_W, height: 24 }}>
                  {Array.from({ length: slotCount }, (_, col) => {
                    const active = getCell(proj, col)
                    const bg = cellColor(active)
                    const isHour = col % 4 === 0
                    const isHovered = hoveredCell?.rowIdx === rowIdx && hoveredCell?.col === col

                    return (
                      <div
                        key={col}
                        style={{
                          width: CELL_W,
                          height: 24,
                          flexShrink: 0,
                          backgroundColor: bg || (isHour ? 'var(--color-fill-2)' : 'transparent'),
                          borderRight: isHour ? '1px solid var(--color-border)' : '1px solid transparent',
                          cursor: bg ? 'pointer' : 'default',
                          borderRadius: bg ? 2 : 0,
                          opacity: bg ? 0.82 : 1,
                          position: 'relative',
                          zIndex: isHovered ? 10 : 1,
                        }}
                        onMouseEnter={() => bg && setHoveredCell({ rowIdx, col })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {isHovered && bg && (
                          <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginBottom: 4,
                            background: 'var(--color-bg-1)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 6,
                            padding: '8px 12px',
                            fontSize: 12,
                            boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                            zIndex: 30,
                            whiteSpace: 'nowrap',
                            minWidth: 180,
                            maxWidth: 340,
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-text-1)', borderBottom: '1px solid var(--color-border)', paddingBottom: 4 }}>
                              ⏱ {fmtHHMM(new Date(minTime + col * SLOT_MS).toISOString())} — {fmtHHMM(new Date(minTime + (col + 1) * SLOT_MS).toISOString())}
                            </div>
                            {active.map((s, i) => (
                              <div key={i} style={{
                                marginBottom: i < active.length - 1 ? 8 : 0,
                                paddingBottom: i < active.length - 1 ? 6 : 0,
                                borderBottom: i < active.length - 1 ? '1px solid var(--color-border)' : 'none'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[s.snippetType] || '#ccc', flexShrink: 0 }} />
                                  <Tag size="small" color={COLORS[s.snippetType] || '#86909c'}
                                    style={{ color: '#fff', border: 'none', fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>
                                    {LABELS[s.snippetType] || s.snippetType}
                                  </Tag>
                                  <span style={{ fontWeight: 500, color: 'var(--color-text-1)', fontSize: 12 }}>{s.title}</span>
                                </div>
                                <div style={{ color: 'var(--color-text-2)', fontSize: 11, marginBottom: 2 }}>
                                  {fmtHHMM(s.startTime)} — {fmtHHMM(s.endTime)}
                                </div>
                                {s.description && (
                                  <div style={{ color: 'var(--color-text-3)', fontSize: 11, lineHeight: 1.5, maxWidth: 300 }}>
                                    {s.description.substring(0, 120)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
