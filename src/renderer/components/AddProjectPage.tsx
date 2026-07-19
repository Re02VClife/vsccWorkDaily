import { useState } from 'react'
import { Card, Form, Input, Button, Message, Tag } from '@arco-design/web-react'

const FormItem = Form.Item

interface Props {
  onAdded?: () => void
}

export default function AddProjectPage({ onAdded }: Props) {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [mdFile, setMdFile] = useState('')
  const [mdFiles, setMdFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleAddMdFile = () => {
    const trimmed = mdFile.trim()
    if (trimmed && !mdFiles.includes(trimmed)) {
      setMdFiles([...mdFiles, trimmed])
      setMdFile('')
    }
  }

  const handleRemoveMdFile = (file: string) => {
    setMdFiles(mdFiles.filter(f => f !== file))
  }

  const handleSave = async () => {
    if (!name.trim()) { Message.warning('请输入项目名称'); return }
    if (!rootPath.trim()) { Message.warning('请输入项目路径'); return }
    setLoading(true)
    try {
      await window.electronAPI.invoke('add-project', {
        name: name.trim(),
        rootPath: rootPath.trim(),
        mdFiles
      })
      Message.success('项目已添加')
      setName('')
      setRootPath('')
      setMdFiles([])
      onAdded?.()
    } catch (e) {
      Message.error('添加失败: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <Card title="➕ 添加项目">
        <Form layout="vertical">
          <FormItem label="项目名称" required>
            <Input value={name} onChange={setName}
              placeholder="例如：机械臂VLA" />
          </FormItem>
          <FormItem label="项目根路径" required>
            <Input value={rootPath} onChange={setRootPath}
              placeholder="例如：C:\Users\你的用户名\Desktop\my-project" />
          </FormItem>
          <FormItem label="要扫描的 Markdown 文件（相对于项目根目录）">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={mdFile} onChange={setMdFile}
                placeholder="例如：PROGRESS.md"
                onPressEnter={handleAddMdFile}
                style={{ flex: 1 }} />
              <Button onClick={handleAddMdFile}>添加</Button>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {mdFiles.map(f => (
                <Tag key={f} closable onClose={() => handleRemoveMdFile(f)}>{f}</Tag>
              ))}
            </div>
          </FormItem>
          <FormItem>
            <Button type="primary" loading={loading} onClick={handleSave} size="large">
              💾 保存项目
            </Button>
          </FormItem>
        </Form>
      </Card>
    </div>
  )
}
