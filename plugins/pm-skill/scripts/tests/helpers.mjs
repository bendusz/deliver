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
  for (const d of cleanup) {
    try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch {}
  }
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

export const RUNNER = path.join(PLUGIN_ROOT, 'scripts', 'codex', 'run.mjs');
const WIN = process.platform === 'win32';

export const STORY_V2 = [
  '# S1-1: focused fix',
  '<!-- pm-meta: {"builder":"codex-builder","touches":["src"]} -->',
  'Sprint: 1 · Priority: high · Covers: AC-1 · Depends on: none · Parallel-safe: yes',
  'Risk: low · Review lenses: code-integrity-reviewer',
  '',
  '## Acceptance criteria (testable)',
  '- [ ] fixed',
  '',
  '## Verification',
  '- Prove done with: `true`',
  '',
].join('\n');

// A story written before 0.17: the same pm-meta plus the visible Builder and Touches fields.
export const STORY_LEGACY = STORY_V2
  .replace('Parallel-safe: yes', 'Parallel-safe: yes · Touches: src')
  .replace('Risk: low · Review lenses: code-integrity-reviewer', 'Risk: low · Review lenses: code-integrity-reviewer · Security-sensitive: no · Architecture-sensitive: no\nBuilder: codex-builder');

export function newBuildProject(signedOff = true) {
  const d = tmpDir('pmbuild-');
  for (const sub of ['docs/stories', 'tmp/codex-builder', 'pm', 'src']) fs.mkdirSync(path.join(d, sub), { recursive: true });
  fs.writeFileSync(path.join(d, '.gitignore'), 'tmp/\n');
  fs.writeFileSync(path.join(d, 'pm', 'pm-state.json'), `{"signed_off":${signedOff},"phase":"implementation"}\n`);
  fs.writeFileSync(path.join(d, 'docs', 'stories', 'S1-1-fix.md'), STORY_V2);
  fs.writeFileSync(path.join(d, 'tmp', 'codex-builder', 'S1-1-round-1.md'), '# Evidence\nRun `true`; fix src/fix.txt.\n');
  fs.writeFileSync(path.join(d, 'src', 'script.sh'), '#!/usr/bin/env sh\nexit 0\n');
  gitIn(d, ['init', '-q']);
  gitIn(d, ['config', 'user.email', 'builder-tests@example.com']);
  gitIn(d, ['config', 'user.name', 'Builder Tests']);
  gitIn(d, ['add', '.gitignore', 'docs/stories/S1-1-fix.md', 'pm/pm-state.json', 'src/script.sh']);
  gitIn(d, ['commit', '-qm', 'fixture']);
  return d;
}

export function makeStub({ layout = 'npm' } = {}) {
  const dir = tmpDir('pmstub-');
  const binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'tmp'));
  const launcher = fs.readFileSync(path.join(TESTS_DIR, 'stub-launcher.cjs'));
  const stub = fs.readFileSync(path.join(TESTS_DIR, 'stub-codex.mjs'));
  if (WIN) {
    if (layout === 'npm') {
      const pkg = path.join(binDir, 'node_modules', '@openai', 'codex', 'bin');
      fs.mkdirSync(pkg, { recursive: true });
      fs.writeFileSync(path.join(pkg, 'codex.js'), launcher);
      fs.writeFileSync(path.join(pkg, 'stub-codex.mjs'), stub);
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@node "%~dp0node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');
    } else {
      fs.writeFileSync(path.join(binDir, 'codex.js'), launcher);
      fs.writeFileSync(path.join(binDir, 'stub-codex.mjs'), stub);
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@node "%~dp0codex.js" %*\r\n');
    }
  } else {
    fs.writeFileSync(path.join(binDir, 'codex'), launcher, { mode: 0o755 });
    fs.writeFileSync(path.join(binDir, 'stub-codex.mjs'), stub);
  }
  return { dir, binDir, actionsLog: path.join(dir, 'actions.log'), argsLog: path.join(dir, 'args.log'), promptFile: path.join(dir, 'prompt.md'), childPid: path.join(dir, 'child.pid'), tmp: path.join(dir, 'tmp') };
}

export function minimalPath() {
  const which = WIN ? 'where' : 'which';
  const gitPath = execFileSync(which, ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  return [path.dirname(process.execPath), path.dirname(gitPath)].join(path.delimiter);
}

export function runRunner(args, { project, stub, env = {}, cwd } = {}) {
  const e = { ...process.env, ...env };
  if (stub) {
    Object.assign(e, { STUB_ACTIONS: stub.actionsLog, STUB_ARGS: stub.argsLog, STUB_PROMPT: stub.promptFile, STUB_CHILD_PID: stub.childPid, TMPDIR: stub.tmp, TMP: stub.tmp, TEMP: stub.tmp });
    fs.writeFileSync(stub.actionsLog, '');
    e.PATH = `${stub.binDir}${path.delimiter}${process.env.PATH}`;
    if (WIN) e.Path = e.PATH;
  }
  const full = project ? ['--worktree', project, '--story', 'docs/stories/S1-1-fix.md', ...args] : args;
  const r = spawnSync(process.execPath, [RUNNER, ...full], { encoding: 'utf8', env: e, cwd, windowsHide: true });
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { out = null; }
  return { status: r.status, out, stdout: r.stdout, stderr: r.stderr };
}

export const stubArgs = (stub) => (fs.existsSync(stub.argsLog) ? fs.readFileSync(stub.argsLog, 'utf8').split('\n').filter(Boolean) : []);
export const stubActions = (stub) => (fs.existsSync(stub.actionsLog) ? fs.readFileSync(stub.actionsLog, 'utf8') : '');
