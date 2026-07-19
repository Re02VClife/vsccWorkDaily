import { useState, useCallback, useEffect } from 'react'
import { Layout, Menu, Button, Message, InputNumber, Tooltip } from '@arco-design/web-react'
import {
  IconApps,
  IconHistory,
  IconFile,
  IconSettings
} from '@arco-design/web-react/icon'
import ProjectList from './components/ProjectList'
import ReportPreview from './components/ReportPreview'
import AddProjectPage from './components/AddProjectPage'
import HistoryPage from './components/HistoryPage'
import SettingsPage from './components/SettingsPage'
import './styles/global.css'

const { Sider, Content } = Layout

// 从配置中持久化追踪项目 ID（存储 key）
const TRACKED_IDS_KEY = 'trackedProjectIds'

export default function App() {
  const [selectedMenu, setSelectedMenu] = useState('today')
  const [projectKey, setProjectKey] = useState(0)
  const [reportRefreshKey, setReportRefreshKey] = useState(0)  // 生成完成后强制刷新日报预览
  const [trackedIds, setTrackedIds] = useState<Set<number>>(new Set())
  // 日报生成进度
  const [generating, setGenerating] = useState(false)
  const [progressLog, setProgressLog] = useState<string[]>([])
  // 摘要分割轮数
  const [chunkSize, setChunkSize] = useState(100)

  // 启动时从 config 恢复追踪列表
  useEffect(() => {
    window.electronAPI.invoke('get-config').then((config: any) => {
      if (config?.trackedProjectIds) {
        setTrackedIds(new Set(config.trackedProjectIds))
      }
      if (config?.chunkSize) {
        setChunkSize(config.chunkSize)
      }
    }).catch(() => {})
  }, [])

  // 切换项目追踪状态
  const handleToggleTrack = useCallback((id: number, tracked: boolean) => {
    setTrackedIds(prev => {
      const next = new Set(prev)
      if (tracked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      // 持久化
      window.electronAPI.invoke('save-config', { trackedProjectIds: [...next] }).catch(() => {})
      return next
    })
  }, [])

  const refreshProjects = useCallback(() => {
    setProjectKey(k => k + 1)
  }, [])

  const handleGenerate = async () => {
    const ids = [...trackedIds]
    if (ids.length === 0) {
      Message.warning('请先在左侧勾选要追踪的项目')
      return
    }

    setGenerating(true)
    setProgressLog([])

    // 监听进度更新
    const unsub = window.electronAPI.on('report-progress', (msg: string) => {
      setProgressLog(prev => [...prev, msg])
    })

    let successCount = 0
    const allErrors: string[] = []

    // 保存 chunkSize 到配置
    window.electronAPI.invoke('save-config', { chunkSize }).catch(() => {})

    try {
      for (const id of ids) {
        const result = await window.electronAPI.invoke('generate-report', id, chunkSize)
        if (result.errors && result.errors.length > 0) {
          allErrors.push(...result.errors)
        }
        if (result.reports && result.reports.length > 0) {
          successCount++
        }
      }

      if (allErrors.length > 0) {
        Message.error({ content: `生成失败：${allErrors[0]}`, duration: 6000 })
      } else if (successCount > 0) {
        Message.success({ content: `✅ 已为 ${successCount} 个项目生成日报` })
      } else {
        Message.warning({ content: '日报生成完成，但无有效结果' })
      }
    } catch (err) {
      Message.error({ content: `生成失败: ${String(err)}`, duration: 6000 })
    } finally {
      unsub()
      setGenerating(false)
      setReportRefreshKey(k => k + 1)  // 强制日报预览重新加载
    }
  }

  const handleExport = async () => {
    Message.loading({ content: '正在导出到飞书...', id: 'export' })
    try {
      const result = await window.electronAPI.invoke('export-feishu')
      if (result.success && result.url) {
        Message.success({ content: '飞书导出成功！正在打开...', id: 'export' })
        // 用系统浏览器打开飞书链接
        window.electronAPI.invoke('open-external', result.url)
      } else {
        Message.error({ content: `导出失败: ${result.error || '未知错误'}`, id: 'export', duration: 6000 })
      }
    } catch (err) {
      Message.error({ content: `导出失败: ${String(err)}`, id: 'export', duration: 5000 })
    }
  }

  const renderContent = () => {
    switch (selectedMenu) {
      case 'today':
        return <ReportPreview key={reportRefreshKey} trackedIds={trackedIds} />
      case 'history':
        return <HistoryPage />
      case 'project-list':
        return (
          <ProjectList
            key={projectKey}
            trackedIds={trackedIds}
            onToggleTrack={handleToggleTrack}
            onDeleted={refreshProjects}
          />
        )
      case 'add-project':
        return <AddProjectPage onAdded={refreshProjects} />
      case 'settings':
        return <SettingsPage />
      default:
        return <ReportPreview key={reportRefreshKey} trackedIds={trackedIds} />
    }
  }

  const getPageTitle = () => {
    switch (selectedMenu) {
      case 'history': return '📅 历史记录'
      case 'project-list': return '📁 项目管理'
      case 'add-project': return '➕ 添加项目'
      case 'settings': return '⚙️ 设置'
      default: return ''
    }
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={240} style={{ background: 'var(--color-bg-2)' }}>
        <div
          style={{
            padding: '20px 16px',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text-1)',
            borderBottom: '1px solid var(--color-border)'
          }}
        >
          📋 工作日报
        </div>

        <Menu
          mode="vertical"
          selectedKeys={[selectedMenu]}
          onClickMenuItem={(key) => setSelectedMenu(key)}
          style={{ marginTop: 12 }}
        >
          <Menu.Item key="today">
            <IconFile /> 今日日报
          </Menu.Item>
          <Menu.Item key="history">
            <IconHistory /> 历史记录
          </Menu.Item>
          <Menu.SubMenu
            key="projects"
            title={<span><IconApps /> 项目管理</span>}
          >
            <Menu.Item key="project-list">项目列表</Menu.Item>
            <Menu.Item key="add-project">添加项目</Menu.Item>
          </Menu.SubMenu>
          <Menu.Item key="settings">
            <IconSettings /> 设置
          </Menu.Item>
        </Menu>

        {/* 侧边栏项目列表 — 带复选框 */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', marginTop: 'auto' }}>
          <ProjectList
            compact
            key={projectKey}
            trackedIds={trackedIds}
            onToggleTrack={handleToggleTrack}
          />
        </div>
      </Sider>

      <Layout>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          {selectedMenu === 'today' && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24
            }}>
              <h2 style={{ margin: 0 }}>
                {new Date().toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long'
                })}
              </h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Tooltip content="摘要切分粒度：每 N 轮对话生成一段摘要。值越小日报越详细但越慢，值越大越快但越概括">
                  <InputNumber
                    value={chunkSize}
                    min={1} max={500}
                    step={10}
                    onChange={v => setChunkSize(v ?? 100)}
                    style={{ width: 110 }}
                    prefix="每"
                    suffix="轮"
                    disabled={generating}
                  />
                </Tooltip>
                <Button type="primary" size="large" onClick={handleGenerate}>
                  🔄 一键生成日报
                </Button>
                <Button type="outline" size="large" onClick={handleExport}>
                  📤 导出飞书
                </Button>
              </div>
            </div>
          )}

          {selectedMenu !== 'today' && (
            <h2 style={{ marginBottom: 24 }}>{getPageTitle()}</h2>
          )}

          {/* 生成进度面板 */}
          {generating && (
            <div style={{
              background: 'var(--color-fill-1)',
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: 20,
              border: '1px solid var(--color-primary-light-3)',
              maxHeight: 600,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap'
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--color-primary-6)' }}>
                ⏳ 正在生成日报...
              </div>
              {progressLog.map((msg, i) => (
                <div key={i} style={{ color: 'var(--color-text-2)' }}>{msg}</div>
              ))}
              {progressLog.length === 0 && (
                <div style={{ color: 'var(--color-text-3)' }}>准备中...</div>
              )}
            </div>
          )}

          {!generating && renderContent()}
        </Content>
      </Layout>
    </Layout>
  )
}
