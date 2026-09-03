import fs from 'node:fs';
import path from 'node:path';
import { realpath } from '../../../hooks/lib.mjs';
import { RunnerError } from '../lib/result.mjs';
import { toplevel, gitOut, gitOk, checkIgnore } from '../lib/git.mjs';
import { findCodex, codexVersion, loginOk, execHelp, reviewHelp, requireFlags, READONLY_FLAGS, REVIEW_FLAGS, PROBE_TIMEOUT, PROBE_TIMEOUT_REASON } from '../lib/preflight.mjs';
import { runCodex } from '../lib/spawn.mjs';
import { makeScratch } from '../lib/scratch.mjs';

const PRESETS = {
  security: 'authn/authz gaps, injection, secret handling, unsafe deserialization, dependency risk',
  bugs: 'logic errors, edge cases, error handling, race conditions, silent failures',
  architecture: 'module boundaries, coupling, abstraction fit, structural drift',
  tests: 'coverage of changed behavior, missing edge cases, assertion quality, flakiness risk',
  performance: 'algorithmic complexity, N+1 patterns, unnecessary allocation/IO, hot paths',
};
const CODEBASE_PROMPT = 'Review this codebase as a senior engineer. Read the repository structure and the most important modules first. Report findings ordered by severity (block, major, minor, nit) with file paths and line references, then a short overall assessment.';
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const slug = (s) => {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (base === '') return 'custom';
  if (base === 'index') return 'index-objective';
  return base;
};

function objectiveClause(objective) {
  if (!objective) return '';
  const preset = PRESETS[objective.toLowerCase()];
  return preset ? ` Focus on ${objective.toLowerCase()}: ${preset}.` : ` Focus exclusively on this objective: ${objective}.`;
}

export async function runReview(o) {
  const cwd = process.cwd();
  const root = toplevel(cwd) ? realpath(toplevel(cwd)) : null;
  if (o.scope !== 'codebase' && !root) throw new RunnerError('rejected', `${o.scope} scope requires a git repository`);
  const base = root || realpath(cwd);

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
  // `codex exec --help` says nothing about the review subcommand, so preflight must ask
  // it directly before it can honestly answer "ready" for a commit/worktree review.
  const rhelp = reviewHelp(found);
  if (rhelp === PROBE_TIMEOUT) throw new RunnerError('unavailable', PROBE_TIMEOUT_REASON, { codex_version: version });
  if (rhelp === null) throw new RunnerError('unavailable', 'codex exec review --help failed; update @openai/codex', { codex_version: version });
  const missingReview = requireFlags(rhelp, REVIEW_FLAGS);
  if (missingReview) throw new RunnerError('unavailable', `installed Codex CLI lacks required review flag ${missingReview}; update @openai/codex`, { codex_version: version });

  if (o.preflight) return { exit: 0, envelope: { runner_status: 'ready', preflight: true, mode: 'review', scope: o.scope, codex_version: version, quota_consumed: false } };

  if (o.scope === 'worktree' && gitOut(root, ['status', '--porcelain']).trim() === '') return { exit: 0, envelope: { runner_status: 'nothing-to-review', mode: 'review', scope: o.scope, reason: 'the working tree is clean', codex_version: version } };
  if (o.scope === 'recent' && !gitOk(root, ['rev-parse', '--verify', 'HEAD'])) return { exit: 0, envelope: { runner_status: 'nothing-to-review', mode: 'review', scope: o.scope, reason: 'no commit to review', codex_version: version } };

  if (!path.isAbsolute(o.out)) throw new RunnerError('rejected', '--out must be an absolute path');
  const outName = path.basename(o.out);
  if (!['untracked', 'codex'].includes(outName) || realpath(path.dirname(o.out)) !== base) throw new RunnerError('rejected', '--out must be <root>/untracked or <root>/codex');
  if (root && gitOut(root, ['ls-files', '--', outName]).trim() !== '') throw new RunnerError('rejected', `${outName}/ holds tracked files and cannot receive reports`);
  // The parent resolving to base is not enough: `<root>/untracked` may itself be a
  // symlink or a Windows junction that redirects the report outside the repository.
  if (fs.existsSync(o.out)) {
    let ls = null;
    try { ls = fs.lstatSync(o.out); } catch { ls = null; }
    if (ls && ls.isSymbolicLink()) throw new RunnerError('rejected', 'output directory must not be a symlink');
    if (realpath(o.out) !== path.join(base, outName)) throw new RunnerError('rejected', 'output directory must resolve inside the repository root');
  }

  const scratch = makeScratch(base, 'pm-codex-review');
  const report = path.join(scratch, 'report.md');
  const stderrPath = path.join(scratch, 'stderr.log');
  const stdoutPath = path.join(scratch, 'stdout.log');
  // --ignore-user-config only skips $CODEX_HOME/config.toml; a trusted repository's
  // .codex/config.toml can still start MCP server processes (which run OUTSIDE the
  // shell sandbox), enable hooks/agents, or turn web search back on. Review is
  // read-only on every platform, so neutralise all four explicitly.
  const tail = ['--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral', '-m', o.model, '-c', `model_reasoning_effort=${o.effort}`,
    '-c', 'mcp_servers={}', '-c', 'features.hooks=false', '-c', 'agents.enabled=false', '-c', 'web_search="disabled"', '-o', report];
  const clause = objectiveClause(o.objective);
  let args; let stdinText;
  if (o.scope === 'codebase') {
    args = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', ...tail, '-'];
    stdinText = `${CODEBASE_PROMPT}${clause}\n`;
  } else if (o.objective) {
    const scopeText = o.scope === 'recent' ? 'Review the changes introduced by the last commit (HEAD).' : 'Review the uncommitted changes — staged, unstaged, and untracked.';
    args = ['exec', 'review', ...tail, `${scopeText}${clause}`];
  } else {
    args = ['exec', 'review', ...(o.scope === 'recent' ? ['--commit', 'HEAD'] : ['--uncommitted']), ...tail];
  }

  const run = await runCodex(found, args, { stdinText, cwd: base, env: process.env, timeoutSeconds: o.timeoutSeconds, stdoutPath, stderrPath });
  const extra = { scratch_dir: scratch, codex_version: version, codex_exit: run.exit };
  if (run.timedOut) throw new RunnerError('timed-out', `codex review exceeded the ${o.timeoutSeconds}s timeout`, { ...extra, stderr_path: stderrPath });
  if (run.interrupted) throw new RunnerError('interrupted', `codex review was interrupted by ${run.interrupted.replace(/^SIG/, '')}`, { ...extra, stderr_path: stderrPath });
  if (run.exit !== 0 || !fs.existsSync(report) || fs.statSync(report).size === 0) {
    const err = new RunnerError('failed', 'codex review exited non-zero or produced no report; inspect stderr.log', extra);
    err.extra.stderr_path = stderrPath;
    throw err;
  }

  fs.mkdirSync(o.out, { recursive: true });
  const nameBase = `${stamp()}-codex-review-${o.scope}${o.objective ? `-${slug(o.objective)}` : ''}`;
  // COPYFILE_EXCL makes the suffix loop atomic: two same-second, same-objective reviews
  // cannot both pick the same name and have the last copy win.
  let reportPath = path.join(o.out, `${nameBase}.md`);
  let copied = false;
  for (let n = 2; n <= 500; n += 1) {
    try { fs.copyFileSync(report, reportPath, fs.constants.COPYFILE_EXCL); copied = true; break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      reportPath = path.join(o.out, `${nameBase}-${n}.md`);
    }
  }
  if (!copied) throw new RunnerError('failed', 'could not place the review report without overwriting an existing one', { ...extra, stderr_path: stderrPath });
  const gitignoreRuleNeeded = root && !checkIgnore(root, `${outName}/probe`) ? `/${outName}/` : null;
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  return { exit: 0, envelope: { runner_status: 'completed', mode: 'review', scope: o.scope, objective: o.objective, report_path: reportPath, codex_version: version, model: o.model, effort: o.effort, codex_exit: String(run.exit), gitignore_rule_needed: gitignoreRuleNeeded } };
}
