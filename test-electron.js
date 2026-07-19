// 最小化 Electron 测试：验证 require('electron') 是否返回 API 对象
const electron = require('electron')
console.log('typeof electron:', typeof electron)
console.log('electron.app:', typeof electron.app)
if (typeof electron.app === 'function') {
  electron.app.whenReady().then(() => {
    console.log('SUCCESS: Electron app ready!')
    electron.app.quit()
  })
} else {
  console.log('FAIL: electron.app is not a function, got:', electron.app)
  console.log('electron keys:', Object.keys(electron).slice(0, 10))
  electron.app?.quit?.()
}
