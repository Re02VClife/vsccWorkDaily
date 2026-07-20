const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.argv[2] || 'c:/Users/XU/Desktop/vscode/vsccWorkDaily';
const ELECTRON_DIR = path.join(ROOT, 'node_modules', 'electron');
const ELECTRON_BAK = path.join(ROOT, 'node_modules', '_electron_bak');
const TEST_FILE = process.argv[3] || '/tmp/test-esm-electron.mjs';

console.log('1. Renaming electron directory...');
fs.renameSync(ELECTRON_DIR, ELECTRON_BAK);
console.log('   Done.');

const electronBin = path.join(ELECTRON_BAK, 'dist', 'electron.exe');
console.log('2. Launching:', electronBin);
console.log('   Test file:', TEST_FILE);

const child = spawn(electronBin, [TEST_FILE], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('close', (code) => {
  console.log('3. Electron exited with code:', code);
  console.log('4. Restoring electron directory...');
  fs.renameSync(ELECTRON_BAK, ELECTRON_DIR);
  console.log('   Done.');
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('Failed to start:', err.message);
  fs.renameSync(ELECTRON_BAK, ELECTRON_DIR);
  process.exit(1);
});
