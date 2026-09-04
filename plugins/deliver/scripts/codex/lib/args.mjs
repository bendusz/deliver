// Argument parsing for run.mjs. Free-form Codex flags are never accepted.
export class UsageError extends Error {}

const MODES = new Set(['build', 'fix', 'review', 'advise', 'research']);
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const SCOPES = new Set(['recent', 'worktree', 'codebase']);
const DEFAULT_MODEL = 'gpt-6-astra';
const DEFAULTS = {
  build: { model: DEFAULT_MODEL, effort: 'high' },
  fix: { model: DEFAULT_MODEL, effort: 'high' },
  review: { model: DEFAULT_MODEL, effort: 'high' },
  research: { model: DEFAULT_MODEL, effort: 'high' },
  advise: { model: DEFAULT_MODEL, effort: 'medium' },
};
// When the default model is refused for this account, every mode retries once on this pair.
export const FALLBACK = { model: 'gpt-5.6-sol', effort: 'medium' };
const VALUE_FLAGS = new Set(['--mode', '--worktree', '--story', '--evidence', '--model', '--effort', '--timeout-seconds', '--scope', '--objective', '--out', '--prompt-file', '--search']);

export const USAGE = 'usage: run.mjs --mode build|fix|review|advise|research [--preflight] [--model <id>] [--effort <level>] [--timeout-seconds <n>] ' +
  '(build/fix: --worktree <abs> --story <docs/stories/x.md> [--evidence <tmp/codex-builder/x.md>]) ' +
  '(review: --scope recent|worktree|codebase [--objective <text>] --out <abs-dir>) ' +
  '(advise/research: --prompt-file <abs> [--search auto|off])';

export function parseArgs(argv) {
  const o = { mode: '', preflight: false, model: '', effort: '', timeoutSeconds: 600, worktree: '', story: '', evidence: '', scope: '', objective: '', out: '', promptFile: '', search: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preflight') { o.preflight = true; continue; }
    if (!VALUE_FLAGS.has(a)) throw new UsageError(`unsupported argument: ${a}`);
    const v = argv[i + 1];
    if (v === undefined) throw new UsageError(`${a} needs a value`);
    i++;
    switch (a) {
      case '--mode': o.mode = v; break;
      case '--worktree': o.worktree = v; break;
      case '--story': o.story = v; break;
      case '--evidence': o.evidence = v; break;
      case '--model': o.model = v; break;
      case '--effort': o.effort = v; break;
      case '--timeout-seconds': o.timeoutSeconds = v; break;
      case '--scope': o.scope = v; break;
      case '--objective': o.objective = v; break;
      case '--out': o.out = v; break;
      case '--prompt-file': o.promptFile = v; break;
      case '--search': o.search = v; break;
    }
  }
  if (!MODES.has(o.mode)) throw new UsageError('mode must be build, fix, review, advise, or research');
  o.modelExplicit = Boolean(o.model);
  if (!o.model) o.model = DEFAULTS[o.mode].model;
  if (!o.effort) o.effort = DEFAULTS[o.mode].effort;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(o.model)) throw new UsageError('unsafe model id');
  if (!EFFORTS.has(o.effort)) throw new UsageError(`unsupported effort: ${o.effort}`);
  if (typeof o.timeoutSeconds === 'string') {
    if (!/^[1-9][0-9]*$/.test(o.timeoutSeconds)) throw new UsageError('timeout must be a positive number of seconds');
    o.timeoutSeconds = Number(o.timeoutSeconds);
  }
  if (o.timeoutSeconds > 7200) throw new UsageError('timeout may not exceed 7200 seconds');

  if (o.mode === 'build' || o.mode === 'fix') {
    if (!o.worktree) throw new UsageError('--worktree is required');
    if (!o.preflight && !o.story) throw new UsageError('--story is required');
    if (o.mode === 'fix' && !o.evidence) throw new UsageError('fix mode requires --evidence');
    if (o.mode === 'build' && o.evidence) throw new UsageError('--evidence is only valid in fix mode');
    if (o.preflight && (o.mode !== 'build' || o.evidence)) throw new UsageError('--preflight does not accept fix-mode options');
  } else if (o.mode === 'review') {
    if (!SCOPES.has(o.scope)) throw new UsageError('review scope must be recent, worktree, or codebase');
    if (!o.preflight && !o.out) throw new UsageError('--out is required');
    // "under 500" is exclusive, and tab/LF/CR are not printable either: the objective
    // is embedded in a prompt and in a report filename slug.
    if (o.objective.length >= 500 || /[\x00-\x1f\x7f]/.test(o.objective)) throw new UsageError('objective must be under 500 printable characters');
  } else {
    if (!o.preflight && !o.promptFile) throw new UsageError('--prompt-file is required');
    if (o.search !== 'auto' && o.search !== 'off') throw new UsageError('--search must be auto or off');
  }
  return o;
}
