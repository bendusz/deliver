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
// operands. A merge into a `pm/*` branch is not a ship and is ignored; the target is the branch a
// `checkout` or `switch` earlier in the command selects, else HEAD's. An operand is a story
// branch when it names `pm/*` locally or on a remote, or resolves to the tip of, or a commit
// inside, a `pm/*` branch that the integration branch does not already hold. In a deliver
// project the hook blocks a computed operand (`$VAR`, `$(...)`, backticks, `-`, `@{-N}`), a story
// merge after another ref-changing git command in the same call (only a plain checkout or switch
// may precede it), `git pull` of a story branch, a commit short of a story tip, and a tag that
// shadows a `pm/*` name.
//
// Nothing is read from the working tree, which the story checkout controls. Candidate trusted
// branches are main, master, the origin/HEAD target, init.defaultBranch, and any local non-`pm/*`
// branch whose committed docs/plan.md names itself as the integration branch. The repository is a
// deliver project when one of them holds docs/approval.json; their plans' `Integration branch:`
// lines must agree, and the branch named may not be `pm/*` or already contain the story tip. The
// claim is the story on that branch, at docs/stories/<branch minus pm/>.md or found by its
// Execution block's `branch`. A claim with neither `deliver` nor `tier` predates these fields and
// passes; otherwise `deliver`, when present, must parse, `tier` must be T0, T1, or T2, and
// `tier`, `deliver`, `branch`, `protected`, `protected_base`, and pm-meta `integrity_allow` must
// be the same at the branch tip. A T1 or T2 claim needs non-empty `protected` and a
// `protected_base`. From the tip only `verifier` and `integrity` are read. The merge is allowed
// only when:
//   - `verifier` is "PASS <sha>", <sha> 7 or more hex digits naming the tip or an ancestor of it;
//   - each commit after <sha> that the integration branch lacks changes only the story file, or
//     is a two-parent merge whose tree equals `git merge-tree --write-tree` of its parents (git
//     2.38 or newer) with conflicts and differences confined to the story file;
//   - at tier T1 or T2, `integrity` is "pass <sha>" under the same rule.
//
// FAIL-OPEN only where the hook cannot tell what is being run: the kill switch, unparseable hook
// input, a command with no merge of a story branch, or a repository that is not a deliver
// project. Blocks exit 2 with the reason on stderr.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let lib;
try { lib = await import('./lib.mjs'); } catch { process.exit(0); }
const { readHookInput, parseExec, git, chomp } = lib;

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

// checkoutOf(args): what a checkout or switch selects, as { create, name, detach, prev, paths, force }.
function checkoutOf(sub, args) {
  const out = { create: null, name: null, detach: false, prev: false, paths: false, force: false };
  for (let i = 0; i < args.length; i++) {
    const w = args[i].text;
    if (w === '--') { out.paths = true; break; }
    if (['-b', '-c', '-B', '-C', '--orphan'].includes(w)) {
      out.create = args[i + 1]?.text ?? null;
      if (w !== '-b' && w !== '-c') out.force = true;
      i++;
    } else if (w === '--detach' || (sub === 'switch' && w === '-d')) out.detach = true;
    else if (w === '-') out.prev = true;
    else if (!w.startsWith('-') && out.name === null) out.name = w;
  }
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

// project(root): null when no trusted branch marks a deliver project; else the integration branch
// as { name, ref }, ref null when it resolves nowhere, or { error } when the plans disagree.
function project(root) {
  const cands = [];
  const add = (name) => {
    if (!name || name.startsWith('pm/')) return;
    const ref = refFor(root, name);
    if (ref && !cands.some((c) => c.ref === ref)) cands.push({ name, ref });
  };
  add('main');
  add('master');
  const originHead = chomp(git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']) || '');
  if (originHead.startsWith('refs/remotes/origin/')) add(originHead.slice('refs/remotes/origin/'.length));
  add(chomp(git(root, ['config', '--get', 'init.defaultBranch']) || ''));
  for (const name of (git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']) || '').split(/\r?\n/).filter(Boolean)) {
    if (name.startsWith('pm/') || cands.some((c) => c.name === name)) continue;
    if (planName(git(root, ['show', `refs/heads/${name}:docs/plan.md`])) === name) add(name);
  }
  for (const c of cands) {
    c.approved = git(root, ['cat-file', '-e', `${c.ref}:docs/approval.json`]) !== null;
    c.plan = c.approved ? planName(git(root, ['show', `${c.ref}:docs/plan.md`])) : null;
  }
  const approved = cands.filter((c) => c.approved);
  if (!approved.length) return null;
  const names = [...new Set(approved.map((c) => c.plan).filter(Boolean))];
  if (names.length > 1) return { error: `the committed plans on ${approved.filter((c) => c.plan).map((c) => c.name).join(', ')} disagree on the integration branch (${names.join(', ')}); make docs/plan.md agree` };
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

// storyBranches(root, op, integ): { branches: [{ name, tip }] } for the pm/* branches a merge
// operand stands for, or { reason } when the operand must be refused outright.
function storyBranches(root, op, integ) {
  const bare = op.replace(/[~^@].*$/, '').replace(/^refs\/tags\//, '');
  const tag = bare && git(root, ['show-ref', '--verify', '--quiet', `refs/tags/${bare}`]) !== null;
  if (tag && (looksPm(bare) || refFor(root, bare))) return { reason: `${bare} is ambiguous: a tag shadows a branch of that name; delete the tag or merge refs/heads/${bare}` };
  const sym = chomp(git(root, ['rev-parse', '--symbolic-full-name', op]) || '');
  let name = null;
  if (sym.startsWith('refs/heads/')) name = sym.slice('refs/heads/'.length);
  else if (sym.startsWith('refs/remotes/')) name = sym.split('/').slice(3).join('/');
  const commit = resolve(root, op);
  if (name && name.startsWith('pm/')) return { branches: commit ? [{ name, tip: commit }] : [] };
  if (!commit) return { branches: [] };
  // What the integration branch already holds brings no story work, whatever names it.
  if (integ.ref && contains(root, commit, integ.ref)) return { branches: [] };
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

// claimOf(root, ref, branch): the story on the integration branch that claims `branch`, as
// { file, text, exec }, exec null when the exact-path story's block does not parse; or null.
function claimOf(root, ref, branch) {
  const exact = `docs/stories/${branch.slice('pm/'.length)}.md`;
  const text = git(root, ['show', `${ref}:${exact}`]);
  if (text !== null) {
    const exec = parseExec(text);
    if (!exec) return { file: exact, text, exec: null };
    if (exec.branch === branch) return { file: exact, text, exec };
  }
  const listing = git(root, ['ls-tree', '--name-only', ref, 'docs/stories/']) || '';
  for (const f of listing.split(/\r?\n/).filter((x) => /^docs\/stories\/[^/]+\.md$/.test(x) && x !== exact)) {
    const t = git(root, ['show', `${ref}:${f}`]);
    const exec = t === null ? null : parseExec(t);
    if (exec && exec.branch === branch) return { file: f, text: t, exec };
  }
  return null;
}

const version = (v) => {
  const m = typeof v === 'string' ? v.match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  return m ? m.slice(1).map(Number) : null;
};

function run(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
}

// Set when merge-tree failed on a git older than 2.38, so the deny can say why.
let oldGit = null;

function noteGitVersion(root) {
  const v = (chomp(git(root, ['version']) || '').match(/(\d+)\.(\d+)/) || []).slice(1).map(Number);
  if (v.length === 2 && (v[0] < 2 || (v[0] === 2 && v[1] < 38))) oldGit = v.join('.');
}

const onlyFile = (list, file) => list.split(/\r?\n/).filter(Boolean).every((p) => p === file);

// mergeMatches(root, commit, parents, file): true when a merge commit's tree is the automatic
// merge of its two parents, apart from the story file.
function mergeMatches(root, commit, parents, file) {
  if (parents.length !== 2) return false;
  const r = run(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', parents[0], parents[1]]);
  if (r.error || (r.status !== 0 && r.status !== 1)) { noteGitVersion(root); return false; }
  const [tree, ...conflicted] = r.stdout.split(/\r?\n/).filter(Boolean);
  if (!/^[0-9a-f]{40,64}$/.test(tree || '') || !conflicted.every((p) => p === file)) return false;
  const diff = git(root, ['diff', '--name-only', tree, commit, '--']);
  return diff !== null && onlyFile(diff, file);
}

// afterVerdict(root, sha, tip, integrationRef, file): true when the commits between the verdict
// and the tip that the integration branch lacks only record state or merge it automatically.
function afterVerdict(root, sha, tip, integrationRef, file) {
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
    const changed = git(root, ['diff-tree', '--root', '--name-only', '--no-commit-id', '-r', commit]);
    if (changed === null || !onlyFile(changed, file)) return false;
  }
  return true;
}

const staleReason = (what, sha, branch, tip, fix) => (oldGit
  ? `checking merges after the ${what} needs git 2.38 or newer (git merge-tree --write-tree), and this is git ${oldGit}; upgrade git`
  : `the ${what} is for ${sha.slice(0, 12)}, but ${branch} at ${tip.slice(0, 12)} holds other changes since; ${fix}`);

const CLAIM_FIELDS = ['tier', 'deliver', 'branch', 'protected', 'protected_base'];
const TIERS = new Set(['T0', 'T1', 'T2']);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const atCommit = (value, word) => (typeof value === 'string' ? value.trim().match(new RegExp(`^(${word})\\s+([0-9a-fA-F]{7,64})$`)) : null);

// verdictFor(root, branch, tip, integ): null to allow, or the reason to block.
function verdictFor(root, branch, tip, integ) {
  if (!integ.ref) return `the integration branch ${integ.name} (docs/plan.md, default main) does not resolve, so the claim cannot be read`;
  if (integ.name.startsWith('pm/')) return `the integration branch ${integ.name} is itself a story branch; fix docs/plan.md`;
  if (contains(root, tip, integ.ref)) return `the integration branch ${integ.name} already contains ${branch}, so it cannot judge the merge`;
  const claim = claimOf(root, integ.ref, branch);
  if (!claim) return `no story on ${integ.name} claims ${branch}; claim it per state.md before merging`;
  if (!claim.exec) return `${claim.file} on ${integ.name} has an Execution block that does not parse`;
  const has = (k) => Object.hasOwn(claim.exec, k);
  // A claim with neither field was made before they existed.
  if (!has('deliver') && !has('tier')) return null;
  if (has('deliver')) {
    const v = version(claim.exec.deliver);
    if (!v) return `${claim.file} on ${integ.name} records no parseable deliver version`;
    if (v[0] === 0 && v[1] < 29) return null;
  }
  const tier = claim.exec.tier;
  if (!TIERS.has(tier)) return `${claim.file} on ${integ.name} records tier ${sanitize(tier ?? 'unset')}, not T0, T1, or T2`;

  const { file } = claim;
  const text = git(root, ['show', `${tip}:${file}`]);
  const exec = text === null ? null : parseExec(text);
  if (!exec) return `${file} is missing or unparseable at the tip of ${branch}`;
  for (const k of CLAIM_FIELDS) {
    if (!same(exec[k], claim.exec[k])) return `${file} on ${branch} changes the claimed ${k}; claim fields are set on ${integ.name} only`;
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
  if (!afterVerdict(root, sha, tip, integ.ref, file)) return staleReason('verifier PASS', sha, branch, tip, 're-verify');
  if (tier === 'T1' || tier === 'T2') {
    const ig = atCommit(exec.integrity, 'pass');
    if (!ig) return `${file} is tier ${tier} and records integrity ${sanitize(exec.integrity ?? 'unset')}, not "pass <sha>"`;
    if (!afterVerdict(root, ig[2].toLowerCase(), tip, integ.ref, file)) return staleReason('integrity pass', ig[2], branch, tip, 're-run test-integrity.mjs');
  }
  return null;
}

function block(what, reason) {
  fs.writeSync(2, `deliver blocked git merge ${sanitize(what)}: ${oneLine(reason)}.
(Set DELIVER_NO_ENFORCE=1 to disable this gate.)
`);
  process.exit(2);
}

let calls;
try {
  const input = readHookInput();
  const cmd = input?.tool_input?.command;
  if (typeof cmd !== 'string' || !/\b(merge|pull)\b/.test(cmd)) process.exit(0);
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
  calls = gitCalls(cmd, cwd);
} catch {
  process.exit(0);
}

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
  let earlierChange = false;
  for (const { dir, sub, args, ops } of calls) {
    if (sub === 'checkout' || sub === 'switch') {
      const co = checkoutOf(sub, args);
      if (co.force) earlierChange = true;
      const root = rootOf(dir);
      if (!root || co.paths) continue;
      if (co.create) targets.set(root, co.create);
      else if (co.detach) targets.set(root, null);
      else if (co.prev) targets.set(root, UNKNOWN);
      else if (co.name && (resolve(root, `refs/heads/${co.name}`) || resolve(root, `refs/remotes/origin/${co.name}`))) targets.set(root, co.name);
      else if (co.name && resolve(root, co.name)) targets.set(root, null);
      continue;
    }
    if (!ops) { earlierChange = true; continue; }
    const prior = earlierChange;
    earlierChange = true;
    const dyn = ops.find((o) => o.dynamic);
    const suspect = dyn || ops.find((o) => looksPm(o.text) || o.text === 'FETCH_HEAD');
    if (dir === UNKNOWN) {
      if (suspect) block(suspect.text, 'the directory this git command runs in cannot be determined, so the story cannot be checked; run it from the project root');
      continue;
    }
    const root = rootOf(dir);
    if (!root) {
      if (suspect) block(suspect.text, `${dir} is not a git repository, so the story cannot be checked; run the merge from the project`);
      continue;
    }
    const integ = project(root);
    if (!integ) continue;
    const target = targets.has(root) ? targets.get(root) : currentBranch(root);
    // Merging into a story branch, such as the integration tip into it, is not a ship.
    if (typeof target === 'string' && target.startsWith('pm/')) continue;
    if (dyn) block(dyn.text || '(computed)', DYNAMIC);
    if (sub === 'pull') {
      const pm = ops.find((o) => looksPm(o.text));
      if (pm) block(pm.text, 'git pull merges a story branch commit the gate cannot see before the fetch; git fetch, then git merge the fetched ref in a separate command');
      continue;
    }
    for (const op of ops) {
      const found = integ.error ? { branches: [] } : storyBranches(root, op.text, integ);
      const story = Boolean(found.reason || found.branches.length || looksPm(op.text) || op.text === 'FETCH_HEAD');
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
