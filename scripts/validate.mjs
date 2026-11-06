import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
let count = 0;
for (const file of manifest.payloadFiles) {
  const absolute = path.resolve(root, file.path);
  const relative = path.relative(root, absolute);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) throw new Error('Invalid manifest path');
  const content = fs.readFileSync(absolute);
  if (crypto.createHash('sha256').update(content).digest('hex') !== file.sha256) throw new Error('Checksum mismatch: ' + file.path);
  if (/C:[\\/]Users[\\/]troub/i.test(content.toString('utf8'))) throw new Error('Personal Windows path: ' + file.path);
  count += 1;
}
if (manifest.skills.length !== 42) throw new Error('Expected 42 user skills');
for (const skill of manifest.skills) {
  const content = fs.readFileSync(path.join(root, skill.path, 'SKILL.md'), 'utf8');
  if (!/^---\s*\r?\n/.test(content) || !/^name:/m.test(content) || !/^description:/m.test(content)) throw new Error('Invalid skill metadata: ' + skill.name);
}
for (const file of ['README.md', 'START-HERE.md', 'docs/CONNECTIONS.md', 'docs/RUNTIMES.md']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error('Missing ' + file);
}
console.log('Validated ' + manifest.skills.length + ' skills and ' + count + ' payload files.');
