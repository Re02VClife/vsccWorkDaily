import { useState, useRef, useCallback, useEffect } from 'react'
import { Button, Message, Space, Card } from '@arco-design/web-react'
import { IconUpload, IconDown, IconUp } from '@arco-design/web-react/icon'
import type { ManualInput as ManualInputType } from '../../shared/types'

interface ManualInputProps {
  value: ManualInputType
  onChange: (value: ManualInputType) => void
  disabled?: boolean
}

const MAX_DIMENSION = 2048
const JPEG_QUALITY = 0.85

/**
 * 将图片文件缩放至最大尺寸限制，返回 base64 data URI
 */
function resizeImageToMaxDimension(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = document.createElement('img')
      img.onload = () => {
        let { width, height } = img
        if (width <= maxDim && height <= maxDim) {
          resolve(reader.result as string)
          return
        }
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 从 contenteditable 的 HTML 中提取纯文本和图片列表（按位置排序）
 */
function extractFromHTML(html: string): { text: string; images: string[] } {
  const div = document.createElement('div')
  div.innerHTML = html
  const images: string[] = []
  const imgTags = div.querySelectorAll('img')
  imgTags.forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (src.startsWith('data:image/')) {
      images.push(src)
    }
  })
  // 获取纯文本（img 标签会被替换为空格）
  const text = (div.textContent || '').trim()
  return { text, images }
}

/**
 * 根据文本和图片列表重建 contenteditable HTML
 * 图片以 [IMG:N] 标记插入文本中，转换为 <img> 标签
 * 如果文本中没有 [IMG:N] 标记，图片追加到末尾
 */
function buildHTML(text: string, images: string[]): string {
  if (images.length === 0) {
    return escapeHTML(text)
  }
  // 检查文本中是否有 [IMG:N] 标记
  const imgTagRegex = /\[IMG:(\d+)\]/g
  let match
  const foundIndices: number[] = []
  while ((match = imgTagRegex.exec(text)) !== null) {
    foundIndices.push(parseInt(match[1], 10))
  }
  if (foundIndices.length > 0 && foundIndices.length <= images.length) {
    // 替换 [IMG:N] 为实际图片
    let html = escapeHTML(text)
    foundIndices.forEach((idx) => {
      if (idx < images.length) {
        html = html.replace(
          `[IMG:${idx}]`,
          `<img src="${images[idx]}" style="max-width:300px;max-height:200px;vertical-align:middle;border-radius:4px;margin:2px 4px;" data-img-idx="${idx}" />`
        )
      }
    })
    return html
  }
  // 没有标记：文本在前，图片追加到末尾
  let html = escapeHTML(text)
  images.forEach((img, idx) => {
    html += `<div style="margin:4px 0;"><img src="${img}" style="max-width:300px;max-height:200px;border-radius:4px;" data-img-idx="${idx}" /></div>`
  })
  return html
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/**
 * 在光标位置插入 HTML
 */
function insertHTMLAtCursor(html: string) {
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const fragment = range.createContextualFragment(html)
    range.insertNode(fragment)
    // 移动光标到插入内容之后
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

export default function ManualInput({ value, onChange, disabled }: ManualInputProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  // 跟踪图片插入序号
  const imgCounterRef = useRef(0)

  const hasContent = value.text.trim() || value.images.length > 0
  useEffect(() => {
    if (hasContent) {
      setCollapsed(false)
    }
  }, [hasContent])

  // 当外部 value 变化时，更新编辑器内容（保持光标位置）
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const { text, images } = extractFromHTML(editor.innerHTML)
    // 只在内容不同步时更新（避免死循环）
    if (text !== value.text || images.length !== value.images.length) {
      const sel = window.getSelection()
      // 尝试保存光标位置
      let cursorOffset = 0
      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        const preRange = document.createRange()
        preRange.selectNodeContents(editor)
        preRange.setEnd(range.startContainer, range.startOffset)
        cursorOffset = preRange.toString().length
      }
      editor.innerHTML = buildHTML(value.text, value.images)
      // 尝试恢复光标
      restoreCursor(editor, cursorOffset)
    }
  }, [value])

  // 恢复光标到指定偏移位置
  function restoreCursor(container: Node, offset: number) {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    let current = 0
    function traverse(node: Node): boolean {
      if (node.nodeType === Node.TEXT_NODE) {
        if (current + (node.textContent?.length || 0) >= offset) {
          range.setStart(node, offset - current)
          range.collapse(true)
          return true
        }
        current += node.textContent?.length || 0
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          if (traverse(node.childNodes[i])) return true
        }
      }
      return false
    }
    if (traverse(container)) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }

  // 从编辑器提取内容并通知父组件
  const syncContent = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const { text, images } = extractFromHTML(editor.innerHTML)
    if (text !== value.text || JSON.stringify(images) !== JSON.stringify(value.images)) {
      onChange({ text, images })
    }
  }, [value, onChange])

  // 处理粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length === 0) return

    e.preventDefault()
    ;(async () => {
      for (const file of imageFiles) {
        try {
          const dataUri = await resizeImageToMaxDimension(file, MAX_DIMENSION)
          const idx = imgCounterRef.current++
          insertHTMLAtCursor(
            `<img src="${dataUri}" style="max-width:300px;max-height:200px;border-radius:4px;margin:2px 4px;" data-img-idx="${idx}" />`
          )
        } catch { /* skip */ }
      }
      syncContent()
    })()
  }, [disabled, syncContent])

  // 拖拽
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (disabled) return

    // 先设置光标到 drop 位置
    const editor = editorRef.current
    if (editor) {
      const sel = window.getSelection()
      if (sel && e.target instanceof Node && editor.contains(e.target)) {
        // 尝试将光标放到 drop 的目标位置
        const range = document.caretRangeFromPoint(e.clientX, e.clientY)
        if (range) {
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
      editor.focus()
    }

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    ;(async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file.type.startsWith('image/')) continue
        try {
          const dataUri = await resizeImageToMaxDimension(file, MAX_DIMENSION)
          const idx = imgCounterRef.current++
          insertHTMLAtCursor(
            `<img src="${dataUri}" style="max-width:300px;max-height:200px;border-radius:4px;margin:2px 4px;" data-img-idx="${idx}" />`
          )
        } catch { /* skip */ }
      }
      syncContent()
    })()
  }, [disabled, syncContent])

  // 文件选择按钮
  const handleFileSelect = useCallback(() => {
    if (disabled) return
    fileInputRef.current?.click()
  }, [disabled])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const editor = editorRef.current
    if (editor) editor.focus()

    ;(async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!file.type.startsWith('image/')) continue
        try {
          const dataUri = await resizeImageToMaxDimension(file, MAX_DIMENSION)
          const idx = imgCounterRef.current++
          insertHTMLAtCursor(
            `<img src="${dataUri}" style="max-width:300px;max-height:200px;border-radius:4px;margin:2px 4px;" data-img-idx="${idx}" />`
          )
        } catch { /* skip */ }
      }
      syncContent()
    })()

    e.target.value = ''
  }, [disabled, syncContent])

  return (
    <div
      className="manual-input-section"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Card
        style={{ marginBottom: 20 }}
        title={
          <div
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setCollapsed(!collapsed)}
          >
            <span>{collapsed ? <IconDown /> : <IconUp />}</span>
            <span style={{ marginLeft: 8 }}>📝 手动补充工作内容</span>
            {hasContent && collapsed && (
              <span style={{ color: 'var(--color-primary-6)', marginLeft: 8, fontSize: 13, fontWeight: 400 }}>
                （有文字{value.images.length > 0 ? `和${value.images.length}张图片` : ''}）
              </span>
            )}
          </div>
        }
      >
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 图文混排编辑区 */}
            <div
              ref={editorRef}
              contentEditable={!disabled}
              suppressContentEditableWarning
              onInput={syncContent}
              onPaste={handlePaste}
              className="manual-editor"
              data-placeholder="补充今天的工作内容、注意事项等，AI 将结合这些信息生成日报。支持直接粘贴图片、拖拽图片到文字中。"
              style={{
                minHeight: 120,
                maxHeight: 400,
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '10px 12px',
                lineHeight: 1.8,
                fontSize: 14,
                color: 'var(--color-text-1)',
                background: disabled ? 'var(--color-fill-1)' : 'var(--color-bg-1)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />

            {/* 底部工具栏 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button
                icon={<IconUpload />}
                onClick={handleFileSelect}
                disabled={disabled}
                size="small"
              >
                插入图片
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                支持直接粘贴、拖拽或点击插入图片到光标位置{value.images.length > 0 ? `（已插入 ${value.images.length} 张）` : ''}
              </span>
            </div>

            {/* 拖拽高亮覆盖层 */}
            {dragOver && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(22,93,255,0.06)',
                  border: '2px dashed var(--color-primary-6)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              >
                <span style={{ fontSize: 16, color: 'var(--color-primary-6)', fontWeight: 600 }}>
                  📥 释放图片到光标位置
                </span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
