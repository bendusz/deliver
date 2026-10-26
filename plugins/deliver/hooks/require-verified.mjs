#!/usr/bin/env node
// deliver PreToolUse hook on Bash: a story branch merges only with a verifier PASS for its code.
//
// Threat model. The gate catches a PM's honest mistakes: forgetting to verify, a stale verdict,
// chaining commands carelessly, a mis-stated tier. It is not a boundary against a deliberately
// evasive agent with Bash; that protection is the 0.30 sandbox. So it reads every form a PM could
// plausibly write, stays fail-closed once a story merge is certain, and never blocks the
// documented merge, but a text parser cannot be complete. The authoritative check is the git-level
// gate: git-merge-gate.mjs, run by git's reference-transaction hook, judges every update of an
// integration branch with judgeRefUpdate() below, whatever the shell form, and a ship this hook
// judges goes through judgeMerge(), the same verdict. This hook gives the friendly early message,
// and blocks `--no-verify` (and commit's `-n`; merge's `-n` is --no-stat) or a `core.hooksPath`
// override on a story merge or pull, or on a commit of an in-progress story merge, since the
// fallback hooks on git older than 2.28 honour it.
//
// It reads the command's `git merge` and `git pull` calls, through `cd` chains, subshells,
// control words (if, then, do, !, {), wrappers (env, nice, command, exec, sudo, time, nohup),
// `-C` forms, and any path to the git binary. Option values, command substitutions, and heredoc
// bodies are opaque, so the documented `-m "$(cat <<'EOF' ... EOF)"` message is never read as
// operands; a backslash-newline joins lines; an unquoted `#` comment is skipped, and so are
// redirections (`>`, `2>&1`, `&>`, `<<<`, ...) with their targets; a process substitution
// (`<(...)`, `>(...)`) is one computed word. A `--git-dir` naming a checkout's own `.git`, with
// any `--work-tree`, locates the repository like `-C`, resolved after every `-C`; `--work-tree`
// alone leaves discovery at the current directory. A merge or pull
// with no operand stands for the target's configured upstream, and on an integration branch with
// none it blocks. FETCH_HEAD stands for every head it lists for merging, and a head whose line
// names `branch 'pm/...'` is that story even with no local or remote ref. status, log, diff, show,
// and rev-parse before a merge move no ref and do not count as earlier ref changes. A merge into a `pm/*` branch is not a ship and is
// ignored; the target is the branch a `checkout` or `switch` earlier in the command selects, else
// HEAD's, and unknown when that checkout names a computed or unresolvable branch, or might not run
// (inside if, case, or a loop, after ||, or behind any command but a checkout in a && chain;
// later calls in its own && chain still see its branch). A story merge into an unknown target
// blocks. An
// operand is a story branch when it names `pm/*` locally or on a remote, or resolves to the tip
// of, or a commit inside, a `pm/*` branch that neither the integration branch nor its configured
// upstream already holds. Merging a named story the integration branch holds into that branch is
// a no-op and allowed, unless an earlier git command in the call can move refs. In a deliver
// project the hook blocks a computed operand (`$VAR`, `$(...)`, backticks, `-`, `@{-N}`), a story
// merge after another ref-changing git command in the same call (only a plain checkout or switch, or status, log, diff, show, or rev-parse,
// may precede it), `git pull` of a story branch, a commit short of a story tip, a tag that
// shadows a `pm/*` name, and an octopus merge of a story into the integration branch once its
// stories pass ("merge one story at a time", as the git-level gate says).
//
// Nothing the verdict rests on is read from the working tree, which the story checkout controls.
// Candidate trusted branches are main, master, the origin/HEAD target, init.defaultBranch, and any
// local non-`pm/*` branch whose committed docs/plan.md names itself as the integration branch. A
// directory is a deliver project when one of them holds docs/approval.json there; every docs/ path
// below then carries that directory's prefix. The project that owns a merge is the one the merge's
// own directory (after cd, -C, and git -C) sits in, the deepest first, else a deliver project at
// the top level. When neither resolves and nothing can be a story (no operand, or no `pm/*` tip,
// no named story operand, and no earlier ref-writing call or fetch), the merge is allowed unread. Otherwise the hook looks for deliver
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
import { fileURLToPath } from 'node:url';

// Run as the PreToolUse hook, or imported by git-merge-gate.mjs for judgeMerge().
const MAIN = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (MAIN && process.env.DELIVER_NO_ENFORCE === '1') process.exit(0);

let lib;
try { lib = await import('./lib.mjs'); } catch (e) { if (MAIN) process.exit(0); throw e; }
const { readHookInput, parseExec, git, chomp, deliverVersion, versionAtLeast, oneLine } = lib;

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
// substitutions, heredoc bodies, and comments (a # starting a word, to the end of its line)
// inside are skipped whole. A # right after `)`, as in `$(x)#y`, or after an escaped space is
// part of a word.
function skipSubst(cmd, i) {
  let depth = 1;
  let pending = [];
  for (let j = i + 1; j < cmd.length; j++) {
    const c = cmd[j];
    if (c === '#' && /[\s;&|(]/.test(cmd[j - 1]) && cmd[j - 2] !== '\\') { const nl = cmd.indexOf('\n', j); j = (nl < 0 ? cmd.length : nl) - 1; } else if (c === '\\') j++;
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
// substitution and any heredoc body are swallowed whole into their word or skipped. An unquoted
// comment, a # starting a word up to the end of its line, is skipped as the shell skips it, and so
// are redirections with their targets, wherever they sit in the command. A process substitution,
// `<(...)` or `>(...)`, is one computed word. Each segment carries `before`, the separator text
// that precedes it (`&&`, `||`, `;`, `|`, a newline, a bracket), so a caller can tell whether it
// runs only when an earlier command succeeded or failed.
function tokenize(cmd) {
  const items = [];
  let seg = [];
  let word = null;
  let pending = [];
  let sep = '';
  // dropNext: the next whole word is a redirection's target, never an argument.
  let dropNext = false;
  const add = (s, dyn = false) => { word = word ?? { text: '', dynamic: false }; word.text += s; word.dynamic ||= dyn; };
  const push = () => { if (word !== null) { if (dropNext) dropNext = false; else seg.push(word); word = null; } };
  const end = () => { push(); dropNext = false; if (seg.length) { seg.before = sep; sep = ''; items.push(seg); } seg = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === '#' && word === null) {
      // An unquoted # at the start of a word comments out the rest of the line; the newline
      // still ends the segment.
      const nl = cmd.indexOf('\n', i);
      i = (nl < 0 ? cmd.length : nl) - 1;
    } else if (c === "'") {
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
    } else if ((c === '<' || c === '>') && cmd[i + 1] === '(') {
      // A process substitution is a computed word (a file name), never a redirection.
      const close = skipSubst(cmd, i + 1);
      add(cmd.slice(i, close + 1), true);
      i = close;
    } else if (c === '<' || c === '>' || (c === '&' && cmd[i + 1] === '>')) {
      // A redirection, with any file descriptor glued before it (`2>`), and its target are not
      // words of the command: `>`, `>>`, `>|`, `<`, `<>`, `&>`, `&>>`, `N>&M`, `N<&-`, `<<<`.
      if (c !== '&' && word !== null && !word.dynamic && /^\d+$/.test(word.text)) word = null;
      else push();
      const j = c === '&' ? i + 1 : i;
      const m = cmd.slice(j).match(/^(<<<|<>|<&|>>|>\||>&|<|>)/);
      i = j + m[0].length - 1;
      dropNext = true;
    } else if (/[;&|()\n]/.test(c)) {
      end();
      sep += c;
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
const COMMIT_OPTS_WITH_VALUE = new Set(['-m', '-F', '-C', '-c', '-t', '--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup']);

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

// Words that open and close a compound command whose body may not run.
const BLOCK_OPEN = new Set(['if', 'while', 'until']);
const BLOCK_HEAD = new Set(['for', 'case', 'select']);
const BLOCK_CLOSE = new Set(['fi', 'done', 'esac']);

// gitCalls(cmd, cwd): every git invocation in order, as { dir, gitDir, sub, args, ops, bare,
// noVerify, cond, chainOk, chain }. dir is where git runs after any preceding cd and its -C,
// --work-tree, and --git-dir options, or UNKNOWN; gitDir the --git-dir given, or null; ops the
// operands that merge, for `merge` and `pull` only; bare when such a call names none and is no
// control form; noVerify when the call skips git hooks (--no-verify, merge's -n, or a
// core.hooksPath override). cond is set when the call might not run: inside if, case, while,
// until, for, or select, after ||, or in a && chain behind a command other than an unconditional
// checkout or switch. chain numbers the && chain the call sits in; chainOk, for a conditional call,
// says a later call in the same chain runs only when this one did (false after ||).
function gitCalls(cmd, cwd) {
  const out = [];
  const stack = [];
  let cur = cwd;
  let depth = 0;
  let chain = 0;
  // prev: the previous segment in the current chain, as { checkout, cond }.
  let prev = null;
  for (const item of tokenize(cmd)) {
    if (item.op) {
      chain++;
      prev = null;
      if (item.op === '(') { stack.push(cur); continue; }
      // A cd inside a subshell or substitution is not tracked past its close.
      if (stack.length && stack.pop() !== cur) cur = UNKNOWN;
      continue;
    }
    const seg = item;
    const before = seg.before ?? '';
    if (before !== '&&') { chain++; prev = null; }
    for (let k = 0; k < seg.length && CONTROL.has(seg[k].text); k++) if (BLOCK_OPEN.has(seg[k].text)) depth++;
    let i = commandStart(seg);
    const head = seg[i]?.text;
    if (BLOCK_HEAD.has(head)) depth++;
    if (BLOCK_CLOSE.has(head)) depth = Math.max(0, depth - 1);
    const orCond = before.includes('||');
    const cond = depth > 0 || orCond || (before === '&&' && (!prev || !prev.checkout || prev.cond));
    const isCheckout = Boolean(head && isGit(head) && /^(checkout|switch)$/.test(seg[gitSubIndex(seg, i)]?.text ?? ''));
    prev = { checkout: isCheckout, cond };
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
    // --git-dir and --work-tree are read after every -C: git resolves a relative one against the
    // directory it ends up in.
    const repo = {};
    let hooksOff = false;
    for (i++; i < seg.length && seg[i].text.startsWith('-'); i++) {
      const w = seg[i].text;
      const eq = w.indexOf('=');
      const opt = eq < 0 ? w : w.slice(0, eq);
      if (w === '-C') { const v = seg[++i]; dir = v ? into(dir, v) : UNKNOWN; } else if (w.startsWith('-C')) dir = into(dir, { text: w.slice(2), dynamic: seg[i].dynamic });
      else if (GIT_REPO_OPTS.has(opt)) repo[opt] = eq < 0 ? seg[++i] ?? null : { text: w.slice(eq + 1), dynamic: seg[i].dynamic };
      else if (w === '-c' || opt === '--config-env') {
        // A core.hooksPath override points git away from the installed merge gate.
        const v = w === '-c' || eq < 0 ? seg[++i] : { text: w.slice(eq + 1) };
        if (v && /^core\.hookspath(=|$)/i.test(v.text)) hooksOff = true;
      } else if (GIT_OPTS_WITH_VALUE.has(w)) i++;
    }
    const at = (v) => (v ? into(dir, v) : UNKNOWN);
    // --work-tree names the checkout only beside --git-dir; alone, git still discovers the
    // repository from the current directory. --git-dir alone names a checkout only as its .git
    // directory. The main loop checks that the checkout's own git directory is the one named.
    const gitDir = Object.hasOwn(repo, '--git-dir') ? at(repo['--git-dir']) : null;
    if (gitDir !== null && Object.hasOwn(repo, '--work-tree')) dir = at(repo['--work-tree']);
    else if (gitDir !== null) dir = gitDir !== UNKNOWN && path.basename(gitDir) === '.git' ? path.dirname(gitDir) : UNKNOWN;
    const sub = seg[i]?.text ?? '';
    const args = seg.slice(i + 1);
    const merging = sub === 'merge' || sub === 'pull' ? operands(sub, args) : null;
    const noVerify = hooksOff || ((sub === 'merge' || sub === 'pull' || sub === 'commit') && skipsHooks(sub, args));
    out.push({ dir, gitDir, sub, args, ops: merging && merging.ops, bare: Boolean(merging && merging.bare), noVerify, cond, chainOk: !orCond, chain });
  }
  return out;
}

// gitSubIndex(seg, i): the index of the subcommand of the git call whose command word is at i.
function gitSubIndex(seg, i) {
  for (i++; i < seg.length && seg[i].text.startsWith('-'); i++) {
    const w = seg[i].text;
    if (w === '-C' || GIT_OPTS_WITH_VALUE.has(w) || GIT_REPO_OPTS.has(w)) i++;
  }
  return i;
}

// skipsHooks(sub, args): the call skips the pre-merge-commit or pre-commit hook: --no-verify, or
// commit's -n (alone or in a cluster of short flags), unless a later --verify undoes it. For merge
// and pull, -n is --no-stat.
function skipsHooks(sub, args) {
  const withValue = sub === 'merge' ? MERGE_OPTS_WITH_VALUE : sub === 'pull' ? PULL_OPTS_WITH_VALUE : COMMIT_OPTS_WITH_VALUE;
  let skip = false;
  for (let k = 0; k < args.length; k++) {
    const w = args[k].text;
    if (w === '--') break;
    if (w === '--no-verify') skip = true;
    else if (w === '--verify') skip = false;
    else if (withValue.has(w)) k++;
    else if (sub === 'commit' && /^-[A-Za-z]+$/.test(w)) {
      // In a cluster, a letter that takes a value swallows the rest: -nm msg skips, -mn is a message.
      for (const ch of w.slice(1)) {
        if (ch === 'n') { skip = true; break; }
        if (withValue.has(`-${ch}`)) break;
      }
    }
  }
  return skip;
}

// operands(sub, args): { ops, bare }: the words that merge, none for a merge --abort and its kin,
// and bare when there are none and no control form, so git merges the configured upstream.
function operands(sub, args) {
  const withValue = sub === 'merge' ? MERGE_OPTS_WITH_VALUE : PULL_OPTS_WITH_VALUE;
  const positional = [];
  let options = true;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (options && w.text === '--') options = false;
    else if (options && MERGE_CONTROL.has(w.text)) return { ops: [], bare: false };
    else if (options && withValue.has(w.text)) i++;
    // `-` and `@{-N}` name the previously checked-out branch, which the shell state decides.
    else if (w.text === '-' || /@\{-\d+\}/.test(w.text)) positional.push({ ...w, dynamic: true });
    else if (!options || !w.text.startsWith('-')) positional.push(w);
  }
  // A pull's first operand is the remote; each further one is a refspec whose source merges.
  const ops = sub === 'pull' ? positional.slice(1).map((w) => ({ ...w, text: w.text.replace(/^\+/, '').split(':')[0] })) : positional;
  return { ops, bare: !ops.length };
}

// upstreamOf(root, branch): the configured upstream a bare merge or pull on branch merges, as
// { text, local }: a local branch name when the upstream's remote is `.`, else the
// remote-tracking name; null when none is configured.
function upstreamOf(root, branch) {
  const name = chomp(git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`]) || '');
  if (!name || name === '@{upstream}') return null;
  const remote = chomp(git(root, ['config', '--get', `branch.${branch}.remote`]) || '');
  return { text: name, dynamic: false, upstream: true, local: remote === '.' };
}

// checkoutOf(args): what a checkout or switch selects, as { create, name, detach, prev, paths,
// force, dynamic }; dynamic when the shell computes the branch it selects: the new branch's name
// when it creates one, else the branch it names. A computed start point leaves the target known.
function checkoutOf(sub, args) {
  const out = { create: null, name: null, detach: false, prev: false, paths: false, force: false, dynamic: false };
  let createDynamic = false;
  let nameDynamic = false;
  let options = true;
  for (let i = 0; i < args.length; i++) {
    const w = args[i].text;
    // For checkout, -- introduces paths. For switch, which takes no paths, it only ends the
    // options: the next word is still the branch.
    if (!options) { if (out.name === null && out.create === null) { out.name = w; nameDynamic = args[i].dynamic; } continue; }
    if (w === '--' && sub === 'switch') { options = false; continue; }
    // `git checkout main --` with nothing after the -- still switches branches.
    if (w === '--') { out.paths = i + 1 < args.length; break; }
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
const sanitize = (s) => oneLine(s).slice(0, 80);
const resolve = (root, rev) => chomp(git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]) || '');
const contains = (root, ancestor, of) => git(root, ['merge-base', '--is-ancestor', ancestor, of]) !== null;

function refFor(root, name) {
  for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) if (resolve(root, ref)) return ref;
  return null;
}

// The plan parsers live in lib.mjs, shared with scripts/retro-stats.mjs.
export const { planEntry, validBranchName, planName } = lib;

// project(root, prefixes): the deliver project at the deepest of `prefixes` (each "" or a
// "dir/" path below the top level) that a trusted branch marks; null when none does. Else the
// integration branch as { name, ref, prefix }, ref null when it resolves nowhere, or
// { error, names, prefix } when the plans disagree.
export function project(root, prefixes = ['']) {
  for (const prefix of prefixes) {
    const found = projectAt(root, prefix);
    if (found) return { ...found, prefix };
  }
  return null;
}

// baseBranches(root): the branch names every project may trust without its plan's say-so: main,
// master, origin/HEAD's target, and init.defaultBranch.
export function baseBranches(root) {
  const originHead = chomp(git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']) || '');
  return ['main', 'master', originHead.startsWith('refs/remotes/origin/') ? originHead.slice('refs/remotes/origin/'.length) : '', chomp(git(root, ['config', '--get', 'init.defaultBranch']) || '')]
    .filter((n) => n && !n.startsWith('pm/'));
}

const localBranches = (root) => (git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']) || '').split(/\r?\n/).filter(Boolean);

export function projectAt(root, prefix) {
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
    const entry = c.approved ? planEntry(git(root, ['show', `${c.ref}:${prefix}docs/plan.md`])) : null;
    c.plan = entry && lib.branchNameOk(root, entry) ? entry : null;
    c.invalid = entry && !c.plan ? entry : null;
  }
  const approved = cands.filter((c) => c.approved);
  if (!approved.length) return null;
  const invalid = approved.find((c) => c.invalid);
  if (invalid) return { names: [invalid.invalid], invalid: invalid.invalid, error: `integration branch ${sanitize(invalid.invalid)} in ${prefix}docs/plan.md is not a valid branch name; story merges are refused until the plan names a valid branch` };
  const names = [...new Set(approved.map((c) => c.plan).filter(Boolean))];
  if (names.length > 1) return { names, error: `the committed plans on ${approved.filter((c) => c.plan).map((c) => c.name).join(', ')} disagree on the integration branch (${names.join(', ')}); make ${prefix}docs/plan.md agree` };
  const name = names[0] ?? approved[0].name;
  return { name, ref: refFor(root, name) };
}

function currentBranch(root) {
  return chomp(git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || '') || null;
}

// remotes(root): the configured remote names, longest first (a name may hold a slash); read once per
// repository per process (a hook is one short process).
const remoteNames = new Map();
function remotes(root) {
  if (!remoteNames.has(root)) remoteNames.set(root, (git(root, ['remote']) || '').split(/\r?\n/).filter(Boolean).sort((a, b) => b.length - a.length));
  return remoteNames.get(root);
}

// branchesOf(ref, names): every branch name a ref can be read as: refs/heads/<b>, or, for
// refs/remotes/<remote>/<b>, one reading per configured remote name in `names` that fits (a name
// may hold a slash, and names may overlap, `a` and `a/pm`), plus the first path segment as the
// remote. A ref no configured remote fits (a leftover of a removed remote, whose name may have held
// a slash) is read at every slash. A remote whose own name ends in `/pm` therefore reads every
// branch on it as a story: rare, and it fails closed. [] for any other ref.
function branchesOf(ref, names) {
  if (ref.startsWith('refs/heads/')) return [ref.slice('refs/heads/'.length)];
  if (!ref.startsWith('refs/remotes/')) return [];
  const rest = ref.slice('refs/remotes/'.length);
  const out = names.filter((r) => rest.startsWith(`${r}/`)).map((r) => rest.slice(r.length + 1));
  if (out.length) {
    if (rest.includes('/')) out.push(rest.slice(rest.indexOf('/') + 1));
  } else {
    for (let i = rest.indexOf('/'); i !== -1; i = rest.indexOf('/', i + 1)) out.push(rest.slice(i + 1));
  }
  return [...new Set(out.filter(Boolean))];
}
// storyName(ref, names): the pm/* branch a ref is a story as, under any reading (failing closed:
// one pm/ reading is enough), or null.
const storyName = (ref, names) => branchesOf(ref, names).find((b) => b.startsWith('pm/')) ?? null;

function pmTips(root) {
  const refs = git(root, ['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads/pm/', 'refs/remotes/']) || '';
  const names = remotes(root);
  const out = [];
  for (const line of refs.split(/\r?\n/)) {
    const [oid, ref] = line.split(' ');
    for (const name of ref ? branchesOf(ref, names) : []) if (name.startsWith('pm/')) out.push({ name, tip: oid });
  }
  return out;
}

// integrationRefs(root, integ): the trusted copies of the integration branch: its ref, and, only
// when `branch.<name>.merge` is `refs/heads/<name>`, the remote-tracking refs of that branch on its
// configured remote: exactly `refs/remotes/<branch.<name>.remote>/<name>` (a remote name may hold
// a slash), and the ref the remote's fetch refspec maps it to (the branch's `%(upstream)`). An
// upstream set to a `pm/*` branch or any other branch proves nothing, and nor does a same-named
// branch on any other remote, a fork's for example.
function integrationRefs(root, integ) {
  const refs = [integ.ref];
  if (resolve(root, `refs/heads/${integ.name}`)) {
    const merge = chomp(git(root, ['config', '--get', `branch.${integ.name}.merge`]) || '');
    const remote = chomp(git(root, ['config', '--get', `branch.${integ.name}.remote`]) || '');
    if (merge === `refs/heads/${integ.name}` && remote && remote !== '.') {
      refs.push(`refs/remotes/${remote}/${integ.name}`);
      const upstream = chomp(git(root, ['for-each-ref', '--format=%(upstream)', `refs/heads/${integ.name}`]) || '');
      if (upstream.startsWith('refs/remotes/')) refs.push(upstream);
    }
  }
  // A remote ref that also reads as a story branch (overlapping remote names) is never trusted.
  const names = remotes(root);
  return [...new Set(refs.filter((r) => r && resolve(root, r) && (r.startsWith('refs/heads/') || !storyName(r, names))))];
}

// noTracking(root, branch): the integration branch has no upstream (branch.<branch>.merge) while
// remotes exist, so a pull's trust rests on binding it to the pull's own operation.
export function noTracking(root, branch) {
  return remotes(root).length > 0 && !chomp(git(root, ['config', '--get', `branch.${branch}.merge`]) || '');
}

// storyReadableUpstream(root, branch): the configured upstream of `branch`, when integrationRefs
// leaves it untrusted because it also reads as a story branch; else null. For --check to report.
export function storyReadableUpstream(root, branch) {
  if (chomp(git(root, ['config', '--get', `branch.${branch}.merge`]) || '') !== `refs/heads/${branch}`) return null;
  const upstream = chomp(git(root, ['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]) || '');
  return upstream.startsWith('refs/remotes/') && storyName(upstream, remotes(root)) ? upstream : null;
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

// fetchHeads(root): the heads FETCH_HEAD lists for merging, every line not marked not-for-merge,
// as `git merge FETCH_HEAD` merges them all: { heads: [{ sha, name }], bad }, name the branch the
// line's `branch '<name>' of <url>` part names, or null, and url that line's url; bad when a line
// marked for merge does not parse. null when FETCH_HEAD cannot be read.
// readGitPath(root, rel): the text of `git rev-parse --git-path <rel>`; null when it cannot be read
// (missing included), or, with { missing: '' }, that value for a missing file.
function readGitPath(root, rel, { missing = null } = {}) {
  const where = chomp(git(root, ['rev-parse', '--git-path', rel]) || '');
  if (!where) return null;
  try { return fs.readFileSync(path.resolve(root, where), 'utf8'); } catch (e) { return e.code === 'ENOENT' ? missing : null; }
}

export function fetchHeads(root) {
  const text = readGitPath(root, 'FETCH_HEAD');
  if (text === null) return null;
  const heads = [];
  let bad = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const [sha, mark = '', desc = ''] = line.split('\t');
    if (mark === 'not-for-merge') continue;
    if (!/^[0-9a-f]{40,64}$/.test(sha || '') || mark !== '') { bad = true; continue; }
    const m = desc.match(/^branch '(.+)' of (.+)$/);
    heads.push({ sha, name: m?.[1] ?? null, url: m?.[2] ?? null });
  }
  return { heads, bad };
}

// mergeHeads(root): the commits MERGE_HEAD lists, the ones an in-progress merge brings in; [] when
// no merge is in progress, null when it cannot be read.
export function mergeHeads(root) {
  const text = readGitPath(root, 'MERGE_HEAD', { missing: '' });
  if (text === null) return null;
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function storyBranches(root, op, integ, target) {
  // FETCH_HEAD resolves to its first line alone, but git merges every head marked for merge. A
  // head whose line names a pm/* branch is that story, with or without a local or remote ref.
  if (op === 'FETCH_HEAD') {
    const fetched = fetchHeads(root);
    if (fetched === null) return pmTips(root).length ? { reason: 'FETCH_HEAD cannot be read, so the heads it merges cannot be checked; merge the fetched branch by name' } : { branches: [] };
    if (fetched.bad) return { reason: 'FETCH_HEAD has a line the gate cannot read, so the heads it merges cannot be checked; merge the fetched branch by name' };
    const branches = [];
    const addBranch = (b) => { if (!branches.some((x) => x.name === b.name)) branches.push(b); };
    for (const { sha, name } of fetched.heads) {
      if (name && name.startsWith('pm/')) {
        const commit = resolve(root, sha);
        if (!commit) return { reason: `FETCH_HEAD lists ${name} at ${sha.slice(0, 12)}, which this repository does not hold, so it cannot be judged; fetch it again` };
        if (integ.ref && integrationRefs(root, integ).some((r) => contains(root, commit, r))) continue;
        addBranch({ name, tip: commit });
        continue;
      }
      const found = storyBranches(root, sha, integ, target);
      if (found.reason) return found;
      for (const b of found.branches || []) addBranch(b);
    }
    return { branches };
  }
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

// spawnGit(root, args, { input, env }): git's raw spawnSync result, with the one set of options
// every caller here shares: a large buffer (a monorepo's whole tree fits), a 10 s timeout, stdin
// only when `input` is given, and stderr ignored.
export function spawnGit(root, args, { input, env } = {}) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 256 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
    ...(input === undefined ? {} : { input }),
    ...(env ? { env } : {}),
  });
}

// listing(root, args): git's NUL-delimited path output (-z) as an array, unquoted whatever
// core.quotePath says; null on failure.
function listing(root, args) {
  const r = spawnGit(root, args);
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

// Set when merge-tree failed on a git older than 2.38, so the deny can say why.
let oldGit = null;

// olderThan238(root): this git's version as "X.Y" when older than 2.38, else null.
function olderThan238(root) {
  const v = (chomp(git(root, ['version']) || '').match(/(\d+)\.(\d+)/) || []).slice(1).map(Number);
  return v.length === 2 && (v[0] < 2 || (v[0] === 2 && v[1] < 38)) ? v.join('.') : null;
}

// mergeTreeWorks(root): this git can run `git merge-tree --write-tree` (git 2.38 or newer), which
// the merged-tree check needs; probed on HEAD when it resolves. Reads no module state.
export function mergeTreeWorks(root) {
  if (olderThan238(root)) return false;
  if (!resolve(root, 'HEAD')) return true;
  const r = spawnGit(root, ['merge-tree', '--write-tree', 'HEAD', 'HEAD']);
  return !r.error && (r.status === 0 || r.status === 1);
}

// isHandoff(p, prefix): p is a handoff note of the project at prefix ("" or "dir/").
const isHandoff = (p, prefix) => p.startsWith(`${prefix}docs/handoff/`) && /^[^/]+\.md$/.test(p.slice(`${prefix}docs/handoff/`.length));
// onlyRecords(list, file, prefix): every path in the list is the story file, or, when prefix is
// given, a handoff note of the project there. Both may be lists: a story several projects claim
// has a story file and handoff notes in each.
const onlyRecords = (list, file, prefix = null) => list.every((p) => [file].flat().includes(p) || (prefix !== null && [prefix].flat().some((x) => isHandoff(p, x))));

// mergeMatches(root, commit, parents, file): true when a merge commit's tree is the automatic
// merge of its two parents, apart from the story file; null when this git has no
// `git merge-tree --write-tree` (older than 2.38, or a usage error, exit 129).
function mergeMatches(root, commit, parents, file) {
  if (parents.length !== 2) return false;
  const r = spawnGit(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', parents[0], parents[1]]);
  if (r.error || (r.status !== 0 && r.status !== 1)) { oldGit = olderThan238(root); return oldGit || r.status === 129 ? null : false; }
  const [tree, ...conflicted] = r.stdout.split('\0').filter(Boolean);
  if (!/^[0-9a-f]{40,64}$/.test(tree || '') || !conflicted.every((p) => [file].flat().includes(p))) return false;
  const diff = listing(root, ['diff', NO_SUBMODULE_IGNORE, '-z', '--name-only', tree, commit, '--']);
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
    const changed = listing(root, ['diff-tree', NO_SUBMODULE_IGNORE, '-z', '--root', '--name-only', '--no-commit-id', '-r', commit]);
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
  if (!claim) return `no story on ${integ.name} claims ${branch} in ${prefix}docs/stories; claim it per state.md before merging`;
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
  // A story several projects claim may record its verdicts in each claimant's story file.
  const records = integ.records ?? file;
  const notes = integ.notes ?? prefix;
  if (!afterVerdict(root, sha, tip, integ.ref, records, notes)) return staleReason('verifier PASS', sha, branch, tip, 're-verify');
  if (tier === 'T1' || tier === 'T2') {
    const ig = atCommit(exec.integrity, 'pass');
    if (!ig) return `${file} is tier ${tier} and records integrity ${sanitize(exec.integrity ?? 'unset')}, not "pass <sha>"`;
    if (!afterVerdict(root, ig[2].toLowerCase(), tip, integ.ref, records, notes)) return staleReason('integrity pass', ig[2], branch, tip, 're-run test-integrity.mjs');
  }
  return null;
}

// A block ends the judgement: the PreToolUse entry point reports it and exits 2.
class Blocked {
  constructor(what, reason) { this.what = what; this.reason = reason; }
}
function block(what, reason) {
  throw new Blocked(what, reason);
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
export function discover(root) {
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

// ownGitDir(dir, gitDir): whether gitDir is the git directory of the checkout at dir.
function ownGitDir(dir, gitDir) {
  if (gitDir === UNKNOWN) return false;
  const actual = chomp(git(dir, ['rev-parse', '--absolute-git-dir']) || '');
  try { return Boolean(actual) && fs.realpathSync(actual) === fs.realpathSync(gitDir); } catch { return false; }
}

// candidates(lists): the prefixes in priority order, each once, ending with the top level.
const candidates = (...lists) => [...new Set([...lists.flat(), ''])];

const DYNAMIC = 'the shell computes this operand, so the gate cannot see which branch merges; name the branch literally';
const SEPARATE = 'an earlier git command in the same call can move the refs this merge reads; run the merge as its own command';

const NO_VERIFY = "--no-verify skips deliver's merge gate; run the merge without it (a core.hooksPath override does the same)";
const UNKNOWN_TARGET = 'the branch this merge goes into is unknown: a checkout before it might not run, or names a computed or unresolvable branch; check out the integration branch as its own command, or in the same && chain as the merge';

// judgeCommand(calls, sessionDir): throws Blocked for the first call that must not run. git calls
// return null on failure, so nothing here should otherwise throw; if something does, the caller
// fails open like every deliver hook rather than wedging the session.
function judgeCommand(calls, sessionDir) {
  const targets = new Map();
  // chainTargets: per repository, a conditional checkout's branch, which holds for later calls in
  // its own && chain, as { chain, value }.
  const chainTargets = new Map();
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
  // earlierChange: an earlier git call may move refs (anything but a plain checkout or switch, or a read-only status, log, diff, show, or rev-parse).
  // earlierWrite: an earlier git call may write refs outright (anything but readsOnly).
  let earlierChange = false;
  let earlierWrite = false;
  // earlierFetch: an earlier git call is a fetch, which can bring in pm/* and remote-tracking refs.
  let earlierFetch = false;
  for (const call of calls) {
    const { sub, args, ops, bare } = call;
    // A --git-dir that is not the checkout's own git directory leaves the repository unknown.
    const dir = call.gitDir !== null && call.dir !== UNKNOWN && !ownGitDir(call.dir, call.gitDir) ? UNKNOWN : call.dir;
    if (sub === 'checkout' || sub === 'switch') {
      const co = checkoutOf(sub, args);
      if (co.force) { earlierChange = true; earlierWrite = true; }
      const root = rootOf(dir);
      if (!root || co.paths) continue;
      // A computed or unresolvable branch leaves the target unknown, and a story merge under an
      // unknown target blocks.
      let value;
      if (co.dynamic) value = UNKNOWN;
      else if (co.create) value = co.create;
      else if (co.detach) value = null;
      else if (co.prev) value = UNKNOWN;
      else if (co.name && (resolve(root, `refs/heads/${co.name}`) || resolve(root, `refs/remotes/origin/${co.name}`))) value = co.name;
      else if (co.name && resolve(root, co.name)) value = null;
      else if (co.name) value = UNKNOWN;
      if (value === undefined) continue;
      // A checkout that might not run leaves the target unknown, except for later calls in its own
      // && chain, which run only when it did.
      if (call.cond) {
        targets.set(root, UNKNOWN);
        if (call.chainOk) chainTargets.set(root, { chain: call.chain, value });
        else chainTargets.delete(root);
      } else {
        targets.set(root, value);
        chainTargets.delete(root);
      }
      continue;
    }
    if (!ops) {
      // A commit of an in-progress story merge that skips hooks skips the git-level gate.
      if (sub === 'commit' && call.noVerify && dir !== UNKNOWN) {
        const root = rootOf(dir);
        const heads = root ? mergeHeads(root) : null;
        if (heads?.length && judgeMerge(root, { target: currentBranch(root), commits: heads }).story) block('(commit of an in-progress merge)', NO_VERIFY);
      }
      // status, log, diff, show, and rev-parse move no ref, so a merge after them is judged as
      // if alone.
      if (READ_ONLY.has(sub)) continue;
      earlierChange = true;
      if (!readsOnly(sub, args)) earlierWrite = true;
      if (sub === 'fetch') earlierFetch = true;
      continue;
    }
    const prior = earlierChange;
    const priorWrite = earlierWrite;
    const priorFetch = earlierFetch;
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
    const ct = chainTargets.get(root);
    const target = ct && ct.chain === call.chain ? ct.value : targets.has(root) ? targets.get(root) : currentBranch(root);
    // Merging into a story branch, such as the integration tip into it, is not a ship.
    if (typeof target === 'string' && target.startsWith('pm/')) continue;
    // A bare merge or pull merges the target's configured upstream: judge that. With none to
    // read, a bare merge onto a deliver project's integration branch, or onto a target the gate
    // cannot name, blocks rather than guess.
    // The project that owns the merge is the one the merge's own directory sits in, else a deliver
    // project at the top level. Outside every project, in a repository holding any, a story-like
    // operand blocks: the gate does not guess which project ships it.
    const integ = project(root, candidates(prefixesOf(root, dir)));
    if (bare) {
      const up = typeof target === 'string' ? upstreamOf(root, target) : null;
      if (up) ops.push(up);
      else if (target !== null && integ && (target === UNKNOWN || integ.error || target === integ.name)) block('(no operand)', `it merges ${target === UNKNOWN ? 'the target branch' : target}'s upstream, which the gate cannot resolve; name the branch to merge explicitly`);
    }
    if (!integ) {
      // Nothing to merge, or no pm/* tip and no named story with no earlier ref-writing call or
      // fetch (either could bring in a pm/* tip): nothing here can block, so the repository is not
      // listed.
      if (!ops.length) continue;
      const tips = pmTips(root);
      if (!tips.length && !ops.some(namedStory) && !priorWrite && !priorFetch) continue;
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
    if (call.noVerify && ops.some(namedStory)) block(ops.find(namedStory).text, NO_VERIFY);
    if (sub === 'pull') {
      // A local upstream (remote `.`) is read now and judged like a merge; a remote one can move
      // in the pull's own fetch.
      const pm = ops.find((o) => looksPm(o.text) && !o.local);
      if (pm) block(pm.text, 'git pull merges a story branch commit the gate cannot see before the fetch; git fetch, then git merge the fetched ref in a separate command');
      if (!ops.some((o) => o.local)) continue;
    }
    // An octopus merge of a story into the integration branch is refused once every story in it
    // passes, so a missing verdict is the reason given first; the git-level gate agrees.
    let octopus = null;
    for (const op of ops) {
      const found = integ.error ? { branches: [] } : storyBranches(root, op.text, integ, target);
      // A no-op judged on refs an earlier command may move is no judgement; fall through to SEPARATE.
      if (found.noop && !prior) continue;
      const story = Boolean(found.reason || found.branches.length || namedStory(op));
      if (!story) continue;
      if (call.noVerify) block(op.text, NO_VERIFY);
      if (prior) block(op.text, SEPARATE);
      if (target === UNKNOWN) block(op.text, UNKNOWN_TARGET);
      if (integ.error) block(op.text, integ.error);
      if (found.reason) block(op.text, found.reason);
      // A ship into the project's integration branch is judged by judgeMerge, the git-level gate's
      // own verdict; a story merged into any other branch keeps the directory project's verdict.
      if (found.branches.length && target === integ.name) {
        const v = judgeMerge(root, { target, commits: found.branches.map((b) => b.tip), prefixes: candidates(prefixesOf(root, dir)) });
        if (!v.allow) block(v.what ?? op.text, v.why ?? v.reason);
        if (ops.length > 1) octopus ??= op.text;
        continue;
      }
      for (const { name, tip } of found.branches) {
        const reason = verdictFor(root, name, tip, integ);
        if (reason) block(name, reason);
      }
    }
    if (octopus) block(octopus, ONE_AT_A_TIME);
  }
}

// ---- the merge git is making ----

const ALLOW = (reason, story = false, judged = []) => ({ allow: true, reason, story, judged });
const DENY = (reason, what = null) => ({ allow: false, reason: what ? `${what}: ${reason}` : reason, what, why: reason, story: true, judged: [] });
const ZERO = /^0+$/;
const MERGE_DIFFERS = 'the merge result differs from the verified automatic merge; re-verify';
export const ONE_AT_A_TIME = 'an octopus merge brings in several stories at once, and the merged-tree check compares two-parent merges only; merge one story at a time';

// storiesOf(root, commit, integ, { strictFetch }): the pm/* branches a merged commit stands for, as
// { branches: [{ name, tip }] }, or { reason } when it must be refused: the tip of a pm/* branch
// here or on a remote, or a head FETCH_HEAD names as a pm/* branch; refused when it sits inside a
// pm/* tip short of it, or, with strictFetch (the default), when FETCH_HEAD has a line that does
// not parse, since that head could be a story. A commit the integration branch or a trusted copy
// of it holds is no story.
function storiesOf(root, commit, integ, { strictFetch = true } = {}) {
  const full = resolve(root, commit);
  if (!full) return { reason: `${sanitize(commit)} does not resolve to a commit, so the merge cannot be judged` };
  if (integ.ref && integrationRefs(root, integ).some((r) => contains(root, full, r))) return { branches: [] };
  const tips = pmTips(root);
  const names = new Set(tips.filter((t) => t.tip === full).map((t) => t.name));
  const fetched = fetchHeads(root);
  for (const h of fetched?.heads ?? []) if (h.sha === full && h.name?.startsWith('pm/')) names.add(h.name);
  if (names.size) return { branches: [...names].map((name) => ({ name, tip: full })) };
  if (fetched?.bad && strictFetch) return { reason: 'FETCH_HEAD has a line the gate cannot read, so the heads it merges cannot be checked; fetch again, or delete FETCH_HEAD' };
  const holder = tips.find((t) => contains(root, full, t.tip));
  if (holder) return { reason: `${full.slice(0, 12)} is part of ${holder.name} short of its tip, which carries the verdict; merge the branch itself` };
  return { branches: [] };
}

// integrationProjects(root, branch, prefixes): the deliver projects whose trusted integration
// branch is `branch`, as { projects: [{ name, ref, prefix, error? }], failed }: every project
// discover() finds, and the projects at `prefixes` (the merge's own directory, deepest first).
function integrationProjects(root, branch, prefixes = []) {
  const disc = discover(root);
  const dirs = [...new Set([...prefixes, ...disc.found.map((d) => (d === '.' ? '' : `${d}/`))])];
  const projects = [];
  for (const prefix of dirs) {
    const p = projectAt(root, prefix);
    if (p && (p.name === branch || p.names?.includes(branch))) projects.push({ ...p, prefix });
  }
  return { projects, failed: disc.failed };
}

// judgeStories(root, branch, commits, { prefixes, info, strictFetch }): the verdict on story
// commits merged into `branch`; judged lists each story allowed as { name, tip, file, prefix, files, prefixes }, once
// per claim. A story several projects claim is judged in each, and any refusal refuses it ("verify
// it in each or rename the branch"); its verdicts may be recorded in every claimant's story file.
// A story one project claims is judged there; with no claim anywhere, the first project in the
// order of the merge's own directory (`prefixes`, deepest first), the top level, then the rest
// (sorted), whose verdict is "no story claims". The git-level gate has no directory, so the top
// level comes first. strictFetch is storiesOf's.
function judgeStories(root, branch, commits, { prefixes = [], info, strictFetch = true } = {}) {
  const { projects, failed } = info ?? integrationProjects(root, branch, prefixes);
  if (!projects.length && !(failed && baseBranches(root).includes(branch))) return ALLOW(`${branch} is no deliver project's integration branch`);
  const integ = { name: branch, ref: refFor(root, branch), prefix: '' };
  const judged = [];
  let story = false;
  for (const commit of commits) {
    const found = storiesOf(root, commit, integ, { strictFetch });
    if (found.reason) return DENY(found.reason);
    for (const { name, tip } of found.branches) {
      story = true;
      if (!projects.length) return DENY(`cannot establish which deliver project ships ${name}: the repository listing failed`, name);
      const order = [...new Set([...prefixes, '', ...projects.map((p) => p.prefix)])].map((x) => projects.find((p) => p.prefix === x)).filter(Boolean);
      const claims = order.map((x) => ({ p: x, claim: !x.error && x.ref ? claimOf(root, x.ref, name, x.prefix) : null })).filter((c) => c.claim);
      // A story several projects claim is judged in each; else the one claimant, or the first
      // project in order, whose verdict is "no story claims".
      if (claims.length > 1) {
        const records = claims.map((c) => c.claim.file);
        const notes = claims.map((c) => c.p.prefix);
        for (const { p } of claims) {
          const reason = verdictFor(root, name, tip, { ...p, records, notes });
          if (reason) return DENY(`${reason}; ${claims.length === 2 ? 'two' : String(claims.length)} projects claim this story; verify it in each or rename the branch`, name);
        }
        for (const { p, claim } of claims) judged.push({ name, tip, file: claim.file, prefix: p.prefix, files: records, prefixes: notes });
        continue;
      }
      const p = claims[0]?.p ?? order[0];
      if (p.error) return DENY(p.error, name);
      const reason = verdictFor(root, name, tip, p);
      if (reason) return DENY(reason, name);
      const file = claims[0]?.claim.file ?? null;
      judged.push({ name, tip, file, prefix: p.prefix, files: file ? [file] : [], prefixes: [p.prefix] });
    }
  }
  return ALLOW(story ? 'every story merged records the verdicts it needs' : 'no story is merged', story, judged);
}

// judgeMerge(root, { target, commits, prefixes }): the verdict on a merge into `target` of
// `commits`, as { allow, reason, story }. root is the repository's top level; prefixes, optional,
// the merge's own directory as project prefixes, deepest first. The projects judged are the deliver
// projects anywhere in the repository whose trusted integration branch is target; a merge into any
// other branch is not a ship. Each merged commit that is a story (storiesOf) is judged by verdictFor
// against the project whose integration branch claims it, so the claim, tier, verifier and
// integrity SHAs, the after-verdict rules, the legacy rule, and the merge-tree check are the
// PreToolUse hook's own. More than one story tip in one merge is refused (ONE_AT_A_TIME), as the
// ref-update gate refuses the octopus commit. story is true once a story merge into an integration
// branch is certain. Fails open on an internal error before that, and closed after it.
// DELIVER_NO_ENFORCE=1 allows.
export function judgeMerge(root, { target, commits, prefixes = [], strictFetch = true }) {
  if (process.env.DELIVER_NO_ENFORCE === '1') return ALLOW('DELIVER_NO_ENFORCE=1 is set');
  let certain = false;
  try {
    const branch = typeof target === 'string' ? target.replace(/^refs\/heads\//, '') : '';
    if (!branch || branch.startsWith('pm/')) return ALLOW('not a merge into an integration branch');
    const list = (commits || []).filter(Boolean);
    if (!list.length) return ALLOW('nothing is being merged');
    certain = true;
    const v = judgeStories(root, branch, list, { prefixes, strictFetch });
    certain = v.story;
    if (v.allow && new Set(v.judged.map((j) => j.tip)).size > 1) return DENY(ONE_AT_A_TIME);
    return v;
  } catch (e) {
    return certain ? DENY(`cannot establish the verdict for this story merge (${oneLine(e?.message ?? e)})`) : ALLOW('the gate could not read the merge');
  }
}

// resultCheck(root, next, exclude, introduced, judged): null when what the update builds on top of
// the stories it brings in is their automatic merge; else the reason to refuse. Commits inside an
// introduced story tip were judged with it. Every other commit in the update that descends from a
// judged story tip must be a two-parent merge whose tree is `git merge-tree --write-tree` of its
// parents with conflicts and differences confined to the story file (mergeMatches), or a commit
// that changes only story files and handoff notes. An octopus merge is refused (ONE_AT_A_TIME). A
// git without merge-tree --write-tree (older than 2.38) skips the merged-tree comparison: that
// check alone fails open, and the verdicts still apply.
function resultCheck(root, next, exclude, introduced, judged) {
  const held = git(root, ['rev-list', ...introduced, '--not', ...exclude]);
  if (held === null) return 'the commits this update brings in cannot be listed';
  const inside = new Set(held.split(/\s+/).filter(Boolean));
  const range = git(root, ['rev-list', '--parents', next, '--not', ...exclude]);
  if (range === null) return 'the commits this update brings in cannot be listed';
  for (const line of range.split(/\r?\n/).filter(Boolean)) {
    const [c, ...parents] = line.split(' ');
    if (inside.has(c)) continue;
    const below = judged.filter((st) => contains(root, st.tip, c));
    if (!below.length) continue;
    if (parents.length > 2) return `${c.slice(0, 12)}: ${ONE_AT_A_TIME}`;
    if (parents.length === 2) {
      const st = judged.find((x) => parents.includes(x.tip)) ?? below[0];
      const same = st.file ? mergeMatches(root, c, parents, st.files) : false;
      if (same === false) return `${c.slice(0, 12)}: ${MERGE_DIFFERS}`;
      continue;
    }
    const changed = listing(root, ['diff-tree', NO_SUBMODULE_IGNORE, '-z', '--root', '--name-only', '--no-commit-id', '-r', c]);
    if (changed === null || !changed.every((p) => below.some((st) => onlyRecords([p], st.files, st.prefixes)))) {
      return `${c.slice(0, 12)} changes more than the story file and handoff notes on top of a story merge; ${MERGE_DIFFERS}`;
    }
  }
  return null;
}

// excludeFor(root, old, next, local): the commits an update of `local` from old to next builds on,
// as rev-list exclusions. A fast-forward builds on old. Any other update (an amend, a rebase, a
// reset) builds on the last commit of old's first-parent history that next also holds, so a story
// old had merged is judged again in the commit that replaces the merge. A creation builds on the
// trusted base refs.
function excludeFor(root, old, next, local) {
  if (!old) return baseRefs(root).filter((r) => r !== local);
  if (contains(root, old, next)) return [old];
  const gone = (git(root, ['rev-list', '--first-parent', old, '--not', next]) || '').split(/\s+/).filter(Boolean);
  const base = gone.length ? resolve(root, `${gone.at(-1)}^1`) : '';
  if (base) return [base];
  const bases = chomp(git(root, ['merge-base', '--all', old, next]) || '').split(/\s+/).filter(Boolean);
  return bases.length ? bases : [old];
}

// storyTips(root): every pm/* tip an update can bring in, as { name, tip }: local and remote pm/*
// branches, and the pm/* heads FETCH_HEAD names.
function storyTips(root) {
  const tips = [...pmTips(root)];
  for (const h of fetchHeads(root)?.heads ?? []) {
    const c = h.name?.startsWith('pm/') ? resolve(root, h.sha) : '';
    if (c) tips.push({ name: h.name, tip: c });
  }
  return [...new Map(tips.map((t) => [`${t.name} ${t.tip}`, t])).values()];
}

// introducedStories(root, { tips, next, reached, held }): the stories an update brings in by
// ancestry: introduced, the exact tips next holds and the update's base does not, where a tip
// another introduced tip of the same story holds (a remote-tracking ref pushed before the verdict,
// say) is superseded and dropped, so only the newest is judged; partials, each commit inside a tip
// short of it that next holds and the base does not, unless an introduced tip already holds it (a
// story stacked on another) or `held` says a non-story ref does (used for a creation); rest, the
// tips the update does not reach.
function introducedStories(root, { tips, next, reached, held = () => false }) {
  const live = tips.filter((t) => !reached(t.tip));
  const inNext = live.filter((t) => contains(root, t.tip, next));
  const introduced = [...new Set(inNext.filter((t) => !inNext.some((o) => o.name === t.name && o.tip !== t.tip && contains(root, t.tip, o.tip))).map((t) => t.tip))];
  const rest = live.filter((t) => !inNext.includes(t));
  const partials = new Set();
  for (const t of rest) {
    for (const mb of chomp(git(root, ['merge-base', '--all', t.tip, next]) || '').split(/\s+/).filter(Boolean)) {
      if (!reached(mb) && !introduced.some((x) => contains(root, mb, x)) && !held(mb)) partials.add(mb);
    }
  }
  return { introduced, partials: [...partials], rest };
}

// heldOutsideStories(root, commit, local): a branch, remote-tracking ref, or tag other than `local`
// and every pm/* ref holds commit.
function heldOutsideStories(root, commit, local) {
  const refs = (git(root, ['for-each-ref', '--format=%(refname)', '--contains', commit, 'refs/heads/', 'refs/remotes/', 'refs/tags/']) || '').split(/\r?\n/).filter(Boolean);
  const names = remotes(root);
  return refs.some((r) => r !== local && !storyName(r, names) && !r.endsWith('/HEAD'));
}

// patchIds(root, args): the `git patch-id --stable` of each patch `git <args>` prints, as a Map
// (patch-ids ignore whitespace, so a copy that differs from the story only in whitespace is not
// found as a copy; acceptable for copy detection, a heuristic, while rewriteCheck compares exact
// bytes)
// from patch-id to the commits that carry it (the zero id for a plain diff); null when either
// command fails.
// Every porcelain diff and log call in the gate passes NO_SUBMODULE_IGNORE, so a changed gitlink is
// code whatever diff.ignoreSubmodules says.
export const NO_SUBMODULE_IGNORE = '--ignore-submodules=none';
// --submodule=short keeps a gitlink change a patch (diff.submodule=log would summarise it, and
// patch-id would see nothing).
const PATCH = ['--no-color', '--no-ext-diff', '--no-textconv', NO_SUBMODULE_IGNORE, '--submodule=short'];
function patchIds(root, args) {
  const out = spawnGit(root, args);
  if (out.error || out.status !== 0) return null;
  const ids = new Map();
  if (!out.stdout.trim()) return ids;
  const r = spawnGit(root, ['patch-id', '--stable'], { input: out.stdout });
  if (r.error || r.status !== 0) return null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const [id, commit] = line.split(' ');
    if (id) ids.set(id, [...(ids.get(id) ?? []), commit]);
  }
  return ids;
}

// recordSpecs(info): pathspecs for the PM state paths onlyRecords treats as records, the story
// files and handoff notes of every project judged: { code }, everything else, and { stories }, the
// story files alone.
function recordSpecs(info) {
  const prefixes = [...new Set((info?.projects ?? []).map((p) => p.prefix ?? ''))];
  if (!prefixes.length) prefixes.push('');
  return {
    code: ['--', '.', ...prefixes.flatMap((p) => [`:(exclude,glob)${p}docs/stories/*.md`, `:(exclude,glob)${p}docs/handoff/*.md`])],
    stories: ['--', ...prefixes.map((p) => `:(glob)${p}docs/stories/*.md`)],
  };
}

const commitTime = (root, c) => Number(chomp(git(root, ['show', '-s', '--format=%ct', c]) || '0'));

// copiedStories(root, { rest, next, exclude, base, introduced, info, local, old }): the tips in
// `rest` whose changes the update copies in, each as { ...tip, replay } (replay: a linear rebase
// flattened a story merge old held). Patches are compared on code alone, the PM state paths
// (recordSpecs) left out on both sides, so a squash whose story record conflicted still matches.
// The update's side (updatePatches) is every non-merge commit it brings in outside the introduced
// tips. A story's side is its own work: what it holds past the update's base and, in a rewrite,
// past old, since story commits old already holds are judged by rewriteCheck, not as copies. A
// copy is a squash (squashCopy: the update carries the story's whole code diff) or a cherry-pick
// (pickCopy: one of the story's commits), not counting the story's own commits, nor a hotfix the
// story copied (hotfixExempt). A tip old holds is, in a rewrite, a copy only as a replay
// (droppedMerges, read once per update, and mergeOfStory). Cost is bounded: nothing when the
// update brings no code commit; the dropped merges and next's first-parent line once per update;
// per tip, a tip whose changed paths miss the update's is skipped after two calls, and patches
// are read once. Fails open (no copy) when the patches cannot be read.
function copiedStories(root, { rest, next, exclude, base = exclude[0], introduced, info, local, old = null }) {
  if (!rest.length) return [];
  const { code } = recordSpecs(info);
  const update = updatePatches(root, { next, exclude, introduced, code });
  if (!update) return [];
  const rewrite = Boolean(old) && !contains(root, old, next);
  // Read once per update, not per tip: the merges old's replaced range held that next dropped, what
  // each brought in, and next's first-parent line.
  const flattened = rewrite ? droppedMerges(root, { old, next, exclude, code, update }) : [];
  const seen = new Map();
  const out = [];
  for (const t of rest) {
    if (!seen.has(t.tip)) {
      // In a rewrite, a linear rebase flattening this story's merge (even after the branch moved on
      // past the merged commit) is a replay; a tip old holds is a copy only that way.
      const replay = flattened.some((m) => mergeOfStory(root, m, t.tip, local));
      let hit = replay;
      if (!hit && !(rewrite && contains(root, t.tip, old))) {
        // The story's own work: past the update's base, and, in a rewrite, neither held by old nor
        // patch-equivalent to a commit old holds (an earlier merge-preserving rebase recreated it).
        const span = rewrite ? ['--cherry-pick', '--right-only', `${old}...${t.tip}`, '--not', ...exclude] : [t.tip, '--not', ...exclude];
        const paths = listing(root, ['log', NO_SUBMODULE_IGNORE, '--no-merges', '--name-only', '-z', '--format=', ...span, ...code]) ?? [];
        if (paths.some((x) => update.touched.has(x))) {
          const own = patchIds(root, ['log', '--no-merges', '-p', ...PATCH, '--format=commit %H', ...span, ...code]) ?? new Map();
          const outside = (c) => !contains(root, c, t.tip);
          hit = (own.size > 0 && squashCopy(root, t.tip, { from: rewrite ? old : base, code, update, outside, own, local }))
            || pickCopy(root, { own, update, outside, local });
        }
      }
      seen.set(t.tip, hit ? { replay } : null);
    }
    if (seen.get(t.tip)) out.push({ ...t, replay: seen.get(t.tip).replay });
  }
  return out;
}

// updatePatches(root, { next, exclude, introduced, code }): the update's non-merge commits outside
// the introduced tips, as { ids: patch-id -> commits, touched: paths }; null when there are none.
function updatePatches(root, { next, exclude, introduced, code }) {
  const range = [next, '--not', ...exclude, ...introduced];
  const ids = patchIds(root, ['log', '--no-merges', '-p', ...PATCH, '--format=commit %H', ...range, ...code]);
  if (!ids?.size) return null;
  return { ids, touched: new Set(listing(root, ['log', NO_SUBMODULE_IGNORE, '--no-merges', '--name-only', '-z', '--format=', ...range, ...code]) ?? []) };
}

// squashCopy(root, tip, { from, code, update, outside, own, local }): the update carries, in one
// commit outside the story, the story's whole code diff from merge-base(from, tip), unless that
// commit is hotfixExempt against every code commit making up the story's own work (an unfinished
// story whose only code is a hotfix it cherry-picked).
function squashCopy(root, tip, { from, code, update, outside, own, local }) {
  const mb = from ? chomp(git(root, ['merge-base', from, tip]) || '') : '';
  if (!mb) return false;
  const whole = patchIds(root, ['diff', ...PATCH, mb, tip, ...code]);
  const theirs = [...own.values()].flat();
  return [...(whole?.keys() ?? [])].some((id) => (update.ids.get(id) ?? []).filter(outside).some((c) => !hotfixExempt(root, c, theirs, local, true)));
}

// pickCopy(root, { own, update, outside, local }): the update carries, outside the story, a commit
// with the patch-id of one of the story's own commits, unless hotfixExempt.
function pickCopy(root, { own, update, outside, local }) {
  for (const [id, theirs] of own) {
    if ((update.ids.get(id) ?? []).filter(outside).some((c) => !hotfixExempt(root, c, theirs, local))) return true;
  }
  return false;
}

// hotfixExempt(root, c, theirs, local, all): the story did not author the change: the update's
// commit c is held by a non-story ref and is no newer than the story's commit (any of `theirs`,
// or, with `all`, every one of them: a hotfix cherry-picked onto the story, then merged itself).
// Relies on commit order (spec: out of scope).
function hotfixExempt(root, c, theirs, local, all = false) {
  if (!theirs.length || !heldOutsideStories(root, c, local)) return false;
  const t = commitTime(root, c);
  return all ? theirs.every((sc) => t <= commitTime(root, sc)) : theirs.some((sc) => t <= commitTime(root, sc));
}

// droppedMerges(root, { old, next, exclude, code, update }): the merges in old's replaced range that
// next no longer holds and whose brought-in commits (m^2 --not m^1) reappear, by patch-id, on
// next's first-parent line: merges a linear rebase flattened. Each as { m, second, brought }, the
// brought commits listed.
function droppedMerges(root, { old, next, exclude, code, update }) {
  const merges = (git(root, ['rev-list', '--merges', '--parents', old, '--not', ...exclude]) || '').split(/\r?\n/).filter(Boolean).map((l) => l.split(' '));
  const gone = merges.filter(([m]) => !contains(root, m, next));
  if (!gone.length) return [];
  const line = new Set((git(root, ['rev-list', '--first-parent', next, '--not', ...exclude]) || '').split(/\s+/).filter(Boolean));
  const out = [];
  for (const [m, , second] of gone) {
    const ids = patchIds(root, ['log', '--no-merges', '-p', ...PATCH, '--format=commit %H', second, '--not', `${m}^1`, ...code]) ?? new Map();
    if ([...ids.keys()].some((id) => (update.ids.get(id) ?? []).some((c) => line.has(c)))) out.push({ m, second, brought: [...ids.values()].flat() });
  }
  return out;
}

// mergeOfStory(root, { m, second, brought }, tip, local): the dropped merge merged this story: its
// second parent is the tip, an ancestor of it (the story moved on past its merged commit, the merge
// itself not in its history), or a descendant of it, and at least one commit it brought in is the
// story's own work (the tip holds it) and no non-story ref holds it, so a non-story branch merged
// before the story forked from it is not taken for the story.
// When a non-story ref (a backup branch or a tag) also holds the story's commits, this fails open:
// the flattening is not called a replay, and rewriteCheck allows it only if the code is unchanged.
function mergeOfStory(root, { m, second, brought }, tip, local) {
  const related = second === tip || (contains(root, second, tip) && !contains(root, m, tip)) || contains(root, tip, second);
  return related && brought.some((c) => contains(root, c, tip) && !heldOutsideStories(root, c, local));
}

// rewriteCheck(root, { old, next, base, info, trusted }): for an update that rewrites history (old
// is not an ancestor of next, and next is not an ancestor of old), whether the replaced range
// base..old held shipped story work, a commit that records a story's verifier in its story file,
// as { found }, and, when it did, { bad }, the refusal when the rewrite changes code (records,
// recordSpecs, left out). `from` is the commit next builds on: the newest of its first-parent
// history that old, a trusted remote copy, or FETCH_HEAD's head of the integration branch from a
// pull's own FETCH_HEAD head (fetchedIntegration) holds. With the same base (an amend), next's code
// tree must equal old's exactly. On a new base (a rebase), next's code tree must equal the rebased
// result, `git merge-tree --write-tree --merge-base <base> <from> <old>` (git 2.40 or newer); where
// conflicts are confined to records, the code is compared all the same; a code conflict resolved
// to anything else is refused (CONFLICTED); where merge-tree cannot run, the code diff base..old
// must equal from..next byte for byte apart
// from line numbers (codeDiff). A reword, a record edit, or a clean rebase passes; a change of a
// single space, or a change moved to another place, does not.
const REWRITE = 'rewriting shipped story history changes code; ship the change as a story';
const CONFLICTED = 'the rebase changed code while resolving a conflict, which cannot be compared with the verified code; use git pull --no-rebase (a merge keeps both sides comparable), or ship the resolution as a story';
// recordFile(f, info): f is a PM state path, a story file or handoff note of a judged project.
const recordFile = (f, info) => (info?.projects?.length ? info.projects : [{ prefix: '' }]).some(({ prefix = '' }) => {
  const dir = `${prefix}docs/stories/`;
  return isHandoff(f, prefix) || (f.startsWith(dir) && /^[^/]+\.md$/.test(f.slice(dir.length)));
});

// fetchedIntegration(root, branch, next): FETCH_HEAD's head of the integration branch, trusted as a
// copy of it only for the pull now running (`git pull <remote> <branch>` with no tracking config),
// as [sha] or []. Trusted only: from the one designated remote (branch.<branch>.remote when set,
// else checkout.defaultRemote, else origin, else the only remote), never a fork, its line naming
// `branch '<branch>' of <url>` for that remote's url (fetchUrl); equal to that remote's
// refs/remotes/<remote>/<branch> when that ref exists and the remote's refspec maps it; and only
// while next holds the fetched head and the update is the pull's own (pullOwn). A FETCH_HEAD left
// by an earlier fetch never trusts a later, unrelated update.
function fetchedIntegration(root, branch, next) {
  const heads = (fetchHeads(root)?.heads ?? []).filter((h) => h.name === branch && h.url);
  if (!heads.length) return [];
  const remote = designatedRemote(root, branch);
  if (!remote) return [];
  const url = fetchUrl(chomp(git(root, ['ls-remote', '--get-url', remote]) || ''));
  // The tracking ref limits staleness only when the remote's fetch refspec maps this branch to it;
  // with a narrowed refspec it is not updated, and is not compared.
  const tracking = mapsBranch(root, remote, branch) ? resolve(root, `refs/remotes/${remote}/${branch}`) : '';
  return heads
    .filter((h) => url && fetchUrl(h.url) === url)
    .map((h) => resolve(root, h.sha))
    .filter((sha) => sha && (!tracking || sha === tracking) && contains(root, sha, next) && pullOwn(root, sha, branch, next));
}

// pullOwn(root, sha, branch, next): the update is the pull that fetched sha, bound to the operation:
// GIT_REFLOG_ACTION starts with `pull` (git sets it for the pull's own merge or rebase); or a merge
// the pull stopped on a conflict is being concluded (`git commit`), MERGE_HEAD being exactly sha and
// next having it as a parent; or a rebase the pull stopped is being continued, the rebase state's
// onto being sha and its head-name this branch. A FETCH_HEAD left by an earlier fetch matches none.
function pullOwn(root, sha, branch, next) {
  if (/^pull\b/.test(process.env.GIT_REFLOG_ACTION ?? '')) return true;
  const heads = mergeHeads(root) ?? [];
  if (heads.length === 1 && heads[0] === sha) {
    const parents = chomp(git(root, ['rev-list', '--parents', '-n', '1', next]) || '').split(' ').slice(1);
    if (parents.includes(sha)) return true;
  }
  const read = (rel) => chomp(readGitPath(root, rel) ?? '');
  for (const dir of ['rebase-merge', 'rebase-apply']) {
    if (read(`${dir}/onto`) === sha && read(`${dir}/head-name`) === `refs/heads/${branch}`) return true;
  }
  return false;
}

// mapsBranch(root, remote, branch): one of remote.<remote>.fetch maps refs/heads/<branch> to
// refs/remotes/<remote>/<branch> (exactly, or through the usual `refs/heads/*` glob), and no
// negative refspec excludes it.
function mapsBranch(root, remote, branch) {
  const specs = (git(root, ['config', '--get-all', `remote.${remote}.fetch`]) || '').split(/\r?\n/).filter(Boolean);
  // A negative refspec (`^refs/heads/<branch>`, or a glob covering it) unmaps the branch.
  const negated = specs.filter((sp) => sp.startsWith('^')).some((sp) => {
    const src = sp.slice(1);
    if (!src.includes('*')) return src === `refs/heads/${branch}`;
    const [pre, post] = src.split('*');
    const ref = `refs/heads/${branch}`;
    return ref.startsWith(pre) && ref.endsWith(post) && ref.length >= pre.length + post.length;
  });
  if (negated) return false;
  return specs.filter((sp) => !sp.startsWith('^')).some((spec) => {
    const [src, dst] = spec.replace(/^\+/, '').split(':');
    if (!src || !dst) return false;
    if (src === `refs/heads/${branch}`) return dst === `refs/remotes/${remote}/${branch}`;
    return src === 'refs/heads/*' && dst === `refs/remotes/${remote}/*`;
  });
}

// designatedRemote(root, branch): the one remote the integration branch is pulled from:
// branch.<branch>.remote when set (and not `.`), else checkout.defaultRemote, else origin, else the
// only configured remote; null otherwise.
export function designatedRemote(root, branch) {
  const names = remotes(root);
  const configured = chomp(git(root, ['config', '--get', `branch.${branch}.remote`]) || '');
  if (configured) return configured !== '.' && names.includes(configured) ? configured : null;
  const preferred = chomp(git(root, ['config', '--get', 'checkout.defaultRemote']) || '');
  if (preferred && names.includes(preferred)) return preferred;
  if (names.includes('origin')) return 'origin';
  return names.length === 1 ? names[0] : null;
}

// fetchUrl(url): a remote url as git fetch writes it into FETCH_HEAD: the user part dropped (for a
// url with a scheme, its `user[:pass]@`; for an scp-style url, everything up to and including the
// first `@` when a `:` follows it, so `git@host:org/repo` is `host:org/repo`), then a trailing `/`,
// then a trailing `.git`. The configured side comes from `git ls-remote --get-url`, which applies
// insteadOf, as fetch does before writing FETCH_HEAD.
export function fetchUrl(url) {
  let u = String(url ?? '').trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = u.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1');
  // A `/` before the first `:`, or a Windows drive (`C:\` or `C:/`), makes it a local path, not
  // scp-style (git's url_is_local_not_ssh).
  else if (u.includes('@') && u.includes(':') && !/^[A-Za-z]:[\\/]/.test(u) && !u.slice(0, u.indexOf(':')).includes('/') && u.indexOf(':', u.indexOf('@')) !== -1) u = u.slice(u.indexOf('@') + 1);
  return u.replace(/\/+$/, '').replace(/\.git$/, '');
}
// Diffs this gate compares are made the same way whatever the user's config says.
const DIFF_CONFIG = ['-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false', '-c', 'diff.suppressBlankEmpty=false', '-c', 'diff.renames=false', '-c', 'diff.algorithm=myers', '-c', 'diff.indentHeuristic=false'];
const DIFF_OPTS = ['--no-renames', '--diff-algorithm=myers', '--no-indent-heuristic', ...PATCH];
// codeDiff(root, a, b, spec): the exact diff from a to b over `spec`, with no context lines (-U0)
// so changes next to a hunk do not count, and with the parts a rebase's line shifts and new blob
// ids change normalised away: each `@@` range header (and the function text after it) and each
// `index` line. Bytes are otherwise exact (--binary, no external diff or textconv, fixed diff
// options), so unlike a patch-id it keeps whitespace. null when git fails.
function codeDiff(root, a, b, spec) {
  const r = spawnGit(root, [...DIFF_CONFIG, 'diff', '-U0', '--binary', ...DIFF_OPTS, a, b, ...spec]);
  if (r.error || r.status !== 0) return null;
  return r.stdout.replace(/^@@ .*$/gm, '@@').replace(/^index [0-9a-f]+\.\.[0-9a-f]+.*$/gm, 'index');
}
// sameCode(root, a, b, spec): the two trees are identical over spec; null when git fails.
function sameCode(root, a, b, spec) {
  const r = spawnGit(root, [...DIFF_CONFIG, 'diff', '--quiet', ...DIFF_OPTS, a, b, ...spec]);
  return r.error ? null : r.status === 0 ? true : r.status === 1 ? false : null;
}
function rewriteCheck(root, { old, next, base, info, trusted }) {
  if (contains(root, next, old)) return { found: false };
  const { code, stories } = recordSpecs(info);
  // Merge commits count too (no --no-merges), compared with their first parent: a PASS may be
  // recorded while committing a merge of the integration branch into the story. Only options git
  // 2.28 has are used here (the reference-transaction gate's minimum).
  const touched = (git(root, ['log', NO_SUBMODULE_IGNORE, '--format=%H', old, '--not', base, ...stories]) || '').split(/\s+/).filter(Boolean);
  const changedStories = (c) => {
    const first = resolve(root, `${c}^1`);
    return listing(root, first ? ['diff', NO_SUBMODULE_IGNORE, '-z', '--name-only', first, c, ...stories] : ['diff-tree', NO_SUBMODULE_IGNORE, '-z', '-r', '--root', '--no-commit-id', '--name-only', c, ...stories]) ?? [];
  };
  const found = touched.some((c) => changedStories(c).some((f) => {
    const exec = parseExec(git(root, ['show', `${c}:${f}`]) ?? '');
    return Boolean(exec?.verifier);
  }));
  if (!found) return { found: false };
  const gone = (git(root, ['rev-list', '--first-parent', next, '--not', old, ...trusted]) || '').split(/\s+/).filter(Boolean);
  const from = gone.length ? resolve(root, `${gone.at(-1)}^1`) : resolve(root, next);
  if (!from) return { found: true, bad: `${REWRITE} (the commit it builds on cannot be read)` };
  const verdict = (same) => (same === null ? { found: true, bad: `${REWRITE} (the trees cannot be compared)` } : same ? { found: true } : { found: true, bad: REWRITE });
  if (from === resolve(root, base)) return verdict(sameCode(root, old, next, code));
  // The rebased result; a conflict confined to records still gives a tree whose code is exact.
  const mt = spawnGit(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', '--merge-base', base, from, old]);
  const [tree, ...conflicted] = mt.status === 0 || mt.status === 1 ? mt.stdout.split('\0').filter(Boolean) : [];
  if (/^[0-9a-f]{40,64}$/.test(tree ?? '')) {
    const same = sameCode(root, tree, next, code);
    if (conflicted.every((f) => recordFile(f, info))) return verdict(same);
    return same === true ? { found: true } : { found: true, bad: CONFLICTED };
  }
  const before = codeDiff(root, base, old, code);
  const after = codeDiff(root, from, next, code);
  if (before === null || after === null) return { found: true, bad: `${REWRITE} (the diffs cannot be read)` };
  return verdict(before === after);
}

export const REPLAY = 'a rebase is replaying a shipped story merge; use git pull --rebase=merges (or git pull --no-rebase)';

// copyVerdict(root, branch, copies, info): the refusal of a story copied into `branch`. A replay (a
// linear rebase flattening a story merge old held) is told to keep the merge. Otherwise an
// unverified story is refused with its verdict; a verified one too, since a copy is no merge of the
// verified tip and so bypasses the merged-tree check. Allowed only when no copy is a story.
function copyVerdict(root, branch, copies, info) {
  for (const t of copies) {
    if (t.replay) return DENY(REPLAY, t.name);
    const v = judgeStories(root, branch, [t.tip], { info, strictFetch: false });
    const how = `its changes reach ${branch} as a copy (a cherry-pick or a squash merge)`;
    if (!v.allow) return DENY(`${how}, and ${v.why}; after verification, merge the story branch itself with git merge --no-ff ${t.name}`, t.name);
    if (v.story) return DENY(`${how}, which bypasses the check that the merge is the verified automatic merge; merge the story branch itself with git merge --no-ff ${t.name}`, t.name);
  }
  return ALLOW('no copied story');
}

// carriedStories(root, carried, tips, info): each carried tip as resultCheck's judged entry
// { name, tip, file, prefix, files, prefixes }: the story file of the first project that claims it
// (top level first), with every claimant's story file and prefix, as judgeStories gives them; file
// null, which no merge matches, when none claims it.
function carriedStories(root, carried, tips, info) {
  const order = [...info.projects.filter((p) => p.prefix === ''), ...info.projects.filter((p) => p.prefix !== '')];
  return carried.map((tip) => {
    const name = tips.find((t) => t.tip === tip)?.name ?? '';
    const claims = order.map((p) => ({ p, claim: !p.error && p.ref ? claimOf(root, p.ref, name, p.prefix) : null })).filter((c) => c.claim);
    if (!claims.length) return { name, tip, file: null, prefix: '', files: [], prefixes: [''] };
    return { name, tip, file: claims[0].claim.file, prefix: claims[0].p.prefix, files: claims.map((c) => c.claim.file), prefixes: claims.map((c) => c.p.prefix) };
  });
}

// judgeIncoming(root, ctx, mark): judgeRefUpdate's verdict on what the update brings in: the
// stories it introduces by ancestry, judged by judgeStories, with resultCheck on what it builds on
// top of them, and the stories it copies (copyVerdict). mark() records that a story update is
// certain, so an internal error after it refuses.
function judgeIncoming(root, { branch, local, oldSha, next, info, exclude, base }, mark) {
  const reached = (c) => exclude.some((x) => contains(root, c, x));
  const tips = storyTips(root);
  // A creation has only the trusted base refs to build on, so a commit another non-story ref
  // holds is not counted as part of a story there.
  const held = oldSha ? () => false : (c) => heldOutsideStories(root, c, local);
  const { introduced, partials, rest } = introducedStories(root, { tips, next, reached, held });
  const copies = copiedStories(root, { rest, next, exclude, base, introduced, info, local, old: oldSha });
  if (!introduced.length && !partials.length && !copies.length) return ALLOW('the update brings in no story');
  mark();
  if (copies.length) {
    const c = copyVerdict(root, branch, copies, info);
    if (!c.allow) return c;
  }
  // A story old already held (an amend or a rebase of its merge) was judged when it shipped;
  // only what the update rebuilds on top of it is judged again.
  const carried = oldSha ? introduced.filter((tip) => contains(root, tip, oldSha)) : [];
  const fresh = introduced.filter((tip) => !carried.includes(tip));
  const v = judgeStories(root, branch, [...fresh, ...partials], { info, strictFetch: false });
  if (!v.allow || !introduced.length) return v;
  const judged = [...v.judged, ...carriedStories(root, carried, tips, info)];
  const bad = resultCheck(root, next, exclude, introduced, judged);
  return bad ? DENY(bad) : ALLOW(v.reason, true, judged);
}

// judgeRewrite(root, ctx, v, mark): v, unless the update rewrites history (old is not an ancestor
// of next) over shipped story work and changes its code (rewriteCheck).
function judgeRewrite(root, { oldSha, next, info, trusted, base }, v, mark) {
  if (!oldSha || contains(root, oldSha, next)) return v;
  const r = rewriteCheck(root, { old: oldSha, next, base, info, trusted });
  if (r.found) mark();
  return r.bad ? DENY(r.bad) : v;
}

// judgeRefUpdate(root, { target, old, new }): the verdict on moving refs/heads/<target> from old
// to new, as git's reference-transaction hook sees it, so a merge commit, a fast-forward, a pull,
// a rebase, a reset, an update-ref, a cherry-pick, a squash merge, an amend, and a conflicted merge
// finished by hand are judged alike. Allowed: a deletion, an update that moves nothing (pack-refs),
// a branch that is no deliver project's integration branch, and a new tip a trusted remote copy of
// the integration branch already holds (it has shipped there). Otherwise the update's base is
// excludeFor's; the stories it brings in by ancestry (introducedStories: a pm/* tip, local, remote,
// or named in FETCH_HEAD, that next reaches and the base does not, or a commit inside such a tip
// short of it) are judged by judgeStories, then resultCheck judges what the update builds on top of
// them; a story it copies (copiedStories) is refused (copyVerdict). An update that states no old
// value is judged from the ref's current value; only a ref that does not exist is a creation,
// judged against the trusted base refs, partials included. A ref counts as shipped only as
// `refs/remotes/<remote>/<target>` (integrationRefs). Same failure model as judgeMerge.
export function judgeRefUpdate(root, { target, old, new: next }) {
  if (process.env.DELIVER_NO_ENFORCE === '1') return ALLOW('DELIVER_NO_ENFORCE=1 is set');
  let certain = false;
  try {
    const branch = typeof target === 'string' ? target.replace(/^refs\/heads\//, '') : '';
    if (!branch || branch.startsWith('pm/')) return ALLOW('not an integration branch');
    if (!next || ZERO.test(next)) return ALLOW('a deletion brings nothing in');
    const local = `refs/heads/${branch}`;
    const full = resolve(root, next);
    // An update that states no old value is judged from the ref as it stands: in the prepared
    // phase the ref still holds its old value. Only a ref that does not exist is a creation.
    const oldSha = (old && !ZERO.test(old) ? old : null) ?? (resolve(root, local) || null);
    if (oldSha && (oldSha === next || oldSha === full)) return ALLOW('the update moves nothing');
    const info = integrationProjects(root, branch);
    if (!info.projects.length && !(info.failed && baseBranches(root).includes(branch))) return ALLOW(`${branch} is no deliver project's integration branch`);
    const integ = { name: branch, ref: refFor(root, branch) };
    // The trusted remote copies of the integration branch: a new tip one holds has shipped there.
    const trusted = integrationRefs(root, integ).filter((r) => r !== local);
    const shipped = trusted.find((r) => contains(root, next, r));
    if (shipped) return ALLOW(`${shipped} already holds it`);
    // The update builds on its base (excludeFor); what a trusted remote copy holds has shipped
    // there and is not judged again (upstream story merges and squashes under a rebase or a pull).
    const base = excludeFor(root, oldSha, next, local);
    // FETCH_HEAD's head of the integration branch, for the pull now running from the designated
    // remote (`git pull origin main` with no tracking config), is trusted the same way.
    const trustedAll = [...new Set([...trusted, ...fetchedIntegration(root, branch, next)])];
    const ctx = { branch, local, oldSha, next, info, trusted: trustedAll, base: base[0], exclude: [...new Set([...base, ...trustedAll])] };
    const mark = () => { certain = true; };
    // Every verdict from here passes one place: what the update brings in, then, for a rewrite (an
    // amend, a rebase, a reset elsewhere), the shipped story work it replaces.
    const v = judgeIncoming(root, ctx, mark);
    return v.allow ? judgeRewrite(root, ctx, v, mark) : v;
  } catch (e) {
    return certain ? DENY(`cannot establish the verdict for this story merge (${oneLine(e?.message ?? e)})`) : ALLOW('the gate could not read the update');
  }
}

// ---- the PreToolUse entry point ----

function main() {
  let calls;
  // The session's project directory: CLAUDE_PROJECT_DIR when it names a directory, else the cwd.
  let sessionDir;
  try {
    const input = readHookInput();
    const cmd = input?.tool_input?.command;
    if (typeof cmd !== 'string' || !/\b(merge|pull|commit)\b/.test(cmd)) process.exit(0);
    const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
    const env = process.env.CLAUDE_PROJECT_DIR;
    sessionDir = env && path.isAbsolute(env) && fs.existsSync(env) && fs.statSync(env).isDirectory() ? path.resolve(env) : cwd;
    calls = gitCalls(cmd, cwd);
  } catch {
    process.exit(0);
  }
  try {
    judgeCommand(calls, sessionDir);
  } catch (e) {
    if (e instanceof Blocked) {
      fs.writeSync(2, `deliver blocked git merge ${sanitize(e.what)}: ${oneLine(e.reason)}.\n`);
      process.exit(2);
    }
  }
  process.exit(0);
}

if (MAIN) main();
