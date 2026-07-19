import { simpleGit, type LogResult, type DefaultLogFields } from 'simple-git'
import type { CodeChange, ChangeType } from '../shared/types'

/**
 * 生成日报前自动提交未保存的改动
 * 返回 true 表示有新提交
 */
export async function autoCommit(
  projectPath: string,
  date: string
): Promise<{ committed: boolean; message: string }> {
  const git = simpleGit(projectPath)

  try {
    // 不是 git 仓库则自动初始化
    const isRepo = await git.checkIsRepo().catch(() => false)
    if (!isRepo) {
      await git.init()
      console.log(`[git] ${projectPath} 已初始化 Git 仓库`)
    }

    // 暂存所有改动
    await git.add('.')
    await git.add('-u') // 包括删除的文件

    // 检查是否有待提交的改动
    const status = await git.status()
    if (status.staged.length === 0 && status.created.length === 0 && status.deleted.length === 0) {
      return { committed: false, message: '无改动' }
    }

    // 提交
    const commitMsg = `日报自动提交 - ${date}`
    const result = await git.commit(commitMsg)
    const shortHash = result.commit?.substring(0, 7) || ''

    console.log(`[git] ${projectPath} 自动提交: ${commitMsg} (${shortHash})`)
    return { committed: true, message: `${status.staged.length + status.created.length + status.deleted.length} 个文件已提交` }
  } catch (err: any) {
    console.error(`[git] ${projectPath} 自动提交失败:`, err.message)
    return { committed: false, message: `提交失败: ${err.message}` }
  }
}

/**
 * 获取某一天的 git 提交和变更
 */
export async function scanCodeChanges(
  projectPath: string,
  date: string, // ISO 日期格式 YYYY-MM-DD
  projectId: number
): Promise<CodeChange[]> {
  const git = simpleGit(projectPath)

  // 检查是否是 git 仓库
  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) {
    console.warn(`[git-collector] ${projectPath} 不是 Git 仓库`)
    return []
  }

  const results: CodeChange[] = []

  try {
    // 获取当天 00:00 到次日 00:00 的所有提交
    const since = `${date}T00:00:00`
    const until = `${date}T23:59:59`

    const log = await git.log({
      '--since': since,
      '--until': until,
      '--numstat': null
    })

    // 解析 git log 输出
    for (const commit of log.all) {
      // simple-git 的 LogResult 格式稍有不同，这里做兼容处理
      const hash = commit.hash
      const message = commit.message
      const commitDate = commit.date

      if (!hash) continue

      // 获取这个 commit 的具体文件变更
      const diff = await git.show([
        hash,
        '--stat',
        '--format='
      ])

      // 解析 --stat 输出
      const fileChanges = parseStatOutput(diff)

      for (const fc of fileChanges) {
        results.push({
          id: 0, // 数据库自动生成
          projectId,
          date,
          filePath: fc.filePath,
          changeType: fc.changeType,
          linesAdded: fc.linesAdded,
          linesRemoved: fc.linesRemoved,
          description: '', // 后续由 AI 填充
          commitHash: hash,
          // gitDiff 后续由 AI 总结时读取
        })
      }
    }
  } catch (err) {
    console.error(`[git-collector] 扫描 ${projectPath} 失败:`, err)
  }

  return results
}

/**
 * 解析 git --stat 输出为文件变更列表
 * 示例输入: "src/foo.py | 10 ++++---\nsrc/bar.ts | 5 ++"
 */
function parseStatOutput(
  statOutput: string
): { filePath: string; changeType: ChangeType; linesAdded: number; linesRemoved: number }[] {
  const results: {
    filePath: string
    changeType: ChangeType
    linesAdded: number
    linesRemoved: number
  }[] = []

  const lines = statOutput.trim().split('\n')
  for (const line of lines) {
    // 格式: "path/to/file | 10 ++++----"
    const match = line.match(/^(.+?)\s+\|\s+(\d+)\s*([+-]*)/)
    if (!match) continue

    const filePath = match[1].trim()
    const totalChanges = parseInt(match[2], 10)
    const symbols = match[3] || ''

    const plusCount = (symbols.match(/\+/g) || []).length
    const minusCount = (symbols.match(/-/g) || []).length

    // 如果有 + 和 - 混合，是修改
    let changeType: ChangeType = 'modified'
    if (plusCount === totalChanges && minusCount === 0) {
      changeType = 'added'
    } else if (minusCount === totalChanges && plusCount === 0) {
      changeType = 'deleted'
    }

    results.push({
      filePath,
      changeType,
      linesAdded: plusCount,
      linesRemoved: minusCount
    })
  }

  return results
}

/**
 * 获取某一天的 git diff 内容用于 AI 总结
 */
export async function getDailyDiff(
  projectPath: string,
  date: string
): Promise<string> {
  const git = simpleGit(projectPath)

  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) return ''

  try {
    const since = `${date}T00:00:00`
    const until = `${date}T23:59:59`

    // 获取当天第一个 commit 之前和最后一个 commit 之间的 diff
    const log = await git.log({
      '--since': since,
      '--until': until,
      '--format': '%H'
    })

    const hashes = log.all.map((c) => c.hash).filter(Boolean)
    if (hashes.length === 0) return ''

    // 获取从第一个 commit 的 parent 到最后一个 commit 的 diff
    const firstHash = hashes[hashes.length - 1]
    const lastHash = hashes[0]

    const diff = await git.diff([`${firstHash}~1`, lastHash, '--', '.'])
    return diff
  } catch {
    return ''
  }
}
