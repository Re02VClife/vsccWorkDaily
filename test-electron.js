const e = require('electron'); console.log('app:', typeof e.app); console.log('keys:', Object.keys(e).slice(0,10)); e.app.whenReady().then(() => { console.log('READY'); e.app.quit(); });
