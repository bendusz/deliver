import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { RunnerError } from './result.mjs';
import { CMD_FALLBACK_SUFFIX } from './preflight.mjs';

const WIN = process.platform === 'win32';

// cmd.exe fallback only: refuse any argument that cmd.exe could reinterpret.
// (found.prefix itself is pre-quoted by findCodex()'s cmdFallbackPrefix.)
function cmdSafe(args) {
  for (const a of args) if (/["%\r\n]/.test(a)) throw new RunnerError('rejected', 'an argument is not safe for the cmd.exe codex shim; install codex.exe or the npm package');
  return args.map((a) => (/[\s&|<>^()]/.test(a) ? `"${a}"` : a));
}

function killTree(pid, signal) {
  if (WIN) { try { spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ } return; }
  try { process.kill(-pid, signal); } catch { try { process.kill(pid, signal); } catch { /* gone */ } }
}

// runCodex — spawn codex with the prompt on stdin, stdout/stderr to files, a hard
// timeout that kills the whole process tree, and interrupt forwarding.
// On POSIX the child leads its own process group (detached), so a final group-wide
// SIGKILL at exit reaps any descendant it backgrounded; on win32 a second taskkill /T
// does the same. Nothing may survive to write after the authoritative post-run snapshot.
export function runCodex(found, args, { stdinText, cwd, env, timeoutSeconds, stdoutPath, stderrPath }) {
  return new Promise((resolve, reject) => {
    let argv = [...found.prefix, ...args];
    if (found.verbatim) argv = [...found.prefix, ...cmdSafe(args), CMD_FALLBACK_SUFFIX];
    const outFd = fs.openSync(stdoutPath, 'w');
    const errFd = fs.openSync(stderrPath, 'w');
    let child;
    try {
      child = spawn(found.file, argv, { cwd, env, stdio: ['pipe', outFd, errFd], detached: !WIN, windowsHide: true, windowsVerbatimArguments: found.verbatim });
    } catch (e) { fs.closeSync(outFd); fs.closeSync(errFd); reject(e); return; }
    let timedOut = false; let interrupted = '';
    const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    // Escalation timers stay referenced (so a pending SIGKILL cannot be skipped by an
    // early event-loop drain) and are cleared in cleanup() so they can never fire
    // against a PID the OS has since reused.
    const escalations = new Set();
    const escalate = (ms) => {
      const t = setTimeout(() => { escalations.delete(t); killTree(child.pid, 'SIGKILL'); }, ms);
      escalations.add(t);
    };
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid, 'SIGTERM'); escalate(5000); }, timeoutSeconds * 1000);
    const onSignal = (sig) => { if (interrupted) return; interrupted = sig; killTree(child.pid, 'SIGTERM'); escalate(2000); };
    for (const sig of SIGNALS) process.on(sig, onSignal);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timer);
      for (const t of escalations) clearTimeout(t);
      escalations.clear();
      for (const sig of SIGNALS) process.off(sig, onSignal);
      try { fs.closeSync(outFd); } catch {}
      try { fs.closeSync(errFd); } catch {}
    };
    // reapDescendants — kill anything codex left behind, best effort and never fatal.
    const reapDescendants = () => {
      if (WIN) { try { spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ } return; }
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* no surviving group */ }
    };
    child.on('error', (e) => { cleanup(); reject(e); });
    child.on('exit', (code, signal) => {
      reapDescendants();
      cleanup();
      const exit = code === null ? 128 + (signal === 'SIGKILL' ? 9 : 15) : code;
      resolve({ exit, timedOut, interrupted });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdinText === undefined ? '' : stdinText);
  });
}
