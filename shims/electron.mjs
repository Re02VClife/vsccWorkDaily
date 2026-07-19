/**
 * Electron ESM Shim
 *
 * 问题：ESM 的 import "electron" 会优先解析到 node_modules/electron (npm 包)，
 *      而非 Electron 内置模块。
 * 解决：通过 createRequire 使用 CJS require 加载 electron 内置模块，
 *      CJS require 中内置模块优先级高于 node_modules。
 *      然后重新导出所有命名导出和默认导出。
 */

import { createRequire } from 'node:module'

// 清除 electron npm 包的缓存，确保 require 找到内置模块
const req = createRequire(import.meta.url)

// 删除可能的 electron npm 包缓存
Object.keys(req.cache).forEach((k) => {
  if (k.includes('electron') && k.includes('node_modules')) {
    delete req.cache[k]
  }
})

// 通过 CJS require 加载 Electron 内置模块
const electron = req('electron')

// 默认导出
export default electron

// 命名导出 — 所有常用 API
export const {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  ipcRenderer,
  Tray,
  Menu,
  nativeImage,
  contextBridge,
  dialog,
  globalShortcut,
  screen,
  clipboard,
  crashReporter,
  desktopCapturer,
  inAppPurchase,
  net,
  netLog,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  session,
  systemPreferences,
  webContents,
  BrowserView,
  DownloadItem,
  MessageChannelMain,
} = electron
