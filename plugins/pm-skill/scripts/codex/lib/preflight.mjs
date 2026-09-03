import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const WIN = process.platform === 'win32';
// Every preflight probe is bounded: --timeout-seconds only covers the model process,
// so a wedged shim, credential helper, or login check must not hang the runner forever.
export const PROBE_TIMEOUT_MS = 30000;
// Sentinel returned by loginOk/execHelp/reviewHelp when a probe hit PROBE_TIMEOUT_MS.
export const PROBE_TIMEOUT = Object.freeze({ probeTimedOut: true });
export const PROBE_TIMEOUT_REASON = 'codex did not respond within 30 s';

function isExecutable(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}

// cmdFallbackPrefix(p) — the `cmd.exe /d /s /c <p>` argv prefix for the win32 .cmd
// fallback. With `/s`, cmd.exe strips the FIRST and LAST character of the command
// string when both are quotes and runs the remainder verbatim; without the extra
// enclosing pair, `/d /s /c "C:\path with spaces\codex.cmd" arg` loses the path's
// own quotes and splits at the space. So the prefix opens an outer quote before the
// quoted path, and runCodex/probe append the matching closing quote as the final
// argument. Returns null if p contains a character that would let it break out of
// quoting (matching cmdSafe's own refusal list in spawn.mjs).
export function cmdFallbackPrefix(p) {
  if (/["%\r\n]/.test(p)) return null;
  return ['/d', '/s', '/c', `""${p}"`];
}

// The closing quote of the cmdFallbackPrefix pair, appended after the real arguments.
export const CMD_FALLBACK_SUFFIX = '"';

// shimEntry(dir) — the @openai/codex JS entry beside a codex.cmd shim, if any.
// Global npm installs put the package under <dir>/node_modules/@openai/...; a
// project-local install puts <dir> at node_modules/.bin, one level BELOW the
// package root, so the entry is <dir>/../@openai/codex/bin/codex.js.
function shimEntry(dir) {
  const globalEntry = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (fs.existsSync(globalEntry)) return globalEntry;
  if (path.basename(dir).toLowerCase() === '.bin' && path.basename(path.dirname(dir)).toLowerCase() === 'node_modules') {
    const localEntry = path.resolve(dir, '..', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(localEntry)) return localEntry;
  }
  return null;
}

// findCodex() — the codex executable on PATH, and how to spawn it without a shell.
// win32: codex.exe ALWAYS wins (a full PATH sweep runs before any .cmd/.bat is
// considered, so a PATHEXT of `.CMD;.EXE` cannot select a shim over the real
// binary); a codex.cmd npm shim is bypassed by running its JS entry with node
// directly (no cmd.exe, no quoting); a bare .cmd falls back to cmd.exe with strict
// argument checks (see spawn.mjs).
export function findCodex() {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (!WIN) {
    for (const d of dirs) { const p = path.join(d, 'codex'); if (isExecutable(p)) return { file: p, prefix: [], verbatim: false, display: p }; }
    return null;
  }
  for (const d of dirs) {
    const p = path.join(d, 'codex.exe');
    if (fs.existsSync(p)) return { file: p, prefix: [], verbatim: false, display: p };
  }
  const exts = (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()).filter(Boolean);
  for (const d of dirs) {
    for (const ext of exts) {
      if (ext === '.exe') continue;
      const p = path.join(d, `codex${ext}`);
      if (!fs.existsSync(p)) continue;
      const shim = shimEntry(d);
      if (shim) return { file: process.execPath, prefix: [shim], verbatim: false, display: p };
      const prefix = cmdFallbackPrefix(p);
      if (!prefix) continue;
      return { file: 'cmd.exe', prefix, verbatim: true, display: p };
    }
  }
  return null;
}

function probe(found, args) {
  const argv = [...found.prefix, ...args, ...(found.verbatim ? [CMD_FALLBACK_SUFFIX] : [])];
  const r = spawnSync(found.file, argv, { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: found.verbatim, stdio: ['ignore', 'pipe', 'ignore'], timeout: PROBE_TIMEOUT_MS });
  const timedOut = Boolean(r.error && r.error.code === 'ETIMEDOUT');
  return { status: timedOut ? null : r.status, stdout: r.stdout || '', timedOut };
}
export function codexVersion(found) {
  const r = probe(found, ['--version']);
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}
export function loginOk(found) {
  const r = probe(found, ['login', 'status']);
  if (r.timedOut) return PROBE_TIMEOUT;
  return r.status === 0;
}
export function execHelp(found) {
  const r = probe(found, ['exec', '--help']);
  if (r.timedOut) return PROBE_TIMEOUT;
  return r.status === 0 ? r.stdout : null;
}
export function reviewHelp(found) {
  const r = probe(found, ['exec', 'review', '--help']);
  if (r.timedOut) return PROBE_TIMEOUT;
  return r.status === 0 ? r.stdout : null;
}
export function requireFlags(help, flags) {
  for (const f of flags) if (!help.includes(f)) return f;
  return null;
}
export const BUILD_FLAGS = ['--cd', '--sandbox', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--output-schema', '--output-last-message'];
export const READONLY_FLAGS = ['--sandbox', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--output-last-message'];
export const REVIEW_FLAGS = ['--commit', '--uncommitted'];
