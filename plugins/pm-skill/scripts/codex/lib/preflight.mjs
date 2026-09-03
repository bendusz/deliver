import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const WIN = process.platform === 'win32';

function isExecutable(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}

// findCodex() — the codex executable on PATH, and how to spawn it without a shell.
// win32: prefer codex.exe; a codex.cmd npm shim is bypassed by running its JS entry
// with node directly (no cmd.exe, no quoting); a bare .cmd falls back to cmd.exe
// with strict argument checks (see spawn.mjs).
export function findCodex() {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (!WIN) {
    for (const d of dirs) { const p = path.join(d, 'codex'); if (isExecutable(p)) return { file: p, prefix: [], verbatim: false, display: p }; }
    return null;
  }
  const exts = (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase());
  for (const d of dirs) {
    for (const ext of exts) {
      const p = path.join(d, `codex${ext}`);
      if (!fs.existsSync(p)) continue;
      if (ext === '.exe') return { file: p, prefix: [], verbatim: false, display: p };
      const shim = path.join(d, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (fs.existsSync(shim)) return { file: process.execPath, prefix: [shim], verbatim: false, display: p };
      return { file: 'cmd.exe', prefix: ['/d', '/s', '/c', p], verbatim: true, display: p };
    }
  }
  return null;
}

function probe(found, args) {
  const r = spawnSync(found.file, [...found.prefix, ...args], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: found.verbatim, stdio: ['ignore', 'pipe', 'ignore'] });
  return { status: r.status, stdout: r.stdout || '' };
}
export function codexVersion(found) {
  const r = probe(found, ['--version']);
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}
export function loginOk(found) {
  return probe(found, ['login', 'status']).status === 0;
}
export function execHelp(found) {
  const r = probe(found, ['exec', '--help']);
  return r.status === 0 ? r.stdout : null;
}
export function requireFlags(help, flags) {
  for (const f of flags) if (!help.includes(f)) return f;
  return null;
}
export const BUILD_FLAGS = ['--cd', '--sandbox', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--output-schema', '--output-last-message'];
export const READONLY_FLAGS = ['--sandbox', '--ephemeral', '--ignore-user-config', '--strict-config', '--output-last-message'];
