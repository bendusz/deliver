import fs from 'node:fs';
import path from 'node:path';
import { realpath } from '../../../hooks/lib.mjs';
import { RunnerError } from '../lib/result.mjs';
import { toplevel } from '../lib/git.mjs';
import { findCodex, codexVersion, loginOk, execHelp, requireFlags, READONLY_FLAGS, PROBE_TIMEOUT, PROBE_TIMEOUT_REASON } from '../lib/preflight.mjs';
import { runCodex } from '../lib/spawn.mjs';
import { makeScratch } from '../lib/scratch.mjs';

export async function runAdvise(o) {
  const cwd = realpath(process.cwd());
  const root = toplevel(cwd);
  if (!o.preflight) {
    if (!path.isAbsolute(o.promptFile)) throw new RunnerError('rejected', '--prompt-file must be an absolute path');
    if (!fs.existsSync(o.promptFile) || !fs.statSync(o.promptFile).isFile()) throw new RunnerError('rejected', 'prompt file does not exist');
  }
  const found = findCodex();
  if (!found) throw new RunnerError('unavailable', 'codex CLI not found; install @openai/codex');
  const version = codexVersion(found);
  const auth = loginOk(found);
  if (auth === PROBE_TIMEOUT) throw new RunnerError('unavailable', PROBE_TIMEOUT_REASON, { codex_version: version });
  if (!auth) throw new RunnerError('unavailable', 'Codex is not authenticated; run codex login', { codex_version: version });
  const help = execHelp(found);
  if (help === PROBE_TIMEOUT) throw new RunnerError('unavailable', PROBE_TIMEOUT_REASON, { codex_version: version });
  if (help === null) throw new RunnerError('unavailable', 'codex exec --help failed', { codex_version: version });
  const missing = requireFlags(help, READONLY_FLAGS);
  if (missing) throw new RunnerError('unavailable', `installed Codex CLI lacks required flag ${missing}; update @openai/codex`, { codex_version: version });
  const searchAvailable = help.includes('--search');
  const useSearch = o.mode === 'research' && o.search === 'auto' && searchAvailable;
  if (o.preflight) return { exit: 0, envelope: { runner_status: 'ready', preflight: true, mode: o.mode, codex_version: version, search_available: searchAvailable, quota_consumed: false } };

  const prompt = fs.readFileSync(o.promptFile, 'utf8');
  const scratch = makeScratch(root ? realpath(root) : null, `pm-codex-${o.mode}`);
  const answer = path.join(scratch, 'answer.md');
  const stderrPath = path.join(scratch, 'stderr.log');
  const stdoutPath = path.join(scratch, 'stdout.log');
  // --ignore-user-config only skips $CODEX_HOME/config.toml. A trusted repository's
  // .codex/config.toml can still launch MCP server processes (which run OUTSIDE the
  // shell sandbox), enable hooks/agents, or force web search on, so --sandbox read-only
  // alone does not make this mode host-read-only. web_search is left to the CLI's own
  // --search handling ONLY when research asked for it; otherwise it is pinned off.
  const args = ['exec', '--ignore-user-config', '--ignore-rules', '--strict-config', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '-m', o.model, '-c', `model_reasoning_effort=${o.effort}`,
    '-c', 'mcp_servers={}', '-c', 'features.hooks=false', '-c', 'agents.enabled=false', ...(useSearch ? ['--search'] : ['-c', 'web_search="disabled"']),
    ...(root ? [] : ['--skip-git-repo-check']), '-o', answer, '-'];
  const run = await runCodex(found, args, { stdinText: prompt, cwd, env: process.env, timeoutSeconds: o.timeoutSeconds, stdoutPath, stderrPath });
  const extra = { scratch_dir: scratch, codex_version: version, codex_exit: run.exit, stderr_path: stderrPath };
  if (run.timedOut) throw new RunnerError('timed-out', `codex exec exceeded the ${o.timeoutSeconds}s timeout`, extra);
  if (run.interrupted) throw new RunnerError('interrupted', `codex exec was interrupted by ${run.interrupted.replace(/^SIG/, '')}`, extra);
  if (run.exit !== 0) throw new RunnerError('failed', 'codex exec exited non-zero; inspect stderr.log', extra);
  if (!fs.existsSync(answer) || fs.statSync(answer).size === 0) throw new RunnerError('failed', 'codex exec returned no answer', extra);
  return { exit: 0, envelope: { runner_status: 'completed', mode: o.mode, answer_path: answer, stderr_path: stderrPath, scratch_dir: scratch, codex_version: version, model: o.model, effort: o.effort, codex_exit: String(run.exit), search_used: useSearch } };
}
