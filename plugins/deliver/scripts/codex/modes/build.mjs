import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pmRelpath, realpath, readJson, legacyState } from '../../../hooks/lib.mjs';
import { RunnerError } from '../lib/result.mjs';
import { toplevel, isTracked, checkIgnore, gitOk, gitOut } from '../lib/git.mjs';
import { parseStory } from '../lib/story.mjs';
import { requireCodex, BUILD_FLAGS } from '../lib/preflight.mjs';
import { runCodexWithFallback } from '../lib/spawn.mjs';
import { makeScratch, runtimeTmp, assertRuntimeRootReal } from '../lib/scratch.mjs';
import { snapshotWorktree, changedPaths, gitMetadataFingerprint } from '../lib/snapshot.mjs';
import { lockedExecArgs } from '../lib/argv.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCHEMA = path.join(PLUGIN_ROOT, 'schemas', 'codex-builder-result.schema.json');
const rejected = (r) => new RunnerError('rejected', r);
const blocked = (r, extra) => new RunnerError('blocked', r, extra);
const unavailable = (r, extra) => new RunnerError('unavailable', r, extra);
const isRootSpec = (rel) => /\.sdd$/i.test(rel) && !rel.includes('/');
const isProtected = (rel) => rel.startsWith('pm/') || rel.startsWith('docs/stories/') || rel.startsWith('docs/wiki/') || rel.startsWith('docs/handoff/') || rel.startsWith('.specdd/') || isRootSpec(rel) || ['docs/approval.json', 'docs/spec.md', 'docs/plan.md', 'docs/constitution.md'].includes(rel);
const allowed = (rel, scopes) => scopes.some((s) => rel === s || rel.startsWith(`${s}/`));
const tomlString = (s) => JSON.stringify(s);

function buildPrompt({ worktree, storyRel, scopes, mode, evidenceRel }) {
  const lines = [
    'You are the implementation worker for one build-ready PM story.',
    `Worktree root: ${worktree}`,
    `Story: ${storyRel}`,
    'Allowed implementation paths from story pm-meta:',
    ...scopes.map((s) => `- ${s}`),
    `Mode: ${mode}`,
  ];
  if (evidenceRel) lines.push(`Fix evidence: ${evidenceRel}`);
  lines.push('',
    'Read the story first. AGENTS.md is already in your context; read CLAUDE.md only when it is more than a pointer. Implement only that story.',
    "Read the story's Specs (.sdd files) before the sources when it names any. If you must change a .sdd inside the allowed paths, name it in summary. Never edit .specdd/ or a root .sdd.",
    mode === 'fix'
      ? 'Read the fix evidence and make the smallest change that resolves its accepted findings or failing gate.'
      : 'Prefer a focused implementation. If the story needs broad architectural work or lacks enough context, return blocked instead of widening scope.',
    "Follow the story's Out of scope, acceptance criteria, and verification sections.",
    'Run the story verification command and the relevant project tests before reporting done.',
    'Stay inside the allowed implementation paths. Do not change git state or edit stories, docs/wiki/, docs/handoff/, docs/approval.json, docs/spec.md, docs/plan.md, docs/constitution.md, or .specdd/.',
    'Your shell environment is reduced and secret-like variables are removed. TMPDIR is an isolated directory inside this worktree.',
    'Return only JSON matching the supplied schema. List every changed path in files_changed. summary holds at most five short strings. Use status blocked when tests fail, scope is wider than this brief, or required evidence is missing.');
  return `${lines.join('\n')}\n`;
}

function validateBuilderResult(r) {
  const noCtl = (s) => typeof s === 'string' && !/[\x00-\x1f\x7f]/.test(s);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (JSON.stringify(Object.keys(r).sort()) !== '["files_changed","root_cause","status","summary","tests"]') return false;
  if (r.status !== 'done' && r.status !== 'blocked') return false;
  if (!(typeof r.root_cause === 'string' || r.root_cause === null)) return false;
  if (!Array.isArray(r.files_changed) || new Set(r.files_changed).size !== r.files_changed.length || !r.files_changed.every(noCtl)) return false;
  if (!Array.isArray(r.summary) || r.summary.length === 0 || r.summary.length > 5 || !r.summary.every((s) => typeof s === 'string')) return false;
  if (!Array.isArray(r.tests) || r.tests.length === 0 || !r.tests.every((t) => t && typeof t === 'object' && typeof t.command === 'string' && ['passed', 'failed', 'not-run'].includes(t.status) && typeof t.summary === 'string')) return false;
  if (r.status === 'done' && !r.tests.every((t) => t.status === 'passed')) return false;
  return true;
}

function policy() {
  return { sandbox: 'danger-full-access', network_access: true, web_search: 'config', mcp_servers: 'config', hooks: false, subagents: false, login_shell: false, environment: 'core-with-secret-filtering', host_tmp_writable: true };
}

export async function runBuild(o) {
  if (!path.isAbsolute(o.worktree)) throw rejected('worktree must be an absolute path');
  if (!fs.existsSync(o.worktree) || !fs.statSync(o.worktree).isDirectory()) throw rejected('worktree does not exist');
  const worktree = realpath(o.worktree);
  if (!worktree) throw rejected('cannot resolve worktree');
  if (!gitOk(process.cwd(), ['--version'])) throw unavailable('git is required');
  const top = toplevel(worktree);
  if (!top) throw rejected('worktree is not a git repository');
  const gitRoot = realpath(top);
  if (!gitRoot) throw rejected('cannot resolve git root');
  if (gitRoot !== worktree) throw rejected('--worktree must name the git worktree root exactly');

  let storyRel = ''; let scopes = []; let builder = '';
  if (o.story) {
    storyRel = pmRelpath(worktree, o.story);
    if (storyRel === null) throw rejected('story path escapes the worktree or cannot be resolved');
    if (!/^docs\/stories\/.+\.md$/.test(storyRel)) throw rejected('story must be a Markdown file under docs/stories/');
    if (!fs.existsSync(path.join(worktree, storyRel)) || !fs.statSync(path.join(worktree, storyRel)).isFile()) throw rejected('story file does not exist');
    if (!isTracked(worktree, storyRel)) throw blocked('story must be tracked before codex-builder can write');
    ({ builder, scopes } = parseStory(worktree, storyRel));
  }

  let evidenceRel = '';
  if (o.mode === 'fix') {
    evidenceRel = pmRelpath(worktree, o.evidence);
    if (evidenceRel === null) throw rejected('evidence path escapes the worktree or cannot be resolved');
    if (!/^tmp\/codex-builder\/.+\.md$/.test(evidenceRel)) throw rejected('fix evidence must be a Markdown file under tmp/codex-builder/');
    if (!fs.existsSync(path.join(worktree, evidenceRel)) || !fs.statSync(path.join(worktree, evidenceRel)).isFile()) throw rejected('fix evidence file does not exist');
  }

  // The approval marker is the one tracked file the gate reads (references/state.md).
  const marker = path.join(worktree, 'docs', 'approval.json');
  let lst = null;
  try { lst = fs.lstatSync(marker); } catch { lst = null; }
  if (!lst) {
    const legacy = legacyState(worktree);
    if (legacy) throw blocked(`docs/approval.json is missing but ${legacy.file} exists: pre-0.24 state; run /deliver:resume to migrate it before codex-builder can write`);
    throw blocked('docs/approval.json is missing; refusing a write-capable run');
  }
  if (lst.isSymbolicLink()) throw blocked('docs/approval.json must not be a symlink');
  if (pmRelpath(worktree, marker) !== 'docs/approval.json') throw blocked('docs/approval.json must be a regular in-worktree file');
  if (!lst.isFile()) throw blocked('docs/approval.json is not a regular file');
  if (!isTracked(worktree, 'docs/approval.json')) throw blocked('docs/approval.json must be tracked before codex-builder can write');
  const approval = readJson(marker);
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) throw blocked('docs/approval.json is malformed; refusing a write-capable run');
  if (approval.status !== 'approved') throw blocked('the plan is not approved (docs/approval.json status is not "approved"); codex-builder may not write implementation files');
  if (typeof approval.plan_digest === 'string' && approval.plan_digest) {
    let digestNow = '';
    try { digestNow = gitOut(worktree, ['hash-object', 'docs/plan.md']).trim(); } catch { digestNow = ''; }
    if (digestNow && digestNow !== approval.plan_digest) throw blocked('docs/plan.md changed since approval (plan_digest mismatch); run /deliver:correct-course before codex-builder can write');
  }

  const { found, version } = requireCodex(BUILD_FLAGS, { hint: ' or use expert-builder' });
  if (!fs.existsSync(SCHEMA)) throw new RunnerError('failed', 'bundled result schema is missing', { codex_version: version });
  assertRuntimeRootReal(worktree);
  if (!checkIgnore(worktree, 'tmp/codex-runtime/probe')) throw blocked('tmp/ must be ignored before codex-builder can create an isolated runtime directory', { codex_version: version });

  if (o.preflight) {
    return { exit: 0, envelope: { runner_status: 'ready', preflight: true, codex_version: version, worktree, story: storyRel || null, story_builder: builder || null, story_scope_checked: storyRel !== '', allowed_paths: scopes, quota_consumed: false, policy: policy() } };
  }

  const scratch = makeScratch(worktree, 'pm-codex-builder');
  const runId = path.basename(scratch).split('.').at(-1);
  const rt = runtimeTmp(worktree, runId);
  // Compare REAL paths, not lexical prefixes: a symlinked component would make a lexical
  // check pass while the rm landed outside the worktree. (runtimeTmp already refuses to
  // hand back such a path; this is the second half of the same guarantee.)
  const runtimeRoot = realpath(path.join(worktree, 'tmp', 'codex-runtime'));
  const cleanupRuntime = () => {
    try {
      const real = realpath(rt);
      if (runtimeRoot && real && real.startsWith(runtimeRoot + path.sep)) fs.rmSync(rt, { recursive: true, force: true });
    } catch { /* best effort */ }
  };
  const files = { prompt: path.join(scratch, 'prompt.md'), result: path.join(scratch, 'result.json'), stdout: path.join(scratch, 'stdout.log'), stderr: path.join(scratch, 'stderr.log') };
  // The model pair and model_fallback appear only after a fallback, so a failure names what ran.
  const diag = (codexExit, actual, ignoredChanged) => ({ scratch_dir: scratch, codex_version: version, codex_exit: codexExit, ...(fallback ? { model, effort, model_fallback: fallback } : {}), actual_files_changed: actual, ignored_files_changed: ignoredChanged });

  const prompt = buildPrompt({ worktree, storyRel, scopes, mode: o.mode, evidenceRel });
  try { fs.writeFileSync(files.prompt, prompt); } catch { cleanupRuntime(); throw new RunnerError('failed', 'could not write the prompt', { scratch_dir: scratch, codex_version: version }); }

  let before;
  try { before = snapshotWorktree(worktree); } catch { cleanupRuntime(); throw blocked('the worktree contains an unsupported path type or a tab/newline filename; refusing an ambiguous baseline', { scratch_dir: scratch, codex_version: version }); }
  const beforeMeta = gitMetadataFingerprint(worktree);

  const argsFor = ({ model, effort }) => ['exec', ...lockedExecArgs({ ...o, model, effort }), '-C', worktree, '--color', 'never',
    '-c', 'allow_login_shell=false',
    '-c', 'shell_environment_policy.inherit="core"', '-c', 'shell_environment_policy.ignore_default_excludes=false', '-c', 'shell_environment_policy.experimental_use_profile=false',
    '-c', `shell_environment_policy.set.TMPDIR=${tomlString(rt)}`, '-c', `shell_environment_policy.set.TMP=${tomlString(rt)}`, '-c', `shell_environment_policy.set.TEMP=${tomlString(rt)}`,
    '--output-schema', SCHEMA, '-o', files.result, '-'];

  let run; let model; let effort; let fallback;
  try {
    ({ run, model, effort, fallback } = await runCodexWithFallback(found, argsFor, o, { stdinText: prompt, cwd: worktree, env: { ...process.env, TMPDIR: rt, TMP: rt, TEMP: rt }, timeoutSeconds: o.timeoutSeconds, stdoutPath: files.stdout, stderrPath: files.stderr }));
  } catch (e) { cleanupRuntime(); throw new RunnerError('failed', `could not start codex: ${e.message}`, { scratch_dir: scratch, codex_version: version }); }
  cleanupRuntime();

  let after;
  try { after = snapshotWorktree(worktree); } catch { throw new RunnerError('failed', 'could not take the post-run worktree snapshot', { scratch_dir: scratch, codex_version: version, codex_exit: run.exit }); }
  // Git-ignored files are reported, not enforced. A pre-existing .env, cache, or build
  // artifact is outside every story's pm-meta.touches by construction, so enforcing it
  // would fail any run whose tests write one. The PM reads ignored_files_changed and raises anything
  // real. Protected PM paths are still enforced, ignored or not.
  const isIgnored = (rel) => (before.get(rel) || '').startsWith('ignored:') || (after.get(rel) || '').startsWith('ignored:');
  const delta = changedPaths(before, after);
  const ignoredChanged = delta.filter(isIgnored);
  const actual = delta.filter((rel) => !isIgnored(rel));
  const afterMeta = gitMetadataFingerprint(worktree);
  const safety = (reason) => new RunnerError('safety-violation', reason, diag(run.exit, actual, ignoredChanged));

  if (beforeMeta !== afterMeta) throw safety('Codex changed protected git state (HEAD, refs, index contents and flags, local config, hooks, info/exclude, or worktree registrations); preserve the worktree and inspect it before continuing');
  for (const rel of [...actual, ...ignoredChanged]) {
    if (isProtected(rel)) throw safety(`Codex changed a protected PM artifact: ${rel}`);
  }
  for (const rel of actual) {
    if (!allowed(rel, scopes)) throw safety(`Codex changed a path outside the story's pm-meta.touches: ${rel}`);
  }
  if (run.timedOut) throw new RunnerError('timed-out', `codex exec exceeded the ${o.timeoutSeconds}s timeout; descendants were terminated and partial changes were preserved`, diag(run.exit, actual, ignoredChanged));
  if (run.interrupted) throw new RunnerError('interrupted', `codex-builder was interrupted by ${run.interrupted.replace(/^SIG/, '')}; descendants were terminated and partial changes were preserved`, diag(run.exit, actual, ignoredChanged));
  if (run.exit !== 0) throw new RunnerError('failed', 'codex exec exited non-zero; inspect stderr.log', diag(run.exit, actual, ignoredChanged));
  if (!fs.existsSync(files.result) || fs.statSync(files.result).size === 0) throw new RunnerError('failed', 'codex exec returned no structured result', diag(run.exit, actual, ignoredChanged));
  const result = readJson(files.result);
  if (!validateBuilderResult(result)) throw new RunnerError('failed', 'Codex result did not satisfy the builder result contract', diag(run.exit, actual, ignoredChanged));

  const claimed = [];
  for (const c of result.files_changed) {
    const rel = pmRelpath(worktree, c);
    if (rel === null) throw safety('Codex reported a changed path outside the worktree');
    if (isIgnored(rel)) continue;
    claimed.push(rel);
  }
  if (JSON.stringify([...new Set(claimed)].sort()) !== JSON.stringify(actual)) throw safety('Codex files_changed does not match the authoritative before/after worktree delta');

  const envelope = { runner_status: 'completed', codex_version: version, model, effort, ...(fallback ? { model_fallback: fallback } : {}), actual_files_changed: actual, ignored_files_changed: ignoredChanged, result };
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  return { exit: 0, envelope };
}
