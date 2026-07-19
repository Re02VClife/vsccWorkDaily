import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'

let db: Database.Database | null = null
let dbPath: string = ''

// 初始化数据库（必须在 app.whenReady 之后调用）
export function initDatabase(dbDir?: string): Database.Database {
  const dir = dbDir || join(homedir(), '.work-report')
  dbPath = join(dir, 'reports.db')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 创建表结构
  createTables()

  return db
}

// 获取数据库实例
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase()
  }
  return db
}

// 关闭数据库
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// 创建所有表
function createTables(): void {
  if (!db) return

  db.exec(`
    -- 项目配置
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      md_files TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 对话会话
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      model TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      round_count INTEGER NOT NULL DEFAULT 0,
      parent_session_id TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 微摘要
    CREATE TABLE IF NOT EXISTS session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      round_start INTEGER NOT NULL,
      round_end INTEGER NOT NULL,
      topic TEXT NOT NULL,
      conclusion TEXT,
      token_input INTEGER NOT NULL DEFAULT 0,
      token_output INTEGER NOT NULL DEFAULT 0,
      token_cache_hit INTEGER NOT NULL DEFAULT 0,
      token_cache_write INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      cost_rmb REAL NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    );

    -- 工作片段
    CREATE TABLE IF NOT EXISTS work_snippets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      snippet_type TEXT NOT NULL CHECK(snippet_type IN ('coding','discussion','debug','docs')),
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      source TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 代码产出
    CREATE TABLE IF NOT EXISTS code_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      file_path TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('added','modified','deleted')),
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_removed INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      commit_hash TEXT,
      git_diff TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 日报主表
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      edited_json TEXT,
      token_total INTEGER NOT NULL DEFAULT 0,
      token_cache_hit INTEGER NOT NULL DEFAULT 0,
      cost_rmb REAL NOT NULL DEFAULT 0,
      issues_unsolved TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','exported')),
      exported_feishu_doc_id TEXT,
      exported_feishu_base_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, date)
    );

    -- 编辑反馈（AI 学习用）
    CREATE TABLE IF NOT EXISTS edit_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      field_path TEXT NOT NULL,
      original TEXT NOT NULL,
      edited TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id);
    CREATE INDEX IF NOT EXISTS idx_snippets_project_date ON work_snippets(project_id, date);
    CREATE INDEX IF NOT EXISTS idx_code_changes_project_date ON code_changes(project_id, date);
    CREATE INDEX IF NOT EXISTS idx_reports_project_date ON daily_reports(project_id, date);
    CREATE INDEX IF NOT EXISTS idx_feedback_project ON edit_feedback(project_id);
  `)
}
