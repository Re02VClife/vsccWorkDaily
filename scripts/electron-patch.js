/**
 * Electron index.js 补丁
 *
 * 核心思路：当在 Electron 内运行时，临时隐藏 npm 包的 package.json，
 * 使 Node.js 路径向上查找直到找到 Electron 内置的 electron 模块。
 */

'use strict'
const fs = require('fs')
const path = require('path')
const pathFile = path.join(__dirname, 'path.txt')

// 仅通过 process.versions.electron 检测
const isInsideElectron = !!(process.versions && process.versions.electron)

if (isInsideElectron) {
  // 策略：临时重命名 package.json，解除 npm 包对内置模块的遮挡
  const pkgJson = path.join(__dirname, 'package.json')
  const pkgJsonBak = path.join(__dirname, 'package.json.__bak__')

  try {
    // 1. 解除遮挡
    if (fs.existsSync(pkgJson)) {
      fs.renameSync(pkgJson, pkgJsonBak)
    }

    // 2. 清除所有 electron 相关缓存
    Object.keys(require.cache).forEach(k => {
      if (k.includes('electron') && k !== __filename) {
        delete require.cache[k]
      }
    })

    // 3. 重新加载 — 现在应该能找到内置模块
    module.exports = require('electron')

  } catch (e) {
    console.warn('[electron-patch] Failed to load built-in electron:', e.message)
    module.exports = {}
  } finally {
    // 4. 恢复 package.json（重要：即使失败也要恢复）
    try {
      if (fs.existsSync(pkgJsonBak)) {
        fs.renameSync(pkgJsonBak, pkgJson)
      }
    } catch (_) { /* 忽略恢复错误 */ }
  }

} else {
  // 标准行为：返回 electron 二进制路径
  let executablePath
  if (fs.existsSync(pathFile)) {
    executablePath = fs.readFileSync(pathFile, 'utf-8').trim()
  }
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    module.exports = path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron')
  } else if (executablePath) {
    module.exports = path.join(__dirname, 'dist', executablePath)
  } else {
    throw new Error('Electron failed to install correctly')
  }
}
