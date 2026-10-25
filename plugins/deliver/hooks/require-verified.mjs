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

export const planName = (text) => (String(text ?? '').match(/^\s*-\s*Integration branch:\s*`?<?([A-Za-z0-9._/-]+)>?`?/m) || [])[1] || null;

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
    c.plan = c.approved ? planName(git(root, ['show', `${c.ref}:${prefix}docs/plan.md`])) : null;
  }
  const approved = cands.filter((c) => c.approved);
  if (!approved.length) return null;
  const names = [...new Set(approved.map((c) => c.plan).filter(Boolean))];
  if (names.length > 1) return { names, error: `the committed plans on ${approved.filter((c) => c.plan).map((c) => c.name).join(', ')} disagree on the integration branch (${names.join(', ')}); make ${prefix}docs/plan.md agree` };
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

// fetchHeads(root): the heads FETCH_HEAD lists for merging, every line not marked not-for-merge,
// as `git merge FETCH_HEAD` merges them all: { heads: [{ sha, name }], bad }, name the branch the
// line's `branch '<name>' of <url>` part names, or null; bad when a line marked for merge does not
// parse. null when FETCH_HEAD cannot be read.
export function fetchHeads(root) {
  const where = chomp(git(root, ['rev-parse', '--git-path', 'FETCH_HEAD']) || '');
  if (!where) return null;
  let text;
  try { text = fs.readFileSync(path.resolve(root, where), 'utf8'); } catch { return null; }
  const heads = [];
  let bad = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const [sha, mark = '', desc = ''] = line.split('\t');
    if (mark === 'not-for-merge') continue;
    if (!/^[0-9a-f]{40,64}$/.test(sha || '') || mark !== '') { bad = true; continue; }
    heads.push({ sha, name: (desc.match(/^branch '(.+)' of /) || [])[1] ?? null });
  }
  return { heads, bad };
}

// mergeHeads(root): the commits MERGE_HEAD lists, the ones an in-progress merge brings in; [] when
// no merge is in progress, null when it cannot be read.
export function mergeHeads(root) {
  const where = chomp(git(root, ['rev-parse', '--git-path', 'MERGE_HEAD']) || '');
  if (!where) return null;
  let text;
  try { text = fs.readFileSync(path.resolve(root, where), 'utf8'); } catch (e) { return e.code === 'ENOENT' ? [] : null; }
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

// mergeTreeWorks(root): this git can run `git merge-tree --write-tree` (git 2.38 or newer), which
// the merged-tree check needs; probed on HEAD when it resolves.
export function mergeTreeWorks(root) {
  oldGit = null;
  noteGitVersion(root);
  if (oldGit) return false;
  if (!resolve(root, 'HEAD')) return true;
  const r = run(root, ['merge-tree', '--write-tree', 'HEAD', 'HEAD']);
  return !r.error && (r.status === 0 || r.status === 1);
}

// isHandoff(p, prefix): p is a handoff note of the project at prefix ("" or "dir/").
const isHandoff = (p, prefix) => p.startsWith(`${prefix}docs/handoff/`) && /^[^/]+\.md$/.test(p.slice(`${prefix}docs/handoff/`.length));
// onlyRecords(list, file, prefix): every path in the list is the story file, or, when prefix is a
// string, a handoff note of the project there.
const onlyRecords = (list, file, prefix = null) => list.every((p) => p === file || (prefix !== null && isHandoff(p, prefix)));

// mergeMatches(root, commit, parents, file): true when a merge commit's tree is the automatic
// merge of its two parents, apart from the story file; null when this git has no
// `git merge-tree --write-tree` (older than 2.38, or a usage error, exit 129).
function mergeMatches(root, commit, parents, file) {
  if (parents.length !== 2) return false;
  const r = run(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', parents[0], parents[1]]);
  if (r.error || (r.status !== 0 && r.status !== 1)) { noteGitVersion(root); return oldGit || r.status === 129 ? null : false; }
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
  if (!afterVerdict(root, sha, tip, integ.ref, file, prefix)) return staleReason('verifier PASS', sha, branch, tip, 're-verify');
  if (tier === 'T1' || tier === 'T2') {
    const ig = atCommit(exec.integrity, 'pass');
    if (!ig) return `${file} is tier ${tier} and records integrity ${sanitize(exec.integrity ?? 'unset')}, not "pass <sha>"`;
    if (!afterVerdict(root, ig[2].toLowerCase(), tip, integ.ref, file, prefix)) return staleReason('integrity pass', ig[2], branch, tip, 're-run test-integrity.mjs');
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
// commits merged into `branch`; judged lists each story allowed as { name, tip, file, prefix }. One
// project judges each story: the first that claims it, in the order of the merge's own directory
// (`prefixes`, deepest first), the top level, then the rest; with no claim anywhere, the first of
// that order, whose verdict is "no story claims". The git-level gate has no directory, so the top
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
      const p = order.find((x) => !x.error && x.ref && claimOf(root, x.ref, name, x.prefix)) ?? order[0];
      if (p.error) return DENY(p.error, name);
      const reason = verdictFor(root, name, tip, p);
      if (reason) return DENY(reason, name);
      judged.push({ name, tip, file: claimOf(root, p.ref, name, p.prefix)?.file ?? null, prefix: p.prefix });
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
export function judgeMerge(root, { target, commits, prefixes = [] }) {
  if (process.env.DELIVER_NO_ENFORCE === '1') return ALLOW('DELIVER_NO_ENFORCE=1 is set');
  let certain = false;
  try {
    const branch = typeof target === 'string' ? target.replace(/^refs\/heads\//, '') : '';
    if (!branch || branch.startsWith('pm/')) return ALLOW('not a merge into an integration branch');
    const list = (commits || []).filter(Boolean);
    if (!list.length) return ALLOW('nothing is being merged');
    certain = true;
    const v = judgeStories(root, branch, list, { prefixes });
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
      const same = st.file ? mergeMatches(root, c, parents, st.file) : false;
      if (same === false) return `${c.slice(0, 12)}: ${MERGE_DIFFERS}`;
      continue;
    }
    const changed = listing(root, ['diff-tree', '-z', '--root', '--name-only', '--no-commit-id', '-r', c]);
    if (changed === null || !changed.every((p) => below.some((st) => onlyRecords([p], st.file, st.prefix)))) {
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

// introducedStories(root, { tips, next, reached, partials }): the stories an update brings in by
// ancestry: introduced, the exact tips next holds and the update's base does not, where a tip
// another introduced tip of the same story holds (a remote-tracking ref pushed before the verdict,
// say) is superseded and dropped, so only the newest is judged; partials, with `partials` set, each
// commit inside a tip short of it that next holds, unless an introduced tip already holds it (a
// story stacked on another); rest, the tips the update does not reach.
function introducedStories(root, { tips, next, reached, partials: withPartials }) {
  const live = tips.filter((t) => !reached(t.tip));
  const inNext = live.filter((t) => contains(root, t.tip, next));
  const introduced = [...new Set(inNext.filter((t) => !inNext.some((o) => o.name === t.name && o.tip !== t.tip && contains(root, t.tip, o.tip))).map((t) => t.tip))];
  const rest = live.filter((t) => !inNext.includes(t));
  const partials = new Set();
  if (withPartials) {
    for (const t of rest) {
      for (const mb of chomp(git(root, ['merge-base', '--all', t.tip, next]) || '').split(/\s+/).filter(Boolean)) {
        if (!reached(mb) && !introduced.some((x) => contains(root, mb, x))) partials.add(mb);
      }
    }
  }
  return { introduced, partials: [...partials], rest };
}

// patchIds(root, args): the `git patch-id --stable` of each patch `git <args>` prints, as a Set;
// null when either command fails.
const PATCH = ['--no-color', '--no-ext-diff', '--no-textconv'];
function patchIds(root, args) {
  const opts = { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 256 * 1024 * 1024 };
  const out = spawnSync('git', ['-C', root, ...args], { ...opts, stdio: ['ignore', 'pipe', 'ignore'] });
  if (out.error || out.status !== 0) return null;
  if (!out.stdout.trim()) return new Set();
  const r = spawnSync('git', ['-C', root, 'patch-id', '--stable'], { ...opts, input: out.stdout, stdio: ['pipe', 'pipe', 'ignore'] });
  if (r.error || r.status !== 0) return null;
  return new Set(r.stdout.split(/\r?\n/).map((l) => l.split(' ')[0]).filter(Boolean));
}

// copiedStories(root, { rest, next, exclude, introduced }): the tips in `rest` whose changes the
// update copies in (a cherry-pick, or a squash merge): the patch-id of a non-merge commit the update
// brings in, outside every introduced tip, equals the patch-id of one of the tip's own non-merge
// commits past the update's base, or of the tip's whole diff from that base. Only commits the
// update brings in and only tips it does not reach are read; nothing when either is empty. Fails
// open (no copy) when the patches cannot be read.
function copiedStories(root, { rest, next, exclude, introduced }) {
  if (!rest.length) return [];
  const mine = patchIds(root, ['log', '--no-merges', '-p', ...PATCH, '--format=commit %H', next, '--not', ...exclude, ...introduced]);
  if (!mine?.size) return [];
  const out = [];
  for (const t of rest) {
    const ids = patchIds(root, ['log', '--no-merges', '-p', ...PATCH, '--format=commit %H', t.tip, '--not', ...exclude]) ?? new Set();
    const mb = exclude.length === 1 ? chomp(git(root, ['merge-base', exclude[0], t.tip]) || '') : '';
    if (mb) for (const id of patchIds(root, ['diff', ...PATCH, mb, t.tip]) ?? []) ids.add(id);
    if ([...ids].some((id) => mine.has(id))) out.push(t);
  }
  return out;
}

// copyVerdict(root, branch, copies, info): the refusal of a story copied into `branch`. An
// unverified story is refused with its verdict; a verified one too, since a copy is no merge of the
// verified tip and so bypasses the merged-tree check. Allowed only when no copy is a story.
function copyVerdict(root, branch, copies, info) {
  for (const t of copies) {
    const v = judgeStories(root, branch, [t.tip], { info, strictFetch: false });
    const how = `its changes reach ${branch} as a copy (a cherry-pick or a squash merge)`;
    if (!v.allow) return DENY(`${how}, and ${v.why}; after verification, merge the story branch itself with git merge --no-ff ${t.name}`, t.name);
    if (v.story) return DENY(`${how}, which bypasses the check that the merge is the verified automatic merge; merge the story branch itself with git merge --no-ff ${t.name}`, t.name);
  }
  return ALLOW('no copied story');
}

// carriedStories(root, carried, tips, info): each carried tip as resultCheck's judged entry
// { name, tip, file, prefix }, the story file from the first project that claims it (top level
// first), or null, which no merge matches.
function carriedStories(root, carried, tips, info) {
  const order = [...info.projects.filter((p) => p.prefix === ''), ...info.projects.filter((p) => p.prefix !== '')];
  return carried.map((tip) => {
    const name = tips.find((t) => t.tip === tip)?.name ?? '';
    for (const p of order) {
      const claim = !p.error && p.ref ? claimOf(root, p.ref, name, p.prefix) : null;
      if (claim) return { name, tip, file: claim.file, prefix: p.prefix };
    }
    return { name, tip, file: null, prefix: '' };
  });
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
// them; a story it copies (copiedStories) is refused (copyVerdict). A creation counts only exact
// tips the trusted base refs lack. Same failure model as judgeMerge.
export function judgeRefUpdate(root, { target, old, new: next }) {
  if (process.env.DELIVER_NO_ENFORCE === '1') return ALLOW('DELIVER_NO_ENFORCE=1 is set');
  let certain = false;
  try {
    const branch = typeof target === 'string' ? target.replace(/^refs\/heads\//, '') : '';
    if (!branch || branch.startsWith('pm/')) return ALLOW('not an integration branch');
    if (!next || ZERO.test(next)) return ALLOW('a deletion brings nothing in');
    const local = `refs/heads/${branch}`;
    const oldSha = old && !ZERO.test(old) ? old : null;
    const full = resolve(root, next);
    if (oldSha === next || (!oldSha && full && resolve(root, local) === full)) return ALLOW('the update moves nothing');
    const info = integrationProjects(root, branch);
    if (!info.projects.length && !(info.failed && baseBranches(root).includes(branch))) return ALLOW(`${branch} is no deliver project's integration branch`);
    const integ = { name: branch, ref: refFor(root, branch) };
    const shipped = integrationRefs(root, integ).filter((r) => r !== local).find((r) => contains(root, next, r));
    if (shipped) return ALLOW(`${shipped} already holds it`);
    const exclude = excludeFor(root, oldSha, next, local);
    const reached = (c) => exclude.some((x) => contains(root, c, x));
    const tips = storyTips(root);
    const { introduced, partials, rest } = introducedStories(root, { tips, next, reached, partials: Boolean(oldSha) });
    const copies = copiedStories(root, { rest, next, exclude, introduced });
    if (!introduced.length && !partials.length && !copies.length) return ALLOW('the update brings in no story');
    certain = true;
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
