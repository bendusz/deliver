import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(TESTS_DIR, '..', '..');
export const HOOKS_DIR = path.join(PLUGIN_ROOT, 'hooks');

const cleanup = [];
process.on('exit', () => {
  for (const d of cleanup) fs.rmSync(d, { recursive: true, force: true });
});

export function tmpDir(prefix = 'pmtest-') {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanup.push(d);
  return d;
}

export function gitIn(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function newProj(signedOff = false) {
  const d = tmpDir('pmproj-');
  for (const sub of ['pm/actors', 'src', 'docs', 'packages/foo']) fs.mkdirSync(path.join(d, sub), { recursive: true });
  fs.writeFileSync(path.join(d, 'pm', 'pm-state.json'), JSON.stringify({ signed_off: signedOff, phase: 'implementation' }) + '\n');
  gitIn(d, ['init', '-q']);
  gitIn(d, ['config', 'user.email', 'casey@example.com']);
  gitIn(d, ['config', 'user.name', 'Casey Example']);
  return d;
}

export function runHook(name, input, env = {}) {
  const e = { ...process.env };
  delete e.CLAUDE_PROJECT_DIR;
  delete e.PM_SKILL_NO_ENFORCE;
  Object.assign(e, env);
  return spawnSync(process.execPath, [path.join(HOOKS_DIR, name)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: e,
    windowsHide: true,
  });
}

export function writeInput(cwd, filePath, content = 'x') {
  return { cwd, tool_input: { file_path: filePath, content } };
}

export function canSymlink(target, linkPath) {
  try {
    const type = fs.existsSync(target) && fs.statSync(target).isDirectory() ? 'dir' : 'file';
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}
