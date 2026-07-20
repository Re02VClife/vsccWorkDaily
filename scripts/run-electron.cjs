/**
 * Electron 应用启动脚本
 *
 * 核心思路：
 *   1. 将 node_modules/electron 重命名为 _electron_bak（解除对内置模块的遮挡）
 *   2. 启动 Electron 应用
 *   3. 退出时恢复重命名
 *
 * 为什么：npm 包 node_modules/electron 会同时遮挡 CJS 和 ESM 的 'electron' 解析，
 *       导致 require('electron') 返回二进制路径而非 Electron API。
 *
 * 用法: node scripts/run-electron.cjs [dev]
 *   dev 模式: 先构建再启动
 *   默认模式: 仅启动（使用已有构建）
 */

const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const MODE = process.argv[2] === 'dev' ? 'dev' : 'run'

const ELECTRON_PKG = path.join(ROOT, 'node_modules', 'electron')
const ELECTRON_BAK = path.join(ROOT, 'node_modules', '_electron_bak')

function hideElectronPkg() {
  if (fs.existsSync(ELECTRON_PKG)) {
    console.log('[run-electron] 隐藏 node_modules/electron → _electron_bak')
    try {
      fs.renameSync(ELECTRON_PKG, ELECTRON_BAK)
      console.log('[run-electron] 重命名成功')
      return true
    } catch (e) {
      console.error('[run-electron] 重命名失败:', e.message)
      console.error('[run-electron] 请手动重命名后重试，或关闭占用该目录的程序')
      return false
    }
  }
  if (fs.existsSync(ELECTRON_BAK)) {
    console.log('[run-electron] electron 已隐藏（_electron_bak 存在）')
    return true
  }
  console.error('[run-electron] 找不到 node_modules/electron 或 _electron_bak')
  return false
}

function restoreElectronPkg() {
  if (fs.existsSync(ELECTRON_BAK)) {
    console.log('[run-electron] 恢复 _electron_bak → node_modules/electron')
    try {
      fs.renameSync(ELECTRON_BAK, ELECTRON_PKG)
    } catch (e) {
      console.warn('[run-electron] 恢复失败（可忽略）:', e.message)
    }
  }
}

function findElectronBinary() {
  const distDir = fs.existsSync(ELECTRON_BAK) ? ELECTRON_BAK : ELECTRON_PKG
  const exe = path.join(distDir, 'dist', 'electron.exe')
  if (fs.existsSync(exe)) return exe
  throw new Error('找不到 electron.exe')
}

async function main() {
  if (MODE === 'dev') {
    console.log('[run-electron] 构建 electron-vite...')
    execSync('npx electron-vite build', { cwd: ROOT, stdio: 'inherit' })
  }

  const mainFile = path.resolve(ROOT, 'out', 'main', 'index.js')
  if (!fs.existsSync(mainFile)) {
    console.error('[run-electron] 构建输出不存在:', mainFile)
    console.error('[run-electron] 请先运行: npm run build')
    process.exit(1)
  }

  if (!hideElectronPkg()) {
    process.exit(1)
  }

  const electronBin = findElectronBinary()
  console.log('[run-electron] Electron:', electronBin)
  console.log('[run-electron] 入口:', mainFile)
  console.log('[run-electron] 启动应用...\n')

  const child = spawn(electronBin, ['-r', path.join(ROOT, 'scripts', 'electron-resolve-patch.cjs'), mainFile], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  child.on('close', (code) => {
    console.log('\n[run-electron] Electron 退出 (code:', code, ')')
    restoreElectronPkg()
    process.exit(code || 0)
  })

  child.on('error', (err) => {
    console.error('[run-electron] 启动失败:', err.message)
    restoreElectronPkg()
    process.exit(1)
  })
}

// 确保退出时恢复
process.on('SIGINT', () => { restoreElectronPkg(); process.exit(130) })
process.on('SIGTERM', () => { restoreElectronPkg(); process.exit(143) })
process.on('uncaughtException', (err) => { console.error(err); restoreElectronPkg(); process.exit(1) })

main()
