import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { realpath } from '../../../hooks/lib.mjs';
import { RunnerError } from './result.mjs';

// makeScratch(worktree, prefix) — a private temp dir OUTSIDE the worktree.
export function makeScratch(worktree, prefix) {
  let base = realpath(os.tmpdir());
  if (!base) throw new RunnerError('failed', 'temporary directory is unavailable');
  if (worktree && (base === worktree || base.startsWith(worktree + path.sep))) {
    base = process.platform === 'win32' ? realpath(process.env.SystemRoot ? path.join(process.env.SystemRoot, 'Temp') : 'C:\\Windows\\Temp') : realpath('/tmp');
    if (!base) throw new RunnerError('failed', 'safe external temporary directory is unavailable');
  }
  let dir;
  try { dir = fs.mkdtempSync(path.join(base, `${prefix}.`)); } catch { throw new RunnerError('failed', 'could not create scratch directory'); }
  try { fs.chmodSync(dir, 0o700); } catch { /* win32 */ }
  return dir;
}

export function runtimeTmp(worktree, runId) {
  const dir = path.join(worktree, 'tmp', 'codex-runtime', runId);
  try { fs.mkdirSync(dir, { recursive: true }); fs.chmodSync(dir, 0o700); } catch (e) { if (!fs.existsSync(dir)) throw new RunnerError('failed', 'could not create the isolated in-worktree runtime directory'); }
  return dir;
}
