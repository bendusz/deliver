#!/usr/bin/env node
// deliver holdout store: T2 holdout checks kept in git where no checkout shows them.
//
//   node holdout.mjs store <story-id> <dir> [--root <repo>]
//   node holdout.mjs check <story-id> [--root <repo>]
//   node holdout.mjs run <story-id> --target <worktree> [--timeout <seconds>] [--root <repo>]
//
// store commits <dir> to the private ref refs/deliver/holdout/<project-key>/<story-id> through a
// temporary index (git add, write-tree, commit-tree, update-ref). It never touches the working
// tree, the real index, or any branch, and the ref is never pushed. <project-key> names the deliver
// project --root (default the working directory) is: `_` for a project at the git top level, else
// its path below the top level as a slug plus a short hash, `nested-b_1a2b3c4d`, so two projects
// in one repository never share a story's checks. <dir> must hold a RUN file: exactly one
// non-blank line, the command that runs the checks, where {holdout} is replaced by the
// materialised directory and {target} by the story worktree. Quote them in RUN if paths may hold
// spaces. store, check, and run all refuse a blank or multiline RUN with exit 64.
//
// check exits 0 when the ref exists and 66 when it does not, which on resume means test-engineer
// regenerates the checks before verification. A project at the top level falls back to the legacy
// unnamespaced ref refs/deliver/holdout/<story-id>, written before 0.29.0, and says so on stderr.
//
// run materialises the ref, from the git top level, into a fresh directory under the OS temp
// directory, runs RUN through the system shell with the target as cwd and HOLDOUT_DIR and
// HOLDOUT_TARGET in the environment, deletes the copy, and prints { verdict, exit, timedOut, dir }.
// --target must be the project's directory, or one below it, in a checkout of the same repository.
// The checks' own output goes to
// stderr. A run longer than --timeout (default 600 seconds) fails, and its whole process tree is
// killed before the copy is deleted: the process group on POSIX, `taskkill /T /F` on Windows. On
// POSIX any process RUN left in the background is killed with its group when RUN exits. On
// Windows nothing is killed after a normal exit, because the exited pid may already name another
// process; a RUN there must not leave background processes, which may survive. RUN goes through
// cmd.exe on Windows, so quote paths there with double quotes.
//
// Exit codes: 0 stored, present, or pass; 1 the checks failed; 64 usage; 66 no holdout ref.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { isMain } from '../hooks/lib.mjs';

class Exit extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const usage = (m) => new Exit(64, `${m}\nusage: holdout.mjs store <story-id> <dir> | check <story-id> | run <story-id> --target <worktree> [--timeout <seconds>]  [--root <repo>]`);

function git(root, args, env = {}) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error || r.status !== 0) throw new Exit(64, `git ${args[0]} failed: ${(r.stderr || String(r.error || '')).trim().split('\n')[0]}`);
  return r.stdout.trim();
}

function parse(argv) {
  const [cmd, id, ...rest] = argv;
  if (!['store', 'check', 'run'].includes(cmd)) throw usage(`unknown command ${cmd ?? '(none)'}`);
  if (!/^S\d+-\d+$/.test(id || '')) throw usage(`story id must look like S1-2, got ${id ?? '(none)'}`);
  const opts = { cmd, id, dir: null, target: null, root: process.cwd(), timeout: 600 };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--timeout' && cmd === 'run') {
      const v = Number(rest[++i]);
      if (!Number.isFinite(v) || v <= 0) throw usage('--timeout needs a positive number of seconds');
      opts.timeout = v;
    } else if (a === '--root' || a === '--target') {
      const v = rest[++i];
      if (!v) throw usage(`${a} needs a value`);
      opts[a.slice(2)] = path.resolve(v);
    } else if (!a.startsWith('--') && cmd === 'store' && !opts.dir) opts.dir = path.resolve(a);
    else throw usage(`unexpected argument ${a}`);
  }
  if (cmd === 'store' && !opts.dir) throw usage('store needs <dir>');
  if (cmd === 'run' && !opts.target) throw usage('run needs --target <worktree>');
  return opts;
}

const PREFIX = 'refs/deliver/holdout';

// project(root): { top, rel, key } for the deliver project at root: the git top level of its
// checkout, root's path below it with `/` separators ('' at the top), and the ref-safe key. The key
// is the same in every checkout of the repository, linked worktrees included.
export function projectKey(rel) {
  if (!rel) return '_';
  const slug = rel.replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '') || 'p';
  return `${slug}_${crypto.createHash('sha256').update(rel).digest('hex').slice(0, 8)}`;
}

function located(dir) {
  const real = (p) => fs.realpathSync.native(p);
  let at = null;
  try { at = real(dir); } catch { throw usage(`no such directory: ${dir}`); }
  const top = real(git(at, ['rev-parse', '--show-toplevel']));
  const common = real(path.resolve(at, git(at, ['rev-parse', '--git-common-dir'])));
  const rel = path.relative(top, at).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw usage(`${dir} is outside its git top level ${top}`);
  return { at, top, common, rel };
}

function project(root) {
  const loc = located(root);
  return { ...loc, key: projectKey(loc.rel) };
}

const refOf = (proj, id) => `${PREFIX}/${proj.key}/${id}`;

// runLineOf(text, where): the one RUN line, or exit 64 for a blank or multiline RUN. A command on a
// second line would never run, so a check there could never fail.
function runLineOf(text, where) {
  const body = String(text ?? '').trim();
  if (!body) throw new Exit(64, `${where} has no RUN file, or a blank one; it must name the command that runs the checks`);
  if (/[\r\n]/.test(body)) throw new Exit(64, `${where} holds a RUN of more than one line; RUN must be one line, so chain commands with && on that line`);
  return body;
}

function tempIndex() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'deliver-holdout-index-'));
  return { file: path.join(d, 'index'), done: () => fs.rmSync(d, { recursive: true, force: true }) };
}

function exists(root, ref) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function store({ id, dir, root }) {
  let st = null;
  try { st = fs.statSync(dir); } catch { st = null; }
  if (!st || !st.isDirectory()) throw usage(`not a directory: ${dir}`);
  let text = '';
  try { text = fs.readFileSync(path.join(dir, 'RUN'), 'utf8'); } catch { text = ''; }
  runLineOf(text, dir);
  const proj = project(root);
  const gitDir = git(root, ['rev-parse', '--absolute-git-dir']);
  const ref = refOf(proj, id);
  const idx = tempIndex();
  try {
    const env = { GIT_DIR: gitDir, GIT_WORK_TREE: dir, GIT_INDEX_FILE: idx.file };
    git(dir, ['add', '-A', '-f', '--', '.'], env);
    const tree = git(dir, ['write-tree'], env);
    const parent = exists(root, ref);
    const who = { GIT_AUTHOR_NAME: 'deliver holdout', GIT_AUTHOR_EMAIL: 'holdout@deliver.invalid', GIT_COMMITTER_NAME: 'deliver holdout', GIT_COMMITTER_EMAIL: 'holdout@deliver.invalid' };
    const commit = git(root, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `holdout checks for ${id}`], who);
    git(root, ['update-ref', ref, commit]);
    return { code: 0, out: { ref, commit } };
  } finally {
    idx.done();
  }
}

// resolve(id, root): { proj, ref, line } for the story's holdout, or exit 66 when there is none and
// 64 when its RUN is blank or multiline. Only a project at the top level reads the legacy ref.
function resolve(id, root) {
  const proj = project(root);
  let ref = refOf(proj, id);
  if (!exists(root, ref)) {
    const legacy = `${PREFIX}/${id}`;
    if (proj.key === '_' && exists(root, legacy)) {
      fs.writeSync(2, `holdout: reading the legacy ref ${legacy}; the next store writes ${ref}\n`);
      ref = legacy;
    } else throw new Exit(66, `no ${ref}: dispatch test-engineer to regenerate the holdout checks before verification`);
  }
  const blob = spawnSync('git', ['-C', root, 'cat-file', 'blob', `${ref}:RUN`], { encoding: 'utf8', windowsHide: true });
  const line = runLineOf(blob.status === 0 ? blob.stdout : '', ref);
  return { proj, ref, line };
}

function check({ id, root }) {
  const { ref } = resolve(id, root);
  return { code: 0, out: { ref } };
}

// killTree(pid): the process and everything it started.
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { /* the group is gone */ } }
}

// killsAfterExit(platform): whether to kill RUN's process tree once RUN has exited. Only a POSIX
// process group can be killed safely then; on Windows taskkill would take the pid, which the OS
// may have reused.
export const killsAfterExit = (platform) => platform !== 'win32';

async function run({ id, root, target, timeout }) {
  const { proj, ref, line } = resolve(id, root);
  // The target is this project in a checkout of the same repository.
  const tgt = located(target);
  if (tgt.common !== proj.common || !(tgt.rel === proj.rel || proj.rel === '' || tgt.rel.startsWith(`${proj.rel}/`))) {
    throw usage(`--target ${target} is not inside project ${proj.rel || '(top level)'} of this repository`);
  }
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'deliver-holdout-')));
  const idx = tempIndex();
  try {
    // From the top level: below it, checkout-index -a checks out only the current prefix.
    git(proj.top, ['read-tree', ref], { GIT_INDEX_FILE: idx.file });
    git(proj.top, ['checkout-index', '-a', '-f', `--prefix=${dir}${path.sep}`], { GIT_INDEX_FILE: idx.file });
    const command = line.replaceAll('{holdout}', dir).replaceAll('{target}', target);
    // Its own process group on POSIX, so a timeout can kill everything RUN started.
    const child = spawn(command, { shell: true, cwd: target, env: { ...process.env, HOLDOUT_DIR: dir, HOLDOUT_TARGET: target }, stdio: ['ignore', 2, 2], windowsHide: true, detached: process.platform !== 'win32' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeout * 1000);
    const exit = await new Promise((done) => {
      child.on('error', () => done(127));
      child.on('exit', (code) => done(code ?? 1));
    });
    clearTimeout(timer);
    if (killsAfterExit(process.platform)) killTree(child.pid);
    const pass = exit === 0 && !timedOut;
    return { code: pass ? 0 : 1, out: { verdict: pass ? 'pass' : 'fail', exit, timedOut, dir } };
  } finally {
    idx.done();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const opts = parse(process.argv.slice(2));
    const { code, out } = await { store, check, run }[opts.cmd](opts);
    fs.writeSync(1, `${JSON.stringify(out)}\n`);
    process.exit(code);
  } catch (e) {
    const code = e instanceof Exit ? e.code : 64;
    fs.writeSync(2, `holdout: ${e && e.message ? e.message : e}\n`);
    process.exit(code);
  }
}

// isMain compares real paths, so a symlinked path to this file still runs it.
if (isMain(import.meta.url)) main();
