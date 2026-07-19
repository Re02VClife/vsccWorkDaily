import { useState, useEffect } from 'react'
import {
  Card, List, Tag, Typography, Button, Popconfirm, Message, Spin,
  Modal, Form, Input, Checkbox
} from '@arco-design/web-react'
import { IconFolder, IconDelete, IconEdit } from '@arco-design/web-react/icon'
import type { ProjectConfig } from '../../shared/types'

const { Text } = Typography
const FormItem = Form.Item

interface Props {
  compact?: boolean
  selectedId?: number
  onSelect?: (id: number) => void
  onDeleted?: () => void
  onEdited?: () => void
  trackedIds?: Set<number>
  onToggleTrack?: (id: number, tracked: boolean) => void
}

export default function ProjectList({
  compact, onSelect, selectedId, onDeleted, onEdited,
  trackedIds = new Set(), onToggleTrack
}: Props) {
  const [projects, setProjects] = useState<ProjectConfig[]>([])
  const [loading, setLoading] = useState(true)

  // 编辑弹窗状态
  const [editVisible, setEditVisible] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectConfig | null>(null)
  const [editName, setEditName] = useState('')
  const [editRootPath, setEditRootPath] = useState('')
  const [editMdFile, setEditMdFile] = useState('')
  const [editMdFiles, setEditMdFiles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const loadProjects = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.invoke('get-projects')
      setProjects(result || [])
    } catch (e) {
      Message.error('加载项目失败: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.invoke('delete-project', id)
      Message.success('项目已删除')
      setProjects(prev => prev.filter(p => p.id !== id))
      onDeleted?.()
    } catch (e) {
      Message.error('删除失败: ' + String(e))
    }
  }

  const handleOpenEdit = (p: ProjectConfig) => {
    setEditingProject(p)
    setEditName(p.name)
    setEditRootPath(p.rootPath)
    setEditMdFiles([...p.mdFiles])
    setEditMdFile('')
    setEditVisible(true)
  }

  const handleAddEditMdFile = () => {
    const trimmed = editMdFile.trim()
    if (trimmed && !editMdFiles.includes(trimmed)) {
      setEditMdFiles([...editMdFiles, trimmed])
      setEditMdFile('')
    }
  }

  const handleSaveEdit = async () => {
    if (!editName.trim()) { Message.warning('请输入项目名称'); return }
    if (!editRootPath.trim()) { Message.warning('请输入项目路径'); return }
    if (!editingProject) return
    setSaving(true)
    try {
      await window.electronAPI.invoke('update-project', {
        id: editingProject.id,
        name: editName.trim(),
        rootPath: editRootPath.trim(),
        mdFiles: editMdFiles
      })
      Message.success('项目已更新')
      setEditVisible(false)
      loadProjects()
      onEdited?.()
    } catch (e) {
      Message.error('更新失败: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spin style={{ display: 'block', padding: 20 }} />

  if (compact) {
    return (
      <div>
        <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
          ☑ 追踪项目 ({trackedIds.size}/{projects.length})
        </Text>
        {projects.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>暂无项目</Text>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              style={{
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: selectedId === p.id ? 'var(--color-fill-2)' : 'transparent'
              }}
            >
              <Checkbox
                checked={trackedIds.has(p.id)}
                onChange={(checked) => {
                  onToggleTrack?.(p.id, checked)
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <span onClick={() => onSelect?.(p.id)} style={{ flex: 1 }}>
                📁 {p.name}
              </span>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <>
      <Card title="项目管理" style={{ height: '100%' }}
        extra={<Button type="text" onClick={loadProjects}>🔄</Button>}>
        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-3)' }}>
            暂无项目，请先在「添加项目」中添加
          </div>
        ) : (
          <List
            dataSource={projects}
            render={(p: ProjectConfig) => (
              <List.Item
                key={p.id}
                style={{ cursor: 'pointer' }}
                extra={
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <Button type="text" size="small" icon={<IconEdit />}
                      onClick={() => handleOpenEdit(p)} />
                    <Popconfirm title="确定删除此项目？" onOk={() => handleDelete(p.id)}>
                      <Button type="text" status="danger" size="small" icon={<IconDelete />} />
                    </Popconfirm>
                  </div>
                }
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Checkbox
                    checked={trackedIds.has(p.id)}
                    onChange={(checked) => onToggleTrack?.(p.id, checked)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 2 }}
                  />
                  <div onClick={() => onSelect?.(p.id)}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      <IconFolder style={{ marginRight: 6 }} />{p.name}
                      {trackedIds.has(p.id) && (
                        <Tag color="green" size="small" style={{ marginLeft: 8 }}>追踪中</Tag>
                      )}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      📂 {p.rootPath}
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      {p.mdFiles.map(f => (
                        <Tag key={f} size="small" style={{ marginRight: 4 }}>📄 {f}</Tag>
                      ))}
                    </div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 编辑项目弹窗 */}
      <Modal
        title="✏️ 修改项目"
        visible={editVisible}
        onOk={handleSaveEdit}
        onCancel={() => setEditVisible(false)}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <FormItem label="项目名称">
            <Input value={editName} onChange={setEditName} placeholder="项目名称" />
          </FormItem>
          <FormItem label="项目根路径">
            <Input value={editRootPath} onChange={setEditRootPath} placeholder="项目根路径" />
          </FormItem>
          <FormItem label="Markdown 文件">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={editMdFile} onChange={setEditMdFile} placeholder="PROGRESS.md"
                onPressEnter={handleAddEditMdFile} style={{ flex: 1 }} />
              <Button onClick={handleAddEditMdFile}>添加</Button>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {editMdFiles.map(f => (
                <Tag key={f} closable onClose={() => setEditMdFiles(prev => prev.filter(x => x !== f))}>
                  {f}
                </Tag>
              ))}
            </div>
          </FormItem>
        </Form>
      </Modal>
    </>
  )
}
