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
// can call. The hooks directory is written only when its real path (symlinked directories
// resolved) sits inside the git directory and core.hooksPath, if set, comes from the repository's
// own config; a hooks directory in the working tree, from global or system config, or elsewhere is
// reported with the lines to add to the existing hook (addLine: they stop with status 1 only on a
// refusal, do nothing once the private copy is gone or mktemp fails, and for reference-transaction
// hand the same stdin records to the rest of the hook). A foreign hook that already calls the
// private copy is `chained`, in place; --uninstall then says to remove those lines. Notes come in
// full, and brief for session start, where each chaining command is replaced by the command
// that prints it, so no note is ever cut.
// An existing hook without the marker on line 2, a symlink, or a file that cannot be read is
// foreign: never overwritten, only reported. Writes go to a temporary file renamed into place.
// Idempotent: a current shim is left alone and a marked one that differs (a plugin update, a new
// integration branch) is refreshed. 0.29.0 before this sets no merge options; a shim from the
// earlier v1 install is replaced, and the `branch.<integration>.mergeoptions --no-ff` it set is
// removed; a deliver shim that cannot be removed (in a hooks directory deliver may not write) is
// reported. Where git cannot run `git merge-tree --write-tree` (older than 2.38), it reports that
// merges are not compared with the verified automatic merge.
//
// session-context.mjs calls installGitHook() at session start; /deliver:doctor runs the CLI:
//   node git-hook-install.mjs [--check | --uninstall] <project-root>
// --check reports without writing, and also checks that the shim is executable, that its gate
// script exists, that its node runs, and the git version. --uninstall removes only deliver's marked
// shims and sets the local `git config deliver.mergeGate off`, which session start honours; the
// CLI with no flag installs and clears it. --check with --uninstall is refused (exit 2; through the
// API, installGitHook does nothing and returns ok false). Exit 0
// when the gate is in place (or removed), 1 otherwise (disabled counts as not in place).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, chomp, isMain, oneLine } from './lib.mjs';
import { discover, projectAt, project, planName, mergeTreeWorks } from './require-verified.mjs';

export const MARKER = '# deliver-merge-gate v2';
const OURS = /^# deliver-merge-gate v\d+$/;
const V1 = '# deliver-merge-gate v1';
export const RT_HOOK = 'reference-transaction';
export const FALLBACK_HOOKS = ['pre-merge-commit', 'pre-commit'];
export const ALL_HOOKS = [RT_HOOK, ...FALLBACK_HOOKS];
export const MIN_GIT = [2, 28];
export const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'git-merge-gate.mjs');
const INSTALLER = fileURLToPath(import.meta.url);

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
// symlink, a non-file, a file that cannot be read, and a file without a marker on line 2 are
// foreign; a symlink's text is its target's, when that can be read.
function readHook(file) {
  let st;
  try { st = fs.lstatSync(file); } catch (e) { return e.code === 'ENOENT' ? { state: 'missing' } : { state: 'foreign', why: `cannot be read (${e.code})` }; }
  if (st.isSymbolicLink()) {
    // Never written through; its target is read, read-only, only to tell its interpreter (and
    // whether it already runs deliver's lines). An unreadable target leaves text unset.
    let target;
    try { target = fs.readFileSync(file, 'utf8'); } catch { target = undefined; }
    return { state: 'foreign', why: 'is a symlink', text: target };
  }
  if (!st.isFile()) return { state: 'foreign', why: 'is not a regular file' };
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { state: 'foreign', why: `cannot be read (${e.code})` }; }
  const second = text.split(/\r?\n/)[1] ?? '';
  return OURS.test(second) ? { state: 'ours', text, mode: st.mode, v1: second === V1 } : { state: 'foreign', why: "is not deliver's", text };
}

// writeAtomic(file, text): write through a temporary file renamed into place; the temporary file
// is removed when the write or the rename fails.
export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.deliver-${process.pid}`);
  try {
    fs.writeFileSync(tmp, text, { mode: 0o755 });
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw e;
  }
}

const isInside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// realPath(p): p with every existing directory component resolved through symlinks; the missing
// tail is kept as written.
function realPath(p) {
  const abs = path.resolve(p);
  let head = abs;
  const tail = [];
  while (!fs.existsSync(head)) {
    const up = path.dirname(head);
    if (up === head) return abs;
    tail.unshift(path.basename(head));
    head = up;
  }
  try { return path.join(fs.realpathSync.native?.(head) ?? fs.realpathSync(head), ...tail); } catch { return abs; }
}

// layout(top): where the hooks go: { dir, common, privateDir, writable, why }. The hooks directory
// is writable only when its real path (symlinked directories resolved) is inside the git
// directory, with core.hooksPath (if set) from the repo's config.
function layout(top) {
  const dir = path.resolve(top, chomp(git(top, ['rev-parse', '--git-path', 'hooks']) || '.git/hooks'));
  const common = path.resolve(top, chomp(git(top, ['rev-parse', '--git-common-dir']) || '.git'));
  const out = { dir, common, privateDir: path.join(common, 'deliver'), writable: true, why: null };
  const configured = git(top, ['config', '--get', 'core.hooksPath']);
  if (configured !== null && git(top, ['config', '--local', '--get', 'core.hooksPath']) === null && git(top, ['config', '--worktree', '--get', 'core.hooksPath']) === null) {
    return { ...out, writable: false, why: `core.hooksPath (${oneLine(chomp(configured))}) comes from your global or system git config` };
  }
  const real = realPath(dir);
  const realCommon = realPath(common);
  if (!isInside(real, realCommon)) {
    const shown = real === dir ? slash(dir) : `${slash(dir)} (really ${slash(real)})`;
    return { ...out, writable: false, why: isInside(real, realPath(top)) ? `the hooks directory ${shown} is in the working tree` : `the hooks directory ${shown} is outside this repository's git directory` };
  }
  return out;
}

// gateLines(name, copy): the sh statements that run deliver's gate from another hook, one template
// for addLine and wrapper. They stop with status 1 only when the gate refuses, and fail open: with
// the private copy gone (after --uninstall, or a git upgrade that drops a fallback hook), or
// without mktemp, they do nothing. The reference-transaction form saves stdin once, feeds it to
// the gate, and then gives the same records to whatever runs next.
function gateLines(name, copy) {
  const c = shQuote(slash(copy));
  return name === RT_HOOK
    ? [
      `if [ -f ${c} ] && deliver_in=$(mktemp 2>/dev/null); then`,
      '  cat > "$deliver_in";',
      `  sh ${c} "$@" < "$deliver_in"; [ $? = 1 ] && { rm -f "$deliver_in"; exit 1; };`,
      '  exec < "$deliver_in"; rm -f "$deliver_in";',
      'fi',
    ]
    : [`if [ -f ${c} ]; then sh ${c} "$@"; [ $? = 1 ] && exit 1; fi`];
}

// addLine(name, copy): gateLines as one line, to put right after the #! line of an existing
// sh-compatible `name` hook.
export const addLine = (name, copy) => gateLines(name, copy).map((l) => l.trim()).join(' ');

// shCompatible(text): an existing hook's interpreter runs POSIX sh lines: a #! naming sh, bash,
// dash, zsh, ksh, ash, mksh, yash, or posh, directly or through env or busybox, or no #! at all.
const SH_LIKE = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'ash', 'mksh', 'yash', 'posh']);
export function shCompatible(text) {
  const first = String(text ?? '').split(/\r?\n/)[0];
  if (!first.startsWith('#!')) return true;
  const words = first.slice(2).trim().split(/\s+/).filter(Boolean);
  const base = (w) => (w ?? '').split('/').at(-1);
  const prog = ['env', 'busybox'].includes(base(words[0])) ? base(words.find((w, i) => i > 0 && !w.startsWith('-'))) : base(words[0]);
  return SH_LIKE.has(prog);
}

// wrapper(name, copy): an sh script to stand in for a `name` hook whose interpreter is not sh
// (python, node, ...), renamed to `<name>.local`: it runs gateLines, then execs `<name>.local` with
// the same arguments and, for reference-transaction, the same stdin. A missing or non-executable
// `<name>.local` is reported and skipped (exit 0), so the wrapper never wedges ref updates.
export function wrapper(name, copy) {
  return [
    '#!/bin/sh',
    `# deliver's merge gate, then the original hook, ${name}.local.`,
    ...gateLines(name, copy),
    `deliver_local="$(dirname "$0")/${name}.local"`,
    '[ -x "$deliver_local" ] || { echo "deliver: $deliver_local missing; restore it or remove this wrapper" >&2; exit 0; }',
    'exec "$deliver_local" "$@"',
    '',
  ].join('\n');
}

// hookFiles(top, { wanted, check, uninstall, doctor }): install, inspect, or remove the hook
// files. Returns { hooks: { name: state }, notes, brief, sawV1 }: notes in full, and brief, the
// same with each chaining command replaced by `doctor`, the command that prints it, for session
// start. A deliver shim that is not wanted (an earlier install's, or every one when uninstalling)
// is removed; where it cannot be (check mode, a hooks directory deliver may not write, a failed
// removal) it is reported: `obsolete` in check mode, else `not-removed` or `error`. A foreign hook
// that already calls the private copy, from an sh-compatible interpreter, is `chained`, which counts
// as in place once it is executable (else `chained-inactive`) and, in check mode, once the copy it
// calls is current (else `copy-missing`, `copy-stale`, or the copy's checkShim state);
// uninstalling says to remove those lines, which then do nothing. A hook whose interpreter is not
// sh gets the wrapper to install instead of inline lines.
function hookFiles(top, { wanted, check = false, uninstall = false, doctor = '/deliver:doctor' }) {
  const res = { hooks: {}, notes: [], brief: [], sawV1: false, layout: layout(top) };
  const { dir, privateDir, writable, why } = res.layout;
  const note = (full, brief = full) => { res.notes.push(full); res.brief.push(brief); };
  // A foreign hook whose interpreter is not sh, or cannot be read (a dangling or unreadable
  // symlink target), gets the wrapper, which is always safe; a missing hook gets the lines.
  const chain = (name, copy, cur) => (cur.state === 'foreign' && (cur.text === undefined || !shCompatible(cur.text))
    ? `its interpreter is not sh, so deliver's lines cannot go inside it; rename it to ${name}.local in the same directory, and write this sh wrapper as ${name}, executable:\n${wrapper(name, copy)}`
    : `add these as the lines right after its #! line: ${addLine(name, copy)}`);
  const pointer = `for what to add to it, run ${doctor}`;
  for (const name of ALL_HOOKS) {
    const file = path.join(dir, name);
    const copy = path.join(privateDir, name);
    const want = uninstall ? null : wanted[name] ?? null;
    const cur = readHook(file);
    if (cur.v1) res.sawV1 = true;
    const whose = cur.v1 ? "an earlier deliver install's" : "deliver's";
    const chained = cur.state === 'foreign' && typeof cur.text === 'string' && cur.text.includes(slash(copy)) && shCompatible(cur.text);
    try {
      if (want === null) {
        // Not wanted in this mode (or uninstalling): remove only what is ours.
        if (cur.state === 'ours') {
          if (check) {
            res.hooks[name] = 'obsolete';
            note(`merge gate: ${slash(file)} is ${whose} ${name} shim, which this mode does not use; ${writable ? 'installing removes it' : 'delete it'}`);
          } else if (!writable) {
            res.hooks[name] = 'not-removed';
            note(`merge gate: ${slash(file)} is ${whose} ${name} shim, and ${why}, so deliver did not remove it; delete it`);
          } else {
            fs.rmSync(file);
            res.hooks[name] = 'removed';
          }
        }
        if (chained && !check) note(`merge gate: ${slash(file)} still calls deliver's gate; those lines now do nothing, so remove the deliver lines you added to it (or, for deliver's wrapper, move ${name}.local back)`);
        if (!check && fs.existsSync(copy)) fs.rmSync(copy);
        continue;
      }
      if (!check) writeAtomic(copy, want);
      // A hook that already runs deliver's lines is in place wherever it lives, a hooks directory
      // deliver may not write (husky's .husky, a global core.hooksPath) included; check mode also
      // needs the private copy it calls to be current.
      if (chained) {
        const executable = process.platform === 'win32' || Boolean(fs.statSync(file).mode & 0o111);
        res.hooks[name] = !executable ? 'chained-inactive' : check ? copyState(copy, want) : 'chained';
        if (res.hooks[name] === 'chained-inactive') note(`merge gate: ${slash(file)} runs deliver's lines but is not executable, so git skips it; run chmod +x ${shQuote(slash(file))}`);
        else if (res.hooks[name] !== 'chained') note(`merge gate: ${slash(file)} runs deliver's lines, but its copy ${slash(copy)} is ${res.hooks[name]}; run the installer without --check to refresh it`);
        continue;
      }
      if (!writable) {
        res.hooks[name] = 'skipped';
        note(`merge gate: ${why}, so deliver did not write its ${name} hook there; add deliver's gate to your hook manager's ${name} hook: ${chain(name, copy, cur)}`,
          `merge gate: ${why}, so deliver did not write its ${name} hook there; add deliver's gate to your hook manager's ${name} hook (${pointer})`);
        if (cur.state === 'ours' && cur.text !== want) note(`merge gate: ${slash(file)} is ${whose} ${name} shim and out of date; delete it, or replace it with deliver's lines`);
        continue;
      }
      if (cur.state === 'foreign') {
        res.hooks[name] = 'foreign';
        note(`merge gate: ${slash(file)} ${cur.why}, so it was left alone and deliver's git-level gate is not installed (run /deliver:doctor after plugin updates); ${chain(name, copy, cur)}`,
          `merge gate: ${slash(file)} ${cur.why}, so it was left alone and deliver's git-level gate is not installed; ${pointer}`);
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
      note(`merge gate: cannot ${want === null ? 'remove' : 'write'} ${slash(file)} (${e.code || oneLine(e.message)})`);
    }
  }
  return res;
}

// copyState(copy, want): `chained` when the private copy a chained hook calls exists and is what
// install writes, else `copy-missing` or `copy-stale`.
function copyState(copy, want) {
  let text;
  try { text = fs.readFileSync(copy, 'utf8'); } catch { return 'copy-missing'; }
  if (text !== want) return 'copy-stale';
  // The copy runs as `sh <copy>`, so its own exec bit does not matter; its gate and node do.
  const state = checkShim(copy, { state: 'ours', text, mode: 0o755 }, want);
  return state === 'current' ? 'chained' : `copy-${state}`;
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

export const OPT_OUT = 'deliver.mergeGate';
const optedOut = (top) => chomp(git(top, ['config', '--local', '--get', OPT_OUT]) || '').toLowerCase() === 'off';
export const TREE_NOTE = 'merge gate: merged-tree check needs git 2.38; merges are not compared with the verified automatic merge';

// installGitHook(root, { gate, node, check, uninstall, explicit, version, treeCheck }): install (or
// inspect, or remove) the gate for the deliver project at root. Returns { project, ok, mode, git,
// branches, hooks, notes, disabled }. mode is reference-transaction, or fallback below git 2.28; ok
// is true when every hook the mode needs is in place (current, installed, or refreshed), or,
// uninstalling, when every deliver shim found is gone. --uninstall also sets the local
// `deliver.mergeGate off`, which session start (no `explicit`) honours by installing nothing and
// check reports as disabled; an explicit install (the CLI with no flag) clears it. treeCheck,
// optional, overrides the probe of `git merge-tree --write-tree`.
export function installGitHook(root, { gate = GATE, node = process.execPath, check = false, uninstall = false, explicit = false, version, treeCheck } = {}) {
  const res = { project: false, ok: false, mode: null, git: null, branches: [], hooks: {}, notes: [], brief: [], disabled: false };
  const abs = path.resolve(root);
  if (check && uninstall) {
    res.notes.push('merge gate: --check and --uninstall cannot be combined; nothing was done');
    res.brief = [...res.notes];
    return res;
  }
  if (!fs.existsSync(path.join(abs, 'docs', 'approval.json'))) return res;
  const top = chomp(git(abs, ['rev-parse', '--show-toplevel']) || '');
  if (!top) return res;
  res.project = true;
  const v = version ?? gitVersion(top);
  res.git = v ? v.join('.') : 'unknown';
  res.mode = atLeast(v, MIN_GIT) ? RT_HOOK : 'fallback';
  res.branches = integrationBranches(abs, top);
  if (!uninstall && !check && explicit && optedOut(top)) git(top, ['config', '--local', '--unset', OPT_OUT]);
  if (!uninstall && optedOut(top)) {
    res.disabled = true;
    res.brief.push(`merge gate: disabled in this repository (git config ${OPT_OUT} off, set by git-hook-install.mjs --uninstall); run node ${shQuote(slash(INSTALLER))} ${shQuote(slash(abs))} to install it again`);
    res.notes.push(`merge gate: disabled in this repository (git config ${OPT_OUT} off, set by git-hook-install.mjs --uninstall); run node <plugin>/hooks/git-hook-install.mjs <project> to install it again`);
    if (!check) return res;
  }
  const wanted = {};
  if (res.mode === RT_HOOK) wanted[RT_HOOK] = shim({ name: RT_HOOK, gate, node, branches: res.branches });
  else for (const name of FALLBACK_HOOKS) wanted[name] = shim({ name, gate, node, branches: res.branches });
  const doctor = `/deliver:doctor, or node ${shQuote(slash(INSTALLER))} --check ${shQuote(slash(abs))}`;
  const files = hookFiles(top, { wanted, check, uninstall, doctor });
  res.hooks = files.hooks;
  res.notes.push(...files.notes);
  res.brief.push(...files.brief);
  const add = (n) => { res.notes.push(n); res.brief.push(n); };
  if (files.sawV1 && !check) {
    const dropped = dropV1MergeOptions(top, res.branches);
    if (dropped.length) add(`merge gate: removed the branch.${dropped.join(', branch.')}.mergeoptions --no-ff an earlier deliver install set`);
  }
  if (uninstall) {
    res.ok = Object.values(res.hooks).every((s) => s === 'removed');
    if (git(top, ['config', '--local', OPT_OUT, 'off']) === null) {
      res.ok = false;
      add(`merge gate: cannot set git config ${OPT_OUT} off, so session start will install the gate again`);
    }
    return res;
  }
  if (res.mode === 'fallback') add(`merge gate: git < 2.28 (this is ${res.git}): fast-forward updates, squash merges, and cherry-picks are not gated (they make no merge commit), and a merge commit's result is compared with the automatic merge only where git needs no content merge, else only the verdicts are checked; upgrade git`);
  else if (!(treeCheck ?? mergeTreeWorks(top))) add(TREE_NOTE);
  const good = new Set(['installed', 'refreshed', 'current', 'chained']);
  res.ok = !res.disabled && Object.keys(wanted).every((n) => good.has(res.hooks[n]));
  return res;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const uninstall = args.includes('--uninstall');
  if (check && uninstall) {
    fs.writeSync(2, 'git-hook-install.mjs: --check and --uninstall cannot be combined; run one of them\n');
    process.exit(2);
  }
  const root = args.find((a) => !a.startsWith('--')) || process.cwd();
  const r = installGitHook(root, { check, uninstall, explicit: !check && !uninstall });
  if (!r.project) {
    fs.writeSync(2, `${path.resolve(root)} is not a deliver project (no docs/approval.json in a git checkout)\n`);
    process.exit(1);
  }
  const lines = [
    `git ${r.git}: ${r.mode === RT_HOOK ? 'reference-transaction gate (2.28 or newer)' : 'older than 2.28, pre-merge-commit fallback'}`,
    `integration branches: ${r.branches.join(', ')}`,
    ...(r.disabled ? ['merge gate: disabled'] : []),
    ...Object.entries(r.hooks).map(([n, s]) => `hook ${n}: ${s}`),
    ...r.notes,
    `gate script: ${slash(GATE)}${fs.existsSync(GATE) ? '' : ' (MISSING)'}`,
    `node: ${slash(process.execPath)}${nodeRuns(process.execPath) ? '' : ' (NOT RUNNABLE)'}`,
  ];
  fs.writeSync(1, `${lines.join('\n')}\n`);
  process.exit(r.ok ? 0 : 1);
}
