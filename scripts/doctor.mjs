import { constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function executable(name) {
  const roots = [repository, process.cwd()].map(root => path.resolve(root));
  const names = process.platform === 'win32' ? [`${name}.exe`] : [name];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(directory) || /[\\/]WindowsApps(?:[\\/]|$)/i.test(directory)) continue;
    for (const basename of names) {
      const candidate = path.join(directory, basename);
      try {
        const resolved = await realpath(candidate);
        if (roots.some(root => within(root, resolved))) continue;
        if (!(await lstat(resolved)).isFile()) continue;
        await access(resolved, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        return resolved;
      } catch (error) {
        if (!['ENOENT', 'EACCES', 'ENOTDIR'].includes(error.code)) throw error;
      }
    }
  }
  return undefined;
}

async function version(name) {
  const command = await executable(name);
  if (!command) return { ok: false, detail: 'not found in trusted absolute PATH locations (repository paths and Windows aliases skipped)' };
  const result = spawnSync(command, [name === 'ffmpeg' || name === 'ffprobe' ? '-version' : '--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true, shell: false });
  const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().split(/\r?\n/)[0] ?? '';
  return { ok: result.status === 0, detail: detail || result.error?.message || `exit ${result.status}` };
}

function parseArguments(args) {
  const options = { strict: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--strict') options.strict = true;
    else if (args[index] === '--home') {
      options.home = args[++index];
      if (!options.home || !path.isAbsolute(options.home)) throw new Error('--home requires an absolute directory.');
    } else throw new Error(`Unsupported option: ${args[index]}`);
  }
  return options;
}

async function checkSkill(home, skill) {
  if (typeof skill.name !== 'string' || !skill.name || /[\\/]/.test(skill.name) || ['.', '..'].includes(skill.name)) return { complete: false, files: 0, resources: 0 };
  const root = path.join(home, '.agents/skills', skill.name);
  let files = 0;
  let resources = 0;
  let complete = Array.isArray(skill.files) && skill.files.length > 0;
  for (const file of skill.files ?? []) {
    const target = path.resolve(root, file.path);
    if (!within(root, target) || target === root) { complete = false; continue; }
    try {
      if (!(await lstat(target)).isFile()) { complete = false; continue; }
      const content = await readFile(target);
      files += 1;
      if (file.path !== 'SKILL.md') resources += 1;
      if (createHash('sha256').update(content).digest('hex') !== file.sha256) complete = false;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;
      complete = false;
    }
  }
  return { complete, files, resources };
}

function reviewHookSuffix(codex) {
  const quote = value => process.platform === 'win32' ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`;
  return ` ${quote(path.join(codex, 'scripts/code-session-review/review.cjs'))} hook`;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const home = path.resolve(options.home ?? os.homedir());
  const codex = options.home ? path.join(home, '.codex') : (process.env.CODEX_HOME || path.join(home, '.codex'));
  const manifest = JSON.parse(await readFile(path.join(repository, 'manifest.json'), 'utf8'));
  if (!Array.isArray(manifest.skills) || !manifest.skills.length) throw new Error('manifest.json must list skills.');
  console.log(`Platform: ${process.platform}/${process.arch}\nNode: ${process.version}\nHome: ${home}\nCODEX_HOME: ${codex}`);
  const tools = ['git', 'codex', 'python3', 'uv', 'ffmpeg', 'ffprobe', 'gh', 'blender'];
  const versions = await Promise.all(tools.map(async name => ({ name, ...await version(name) })));
  for (const result of versions) console.log(`${result.name}: ${result.ok ? 'OK' : 'unavailable'} — ${result.detail}`);
  const skills = await Promise.all(manifest.skills.map(skill => checkSkill(home, skill)));
  const installed = skills.filter(skill => skill.complete).length;
  console.log(`Skills: ${installed}/${manifest.skills.length} complete; ${skills.reduce((sum, skill) => sum + skill.files, 0)} files; ${skills.reduce((sum, skill) => sum + skill.resources, 0)} resource files.`);
  let hookConfigured = false;
  try {
    const hooks = JSON.parse(await readFile(path.join(codex, 'hooks.json'), 'utf8'));
    hookConfigured = Array.isArray(hooks?.hooks?.Stop) && hooks.hooks.Stop.some(group => Array.isArray(group?.hooks) && group.hooks.some(hook => hook?.type === 'command' && typeof hook.command === 'string' && hook.command.endsWith(reviewHookSuffix(codex))));
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
  }
  console.log(`Review hook: ${hookConfigured ? 'configured' : 'not configured'}. Trust: manual check required in Codex /hooks.`);
  console.log('Accounts, MCP connections and managed plugin activation: unverified; reconnect manually in Codex.');
  console.log('Doctor is read-only. Optional tools do not affect --strict.');
  const requiredPass = Number(process.versions.node.split('.')[0]) >= 22 && versions.find(result => result.name === 'git').ok && installed === manifest.skills.length;
  if (options.strict && !requiredPass) process.exitCode = 1;
} catch (error) {
  console.error(`Doctor failed: ${error.message}`);
  process.exitCode = 1;
}
