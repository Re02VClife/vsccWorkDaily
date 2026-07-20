// 共享类型定义 — 主进程和渲染进程共用

// ==================== 项目配置 ====================
export interface ProjectConfig {
  id: number
  name: string
  rootPath: string
  mdFiles: string[] // 要扫描的 MD 文件路径列表
  createdAt: string
  updatedAt: string
}

// ==================== 对话会话 ====================
export interface Session {
  id: number
  projectId: number
  sessionId: string // JSONL 的 sessionId (UUID)
  model: string
  startedAt: string
  endedAt: string
  roundCount: number
  parentSessionId: string | null
}

// ==================== 微摘要 ====================
export interface SessionSummary {
  id: number
  sessionId: string
  roundStart: number
  roundEnd: number
  topic: string // 讨论主题（1句话）
  conclusion: string // 结论/产出（1句话）
  tokenInput: number
  tokenOutput: number
  tokenCacheHit: number
  tokenCacheWrite: number
  model: string
  costRmb: number
  generatedAt: string
}

// ==================== 工作片段（甘特图行） ====================
export type SnippetType = 'coding' | 'discussion' | 'debug' | 'docs'

export interface WorkSnippet {
  id: number
  projectId: number
  date: string
  snippetType: SnippetType
  title: string
  description: string
  startTime: string
  endTime: string
  source: string // session_id | git_commit_hash | manual
}

// ==================== 代码产出 ====================
export type ChangeType = 'added' | 'modified' | 'deleted'

export interface CodeChange {
  id: number
  projectId: number
  date: string
  filePath: string
  changeType: ChangeType
  linesAdded: number
  linesRemoved: number
  description: string
  commitHash: string
}

// ==================== 日报 ====================
export type ReportStatus = 'draft' | 'published' | 'exported'

export interface DailyReport {
  id: number
  projectId: number
  date: string
  rawJson: ReportContent
  editedJson: ReportContent | null
  tokenTotal: number
  tokenCacheHit: number
  costRmb: number
  issuesUnsolved: string[]
  status: ReportStatus
  exportedFeishuDocId: string | null
  exportedFeishuBaseId: string | null
  createdAt: string
  updatedAt: string
}

// 日报内容结构
export interface ReportContent {
  overview: ReportOverview
  projects: ProjectReport[]
}

export interface ReportOverview {
  projectCount: number
  totalSessions: number
  totalCodeChanges: number
  totalTokens: number
  cacheHitTokens: number
  cacheHitRate: number
  totalCostRmb: number
  costSavedRmb: number
  issuesUnsolvedCount: number
  // 详细 Token 仪表盘数据（本地计算，非 AI 生成）
  tokenDashboard?: TokenDashboard
  // 用户手动补充的工作内容（保存供后续参考）
  manualInput?: ManualInput
}

export interface TokenDashboard {
  model: string                     // 使用的模型名
  totalInput: number                // 总输入 token（计费的非缓存部分）
  totalOutput: number               // 总输出 token
  cacheHitRate: number              // 缓存命中率 %（多轮取最大值，代表稳态效率）
  totalCostRmb: number              // 总费用
  avgCostPerRound: number           // 平均每轮费用
  totalRounds: number               // 总会话轮数（去重后）
  balance?: string                  // 账户余额
}

// ==================== 用户手动输入 ====================
export interface ManualInput {
  text: string           // 用户手动输入的工作内容描述
  images: string[]       // 图片的 base64 data URI 数组 (data:image/...)
}

export interface ProjectReport {
  projectName: string
  progress: ProgressItem[]
  codeChanges: CodeChangeDisplay[]
  issues: IssueItem[]
  solutions: SolutionItem[]
  aiConversations: AIConversationDisplay[]
  tokenSummary: TokenSummary
}

export interface ProgressItem {
  content: string
  source?: string
}

export interface CodeChangeDisplay {
  filePath: string
  changeType: ChangeType
  linesAdded: number
  linesRemoved: number
  description: string
}

export interface IssueItem {
  content: string
  isSolved: boolean
}

export interface SolutionItem {
  content: string
  relatedIssue: string
}

export interface AIConversationDisplay {
  timeRange: string
  topic: string
  model?: string
  roundCount: number
  inputTokens: number
  cacheHit: number
  outputTokens: number
  tokens: number
  cacheHitRate: number
  costRmb: number
}

export interface TokenSummary {
  total: number
  inputTokens: number
  cacheHit: number
  outputTokens: number
  cacheHitRate: number
  costRmb: number
  avgCostPerRound: number
  totalRounds: number
  model?: string
}

// ==================== 编辑反馈 ====================
export interface EditFeedback {
  id: number
  projectId: number
  fieldPath: string
  original: string
  edited: string
  createdAt: string
}

// ==================== JSONL 原始数据 ====================
export interface JsonlEntry {
  type: string
  timestamp: string
  sessionId: string
  uuid: string
  parentUuid: string | null
  cwd: string
  model?: string
  // 顶层 usage（旧格式兼容）
  usage?: JsonlUsage
  // 实际 JSONL 格式：usage、model、id 都在 message 里面
  message?: {
    id?: string       // 用于去重：同一轮 thinking + text 共享相同 id
    role: string
    model?: string
    content: unknown
    usage?: JsonlUsage
  }
  isSidechain?: boolean
  attributionAgent?: string
  attributionSkill?: string
  gitBranch?: string
  entrypoint?: string
}

export interface JsonlUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  cache_creation?: {
    ephemeral_1h_input_tokens: number
    ephemeral_5m_input_tokens: number
  }
  server_tool_use?: {
    web_search_requests: number
    web_fetch_requests: number
  }
  service_tier: string
}

// ==================== 配置 ====================
export interface AppConfig {
  version: string
  workdayStartHour: number // 工作日开始时间 (默认 5 = 凌晨5点)
  closeToTray: boolean // 关闭窗口时最小化到托盘
  feishu: FeishuConfig
  modelPricing: ModelPricingMap
  defaultModel: string
  feishuExportTarget: 'personal' | 'team'
  apiKey: string // AI API Key
  apiBaseUrl?: string // 自定义 API 地址（可选，默认用官方地址）
  trackedProjectIds: number[] // 追踪中的项目 ID
  chunkSize: number // 摘要切割轮数 (默认100)
}

export interface FeishuConfig {
  appId: string
  appSecret: string
  docFolderToken?: string // 飞书文档导出文件夹
  baseAppToken?: string // 多维表格 app token
  baseTableId?: string // 多维表格 table id
}

export interface ModelPricing {
  inputPerMTok: number // 每百万 input token 价格 — 缓存未命中 (RMB)
  cacheHitPerMTok: number // 每百万 input token — 缓存命中价格 (RMB)
  outputPerMTok: number // 每百万 output token 价格 (RMB)
}

export type ModelPricingMap = Record<string, ModelPricing>

// ==================== IPC 通道 ====================
export const IPC_CHANNELS = {
  // 配置
  GET_CONFIG: 'get-config',
  SAVE_CONFIG: 'save-config',

  // 项目
  GET_PROJECTS: 'get-projects',
  ADD_PROJECT: 'add-project',
  UPDATE_PROJECT: 'update-project',
  DELETE_PROJECT: 'delete-project',

  // JSONL 扫描
  SCAN_SESSIONS: 'scan-sessions',
  GET_SESSION_SUMMARIES: 'get-session-summaries',

  // Git
  SCAN_CODE_CHANGES: 'scan-code-changes',

  // 日报
  GENERATE_REPORT: 'generate-report',
  GET_REPORT: 'get-report',
  GET_REPORTS_BY_DATE_RANGE: 'get-reports-by-date-range',
  UPDATE_REPORT: 'update-report',
  DELETE_REPORT: 'delete-report',

  // 飞书导出
  EXPORT_FEISHU: 'export-feishu',
  EXPORT_FEISHU_BITABLE: 'export-feishu-bitable',

  // 工作片段 (甘特图)
  GET_WORK_SNIPPETS: 'get-work-snippets',

  // 文件监控
  START_WATCHER: 'start-watcher',
  STOP_WATCHER: 'stop-watcher',
  ON_NEW_SESSION: 'on-new-session' // 新对话事件推送
} as const
