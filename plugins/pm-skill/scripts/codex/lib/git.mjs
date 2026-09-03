import { execFileSync } from 'node:child_process';

export function gitOut(root, args, input) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], input, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}
export function gitOk(root, args) {
  try { gitOut(root, args); return true; } catch { return false; }
}
// Newline-only chomp, like the hooks: a repository path may legitimately end in a
// space or tab, and .trim() would silently corrupt it into a different directory.
export function toplevel(dir) {
  try { return gitOut(dir, ['rev-parse', '--show-toplevel']).replace(/(\r?\n)+$/, '') || null; } catch { return null; }
}
export function isTracked(root, rel) {
  return gitOk(root, ['ls-files', '--error-unmatch', '--', rel]);
}
export function checkIgnore(root, rel) {
  return gitOk(root, ['check-ignore', '-q', '--', rel]);
}
