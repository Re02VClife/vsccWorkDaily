import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase, getDatabase } from '../../src/main/db'
import { loadConfig, saveConfig } from '../../src/main/config'
import { generateReport } from '../../src/main/report-generator'
import { scanRecentSessions, getClaudeProjectSlugs } from '../../src/main/jsonl-parser'
import { scanCodeChanges } from '../../src/main/git-collector'
import { chokidarWatcher } from '../../src/main/watcher'
import type { AppConfig, ProjectConfig, DailyReport } from '../../src/shared/types'

// 主窗口引用
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ==================== 窗口管理 ====================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: '工作日报',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭到托盘
  mainWindow.on('close', (event) => {
    const config = loadConfig()
    if (config.closeToTray && !(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  // 创建托盘图标（16x16 太小，用原生图标或空图标占位）
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  // 设置托盘标题（Windows 可见）
  tray.setToolTip('工作日报')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow?.show())
}

// ==================== 应用生命周期 ====================

;(app as any).isQuitting = false

app.whenReady().then(() => {
  // 初始化数据库
  initDatabase()

  // 启动文件监控
  const config = loadConfig()
  chokidarWatcher.start()

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  (app as any).isQuitting = true
  chokidarWatcher.stop()
  closeDatabase()
})

// ==================== IPC 处理 ====================

// ---- 配置 ----
ipcMain.handle('get-config', () => {
  return loadConfig()
})

ipcMain.handle('save-config', (_event, config: Partial<AppConfig>) => {
  return saveConfig(config)
})

// ---- 项目 CRUD ----
ipcMain.handle('get-projects', () => {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as any[]
  return rows.map(rowToProject)
})

ipcMain.handle('add-project', (_event, project: { name: string; rootPath: string; mdFiles: string[] }) => {
  const db = getDatabase()
  const result = db.prepare(
    'INSERT INTO projects (name, root_path, md_files) VALUES (?, ?, ?)'
  ).run(project.name, project.rootPath, JSON.stringify(project.mdFiles || []))
  return { id: result.lastInsertRowid }
})

ipcMain.handle('update-project', (_event, project: ProjectConfig) => {
  const db = getDatabase()
  db.prepare(
    `UPDATE projects SET name = ?, root_path = ?, md_files = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(project.name, project.rootPath, JSON.stringify(project.mdFiles), project.id)
  return { success: true }
})

ipcMain.handle('delete-project', (_event, id: number) => {
  const db = getDatabase()
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return { success: true }
})

// ---- Claude Code 项目导入 ----
ipcMain.handle('get-claude-projects', async () => {
  return await getClaudeProjectSlugs()
})

// ---- 扫描会话 ----
ipcMain.handle('scan-sessions', async (_event, since: string) => {
  const sessions = await scanRecentSessions(new Date(since))
  return sessions.map((s) => ({
    projectSlug: s.projectSlug,
    filePath: s.filePath,
    mtime: s.mtime.toISOString()
  }))
})

// ---- 扫描代码变更 ----
ipcMain.handle('scan-code-changes', async (_event, projectPath: string, date: string, projectId: number) => {
  return await scanCodeChanges(projectPath, date, projectId)
})

// ---- 日报生成 ----
ipcMain.handle('generate-report', async (event, projectId?: number, chunkSize?: number) => {
  const sender = event.sender
  const result = await generateReport(projectId, (msg: string) => {
    try { sender.send('report-progress', msg) } catch {}
  }, chunkSize || 100)
  return {
    reports: result.reports,
    errors: result.errors
  }
})

// ---- 日报 CRUD ----
ipcMain.handle('get-report', (_event, projectId: number, date: string) => {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM daily_reports WHERE project_id = ? AND date = ?'
  ).get(projectId, date) as any
  return row ? rowToReport(row) : null
})

ipcMain.handle('get-reports-by-date-range', (_event, startDate: string, endDate: string) => {
  const db = getDatabase()
  const rows = db.prepare(
    `SELECT dr.*, p.name as project_name
     FROM daily_reports dr
     JOIN projects p ON dr.project_id = p.id
     WHERE dr.date BETWEEN ? AND ?
     ORDER BY dr.date DESC`
  ).all(startDate, endDate) as any[]
  return rows.map((r: any) => ({
    ...rowToReport(r),
    projectName: r.project_name
  }))
})

ipcMain.handle('update-report', (_event, report: Partial<DailyReport>) => {
  const db = getDatabase()
  if (!report.id) return { success: false, error: '缺少 report id' }

  db.prepare(
    `UPDATE daily_reports SET
      edited_json = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    report.editedJson ? JSON.stringify(report.editedJson) : null,
    report.status || 'draft',
    report.id
  )
  return { success: true }
})

ipcMain.handle('delete-report', (_event, id: number) => {
  const db = getDatabase()
  db.prepare('DELETE FROM daily_reports WHERE id = ?').run(id)
  return { success: true }
})

// ---- 编辑反馈（AI 学习） ----
ipcMain.handle('save-edit-feedback', (_event, data: { projectId: number; fieldPath: string; original: string; edited: string }) => {
  const db = getDatabase()
  db.prepare(
    'INSERT INTO edit_feedback (project_id, field_path, original, edited) VALUES (?, ?, ?, ?)'
  ).run(data.projectId, data.fieldPath, data.original, data.edited)
  return { success: true }
})

// ---- API Key 测试 ----
ipcMain.handle('test-api-key', async (_event, apiKey: string, baseUrl?: string) => {
  const axios = require('axios')
  const results: { url: string; status: number; error: string; ok: boolean }[] = []

  // 构建测试 URL 列表（每种只测一个最快的）
  const testUrls: string[] = []
  if (baseUrl) {
    testUrls.push(baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`)
  } else {
    // 直接测最常见的路径，5秒超时
    testUrls.push('https://api.deepseek.com/chat/completions')
  }

  // 如果 key 像 Anthropic 格式，也测一下
  if (apiKey.startsWith('sk-ant-')) {
    try {
      const Anthropic = require('@anthropic-ai/sdk').default
      const ai = new Anthropic({ apiKey })
      await ai.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }]
      })
      results.push({ url: 'Anthropic API', status: 200, error: '', ok: true })
      return results
    } catch (e: any) {
      results.push({ url: 'Anthropic API', status: e.status || 0, error: e.message?.substring(0, 80), ok: false })
      return results
    }
  }

  // OpenAI 兼容测试
  for (const url of testUrls) {
    try {
      const res = await axios.post(url, {
        model: 'deepseek-v4-flash',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }]
      }, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 8000 // 8秒超时，够快了
      })
      if (res.status === 200) {
        results.push({ url, status: 200, error: '', ok: true })
        return results // 成功了立即返回
      }
    } catch (e: any) {
      const errMsg = e.response?.data?.error?.message || e.response?.statusText || e.code || e.message
      results.push({
        url,
        status: e.response?.status || 0,
        error: errMsg?.substring(0, 100) || '',
        ok: false
      })
    }
  }

  return results
})

// ---- 飞书导出 ----
// ---- DeepSeek 余额查询 ----
ipcMain.handle('get-deepseek-balance', async () => {
  const config = loadConfig()
  const apiKey = config.apiKey
  if (!apiKey) return { available: false, error: '未配置 API Key' }

  try {
    const https = require('https')
    return await new Promise((resolve) => {
      const req = https.get('https://api.deepseek.com/user/balance', {
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }, (res: any) => {
        let data = ''
        res.on('data', (chunk: string) => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve({
              available: json.is_available ?? false,
              infos: json.balance_infos ?? [],
              fetchedAt: Date.now()
            })
          } catch { resolve({ available: false, error: '解析余额数据失败' }) }
        })
      })
      req.on('error', (e: any) => resolve({ available: false, error: e.message }))
      req.on('timeout', () => { req.destroy(); resolve({ available: false, error: '请求超时' }) })
    })
  } catch (e: any) {
    return { available: false, error: e.message }
  }
})

// ---- 打开外部链接 ----
ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('export-feishu', async (_event, reportJson?: string) => {
  try {
    const { exportToFeishu } = await import('../../src/main/feishu-exporter')
    if (!reportJson) {
      // 如果没有传入日报数据，尝试加载最新的
      const db = getDatabase()
      const today = new Date().toISOString().slice(0, 10)
      const rows = db.prepare(
        `SELECT raw_json FROM daily_reports WHERE date = ? ORDER BY updated_at DESC LIMIT 1`
      ).all(today) as any[]
      if (rows.length === 0) {
        return { success: false, error: '没有找到今天的日报，请先生成日报' }
      }
      reportJson = rows[0].raw_json
    }
    const result = await exportToFeishu(typeof reportJson === 'string' ? reportJson : JSON.stringify(reportJson))
    return { success: true, url: result.url, docId: result.docId }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// ---- Markdown 导出 ----
ipcMain.handle('export-markdown', async (_event, reportJson: string) => {
  const { markdownExporter } = await import('../../src/main/markdown-exporter')
  return markdownExporter(reportJson)
})

// ---- 文件监控 ----
ipcMain.handle('start-watcher', () => {
  chokidarWatcher.start()
  return { success: true }
})

ipcMain.handle('stop-watcher', () => {
  chokidarWatcher.stop()
  return { success: true }
})

ipcMain.handle('get-watcher-status', () => {
  return { running: chokidarWatcher.isRunning() }
})

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

function rowToReport(row: any): DailyReport {
  return {
    id: row.id,
    projectId: row.project_id,
    date: row.date,
    rawJson: JSON.parse(row.raw_json || '{}'),
    editedJson: row.edited_json ? JSON.parse(row.edited_json) : null,
    tokenTotal: row.token_total,
    tokenCacheHit: row.token_cache_hit,
    costRmb: row.cost_rmb,
    issuesUnsolved: JSON.parse(row.issues_unsolved || '[]'),
    status: row.status,
    exportedFeishuDocId: row.exported_feishu_doc_id,
    exportedFeishuBaseId: row.exported_feishu_base_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
