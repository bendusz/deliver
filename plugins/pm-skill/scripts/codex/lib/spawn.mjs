import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { RunnerError } from './result.mjs';

const WIN = process.platform === 'win32';

// cmd.exe fallback only: refuse any argument that cmd.exe could reinterpret.
function cmdSafe(args) {
  for (const a of args) if (/["%\r\n]/.test(a)) throw new RunnerError('rejected', 'an argument is not safe for the cmd.exe codex shim; install codex.exe or the npm package');
  return args.map((a) => (/[\s&|<>^()]/.test(a) ? `"${a}"` : a));
}

function killTree(pid, signal) {
  if (WIN) { spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true }); return; }
  try { process.kill(-pid, signal); } catch { try { process.kill(pid, signal); } catch { /* gone */ } }
}

// runCodex — spawn codex with the prompt on stdin, stdout/stderr to files, a hard
// timeout that kills the whole process tree, and interrupt forwarding.
export function runCodex(found, args, { stdinText, cwd, env, timeoutSeconds, stdoutPath, stderrPath }) {
  return new Promise((resolve, reject) => {
    let argv = [...found.prefix, ...args];
    if (found.verbatim) argv = [...found.prefix, ...cmdSafe(args)];
    const outFd = fs.openSync(stdoutPath, 'w');
    const errFd = fs.openSync(stderrPath, 'w');
    let child;
    try {
      child = spawn(found.file, argv, { cwd, env, stdio: ['pipe', outFd, errFd], detached: !WIN, windowsHide: true, windowsVerbatimArguments: found.verbatim });
    } catch (e) { fs.closeSync(outFd); fs.closeSync(errFd); reject(e); return; }
    let timedOut = false; let interrupted = '';
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid, 'SIGTERM'); setTimeout(() => killTree(child.pid, 'SIGKILL'), 5000).unref(); }, timeoutSeconds * 1000);
    const onSignal = (sig) => { if (interrupted) return; interrupted = sig; killTree(child.pid, 'SIGTERM'); setTimeout(() => killTree(child.pid, 'SIGKILL'), 2000).unref(); };
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, onSignal);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(sig, onSignal);
      fs.closeSync(outFd); fs.closeSync(errFd);
      const exit = code === null ? 128 + (signal === 'SIGKILL' ? 9 : 15) : code;
      resolve({ exit, timedOut, interrupted });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdinText === undefined ? '' : stdinText);
  });
}
