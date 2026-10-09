const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'cloud');
const html = fs.readFileSync(path.join(root, 'index.html'));
if (!html.toString('utf8').includes('<title>Nuvexa Pro v0.3.0')) {
  throw new Error('Refusing to publish an unexpected application');
}
const sourceSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
  throw new Error('Build output must not be a symbolic link');
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), html);
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify({
  application: 'Nuvexa Pro Cloud Edition',
  version: '0.3.0',
  sourceSha,
  files: { 'index.html': crypto.createHash('sha256').update(html).digest('hex') },
}, null, 2) + '\n');
console.log(JSON.stringify({ output, sourceSha, files: ['index.html', 'release.json'] }));
