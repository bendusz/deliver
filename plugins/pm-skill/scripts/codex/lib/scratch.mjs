import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { realpath } from '../../../hooks/lib.mjs';
import { RunnerError } from './result.mjs';

// inside(root, p) — true when p is root itself or below it. path.relative avoids the
// doubled-separator bug a `root + sep` prefix test has for a drive root ('C:\') or '/'.
function inside(root, p) {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// notSymlink(p) — true when p is absent or is not a symlink. An absent component is
// fine: mkdirSync creates it. An existing symlink is not, at any depth we control.
function notSymlink(p) {
  try { return !fs.lstatSync(p).isSymbolicLink(); } catch { return true; }
}

// makeScratch(worktree, prefix) — a private temp dir OUTSIDE the worktree.
export function makeScratch(worktree, prefix) {
  let base = realpath(os.tmpdir());
  if (!base) throw new RunnerError('failed', 'temporary directory is unavailable');
  if (worktree && inside(worktree, base)) {
    base = process.platform === 'win32' ? realpath(process.env.SystemRoot ? path.join(process.env.SystemRoot, 'Temp') : 'C:\\Windows\\Temp') : realpath('/tmp');
    if (!base) throw new RunnerError('failed', 'safe external temporary directory is unavailable');
  }
  let dir;
  try { dir = fs.mkdtempSync(path.join(base, `${prefix}.`)); } catch { throw new RunnerError('failed', 'could not create scratch directory'); }
  try { fs.chmodSync(dir, 0o700); } catch { /* win32 */ }
  return dir;
}

const runtimeBlocked = () => new RunnerError('blocked', 'tmp/codex-runtime must be a real directory inside the worktree');

// assertRuntimeRootReal(worktree) — tmp/ and tmp/codex-runtime must not be symlinks.
// Called early, before the ignore probe: `check-ignore` cannot even traverse a symlinked
// component, so without this the specific diagnostic would be lost behind the generic
// "tmp/ must be ignored" message.
export function assertRuntimeRootReal(worktree) {
  const tmpParent = path.join(worktree, 'tmp');
  if (!notSymlink(tmpParent) || !notSymlink(path.join(tmpParent, 'codex-runtime'))) throw runtimeBlocked();
}

// runtimeTmp(worktree, runId) — the per-run TMPDIR handed to Codex. It must be a real
// directory physically inside <worktree>/tmp/codex-runtime: a symlinked `tmp` or
// `tmp/codex-runtime` would let a workspace-write (or, on win32, full-access) run read
// and write outside the worktree through a path the runner itself created.
export function runtimeTmp(worktree, runId) {
  const runtimeRoot = path.join(worktree, 'tmp', 'codex-runtime');
  // Clears tmp/ and tmp/codex-runtime, so the only path left to test is the one this call
  // creates. The realpath containment check below then confirms where it really landed.
  assertRuntimeRootReal(worktree);
  const dir = path.join(runtimeRoot, runId);
  try { fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, 0o700); } catch { if (!fs.existsSync(dir)) throw new RunnerError('failed', 'could not create the isolated in-worktree runtime directory'); }
  if (!notSymlink(dir)) throw runtimeBlocked();
  const realRoot = realpath(runtimeRoot);
  const realDir = realpath(dir);
  if (!realRoot || !realDir || !realDir.startsWith(realRoot + path.sep)) throw runtimeBlocked();
  return dir;
}
