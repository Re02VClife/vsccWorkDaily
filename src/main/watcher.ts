import { watch, FSWatcher } from 'chokidar'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { parseJsonlFile, extractSessionMeta } from './jsonl-parser'
import { generateMicroSummary } from './ai-engine'
import { getDatabase } from './db'
import type { BrowserWindow } from 'electron'

// Claude Code 项目数据根目录
const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')

class ChokidarWatcher {
  private watcher: FSWatcher | null = null
  private running = false
  private mainWindow: BrowserWindow | null = null

  // 设置主窗口引用（用于推送事件到渲染进程）
  setWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  start(): void {
    if (this.running) return
    if (!existsSync(CLAUDE_PROJECTS_DIR)) {
      console.warn('[watcher] Claude Code 项目目录不存在，跳过文件监控')
      return
    }

    this.running = true

    // 监控所有项目的 JSONL 文件变化
    this.watcher = watch(join(CLAUDE_PROJECTS_DIR, '**/*.jsonl'), {
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true, // 不触发初始扫描
      awaitWriteFinish: {
        stabilityThreshold: 2000, // 文件稳定 2 秒后才触发
        pollInterval: 100
      }
    })

    this.watcher
      .on('add', (filePath) => this.handleNewFile(filePath))
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('error', (error) => console.error('[watcher] 监控错误:', error))

    console.log('[watcher] 文件监控已启动')
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.running = false
    console.log('[watcher] 文件监控已停止')
  }

  isRunning(): boolean {
    return this.running
  }

  /**
   * 处理新的 JSONL 文件（新会话）
   */
  private async handleNewFile(filePath: string): Promise<void> {
    console.log(`[watcher] 检测到新会话: ${filePath}`)
    // P0 阶段先记录，P1 阶段实现自动微摘要
    // 微摘要在一键生成时统一处理，避免打断用户工作
    if (this.mainWindow) {
      this.mainWindow.webContents.send('on-new-session', { filePath })
    }
  }

  /**
   * 处理 JSONL 文件变更（会话追加内容）
   */
  private async handleFileChange(filePath: string): Promise<void> {
    console.log(`[watcher] 会话更新: ${filePath}`)
    // P0 阶段同样只记录
  }
}

// 单例导出
export const chokidarWatcher = new ChokidarWatcher()
