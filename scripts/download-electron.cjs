process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');

const version = '31.7.5';
const distPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
const pkgPath = path.join(__dirname, '..', 'node_modules', 'electron');

console.log(`Downloading Electron v${version} win32 x64...`);
downloadArtifact({
  version,
  artifactName: 'electron',
  force: true,
  platform: 'win32',
  arch: 'x64'
}).then(zipPath => {
  console.log('Downloaded to:', zipPath);
  console.log('Extracting...');
  if (fs.existsSync(distPath)) fs.rmSync(distPath, { recursive: true });
  fs.mkdirSync(distPath, { recursive: true });
  return extract(zipPath, { dir: distPath });
}).then(() => {
  console.log('Extraction done!');
  fs.writeFileSync(path.join(pkgPath, 'path.txt'), 'electron.exe');
  fs.writeFileSync(path.join(distPath, 'version'), `v${version}`);
  console.log('Config files written. Ready!');
}).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
