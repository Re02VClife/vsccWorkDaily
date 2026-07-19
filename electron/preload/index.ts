import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的安全 API
// 渲染进程通过 window.electronAPI 调用
contextBridge.exposeInMainWorld('electronAPI', {
  // 通用调用
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  // 事件监听
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  // 一次性事件
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  }
})
