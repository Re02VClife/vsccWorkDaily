import { readFileSync, existsSync, statSync } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { JsonlEntry, JsonlUsage } from '../shared/types'

// Claude Code 项目数据根目录
const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')

/**
 * 解析 JSONL 文件为条目数组
 */
export function parseJsonlFile(filePath: string): JsonlEntry[] {
  if (!existsSync(filePath)) return []

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  const entries: JsonlEntry[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as JsonlEntry)
    } catch {
      continue
    }
  }

  return entries
}

/**
 * 获取去重后的 assistant usage 条目。
 * Claude Code 每轮对话产生两条 assistant 条目（thinking + text），
 * 它们共享相同的 message.id，必须按 id 去重避免 Token 重复统计。
 * 同一 id 的多条条目中，取 usage 值最大的一组（通常是 thinking 块更完整）。
 */
export interface DedupedUsageEntry {
  usage: JsonlUsage
  model?: string
  timestamp: string
  cacheHitRate: number  // 本轮缓存命中率
}

export function getDedupedUsage(entries: JsonlEntry[]): DedupedUsageEntry[] {
  const seen = new Map<string, DedupedUsageEntry>()

  for (const entry of entries) {
    if (entry.type !== 'assistant') continue

    // 优先从 message.usage 取，兼容顶层 usage
    const usage = entry.message?.usage ?? entry.usage
    if (!usage) continue

    // 去重 key：message.id > uuid
    const dedupKey = entry.message?.id || entry.uuid
    if (!dedupKey) continue

    const model = entry.message?.model ?? entry.model
    const roundTotal = (usage.cache_read_input_tokens || 0) + (usage.input_tokens || 0)
    const cacheHitRate = roundTotal > 0
      ? (usage.cache_read_input_tokens || 0) / roundTotal
      : 0

    // 同一 id 取 input_tokens 最大的条目（thinking 块通常更完整）
    const existing = seen.get(dedupKey)
    if (!existing || (usage.input_tokens || 0) > (existing.usage.input_tokens || 0)) {
      seen.set(dedupKey, {
        usage,
        model,
        timestamp: entry.timestamp,
        cacheHitRate
      })
    }
  }

  return Array.from(seen.values())
}

export interface SessionMeta {
  sessionId: string
  cwd: string
  model: string
  startTime: string
  endTime: string
  roundCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheHit: number
  totalCacheWrite: number
  isSidechain: boolean
  parentUuid: string | null
  attributionAgent?: string
  attributionSkill?: string
  gitBranch?: string
  entrypoint?: string
}

export function extractSessionMeta(entries: JsonlEntry[]): SessionMeta | null {
  if (entries.length === 0) return null

  const first = entries[0]
  const last = entries[entries.length - 1]

  // 用去重后的条目统计 token
  const deduped = getDedupedUsage(entries)
  const roundCount = deduped.length

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheHit = 0
  let totalCacheWrite = 0
  const models = new Set<string>()

  for (const { usage: u, model } of deduped) {
    totalInputTokens += u.input_tokens || 0
    totalOutputTokens += u.output_tokens || 0
    totalCacheHit += u.cache_read_input_tokens || 0
    totalCacheWrite +=
      (u.cache_creation?.ephemeral_1h_input_tokens || 0) +
      (u.cache_creation?.ephemeral_5m_input_tokens || 0)
    if (model) {
      models.add(model)
    }
  }

  const cwdEntry = entries.find((e) => e.cwd)
  // 用去重后的条目找 model（取 deduped 中第一个有 model 的）
  const modelFromDeduped = deduped.find((d) => d.model)?.model

  return {
    sessionId: first.sessionId,
    cwd: cwdEntry?.cwd || '',
    model: modelFromDeduped || models.values().next().value || 'unknown',
    startTime: first.timestamp,
    endTime: last.timestamp,
    roundCount,
    totalInputTokens,
    totalOutputTokens,
    totalCacheHit,
    totalCacheWrite,
    isSidechain: entries.some((e) => e.isSidechain),
    parentUuid: first.parentUuid,
    attributionAgent: entries.find((e) => e.attributionAgent)?.attributionAgent,
    attributionSkill: entries.find((e) => e.attributionSkill)?.attributionSkill,
    gitBranch: cwdEntry?.gitBranch,
    entrypoint: cwdEntry?.entrypoint
  }
}

export async function scanRecentSessions(
  since: Date
): Promise<{ projectSlug: string; filePath: string; mtime: Date }[]> {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return []

  const results: { projectSlug: string; filePath: string; mtime: Date }[] = []
  const projectDirs = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true })

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue

    const projectDir = join(CLAUDE_PROJECTS_DIR, dir.name)
    try {
      const files = await readdir(projectDir, { withFileTypes: true })

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.jsonl')) {
          const filePath = join(projectDir, file.name)
          const stat = statSync(filePath)
          if (stat.mtime >= since) {
            results.push({ projectSlug: dir.name, filePath, mtime: stat.mtime })
          }
        }

        if (file.isDirectory() && file.name === 'subagents') {
          const subDir = join(projectDir, file.name)
          try {
            const subFiles = await readdir(subDir, { withFileTypes: true })
            for (const sf of subFiles) {
              if (sf.isFile() && sf.name.endsWith('.jsonl')) {
                const fp = join(subDir, sf.name)
                const stat = statSync(fp)
                if (stat.mtime >= since) {
                  results.push({ projectSlug: dir.name, filePath: fp, mtime: stat.mtime })
                }
              }
            }
          } catch { /* 忽略 */ }
        }
      }
    } catch { /* 忽略 */ }
  }

  return results
}

export async function getClaudeProjectSlugs(): Promise<string[]> {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return []
  const dirs = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
  return dirs.filter((d) => d.isDirectory()).map((d) => d.name)
}
