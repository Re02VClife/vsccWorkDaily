import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import type { AppConfig, ModelPricingMap } from '../shared/types'

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
  version: '0.1.0',
  workdayStartHour: 5,
  closeToTray: false,
  apiKey: '',
  apiBaseUrl: '',
  feishu: {
    appId: '',
    appSecret: '',
    docFolderToken: '',
    baseAppToken: '',
    baseTableId: ''
  },
  modelPricing: {
    'deepseek-v4-flash': { inputPerMTok: 1.0, cacheHitPerMTok: 0.02, outputPerMTok: 2.0 },
    'deepseek-v4-pro': { inputPerMTok: 7.0, cacheHitPerMTok: 0.14, outputPerMTok: 21.0 },
    'claude-sonnet-5': { inputPerMTok: 21.0, cacheHitPerMTok: 2.1, outputPerMTok: 105.0 },
    'claude-opus-4-8': { inputPerMTok: 105.0, cacheHitPerMTok: 10.5, outputPerMTok: 525.0 },
    'claude-haiku-4-5': { inputPerMTok: 7.0, cacheHitPerMTok: 0.7, outputPerMTok: 35.0 }
  } as ModelPricingMap,
  defaultModel: 'deepseek-v4-flash',
  feishuExportTarget: 'personal',
  trackedProjectIds: [],
  chunkSize: 100
}

// 获取配置文件路径（延迟计算，避免模块顶层调用 electron API）
function getConfigDir(): string {
  return join(homedir(), '.work-report')
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

// 确保配置目录存在
function ensureConfigDir(): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// 读取配置
export function loadConfig(): AppConfig {
  ensureConfigDir()
  try {
    const configPath = getConfigPath()
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8')
      const saved = JSON.parse(raw) as Partial<AppConfig>
      return { ...DEFAULT_CONFIG, ...saved }
    }
  } catch (err) {
    console.error('读取配置文件失败，使用默认配置:', err)
  }
  return { ...DEFAULT_CONFIG }
}

// 保存配置
export function saveConfig(config: Partial<AppConfig>): AppConfig {
  ensureConfigDir()
  const current = loadConfig()
  const updated = { ...current, ...config }
  writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

// 导出配置文件路径
export function getConfigFilePath(): string {
  return getConfigPath()
}
