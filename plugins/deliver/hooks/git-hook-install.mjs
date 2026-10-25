#!/usr/bin/env node
// Installs deliver's git-level ship gate in a deliver project's repository.
//
// With git 2.28 or newer: a POSIX sh `reference-transaction` shim, `# deliver-merge-gate v2` on
// line 2, in `git rev-parse --git-path hooks`. Git runs it for every ref transaction; it exits at
// once unless the phase is `prepared` and a line updates `refs/heads/<integration>` for an
// integration branch baked in at install (every one a deliver project in the repository names),
// and only then pipes those lines to git-merge-gate.mjs, run by the node that installed it (else
// `node` on PATH). With older git: `pre-merge-commit` and `pre-commit` shims instead, which gate
// merge commits only, reported as "git < 2.28: fast-forward updates are not gated".
//
// A private copy of each shim lives in `<git-common-dir>/deliver/`, a stable path a hook manager
// can call (`sh "<copy>" "$@"`). The hooks directory is written only when it sits inside the git
// directory and core.hooksPath, if set, comes from the repository's own config; a hooks directory
// in the working tree, from global or system config, or elsewhere is reported with the line to add.
// An existing hook without the marker on line 2, a symlink, or a file that cannot be read is
// foreign: never overwritten, only reported. Writes go to a temporary file renamed into place.
// Idempotent: a current shim is left alone and a marked one that differs (a plugin update, a new
// integration branch) is refreshed. 0.29.0 before this sets no merge options; a shim from the
// earlier v1 install is replaced, and the `branch.<integration>.mergeoptions --no-ff` it set is
// removed.
//
// session-context.mjs calls installGitHook() at session start; /deliver:doctor runs the CLI:
//   node git-hook-install.mjs [--check | --uninstall] <project-root>
// --check reports without writing, and also checks that the shim is executable, that its gate
// script exists, that its node runs, and the git version. --uninstall removes only deliver's marked
// shims. Exit 0 when the gate is in place (or removed), 1 otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, chomp, isMain, oneLine } from './lib.mjs';
import { discover, projectAt, project, planName } from './require-verified.mjs';

export const MARKER = '# deliver-merge-gate v2';
const OURS = /^# deliver-merge-gate v\d+$/;
const V1 = '# deliver-merge-gate v1';
export const RT_HOOK = 'reference-transaction';
export const FALLBACK_HOOKS = ['pre-merge-commit', 'pre-commit'];
export const ALL_HOOKS = [RT_HOOK, ...FALLBACK_HOOKS];
export const MIN_GIT = [2, 28];
export const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'git-merge-gate.mjs');

const slash = (p) => path.resolve(p).replace(/\\/g, '/');
// shQuote(s): s inside sh double quotes.
const shQuote = (s) => `"${String(s).replace(/["\\$`]/g, '\\$&')}"`;

// shim({ name, gate, node, branches }): the hook script `name`. Forward slashes, so git for
// Windows' sh runs the same script. A missing gate script or node fails open with a warning:
// deliver's hooks never wedge the repository.
export function shim({ name = RT_HOOK, gate = GATE, node = process.execPath, branches = ['main'] } = {}) {
  const head = [
    '#!/bin/sh',
    MARKER,
    "# deliver's git-level ship gate, installed by the deliver plugin (hooks/git-hook-install.mjs)",
    '# and refreshed at session start. Remove it with git-hook-install.mjs --uninstall <project>.',
    '# DELIVER_NO_ENFORCE=1 disables it.',
    '[ "${DELIVER_NO_ENFORCE:-}" = 1 ] && exit 0',
  ];
  const run = [
    `gate=${shQuote(slash(gate))}`,
    `node=${shQuote(slash(node))}`,
    '[ -f "$gate" ] || { echo "deliver: the merge gate script $gate is missing; run /deliver:doctor" >&2; exit 0; }',
    '[ -x "$node" ] || node=node',
    'command -v "$node" >/dev/null 2>&1 || { echo "deliver: node is not runnable, so the merge gate did not run; run /deliver:doctor" >&2; exit 0; }',
  ];
  if (name === RT_HOOK) {
    const refs = [...new Set(branches)].sort().map((b) => shQuote(`refs/heads/${b}`)).join('|');
    return [
      ...head,
      '[ "$1" = prepared ] || exit 0',
      'lines=',
      'while read -r old new ref; do',
      `  case "$ref" in ${refs}) lines="$lines$old $new $ref`,
      '" ;;',
      '  esac',
      'done',
      '[ -n "$lines" ] || exit 0',
      ...run,
      `printf '%s' "$lines" | "$node" "$gate" ${RT_HOOK}`,
      '',
    ].join('\n');
  }
  return [
    ...head,
    ...(name === 'pre-commit' ? ['[ -f "$(git rev-parse --git-path MERGE_HEAD)" ] || exit 0'] : []),
    ...run,
    `exec "$node" "$gate" ${name}`,
    '',
  ].join('\n');
}

export function gitVersion(dir) {
  const m = chomp(git(dir, ['version']) || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}
const atLeast = (v, min) => Boolean(v) && (v[0] > min[0] || (v[0] === min[0] && v[1] >= min[1]));

// integrationBranches(root, top): every integration branch a deliver project in the repository
// names, so one shim serves them all; else the plan on HEAD's; else main.
export function integrationBranches(root, top) {
  const names = new Set();
  try {
    for (const dir of discover(top).found) {
      const p = projectAt(top, dir === '.' ? '' : `${dir}/`);
      for (const n of p?.names ?? (p?.name ? [p.name] : [])) names.add(n);
    }
    const prefix = chomp(git(root, ['rev-parse', '--show-prefix']) || '').replace(/\\/g, '/');
    const own = project(top, [prefix]);
    for (const n of own?.names ?? (own?.name ? [own.name] : [])) names.add(n);
    if (!names.size) names.add(planName(git(top, ['show', `HEAD:${prefix}docs/plan.md`])) || 'main');
  } catch { names.add('main'); }
  return [...names].filter((n) => !n.startsWith('pm/')).sort();
}

// readHook(file): an existing hook as { state: 'missing' | 'ours' | 'foreign', text, why }. A
// symlink, a non-file, a file that cannot be read, and a file without a marker on line 2 are foreign.
function readHook(file) {
  let st;
  try { st = fs.lstatSync(file); } catch (e) { return e.code === 'ENOENT' ? { state: 'missing' } : { state: 'foreign', why: `cannot be read (${e.code})` }; }
  if (st.isSymbolicLink()) return { state: 'foreign', why: 'is a symlink' };
  if (!st.isFile()) return { state: 'foreign', why: 'is not a regular file' };
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { state: 'foreign', why: `cannot be read (${e.code})` }; }
  const second = text.split(/\r?\n/)[1] ?? '';
  return OURS.test(second) ? { state: 'ours', text, mode: st.mode, v1: second === V1 } : { state: 'foreign', why: "is not deliver's" };
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.deliver-${process.pid}`);
  fs.writeFileSync(tmp, text, { mode: 0o755 });
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, file);
}

const isInside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// layout(top): where the hooks go: { dir, common, privateDir, writable, why }. The hooks directory
// is writable only inside the git directory, with core.hooksPath (if set) from the repo's config.
function layout(top) {
  const dir = path.resolve(top, chomp(git(top, ['rev-parse', '--git-path', 'hooks']) || '.git/hooks'));
  const common = path.resolve(top, chomp(git(top, ['rev-parse', '--git-common-dir']) || '.git'));
  const out = { dir, common, privateDir: path.join(common, 'deliver'), writable: true, why: null };
  const configured = git(top, ['config', '--get', 'core.hooksPath']);
  if (configured !== null && git(top, ['config', '--local', '--get', 'core.hooksPath']) === null && git(top, ['config', '--worktree', '--get', 'core.hooksPath']) === null) {
    return { ...out, writable: false, why: `core.hooksPath (${oneLine(chomp(configured))}) comes from your global or system git config` };
  }
  if (!isInside(dir, common)) {
    return { ...out, writable: false, why: isInside(dir, top) ? `the hooks directory ${slash(dir)} is in the working tree` : `the hooks directory ${slash(dir)} is outside this repository` };
  }
  return out;
}

const addLine = (copy) => `sh ${shQuote(slash(copy))} "$@"`;

// hookFiles(top, { names, wanted, check, uninstall }): install, inspect, or remove the hook files.
// Returns { hooks: { name: state }, notes, sawV1 }.
function hookFiles(top, { wanted, check = false, uninstall = false }) {
  const res = { hooks: {}, notes: [], sawV1: false, layout: layout(top) };
  const { dir, privateDir, writable, why } = res.layout;
  for (const name of ALL_HOOKS) {
    const file = path.join(dir, name);
    const copy = path.join(privateDir, name);
    const want = wanted[name] ?? null;
    const cur = readHook(file);
    if (cur.v1) res.sawV1 = true;
    try {
      if (uninstall || want === null) {
        // Not wanted in this mode (or uninstalling): remove only what is ours.
        if (!check && cur.state === 'ours' && writable) { fs.rmSync(file); res.hooks[name] = 'removed'; }
        if (!check && fs.existsSync(copy)) fs.rmSync(copy);
        continue;
      }
      if (!check) writeAtomic(copy, want);
      if (!writable) {
        res.hooks[name] = 'skipped';
        res.notes.push(`merge gate: ${why}, so deliver did not write its ${name} hook there; add deliver's gate to your hook manager, as the first line of its ${name} hook: ${addLine(copy)}`);
        continue;
      }
      if (cur.state === 'foreign') {
        res.hooks[name] = 'foreign';
        res.notes.push(`merge gate: ${slash(file)} ${cur.why}, so it was left alone and deliver's git-level gate is not installed; add this as its first line: ${addLine(copy)} (and run /deliver:doctor after plugin updates)`);
        continue;
      }
      if (check) {
        res.hooks[name] = checkShim(file, cur, want);
        continue;
      }
      if (cur.state === 'ours' && cur.text === want) {
        fs.chmodSync(file, 0o755);
        res.hooks[name] = 'current';
      } else {
        writeAtomic(file, want);
        res.hooks[name] = cur.state === 'missing' ? 'installed' : 'refreshed';
      }
    } catch (e) {
      res.hooks[name] = 'error';
      res.notes.push(`merge gate: cannot write ${slash(file)} (${e.code || oneLine(e.message)})`);
    }
  }
  return res;
}

// checkShim(file, cur, want): a shim's readiness: missing, stale (differs from what install
// writes), not-executable, gate-missing, node-not-runnable, or current.
function checkShim(file, cur, want) {
  if (cur.state === 'missing') return 'missing';
  if (process.platform !== 'win32' && !(cur.mode & 0o111)) return 'not-executable';
  const gate = (cur.text.match(/^gate="(.*)"$/m) || [])[1]?.replace(/\\(.)/g, '$1');
  if (!gate || !fs.existsSync(gate)) return 'gate-missing';
  const node = (cur.text.match(/^node="(.*)"$/m) || [])[1]?.replace(/\\(.)/g, '$1');
  if (!node || !nodeRuns(node)) return 'node-not-runnable';
  return cur.text === want ? 'current' : 'stale';
}

// nodeRuns(node): the shim's node, or node on PATH as the shim falls back, starts.
export function nodeRuns(node) {
  const r = spawnSync('sh', ['-c', `n=${shQuote(node)}; [ -x "$n" ] || n=node; "$n" -e 0`], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
  if (r.error?.code === 'ENOENT') return spawnSync(node, ['-e', '0'], { windowsHide: true, timeout: 10000, stdio: 'ignore' }).status === 0;
  return r.status === 0;
}

// dropV1MergeOptions(top, branches): undo the v1 install's `branch.<b>.mergeoptions --no-ff`.
function dropV1MergeOptions(top, branches) {
  const dropped = [];
  for (const b of branches) {
    if (chomp(git(top, ['config', '--local', '--get', `branch.${b}.mergeoptions`]) || '') !== '--no-ff') continue;
    if (git(top, ['config', '--local', '--unset', `branch.${b}.mergeoptions`]) !== null) dropped.push(b);
  }
  return dropped;
}

// installGitHook(root, { gate, node, check, uninstall, version }): install (or inspect, or remove)
// the gate for the deliver project at root. Returns { project, ok, mode, git, branches, hooks,
// notes }. mode is reference-transaction, or fallback below git 2.28; ok is true when every hook
// the mode needs is in place (current, installed, or refreshed), or, uninstalling, when ours are gone.
export function installGitHook(root, { gate = GATE, node = process.execPath, check = false, uninstall = false, version } = {}) {
  const res = { project: false, ok: false, mode: null, git: null, branches: [], hooks: {}, notes: [] };
  const abs = path.resolve(root);
  if (!fs.existsSync(path.join(abs, 'docs', 'approval.json'))) return res;
  const top = chomp(git(abs, ['rev-parse', '--show-toplevel']) || '');
  if (!top) return res;
  res.project = true;
  const v = version ?? gitVersion(top);
  res.git = v ? v.join('.') : 'unknown';
  res.mode = atLeast(v, MIN_GIT) ? RT_HOOK : 'fallback';
  res.branches = integrationBranches(abs, top);
  const wanted = {};
  if (res.mode === RT_HOOK) wanted[RT_HOOK] = shim({ name: RT_HOOK, gate, node, branches: res.branches });
  else for (const name of FALLBACK_HOOKS) wanted[name] = shim({ name, gate, node, branches: res.branches });
  const files = hookFiles(top, { wanted, check, uninstall });
  res.hooks = files.hooks;
  res.notes.push(...files.notes);
  if (files.sawV1 && !check) {
    const dropped = dropV1MergeOptions(top, res.branches);
    if (dropped.length) res.notes.push(`merge gate: removed the branch.${dropped.join(', branch.')}.mergeoptions --no-ff an earlier deliver install set`);
  }
  if (uninstall) {
    res.ok = Object.values(res.hooks).every((s) => s === 'removed');
    return res;
  }
  if (res.mode === 'fallback') res.notes.push(`merge gate: git < 2.28 (this is ${res.git}): fast-forward updates are not gated; upgrade git`);
  const good = new Set(['installed', 'refreshed', 'current']);
  res.ok = Object.keys(wanted).every((n) => good.has(res.hooks[n]));
  return res;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const uninstall = args.includes('--uninstall');
  const root = args.find((a) => !a.startsWith('--')) || process.cwd();
  const r = installGitHook(root, { check, uninstall });
  if (!r.project) {
    fs.writeSync(2, `${path.resolve(root)} is not a deliver project (no docs/approval.json in a git checkout)\n`);
    process.exit(1);
  }
  const lines = [
    `git ${r.git}: ${r.mode === RT_HOOK ? 'reference-transaction gate (2.28 or newer)' : 'older than 2.28, pre-merge-commit fallback'}`,
    `integration branches: ${r.branches.join(', ')}`,
    ...Object.entries(r.hooks).map(([n, s]) => `hook ${n}: ${s}`),
    ...r.notes,
    `gate script: ${slash(GATE)}${fs.existsSync(GATE) ? '' : ' (MISSING)'}`,
    `node: ${slash(process.execPath)}${nodeRuns(process.execPath) ? '' : ' (NOT RUNNABLE)'}`,
  ];
  fs.writeSync(1, `${lines.join('\n')}\n`);
  process.exit(r.ok ? 0 : 1);
}
