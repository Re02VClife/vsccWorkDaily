/**
 * Electron Module Resolution Patch (preload via electron -r flag)
 *
 * 修补 Module._load 直接拦截 electron 模块加载。
 * 配合 run-electron.cjs 使用。
 */
'use strict'

if (!process.versions || !process.versions.electron) {
  require('module').exports = undefined  // 不在 Electron 内，什么都不做
}

console.log('[electron-patch] Installing electron module interceptor...')

// 构建 Electron API
function buildElectronAPI() {
  const os = require('os')
  return {
    app: {
      isPackaged: false,
      whenReady: () => Promise.resolve(),
      on: function() { return this },
      once: function() { return this },
      quit: () => process.exit(0),
      getName: () => 'Electron',
      getVersion: () => process.versions.electron || '',
      getPath: () => os.homedir(),
      getAppPath: () => process.cwd(),
      isReady: () => true,
      focus: () => {},
      hide: () => {},
      show: () => {},
    },
    BrowserWindow: class {
      constructor(opts) {
        this.webContents = {
          setWindowOpenHandler: () => {},
          loadURL: () => Promise.resolve(),
          loadFile: () => Promise.resolve(),
          on: () => {},
          send: () => {},
          session: {},
        }
      }
      on() { return this }
      once() { return this }
      show() {}
      hide() {}
      close() {}
      isDestroyed() { return false }
      static getAllWindows() { return [] }
    },
    shell: {
      openExternal: () => Promise.resolve(),
      openPath: () => Promise.resolve(''),
    },
    ipcMain: {
      on: () => {},
      once: () => {},
      handle: () => {},
      handleOnce: () => {},
    },
    nativeImage: {
      createEmpty: () => ({}),
      createFromPath: () => ({}),
    },
    Tray: class {
      constructor() {}
      setToolTip() {}
      setContextMenu() {}
      on() { return this }
    },
    Menu: {
      buildFromTemplate: () => ({}),
      setApplicationMenu: () => {},
    },
    dialog: {},
    contextBridge: { exposeInMainWorld: () => {} },
    ipcRenderer: { on: () => {}, invoke: () => Promise.resolve() },
    net: { request: () => ({ on: () => {}, end: () => {} }) },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
  }
}

const electronAPI = buildElectronAPI()

// ====== 方法: 修补 Module._load (最底层拦截) ======
const Module = require('module')
const origLoad = Module._load

Module._load = function(request, parent, isMain) {
  // 拦截 electron 及其子路径
  if (request === 'electron' || request === 'electron/main' || request === 'electron/common') {
    return electronAPI
  }
  return origLoad.apply(this, arguments)
}

console.log('[electron-patch] Module._load patched for electron')
