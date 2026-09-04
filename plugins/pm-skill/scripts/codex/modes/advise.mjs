import fs from 'node:fs';
import path from 'node:path';
import { realpath } from '../../../hooks/lib.mjs';
import { RunnerError } from '../lib/result.mjs';
import { toplevel } from '../lib/git.mjs';
import { requireCodex, READONLY_FLAGS } from '../lib/preflight.mjs';
import { runCodexWithFallback } from '../lib/spawn.mjs';
import { makeScratch } from '../lib/scratch.mjs';
import { lockedExecArgs } from '../lib/argv.mjs';

export async function runAdvise(o) {
  const cwd = realpath(process.cwd());
  const root = toplevel(cwd);
  if (!o.preflight) {
    if (!path.isAbsolute(o.promptFile)) throw new RunnerError('rejected', '--prompt-file must be an absolute path');
    if (!fs.existsSync(o.promptFile) || !fs.statSync(o.promptFile).isFile()) throw new RunnerError('rejected', 'prompt file does not exist');
  }
  const { found, version, help } = requireCodex(READONLY_FLAGS);
  const searchAvailable = help.includes('--search');
  const useSearch = o.mode === 'research' && o.search === 'auto' && searchAvailable;
  if (o.preflight) return { exit: 0, envelope: { runner_status: 'ready', preflight: true, mode: o.mode, codex_version: version, search_available: searchAvailable, quota_consumed: false } };

  const prompt = fs.readFileSync(o.promptFile, 'utf8');
  const scratch = makeScratch(root ? realpath(root) : null, `pm-codex-${o.mode}`);
  const answer = path.join(scratch, 'answer.md');
  const stderrPath = path.join(scratch, 'stderr.log');
  const stdoutPath = path.join(scratch, 'stdout.log');
  // web_search is left to the CLI's own --search handling ONLY when research asked for
  // it; otherwise lockedExecArgs pins it off.
  const argsFor = (model) => ['exec', ...lockedExecArgs({ ...o, model }, { search: useSearch }), '--sandbox', 'read-only', '--color', 'never',
    ...(root ? [] : ['--skip-git-repo-check']), '-o', answer, '-'];
  const { run, model, fallback } = await runCodexWithFallback(found, argsFor, o, { stdinText: prompt, cwd, env: process.env, timeoutSeconds: o.timeoutSeconds, stdoutPath, stderrPath });
  const extra = { scratch_dir: scratch, codex_version: version, codex_exit: run.exit, stderr_path: stderrPath };
  if (run.timedOut) throw new RunnerError('timed-out', `codex exec exceeded the ${o.timeoutSeconds}s timeout`, extra);
  if (run.interrupted) throw new RunnerError('interrupted', `codex exec was interrupted by ${run.interrupted.replace(/^SIG/, '')}`, extra);
  if (run.exit !== 0) throw new RunnerError('failed', 'codex exec exited non-zero; inspect stderr.log', extra);
  if (!fs.existsSync(answer) || fs.statSync(answer).size === 0) throw new RunnerError('failed', 'codex exec returned no answer', extra);
  return { exit: 0, envelope: { runner_status: 'completed', mode: o.mode, answer_path: answer, stderr_path: stderrPath, scratch_dir: scratch, codex_version: version, model, effort: o.effort, codex_exit: String(run.exit), search_used: useSearch, ...(fallback ? { model_fallback: fallback } : {}) } };
}
