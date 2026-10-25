#!/usr/bin/env node
// deliver PreToolUse hook on Bash: a story branch merges only with a verifier PASS for its code.
//
// Threat model. The gate catches a PM's honest mistakes: forgetting to verify, a stale verdict,
// chaining commands carelessly, a mis-stated tier. It is not a boundary against a deliberately
// evasive agent with Bash; that protection is the 0.30 sandbox. So it reads every form a PM could
// plausibly write, stays fail-closed once a story merge is certain, and never blocks the
// documented merge, but it does not parse exotic evasion.
//
// It reads the command's `git merge` and `git pull` calls, through `cd` chains, subshells,
// control words (if, then, do, !, {), wrappers (env, nice, command, exec, sudo, time, nohup),
// `-C` forms, and any path to the git binary. Option values, command substitutions, and heredoc
// bodies are opaque, so the documented `-m "$(cat <<'EOF' ... EOF)"` message is never read as
// operands; a backslash-newline joins lines. A merge into a `pm/*` branch is not a ship and is
// ignored; the target is the branch a `checkout` or `switch` earlier in the command selects, else
// HEAD's, and unknown (so gated) when that checkout names a computed or unresolvable branch. An
// operand is a story branch when it names `pm/*` locally or on a remote, or resolves to the tip
// of, or a commit inside, a `pm/*` branch that neither the integration branch nor its configured
// upstream already holds. Merging a named story the integration branch holds into that branch is
// a no-op and allowed, unless an earlier git command in the call can move refs. In a deliver
// project the hook blocks a computed operand (`$VAR`, `$(...)`, backticks, `-`, `@{-N}`), a story
// merge after another ref-changing git command in the same call (only a plain checkout or switch
// may precede it), `git pull` of a story branch, a commit short of a story tip, and a tag that
// shadows a `pm/*` name.
//
// Nothing the verdict rests on is read from the working tree, which the story checkout controls.
// Candidate trusted branches are main, master, the origin/HEAD target, init.defaultBranch, and any
// local non-`pm/*` branch whose committed docs/plan.md names itself as the integration branch. A
// directory is a deliver project when one of them holds docs/approval.json there; every docs/ path
// below then carries that directory's prefix. The project that owns a merge is the one the merge's
// own directory (after cd, -C, and git -C) sits in, the deepest first, else a deliver project at
// the top level. When neither resolves and nothing can be a story (no operand, or no `pm/*` tip,
// no named story operand, and no earlier ref-writing call), the merge is allowed unread. Otherwise the hook looks for deliver
// projects anywhere in the repository, from NUL-delimited listings: a docs/approval.json at any
// depth on a trusted base ref, on a local non-`pm/*` branch whose committed plan there names it,
// or in the working tree. When a listing fails and an operand could be a story, the merge blocks.
// When every listing was read: with no project found, the merge is allowed; a known target that
// is neither a base branch nor any found project's integration branch is not a ship, and is
// allowed; else the merge blocks when an earlier git call in the command can move refs and an
// operand is not a trusted base branch by name, or is one but an earlier call may write refs
// (anything but a plain checkout or switch, status, log, diff, show, rev-parse, or a fetch with
// no `<src>:<dst>` refspec) (SEPARATE); and when an operand could be a story, naming the projects
// found: run it from the project directory or with git -C <project>.
// An operand could be a story when it is computed, `-`, `@{-N}`, or FETCH_HEAD, spells a `pm/*`
// name, or resolves to the tip of, or a commit inside, a `pm/*` branch here or on any remote that
// no trusted base ref (main, master, the origin/HEAD target, init.defaultBranch, and their trusted
// upstreams) already holds. That exemption is a deliberate trade-off under the honest-mistake
// threat model: a story tip a trusted base branch holds has already shipped there, and refusing
// it would block `git merge main` at a monorepo root right after `git branch pm/<id> main`. Inside the
// owning project, its plans' `Integration branch:` lines must agree, and the branch named may
// not be `pm/*` or already contain the story tip. The claim is the
// story on that branch, at docs/stories/<branch minus pm/>.md or found by its Execution block's
// `branch`. A claim with neither `deliver` nor `tier` predates these fields and passes, unless
// another story on that branch records `deliver` 0.29.0 or later; otherwise `deliver`, when
// present, must parse, `tier` must be T0, T1, or T2, and `tier`, `deliver`, `branch`,
// `protected`, `protected_base`, and pm-meta `integrity_allow` must be the same at the branch tip
// (an absent `protected` equals [], an absent `protected_base` equals ""). A T1 or T2 claim needs
// non-empty `protected` and a `protected_base`. From the tip only `verifier` and `integrity` are
// read. The merge is allowed only when:
//   - `verifier` is "PASS <sha>", <sha> 7 or more hex digits naming the tip or an ancestor of it;
//   - each commit after <sha> that the integration branch lacks changes only the story file and
//     handoff notes (docs/handoff/*.md), or
//     is a two-parent merge whose tree equals `git merge-tree --write-tree` of its parents (git
//     2.38 or newer) with conflicts and differences confined to the story file;
//   - at tier T1 or T2, `integrity` is "pass <sha>" under the same rule.
//
// FAIL-OPEN only where the hook cannot tell what is being run: the kill switch, unparseable hook
// input, a command with no merge of a story branch, or a repository holding no deliver project. A
// story-like merge in a directory the hook cannot determine, or outside any git repository, blocks
// only when the session's own project (CLAUDE_PROJECT_DIR, else the cwd) is a deliver project.
// Known limits: that session check looks at the session directory and the directories above it,
// never below, so a session opened at a monorepo root whose deliver projects all sit in
// subdirectories fails open on a computed cd; run the merge without one. And a project whose
// integration branch exists only on a remote, with no local copy and absent from the working
// tree, is not found from outside it. And a listing that times out in a very large repository
// blocks a story-like merge outside every project even when the repository holds no deliver
// project: fail closed by design. Blocks exit 2 with the reason on stderr.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, parseExec, git, chomp, deliverVersion, versionAtLeast } = lib;

const UNKNOWN = Symbol('unknown');

// ---- the shell command ----

// heredocAt(cmd, i): the heredoc operator starting at i as { delim, strip, end }, or null.
function heredocAt(cmd, i) {
  const m = cmd.slice(i).match(/^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|([A-Za-z0-9_.-]+))/);
  return m ? { delim: m[2] ?? m[3] ?? m[4], strip: m[1] === '-', end: i + m[0].length } : null;
}

// skipBodies(cmd, nl, pending): past the heredoc bodies that start after the newline at nl;
// returns the index of the newline ending the last delimiter line, or the end of the command.
function skipBodies(cmd, nl, pending) {
  let pos = nl;
  for (const h of pending) {
    for (;;) {
      if (pos >= cmd.length) return cmd.length;
      const next = cmd.indexOf('\n', pos + 1);
      const line = cmd.slice(pos + 1, next < 0 ? cmd.length : next);
      pos = next < 0 ? cmd.length : next;
      if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
    }
  }
  return pos;
}

function skipBacktick(cmd, i) {
  let k = i + 1;
  while (k < cmd.length && cmd[k] !== '`') k += cmd[k] === '\\' ? 2 : 1;
  return Math.min(k, cmd.length);
}

function skipDouble(cmd, i) {
  let k = i + 1;
  while (k < cmd.length && cmd[k] !== '"') {
    if (cmd[k] === '\\') k += 2;
    else if (cmd[k] === '$' && cmd[k + 1] === '(') k = skipSubst(cmd, k + 1) + 1;
    else if (cmd[k] === '`') k = skipBacktick(cmd, k) + 1;
    else k++;
  }
  return Math.min(k, cmd.length);
}

// skipSubst(cmd, i): i is the `(` of `$(`; the index of its matching `)`. Quotes, nested
// substitutions, and heredoc bodies inside are skipped whole.
function skipSubst(cmd, i) {
  let depth = 1;
  let pending = [];
  for (let j = i + 1; j < cmd.length; j++) {
    const c = cmd[j];
    if (c === '\\') j++;
    else if (c === "'") { const e = cmd.indexOf("'", j + 1); j = e < 0 ? cmd.length : e; } else if (c === '"') j = skipDouble(cmd, j);
    else if (c === '`') j = skipBacktick(cmd, j);
    else if (c === '<' && cmd[j + 1] === '<' && cmd[j + 2] !== '<') {
      const h = heredocAt(cmd, j);
      if (h) { pending.push(h); j = h.end - 1; }
    } else if (c === '\n' && pending.length) { j = skipBodies(cmd, j, pending); pending = []; } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j;
  }
  return cmd.length;
}

// tokenize(cmd): word segments and the subshell brackets between them. Segments split on
// unquoted ; & | ( ) and newlines; `(` and `)` also come back as { op }. A word carries `dynamic`
// when the shell computes part of it: `$`, `$(...)`, or backticks outside single quotes. A
// substitution and any heredoc body are swallowed whole into their word or skipped.
function tokenize(cmd) {
  const items = [];
  let seg = [];
  let word = null;
  let pending = [];
  const add = (s, dyn = false) => { word = word ?? { text: '', dynamic: false }; word.text += s; word.dynamic ||= dyn; };
  const push = () => { if (word !== null) { seg.push(word); word = null; } };
  const end = () => { push(); if (seg.length) items.push(seg); seg = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") {
      const close = cmd.indexOf("'", i + 1);
      add(cmd.slice(i + 1, close < 0 ? cmd.length : close));
      i = close < 0 ? cmd.length : close;
    } else if (c === '"') {
      const close = skipDouble(cmd, i);
      const body = cmd.slice(i + 1, close);
      add(body.replace(/\\(["\\$`])/g, '$1'), /(^|[^\\])[$`]/.test(body));
      i = close;
    } else if (c === '\\' && cmd[i + 1] === '\n') {
      // A line continuation joins the lines; it is not a character of any word.
      i++;
    } else if (c === '\\' && i + 1 < cmd.length) {
      add(cmd[++i]);
    } else if (c === '$' && cmd[i + 1] === '(') {
      const close = skipSubst(cmd, i + 1);
      add(cmd.slice(i, close + 1), true);
      i = close;
    } else if (c === '`') {
      const close = skipBacktick(cmd, i);
      add(cmd.slice(i, close + 1), true);
      i = close;
    } else if (c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<' && heredocAt(cmd, i)) {
      const h = heredocAt(cmd, i);
      push();
      pending.push(h);
      i = h.end - 1;
    } else if (/[;&|()\n]/.test(c)) {
      end();
      if (c === '(' || c === ')') items.push({ op: c });
      if (c === '\n' && pending.length) { i = skipBodies(cmd, i, pending); pending = []; }
    } else if (/\s/.test(c)) {
      push();
    } else {
      add(c, c === '$');
    }
  }
  end();
  return items;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const CONTROL = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{']);
// Wrappers that run the next word as the command, with the options that take a value.
const WRAPPERS = {
  command: [], exec: ['-a'], nohup: [], time: ['-f', '-o'],
  env: ['-u', '--unset', '-C', '--chdir', '-S', '--split-string'],
  nice: ['-n', '--adjustment'],
  sudo: ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U'],
};
const GIT_OPTS_WITH_VALUE = new Set(['-c', '--namespace', '--exec-path', '--config-env', '--super-prefix', '--attr-source']);
const GIT_REPO_OPTS = new Set(['--git-dir', '--work-tree']);
const MERGE_OPTS_WITH_VALUE = new Set(['-m', '--message', '-F', '--file', '-s', '-X', '--strategy', '--strategy-option', '--into-name']);
const PULL_OPTS_WITH_VALUE = new Set(['-s', '-X', '--strategy', '--strategy-option', '--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs', '--upload-pack', '-o', '--server-option', '--negotiation-tip']);
const MERGE_CONTROL = new Set(['--abort', '--continue', '--quit', '--skip']);

const isGit = (w) => /^git(\.exe)?$/i.test(w.split(/[\\/]/).at(-1));
const expandHome = (t) => (t === '~' || t.startsWith('~/') ? path.join(os.homedir(), t.slice(1)) : t);
// MSYS and Git Bash spell C:\x as /c/x.
const msys = (t) => (process.platform === 'win32' ? t.replace(/^\/([A-Za-z])(\/|$)/, (_, d) => `${d.toUpperCase()}:\\`) : t);
const into = (dir, target) => {
  if (target.dynamic) return UNKNOWN;
  const t = msys(expandHome(target.text));
  if (path.isAbsolute(t)) return path.resolve(t);
  return dir === UNKNOWN ? UNKNOWN : path.resolve(dir, t);
};

// commandStart(seg): the index of the word the shell runs, past control words, assignments,
// and wrappers with their options.
function commandStart(seg) {
  let i = 0;
  for (;;) {
    const w = seg[i]?.text;
    if (w === undefined) return i;
    if (CONTROL.has(w) || ASSIGNMENT.test(w)) { i++; continue; }
    if (!Object.hasOwn(WRAPPERS, w)) return i;
    const withValue = WRAPPERS[w];
    for (i++; i < seg.length && seg[i].text.startsWith('-'); i++) {
      if (seg[i].text === '--') { i++; break; }
      if (withValue.includes(seg[i].text)) i++;
    }
  }
}

// gitCalls(cmd, cwd): every git invocation in order, as { dir, sub, args, ops }. dir is where
// git runs after any preceding cd and its -C options, or UNKNOWN; ops are the operands that
// merge, for `merge` and `pull` only.
function gitCalls(cmd, cwd) {
  const out = [];
  const stack = [];
  let cur = cwd;
  for (const item of tokenize(cmd)) {
    if (item.op === '(') { stack.push(cur); continue; }
    if (item.op === ')') {
      // A cd inside a subshell or substitution is not tracked past its close.
      if (stack.length && stack.pop() !== cur) cur = UNKNOWN;
      continue;
    }
    const seg = item;
    let i = commandStart(seg);
    const head = seg[i]?.text;
    if (head === 'cd' || head === 'pushd') {
      const args = seg.slice(i + 1).filter((w) => !/^-[PLe@]$/.test(w.text) && w.text !== '--');
      if (!args.length) cur = os.homedir();
      else if (args[0].text === '-') cur = UNKNOWN;
      else cur = into(cur, args[0]);
      continue;
    }
    if (head === 'popd') { cur = UNKNOWN; continue; }
    if (!head || !isGit(head)) continue;
    let dir = cur;
    for (i++; i < seg.length && seg[i].text.startsWith('-'); i++) {
      const w = seg[i].text;
      if (w === '-C') { const v = seg[++i]; dir = v ? into(dir, v) : UNKNOWN; } else if (w.startsWith('-C')) dir = into(dir, { text: w.slice(2), dynamic: seg[i].dynamic });
      else if (GIT_REPO_OPTS.has(w)) { dir = UNKNOWN; i++; } else if ([...GIT_REPO_OPTS].some((o) => w.startsWith(`${o}=`))) dir = UNKNOWN;
      else if (GIT_OPTS_WITH_VALUE.has(w)) i++;
    }
    const sub = seg[i]?.text ?? '';
    const args = seg.slice(i + 1);
    out.push({ dir, sub, args, ops: sub === 'merge' || sub === 'pull' ? operands(sub, args) : null });
  }
  return out;
}

// operands(sub, args): the words that merge, or null for a merge --abort and its kin.
function operands(sub, args) {
  const withValue = sub === 'merge' ? MERGE_OPTS_WITH_VALUE : PULL_OPTS_WITH_VALUE;
  const positional = [];
  let options = true;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (options && w.text === '--') options = false;
    else if (options && MERGE_CONTROL.has(w.text)) return [];
    else if (options && withValue.has(w.text)) i++;
    // `-` and `@{-N}` name the previously checked-out branch, which the shell state decides.
    else if (w.text === '-' || /@\{-\d+\}/.test(w.text)) positional.push({ ...w, dynamic: true });
    else if (!options || !w.text.startsWith('-')) positional.push(w);
  }
  // A pull's first operand is the remote; each further one is a refspec whose source merges.
  return sub === 'pull' ? positional.slice(1).map((w) => ({ ...w, text: w.text.replace(/^\+/, '').split(':')[0] })) : positional;
}

// checkoutOf(args): what a checkout or switch selects, as { create, name, detach, prev, paths,
// force, dynamic }; dynamic when the shell computes the branch it selects: the new branch's name
// when it creates one, else the branch it names. A computed start point leaves the target known.
function checkoutOf(sub, args) {
  const out = { create: null, name: null, detach: false, prev: false, paths: false, force: false, dynamic: false };
  let createDynamic = false;
  let nameDynamic = false;
  for (let i = 0; i < args.length; i++) {
    const w = args[i].text;
    if (w === '--') { out.paths = true; break; }
    if (['-b', '-c', '-B', '-C', '--orphan'].includes(w)) {
      out.create = args[i + 1]?.text ?? null;
      createDynamic = Boolean(args[i + 1]?.dynamic);
      if (w !== '-b' && w !== '-c') out.force = true;
      i++;
    } else if (w === '--detach' || (sub === 'switch' && w === '-d')) out.detach = true;
    else if (w === '-') out.prev = true;
    else if (!w.startsWith('-') && out.name === null) { out.name = w; nameDynamic = args[i].dynamic; }
  }
  out.dynamic = out.create !== null ? createDynamic : nameDynamic;
  return out;
}

// ---- the repository ----

const looksPm = (op) => /(^|\/)pm\//.test(op);
const oneLine = (s) => String(s).replace(/[\x00-\x1f\x7f]+/g, ' ');
const sanitize = (s) => oneLine(s).slice(0, 80);
const resolve = (root, rev) => chomp(git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]) || '');
const contains = (root, ancestor, of) => git(root, ['merge-base', '--is-ancestor', ancestor, of]) !== null;

function refFor(root, name) {
  for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) if (resolve(root, ref)) return ref;
  return null;
}

const planName = (text) => (String(text ?? '').match(/^\s*-\s*Integration branch:\s*`?<?([A-Za-z0-9._/-]+)>?`?/m) || [])[1] || null;

// project(root, prefixes): the deliver project at the deepest of `prefixes` (each "" or a
// "dir/" path below the top level) that a trusted branch marks; null when none does. Else the
// integration branch as { name, ref, prefix }, ref null when it resolves nowhere, or
// { error, prefix } when the plans disagree.
function project(root, prefixes = ['']) {
  for (const prefix of prefixes) {
    const found = projectAt(root, prefix);
    if (found) return { ...found, prefix };
  }
  return null;
}

// baseBranches(root): the branch names every project may trust without its plan's say-so: main,
// master, origin/HEAD's target, and init.defaultBranch.
function baseBranches(root) {
  const originHead = chomp(git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']) || '');
  return ['main', 'master', originHead.startsWith('refs/remotes/origin/') ? originHead.slice('refs/remotes/origin/'.length) : '', chomp(git(root, ['config', '--get', 'init.defaultBranch']) || '')]
    .filter((n) => n && !n.startsWith('pm/'));
}

const localBranches = (root) => (git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']) || '').split(/\r?\n/).filter(Boolean);

function projectAt(root, prefix) {
  const cands = [];
  const add = (name) => {
    if (!name || name.startsWith('pm/')) return;
    const ref = refFor(root, name);
    if (ref && !cands.some((c) => c.ref === ref)) cands.push({ name, ref });
  };
  for (const name of baseBranches(root)) add(name);
  for (const name of localBranches(root)) {
    if (name.startsWith('pm/') || cands.some((c) => c.name === name)) continue;
    if (planName(git(root, ['show', `refs/heads/${name}:${prefix}docs/plan.md`])) === name) add(name);
  }
  for (const c of cands) {
    c.approved = git(root, ['cat-file', '-e', `${c.ref}:${prefix}docs/approval.json`]) !== null;
    c.plan = c.approved ? planName(git(root, ['show', `${c.ref}:${prefix}docs/plan.md`])) : null;
  }
  const approved = cands.filter((c) => c.approved);
  if (!approved.length) return null;
  const names = [...new Set(approved.map((c) => c.plan).filter(Boolean))];
  if (names.length > 1) return { error: `the committed plans on ${approved.filter((c) => c.plan).map((c) => c.name).join(', ')} disagree on the integration branch (${names.join(', ')}); make ${prefix}docs/plan.md agree` };
  const name = names[0] ?? approved[0].name;
  return { name, ref: refFor(root, name) };
}

function currentBranch(root) {
  return chomp(git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || '') || null;
}

function pmTips(root) {
  const refs = git(root, ['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads/pm/', 'refs/remotes/']) || '';
  const out = [];
  for (const line of refs.split(/\r?\n/)) {
    const [oid, ref] = line.split(' ');
    const m = ref && (ref.match(/^refs\/heads\/(pm\/.+)$/) || ref.match(/^refs\/remotes\/[^/]+\/(pm\/.+)$/));
    if (m) out.push({ name: m[1], tip: oid });
  }
  return out;
}

// integrationRefs(root, integ): the trusted copies of the integration branch: its ref, the local
// branch's configured upstream, and origin's copy when origin is that upstream's remote. A
// same-named branch on any other remote, a fork's for example, proves nothing.
function integrationRefs(root, integ) {
  const refs = [integ.ref];
  if (resolve(root, `refs/heads/${integ.name}`)) {
    const upstream = chomp(git(root, ['for-each-ref', '--format=%(upstream)', `refs/heads/${integ.name}`]) || '');
    if (upstream.startsWith('refs/remotes/')) refs.push(upstream);
    if (chomp(git(root, ['config', '--get', `branch.${integ.name}.remote`]) || '') === 'origin') refs.push(`refs/remotes/origin/${integ.name}`);
  }
  return [...new Set(refs.filter((r) => r && resolve(root, r)))];
}

// storyBranches(root, op, integ, target): { branches: [{ name, tip }] } for the pm/* branches a
// merge operand stands for, { noop } when merging it into the target changes nothing, or
// { reason } when the operand must be refused outright.
// operandOf(root, op): what a merge operand names, as { bare, name, commit }: bare is the operand
// without revision suffixes or refs/tags/, name the branch it spells (a local branch, or a
// remote's branch without the remote), null for a SHA, tag, or FETCH_HEAD; commit what it resolves
// to, or ''.
function operandOf(root, op) {
  const bare = op.replace(/[~^@].*$/, '').replace(/^refs\/tags\//, '');
  const sym = chomp(git(root, ['rev-parse', '--symbolic-full-name', op]) || '');
  let name = null;
  if (sym.startsWith('refs/heads/')) name = sym.slice('refs/heads/'.length);
  else if (sym.startsWith('refs/remotes/')) name = sym.split('/').slice(3).join('/');
  return { bare, name, commit: resolve(root, op) };
}

function storyBranches(root, op, integ, target) {
  const { bare, name, commit } = operandOf(root, op);
  const tag = bare && git(root, ['show-ref', '--verify', '--quiet', `refs/tags/${bare}`]) !== null;
  if (tag && (looksPm(bare) || refFor(root, bare))) return { reason: `${bare} is ambiguous: a tag shadows a branch of that name; delete the tag or merge refs/heads/${bare}` };
  // A story the integration branch already holds merges nothing into it.
  if (name && name.startsWith('pm/') && commit && integ.ref && target === integ.name && contains(root, commit, integ.ref)) return { branches: [], noop: true };
  if (name && name.startsWith('pm/')) return { branches: commit ? [{ name, tip: commit }] : [] };
  if (!commit) return { branches: [] };
  // What the integration branch, or a trusted remote copy of it, already holds brings no story
  // work, whatever names it.
  if (integrationRefs(root, integ).some((r) => contains(root, commit, r))) return { branches: [] };
  const tips = pmTips(root);
  const exact = [...new Set(tips.filter((t) => t.tip === commit).map((t) => t.name))];
  if (exact.length) return { branches: exact.map((n) => ({ name: n, tip: commit })) };
  const holder = tips.find((t) => contains(root, commit, t.tip));
  if (holder) return { reason: `${op} is part of ${holder.name} short of its tip, which carries the verdict; merge the branch itself` };
  return { branches: [] };
}

function parseMeta(text) {
  const head = String(text).split(/\r?\n/).slice(0, 12).join('\n');
  const m = head.match(/<!--\s*pm-meta:\s*(\{.*?\})\s*-->/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// listing(root, args): git's NUL-delimited path output (-z) as an array, unquoted whatever
// core.quotePath says; null on failure. A large buffer, so a monorepo's whole tree fits.
function listing(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.error || r.status !== 0 ? null : r.stdout.split('\0').filter(Boolean);
}

// storyFiles(root, ref, prefix): the story files on `ref`, as paths from the top level.
function storyFiles(root, ref, prefix) {
  const dir = `${prefix}docs/stories/`;
  return (listing(root, ['ls-tree', '-z', '--name-only', ref, dir]) ?? []).filter((x) => x.startsWith(dir) && /^[^/]+\.md$/.test(x.slice(dir.length)));
}

// claimOf(root, ref, branch, prefix): the story on the integration branch that claims `branch`, as
// { file, text, exec }, exec null when the exact-path story's block does not parse; or null.
function claimOf(root, ref, branch, prefix) {
  const exact = `${prefix}docs/stories/${branch.slice('pm/'.length)}.md`;
  const text = git(root, ['show', `${ref}:${exact}`]);
  if (text !== null) {
    const exec = parseExec(text);
    if (!exec) return { file: exact, text, exec: null };
    if (exec.branch === branch) return { file: exact, text, exec };
  }
  for (const f of storyFiles(root, ref, prefix).filter((x) => x !== exact)) {
    const t = git(root, ['show', `${ref}:${f}`]);
    const exec = t === null ? null : parseExec(t);
    if (exec && exec.branch === branch) return { file: f, text: t, exec };
  }
  return null;
}

function run(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
}

// Set when merge-tree failed on a git older than 2.38, so the deny can say why.
let oldGit = null;

function noteGitVersion(root) {
  const v = (chomp(git(root, ['version']) || '').match(/(\d+)\.(\d+)/) || []).slice(1).map(Number);
  if (v.length === 2 && (v[0] < 2 || (v[0] === 2 && v[1] < 38))) oldGit = v.join('.');
}

// isHandoff(p, prefix): p is a handoff note of the project at prefix ("" or "dir/").
const isHandoff = (p, prefix) => p.startsWith(`${prefix}docs/handoff/`) && /^[^/]+\.md$/.test(p.slice(`${prefix}docs/handoff/`.length));
// onlyRecords(list, file, prefix): every path in the list is the story file, or, when prefix is a
// string, a handoff note of the project there.
const onlyRecords = (list, file, prefix = null) => list.every((p) => p === file || (prefix !== null && isHandoff(p, prefix)));

// mergeMatches(root, commit, parents, file): true when a merge commit's tree is the automatic
// merge of its two parents, apart from the story file.
function mergeMatches(root, commit, parents, file) {
  if (parents.length !== 2) return false;
  const r = run(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', parents[0], parents[1]]);
  if (r.error || (r.status !== 0 && r.status !== 1)) { noteGitVersion(root); return false; }
  const [tree, ...conflicted] = r.stdout.split('\0').filter(Boolean);
  if (!/^[0-9a-f]{40,64}$/.test(tree || '') || !conflicted.every((p) => p === file)) return false;
  const diff = listing(root, ['diff', '-z', '--name-only', tree, commit, '--']);
  return diff !== null && onlyRecords(diff, file);
}

// afterVerdict(root, sha, tip, integrationRef, file, prefix): true when the commits between the
// verdict and the tip that the integration branch lacks only record state (the story file and the
// project's handoff notes) or merge it automatically.
function afterVerdict(root, sha, tip, integrationRef, file, prefix) {
  if (tip.startsWith(sha)) return true;
  const full = resolve(root, sha);
  if (!full || !contains(root, full, tip)) return false;
  const after = git(root, ['rev-list', '--parents', `${full}..${tip}`, '--not', integrationRef]);
  if (after === null) return false;
  for (const line of after.split(/\r?\n/).filter(Boolean)) {
    const [commit, ...parents] = line.split(' ');
    if (parents.length > 1) {
      if (!mergeMatches(root, commit, parents, file)) return false;
      continue;
    }
    const changed = listing(root, ['diff-tree', '-z', '--root', '--name-only', '--no-commit-id', '-r', commit]);
    if (changed === null || !onlyRecords(changed, file, prefix)) return false;
  }
  return true;
}

const staleReason = (what, sha, branch, tip, fix) => (oldGit
  ? `checking merges after the ${what} needs git 2.38 or newer (git merge-tree --write-tree), and this is git ${oldGit}; upgrade git`
  : `the ${what} is for ${sha.slice(0, 12)}, but ${branch} at ${tip.slice(0, 12)} holds other changes since; ${fix}`);

const CLAIM_FIELDS = ['tier', 'deliver', 'branch', 'protected', 'protected_base'];
const TIERS = new Set(['T0', 'T1', 'T2']);
// An absent `protected` reads as [] and an absent `protected_base` as "", so a T0 claim may
// spell either.
const EMPTY = { protected: [], protected_base: '' };
const same = (a, b, k) => JSON.stringify(a ?? EMPTY[k] ?? null) === JSON.stringify(b ?? EMPTY[k] ?? null);
const atCommit = (value, word) => (typeof value === 'string' ? value.trim().match(new RegExp(`^(${word})\\s+([0-9a-fA-F]{7,64})$`)) : null);

// verdictFor(root, branch, tip, integ): null to allow, or the reason to block.
function verdictFor(root, branch, tip, integ) {
  const prefix = integ.prefix ?? '';
  if (!integ.ref) return `the integration branch ${integ.name} (${prefix}docs/plan.md, default main) does not resolve, so the claim cannot be read`;
  if (integ.name.startsWith('pm/')) return `the integration branch ${integ.name} is itself a story branch; fix ${prefix}docs/plan.md`;
  if (contains(root, tip, integ.ref)) return `the integration branch ${integ.name} already contains ${branch}, so it cannot judge the merge`;
  const claim = claimOf(root, integ.ref, branch, prefix);
  if (!claim) return `no story on ${integ.name} claims ${branch}; claim it per state.md before merging`;
  if (!claim.exec) return `${claim.file} on ${integ.name} has an Execution block that does not parse`;
  const has = (k) => Object.hasOwn(claim.exec, k);
  // A claim with neither field was made before they existed, unless the project already records
  // 0.29 or later on another story, when the missing tier is a mistake.
  if (!has('deliver') && !has('tier')) {
    const modern = storyFiles(root, integ.ref, prefix).filter((f) => f !== claim.file).some((f) => {
      return versionAtLeast(parseExec(git(root, ['show', `${integ.ref}:${f}`]) ?? '')?.deliver, [0, 29, 0]) === true;
    });
    return modern ? `${claim.file} on ${integ.name}: the claim records no tier, and other stories there record deliver 0.29 or later; set tier and deliver on the claim` : null;
  }
  if (has('deliver')) {
    if (!deliverVersion(claim.exec.deliver)) return `${claim.file} on ${integ.name} records no parseable deliver version`;
    if (!versionAtLeast(claim.exec.deliver, [0, 29, 0])) return null;
  }
  const tier = claim.exec.tier;
  if (!TIERS.has(tier)) return `${claim.file} on ${integ.name} records tier ${sanitize(tier ?? 'unset')}, not T0, T1, or T2`;

  const { file } = claim;
  const text = git(root, ['show', `${tip}:${file}`]);
  const exec = text === null ? null : parseExec(text);
  if (!exec) return `${file} is missing or unparseable at the tip of ${branch}`;
  for (const k of CLAIM_FIELDS) {
    if (!same(exec[k], claim.exec[k], k)) return `${file} on ${branch} changes the claimed ${k}; claim fields are set on ${integ.name} only`;
  }
  if (!same(parseMeta(text)?.integrity_allow, parseMeta(claim.text)?.integrity_allow)) return `${file} on ${branch} changes pm-meta integrity_allow from the claim on ${integ.name}`;
  if (tier === 'T1' || tier === 'T2') {
    const prot = claim.exec.protected;
    const okProt = Array.isArray(prot) && prot.length > 0 && prot.every((x) => typeof x === 'string' && x);
    if (!okProt || !/^[0-9a-fA-F]{7,64}$/.test(String(claim.exec.protected_base ?? ''))) return `${file} is tier ${tier} but the claim on ${integ.name} lacks the protect commit's protected paths and protected_base`;
  }

  const m = atCommit(exec.verifier, 'PASS|FAIL|UNKNOWN');
  if (!m) return `${file} records no verifier verdict at a commit ("verifier": "PASS <sha>")`;
  if (m[1] !== 'PASS') return `${file} records verifier ${m[1]}, and only PASS ships`;
  const sha = m[2].toLowerCase();
  if (!afterVerdict(root, sha, tip, integ.ref, file, prefix)) return staleReason('verifier PASS', sha, branch, tip, 're-verify');
  if (tier === 'T1' || tier === 'T2') {
    const ig = atCommit(exec.integrity, 'pass');
    if (!ig) return `${file} is tier ${tier} and records integrity ${sanitize(exec.integrity ?? 'unset')}, not "pass <sha>"`;
    if (!afterVerdict(root, ig[2].toLowerCase(), tip, integ.ref, file, prefix)) return staleReason('integrity pass', ig[2], branch, tip, 're-run test-integrity.mjs');
  }
  return null;
}

function block(what, reason) {
  fs.writeSync(2, `deliver blocked git merge ${sanitize(what)}: ${oneLine(reason)}.\n`);
  process.exit(2);
}

let calls;
// The session's project directory: CLAUDE_PROJECT_DIR when it names a directory, else the cwd.
let sessionDir;
try {
  const input = readHookInput();
  const cmd = input?.tool_input?.command;
  if (typeof cmd !== 'string' || !/\b(merge|pull)\b/.test(cmd)) process.exit(0);
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
  const env = process.env.CLAUDE_PROJECT_DIR;
  sessionDir = env && path.isAbsolute(env) && fs.existsSync(env) && fs.statSync(env).isDirectory() ? path.resolve(env) : cwd;
  calls = gitCalls(cmd, cwd);
} catch {
  process.exit(0);
}

const commonDir = (dir) => {
  const d = chomp(git(dir, ['rev-parse', '--git-common-dir']) || '');
  return d ? (fs.realpathSync.native?.(path.resolve(dir, d)) ?? path.resolve(dir, d)) : null;
};

// prefixesOf(root, dir): where a deliver project holding dir may sit, as "a/b/" paths from the top
// level, deepest first; [] when dir is the top level or not in root's repository. A project below
// the git top level keeps docs/ there, so every path the gate reads carries the prefix.
function prefixesOf(root, dir) {
  const repo = commonDir(root);
  if (!dir || dir === UNKNOWN || !repo || commonDir(dir) !== repo) return [];
  const parts = chomp(git(dir, ['rev-parse', '--show-prefix']) || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const out = [];
  for (let n = parts.length; n > 0; n--) out.push(`${parts.slice(0, n).join('/')}/`);
  return out;
}

// baseRefs(root): the trusted base refs: main, master, origin/HEAD's target, and
// init.defaultBranch, each with its trusted upstream.
const baseRefs = (root) => [...new Set(baseBranches(root).flatMap((name) => {
  const ref = refFor(root, name);
  return ref ? integrationRefs(root, { name, ref }) : [];
}))];

// discover(root): the deliver projects in the repository, as { found, integrations, failed }:
// found, every directory at any depth holding docs/approval.json, as "." or "a/b", sorted;
// integrations, every branch name a found project's plan names as its integration branch; failed,
// true when a listing could not be read. Projects are read from the trusted base refs, from each
// local non-`pm/*` branch whose committed plan there names that branch, and from the working tree.
// Listings are NUL-delimited, so no path is quoted.
function discover(root) {
  const tail = 'docs/approval.json';
  const found = new Set();
  const integrations = new Set();
  let failed = false;
  const dirs = (paths) => {
    if (paths === null) { failed = true; return []; }
    return paths.filter((p) => p === tail || p.endsWith(`/${tail}`)).map((p) => p.slice(0, -tail.length));
  };
  const note = (prefix, plan) => {
    found.add(prefix.replace(/\/$/, '') || '.');
    if (plan) integrations.add(plan);
  };
  const bases = baseBranches(root);
  for (const ref of baseRefs(root)) {
    for (const prefix of dirs(listing(root, ['ls-tree', '-r', '-z', '--name-only', ref]))) note(prefix, planName(git(root, ['show', `${ref}:${prefix}docs/plan.md`])));
  }
  for (const name of localBranches(root)) {
    if (name.startsWith('pm/') || bases.includes(name)) continue;
    for (const prefix of dirs(listing(root, ['ls-tree', '-r', '-z', '--name-only', `refs/heads/${name}`]))) {
      if (planName(git(root, ['show', `refs/heads/${name}:${prefix}docs/plan.md`])) === name) note(prefix, name);
    }
  }
  // The working tree is untrusted, so it only adds projects, and so blocks; it never removes one.
  for (const prefix of dirs(listing(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', `:(glob)**/${tail}`]))) {
    let plan = null;
    try { plan = planName(fs.readFileSync(path.join(root, `${prefix}docs/plan.md`), 'utf8')); } catch { plan = null; }
    note(prefix, plan);
  }
  return { found: [...found].sort(), integrations, failed };
}

// namedStory(op): the operand's spelling alone makes it a story candidate: computed by the shell
// (with `-` and `@{-N}`), a pm/* name in any spelling, or FETCH_HEAD. Shared by every path, so
// they cannot drift.
const namedStory = (op) => op.dynamic || looksPm(op.text) || op.text === 'FETCH_HEAD';

// storyLike(root, op, tips, base): the operand could be a story outside every project: a named
// story, a ref resolving to a pm/* branch, or a commit that is, or is inside, a pm/* tip here or
// on any remote and that no trusted base ref already holds. The exemption is deliberate: a tip a
// base branch holds has shipped there, and refusing it would block `git merge main` right after
// `git branch pm/<id> main`.
function storyLike(root, op, tips, base) {
  if (namedStory(op)) return true;
  const o = operandOf(root, op.text);
  if (o.name?.startsWith('pm/')) return true;
  if (!o.commit || !tips.some((t) => t.tip === o.commit || contains(root, o.commit, t.tip))) return false;
  return !base().some((r) => contains(root, o.commit, r));
}

// baseByName(root, text, refs): the operand names a trusted base branch: main or its kin, locally,
// as origin/<name>, or as one of the trusted base refs.
function baseByName(root, text, refs) {
  const names = baseBranches(root).flatMap((n) => [n, `origin/${n}`, `refs/heads/${n}`, `refs/remotes/origin/${n}`]);
  return names.includes(text) || refs().some((r) => text === r || text === r.replace(/^refs\/(heads|remotes)\//, ''));
}

// readsOnly(sub, args): a git call known not to write refs: status, log, diff, show, rev-parse,
// or a fetch with no destination refspec (`<src>:<dst>`), which updates only remote-tracking refs.
// A plain checkout or switch is judged by checkoutOf.
const READ_ONLY = new Set(['status', 'log', 'diff', 'show', 'rev-parse']);
const FETCH_OPTS_WITH_VALUE = new Set([...PULL_OPTS_WITH_VALUE, '--refmap', '--recurse-submodules-default']);
function readsOnly(sub, args) {
  if (READ_ONLY.has(sub)) return true;
  if (sub !== 'fetch') return false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.dynamic) return false;
    if (w.text === '--') { positional.push(...args.slice(i + 1)); break; }
    if (FETCH_OPTS_WITH_VALUE.has(w.text)) i++;
    else if (!w.text.startsWith('-')) positional.push(w);
  }
  // The first operand is the remote, which may be a URL; each further one is a refspec.
  return positional.slice(1).every((w) => !w.dynamic && !w.text.includes(':'));
}

// candidates(lists): the prefixes in priority order, each once, ending with the top level.
const candidates = (...lists) => [...new Set([...lists.flat(), ''])];

const DYNAMIC = 'the shell computes this operand, so the gate cannot see which branch merges; name the branch literally';
const SEPARATE = 'an earlier git command in the same call can move the refs this merge reads; run the merge as its own command';

// git calls return null on failure, so nothing below should throw; if something does, the hook
// fails open like every deliver hook rather than wedging the session.
try {
  const targets = new Map();
  const rootOf = (dir) => {
    if (dir === UNKNOWN) return null;
    const top = chomp(git(dir, ['rev-parse', '--show-toplevel']) || '');
    return top ? path.resolve(top) : null;
  };
  // Whether the session's own project is a deliver project, decided once, on first need.
  let sessionDeliver;
  const inDeliverSession = () => {
    if (sessionDeliver === undefined) {
      const root = rootOf(sessionDir);
      sessionDeliver = Boolean(root && project(root, candidates(prefixesOf(root, sessionDir))));
    }
    return sessionDeliver;
  };
  // discover(root) per repository, read on first need.
  const discovered = new Map();
  // earlierChange: an earlier git call may move refs (anything but a plain checkout or switch).
  // earlierWrite: an earlier git call may write refs outright (anything but readsOnly).
  let earlierChange = false;
  let earlierWrite = false;
  for (const { dir, sub, args, ops } of calls) {
    if (sub === 'checkout' || sub === 'switch') {
      const co = checkoutOf(sub, args);
      if (co.force) { earlierChange = true; earlierWrite = true; }
      const root = rootOf(dir);
      if (!root || co.paths) continue;
      // A computed or unresolvable branch leaves the target unknown, and a story merge under an
      // unknown target is gated as a ship.
      if (co.dynamic) targets.set(root, UNKNOWN);
      else if (co.create) targets.set(root, co.create);
      else if (co.detach) targets.set(root, null);
      else if (co.prev) targets.set(root, UNKNOWN);
      else if (co.name && (resolve(root, `refs/heads/${co.name}`) || resolve(root, `refs/remotes/origin/${co.name}`))) targets.set(root, co.name);
      else if (co.name && resolve(root, co.name)) targets.set(root, null);
      else if (co.name) targets.set(root, UNKNOWN);
      continue;
    }
    if (!ops) {
      earlierChange = true;
      if (!readsOnly(sub, args)) earlierWrite = true;
      continue;
    }
    const prior = earlierChange;
    const priorWrite = earlierWrite;
    earlierChange = true;
    earlierWrite = true;
    const dyn = ops.find((o) => o.dynamic);
    const suspect = ops.find(namedStory);
    // Where the repository cannot be read, a pm-looking merge is suspect only from a deliver
    // session; anywhere else the gate has nothing to protect and fails open.
    if (dir === UNKNOWN) {
      if (suspect && inDeliverSession()) block(suspect.text, 'the directory this git command runs in cannot be determined, so the story cannot be checked; run it from the project root');
      continue;
    }
    const root = rootOf(dir);
    if (!root) {
      if (suspect && inDeliverSession()) block(suspect.text, `${dir} is not a git repository, so the story cannot be checked; run the merge from the project`);
      continue;
    }
    const target = targets.has(root) ? targets.get(root) : currentBranch(root);
    // Merging into a story branch, such as the integration tip into it, is not a ship.
    if (typeof target === 'string' && target.startsWith('pm/')) continue;
    // The project that owns the merge is the one the merge's own directory sits in, else a deliver
    // project at the top level. Outside every project, in a repository holding any, a story-like
    // operand blocks: the gate does not guess which project ships it.
    const integ = project(root, candidates(prefixesOf(root, dir)));
    if (!integ) {
      // Nothing to merge, or no pm/* tip and no named story with no earlier ref-writing call
      // (which could create a pm/* branch): nothing here can block, so the repository is not listed.
      if (!ops.length) continue;
      const tips = pmTips(root);
      if (!tips.length && !ops.some(namedStory) && !priorWrite) continue;
      // Discovery next: it is read once per repository, and with no deliver project anywhere
      // nothing below needs a merge-base.
      if (!discovered.has(root)) discovered.set(root, discover(root));
      const disc = discovered.get(root);
      if (!disc.failed && !disc.found.length) continue;
      // A known target that is no base branch and that no project integrates on is not a ship.
      if (!disc.failed && typeof target === 'string' && !baseBranches(root).includes(target) && !disc.integrations.has(target)) continue;
      let base;
      const baseOnce = () => (base ??= baseRefs(root));
      const op = ops.find((o) => storyLike(root, o, tips, baseOnce));
      if (disc.failed) {
        if (op) block(op.text || '(computed)', 'the gate cannot list the repository to look for deliver projects; run the merge from the project directory, or with git -C <project>');
        continue;
      }
      // A base branch by name is exempt only when no earlier call can have written refs.
      if (prior) {
        const other = ops.find((o) => priorWrite || !baseByName(root, o.text, baseOnce));
        if (other) block(other.text || '(computed)', SEPARATE);
      }
      if (op) block(op.text || '(computed)', `${dir} is in no deliver project; run the merge from the project directory, or with git -C <project> (found deliver projects: ${disc.found.join(', ')})`);
      continue;
    }
    if (dyn) block(dyn.text || '(computed)', DYNAMIC);
    if (sub === 'pull') {
      const pm = ops.find((o) => looksPm(o.text));
      if (pm) block(pm.text, 'git pull merges a story branch commit the gate cannot see before the fetch; git fetch, then git merge the fetched ref in a separate command');
      continue;
    }
    for (const op of ops) {
      const found = integ.error ? { branches: [] } : storyBranches(root, op.text, integ, target);
      // A no-op judged on refs an earlier command may move is no judgement; fall through to SEPARATE.
      if (found.noop && !prior) continue;
      const story = Boolean(found.reason || found.branches.length || namedStory(op));
      if (!story) continue;
      if (prior) block(op.text, SEPARATE);
      if (integ.error) block(op.text, integ.error);
      if (found.reason) block(op.text, found.reason);
      for (const { name, tip } of found.branches) {
        const reason = verdictFor(root, name, tip, integ);
        if (reason) block(name, reason);
      }
    }
  }
} catch {
  process.exit(0);
}
process.exit(0);
