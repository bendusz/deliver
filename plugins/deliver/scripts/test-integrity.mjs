#!/usr/bin/env node
// deliver test-integrity gate: did a story's diff weaken the checks that judge it?
//
//   node test-integrity.mjs <base> <head> [--protected <path>...] [--protected-base <rev>]
//                           [--allow <kind>...] [--root <dir>]
//
// Compares the merge base of <base> and <head> with <head>, the same three-dot range the scope
// check uses, so integration-branch history never counts against the story. Protected paths are
// compared from --protected-base when given: the commit that added the acceptance tests, since
// against the integration branch a file added on the story branch only ever reads as added.
// Protected paths must be repo-relative, without `..`. Prints one JSON verdict
// { verdict, findings: [{ kind, path, detail }] } on stdout. Exit 0 on pass, 1 on fail, 64 on a
// usage error (bad flag, unknown kind, bad path, unresolvable revision, not a git repository) or
// when git cannot produce the diff; 64 is never a pass.
//
// Kinds: test-deleted, skip-added, assertions-dropped, config-weakened, pragma-added,
// protected-changed. pragma-added counts disable and ignore pragmas in each changed file's raw old
// and new contents, comments included, since that is where pragmas live.
// Every check is a heuristic. Markers and assertions are counted in each test file's old and new
// contents after comments and string literals are blanked, so moving code is neutral and a
// commented-out assertion counts as dropped. A trivial assertion such as `assert.ok(true)` still
// counts; spotting it is the reviewers' job. config-weakened prefers precision: it compares a
// value only when it can read old and new, and flags a deleted shared file (package.json,
// setup.cfg, pyproject.toml, and the like) only when that file held thresholds, rules, or a pin.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KINDS = ['test-deleted', 'skip-added', 'assertions-dropped', 'config-weakened', 'pragma-added', 'protected-changed'];

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { positional: [], protected: [], protectedBase: null, allow: [], root: process.cwd() };
  let mode = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--protected' || a === '--allow') { mode = a.slice(2); continue; }
    if (a === '--root' || a === '--protected-base') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new UsageError(`${a} needs a value`);
      if (a === '--root') opts.root = path.resolve(v);
      else opts.protectedBase = v;
      mode = null;
      continue;
    }
    if (a.startsWith('--')) throw new UsageError(`unknown flag ${a}`);
    if (mode === 'protected') {
      const segs = a.replace(/\\/g, '/').split('/');
      if (path.isAbsolute(a) || /^[A-Za-z]:/.test(a) || a.startsWith('/') || segs.includes('..')) throw new UsageError(`--protected paths must be repo-relative without '..': ${a}`);
      opts.protected.push(a);
    }
    else if (mode === 'allow') {
      if (!KINDS.includes(a)) throw new UsageError(`unknown kind for --allow: ${a}`);
      opts.allow.push(a);
    } else opts.positional.push(a);
  }
  if (opts.positional.length !== 2) throw new UsageError('expected exactly <base> and <head>');
  return opts;
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024, windowsHide: true });
}

function show(root, rev, file) {
  try { return git(root, ['show', `${rev}:${file}`]); } catch { return null; }
}

// ---- classification ----

// isCollected(p): the file name alone makes a framework collect it as tests.
export function isCollected(p) {
  const base = p.split('/').at(-1);
  return /\.(test|spec)\.[^/]+$/.test(base) || /^test_.*\.py$/.test(base) || /_test\.py$/.test(base) || /_test\.go$/.test(base);
}

export function isTestPath(p) {
  const segs = p.split('/');
  const base = segs.at(-1);
  if (/\.(test|spec)\.[^/]+$/.test(base)) return true;
  if (/^test_.*\.py$/.test(base) || /_test\.py$/.test(base) || /_test\.go$/.test(base)) return true;
  return segs.slice(0, -1).some((s) => s === '__tests__' || s === 'tests' || s === 'test' || s === 'spec');
}

// blank(text, file): the source with comments removed and string contents emptied, so markers
// and assertions are counted only in code. A small scanner per language family: Python and Ruby
// use `#` comments and triple quotes; everything else is C-like (`//`, `/* */`, quotes, and
// backticks), except that Rust does not treat `'` as a string so lifetimes survive.
export function blank(text, file) {
  const ext = (file.match(/\.([^./]+)$/) || [])[1] || '';
  const hash = /^(py|pyi|rb)$/.test(ext);
  const quotes = hash ? ['"', "'"] : ext === 'rs' ? ['"'] : ['"', "'", '`'];
  let out = '';
  for (let i = 0; i < text.length;) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (hash ? c === '#' : two === '//') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (!hash && two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (quotes.includes(c)) {
      const triple = hash && text.slice(i, i + 3) === c.repeat(3);
      const close = triple ? c.repeat(3) : c;
      let j = i + close.length;
      while (j < text.length && text.slice(j, j + close.length) !== close) {
        if (text[j] === '\\') j++;
        else if (!triple && c !== '`' && text[j] === '\n') break;
        j++;
      }
      out += close + close;
      i = Math.min(text.length, j + close.length);
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Skip and focus markers, tolerant of whitespace and newlines around the dots. MARKS_ANYWHERE
// are unambiguous in any file. MARKS_IN_TESTS count only in test files: `fit('title'`-style
// focus calls and node:test-style `{ skip: true }` options. So does a bare `.skip(` or
// `.only(`, since iterators and streams use those names.
const QUALIFIED = /\b(?:it|test|describe|context|suite|specify)\s*\.\s*(?:skip|only|todo|skipIf|fixme)\b/g;
const QUALIFIED_CALL = /\b(?:it|test|describe|context|suite|specify)\s*\.\s*(?:skip|only)\s*\(/g;
const MARKS_ANYWHERE = /@unittest\s*\.\s*skip\w*|\bself\s*\.\s*skipTest\s*\(|\bpytest\s*\.\s*skip\s*\(|\bpytest\s*\.\s*mark\s*\.\s*(?:skip|skipif|xfail)\b|@Disabled\b|@Ignore\b|\bt\s*\.\s*Skip(?:f|Now)?\s*\(|#\[\s*ignore\b/g;
const MARKS_IN_TESTS = /(?<![\w$.])(?:x(?:it|describe|test|context)|f(?:it|describe))\s*\(\s*['"`]|[{,]\s*(?:skip|todo|only)\s*:\s*(?:true\b|['"`])/g;
const BARE = /\.\s*(?:skip|only)\s*\(/g;

function count(text, re) {
  if (!text) return 0;
  return (text.match(re) || []).length;
}

function skipCount(code, testFile) {
  if (!code) return 0;
  const anywhere = count(code, QUALIFIED) + count(code, MARKS_ANYWHERE);
  if (!testFile) return anywhere;
  // Bare calls minus the qualified ones already counted.
  return anywhere + count(code, MARKS_IN_TESTS) + count(code, BARE) - count(code, QUALIFIED_CALL);
}

// Disable and ignore pragmas. Each pattern is spelt so that this source does not match it.
const PRAGMA = /eslint[-]disable|istanbul\s+ignore|c8\s+ignore|pragma:\s*no\s+cover|@ts[-](?:ignore|nocheck)|type:\s*ignore\b|#\[\s*allow\s*\(|\/\/\s*nolint\b/g;

// Prose files mention pragmas without applying them. Code under docs/ is still code.
const PROSE = /\.(md|mdx|markdown|rst|txt|adoc)$/i;

const ASSERTION = /\bassert(?:\.\w+|_\w+|[A-Z]\w*)?!?\s*\(|^\s*assert\s|\bexpect\s*\(|\.should\b|\bshould\.|\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\brequire\.[A-Z]\w*\s*\(/gm;

// ---- config-weakened ----

const COVERAGE_FILE = /^(?:(?:jest|vitest|vite)\.config\.(?:[cm]?[jt]s|json)|package\.json|\.nycrc(?:\.json|\.ya?ml)?|\.c8rc(?:\.json)?|\.coveragerc|setup\.cfg|tox\.ini|pytest\.ini|pyproject\.toml)$/;
const ESLINT_FILE = /^(?:\.eslintrc(?:\.(?:c?js|json|ya?ml))?|eslint\.config\.[cm]?[jt]s|\.stylelintrc(?:\.(?:c?js|json|ya?ml))?|stylelint\.config\.[cm]?js)$/;
const BIOME_FILE = /^biome\.jsonc?$/;
const TSCONFIG_FILE = /^tsconfig(?:\..+)?\.json$/;

function numbersByKey(text, re) {
  const out = new Map();
  for (const m of text.matchAll(re)) {
    const k = m[1].toLowerCase().replace(/-/g, '_');
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(Number(m[2]));
  }
  return out;
}

const THRESHOLD = /["']?\b(branches|functions|lines|statements|fail_under|fail-under)["']?\s*[:=]\s*(\d+(?:\.\d+)?)/g;
const COV_FLAG = /(--cov-fail-under)[= ](\d+(?:\.\d+)?)/g;

function coverageWeakened(oldText, newText) {
  const out = [];
  const oldMap = new Map([...numbersByKey(oldText, THRESHOLD), ...numbersByKey(oldText, COV_FLAG)]);
  const newMap = new Map([...numbersByKey(newText, THRESHOLD), ...numbersByKey(newText, COV_FLAG)]);
  for (const [k, olds] of oldMap) {
    const news = newMap.get(k);
    if (!news) { out.push(`coverage threshold ${k} removed (was ${olds.join(', ')})`); continue; }
    if (news.length < olds.length) { out.push(`coverage threshold ${k} lost an occurrence (was ${olds.join(', ')}, now ${news.join(', ')})`); continue; }
    for (let i = 0; i < Math.min(olds.length, news.length); i++) {
      if (news[i] < olds[i]) { out.push(`coverage threshold ${k} lowered from ${olds[i]} to ${news[i]}`); break; }
    }
  }
  return out;
}

const SEVERITY = { off: 0, warn: 1, error: 2, 0: 0, 1: 1, 2: 2 };

function lintRules(text, numeric) {
  const sev = numeric ? '(off|warn|error|0|1|2)' : '(off|warn|error)';
  const re = new RegExp(`["']?([@A-Za-z][\\w@/.-]*)["']?\\s*:\\s*\\[?\\s*["']?${sev}\\b["']?`, 'g');
  const out = new Map();
  for (const m of text.matchAll(re)) {
    const level = SEVERITY[m[2]];
    const cur = out.get(m[1]) || { sum: 0, max: 0 };
    out.set(m[1], { sum: cur.sum + level, max: Math.max(cur.max, level) });
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function lintWeakened(oldText, newText, numeric) {
  const out = [];
  const oldRules = lintRules(oldText, numeric);
  const newRules = lintRules(newText, numeric);
  for (const [rule, o] of oldRules) {
    const n = newRules.get(rule);
    if (n) {
      if (n.sum < o.sum) out.push(`lint rule ${rule} downgraded`);
    } else if (o.max > 0) {
      // Gone as a severity entry. Count it removed only when the key itself is gone, so a
      // value this parser does not read (an object, an option) never reads as a removal.
      const keyRe = new RegExp(`["']?${escapeRe(rule)}["']?\\s*:`);
      if (!keyRe.test(newText)) out.push(`lint rule ${rule} removed`);
    }
  }
  return out;
}

// The flags `strict` turns on; each one set explicitly wins over `strict`.
const STRICT_FAMILY = ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes', 'strictBindCallApply', 'strictPropertyInitialization', 'noImplicitThis', 'alwaysStrict', 'useUnknownInCatchVariables'];

function tsFlags(text) {
  const out = new Map();
  for (const m of text.matchAll(/["'](strict|noImplicitAny|strictNullChecks|strictFunctionTypes|strictBindCallApply|strictPropertyInitialization|noImplicitThis|alwaysStrict|useUnknownInCatchVariables)["']\s*:\s*(true|false)/g)) out.set(m[1], m[2] === 'true');
  return out;
}

function tsconfigWeakened(oldText, newText) {
  const out = [];
  const o = tsFlags(oldText);
  const n = tsFlags(newText);
  if (o.get('strict') === true && n.get('strict') !== true) out.push(`tsconfig strict turned from true to ${n.has('strict') ? 'false' : 'unset'}`);
  const on = (flags, k) => (flags.has(k) ? flags.get(k) : flags.get('strict') === true);
  for (const k of STRICT_FAMILY) {
    // A flag only implied by strict is reported once, as strict itself.
    if (on(o, k) && !on(n, k) && (o.has(k) || n.has(k))) out.push(`tsconfig ${k} turned from true to ${n.has(k) ? 'false' : 'unset'}`);
  }
  return out;
}

function versionOf(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : null;
}

function lower(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return y < x;
  }
  return false;
}

function toolchainVersion(base, text) {
  if (text === null) return null;
  if (base === '.nvmrc' || base === '.node-version') {
    const first = text.trim().split(/\s+/)[0] || '';
    return /^v?\d/.test(first) ? versionOf(first) : null;
  }
  if (base === 'package.json') {
    try {
      const node = JSON.parse(text)?.engines?.node;
      return typeof node === 'string' ? versionOf(node) : null;
    } catch { return null; }
  }
  if (base === 'go.mod') return versionOf((text.match(/^go\s+(\d+(?:\.\d+)*)\s*$/m) || [])[1]);
  if (base === 'rust-toolchain' || base === 'rust-toolchain.toml') {
    const channel = (text.match(/channel\s*=\s*["']([^"']+)["']/) || [])[1] ?? text.trim().split(/\s+/)[0];
    return /^\d/.test(channel || '') ? versionOf(channel) : null;
  }
  return null;
}

const TOOLCHAIN_FILE = new Set(['.nvmrc', '.node-version', 'package.json', 'go.mod', 'rust-toolchain', 'rust-toolchain.toml']);
// Files whose only job is a check or a pin: deleting one weakens it outright.
const DEDICATED = /^(?:(?:jest|vitest)\.config\.(?:[cm]?[jt]s|json)|\.nycrc(?:\.json|\.ya?ml)?|\.c8rc(?:\.json)?|\.coveragerc|\.nvmrc|\.node-version|rust-toolchain(?:\.toml)?)$/;

// addedConfig(file, newText): a new lint config that turns rules off, as a nested .eslintrc does
// to its directory, or a new coverage config with a threshold of 0.
function addedConfig(file, rawNew) {
  const base = file.split('/').at(-1);
  const newText = configCode(rawNew, base);
  const details = [];
  if (ESLINT_FILE.test(base) || BIOME_FILE.test(base)) {
    for (const [rule, r] of lintRules(newText, ESLINT_FILE.test(base))) if (r.max === 0) details.push(`added config turns lint rule ${rule} off`);
  }
  if (COVERAGE_FILE.test(base)) {
    for (const [k, values] of new Map([...numbersByKey(newText, THRESHOLD), ...numbersByKey(newText, COV_FLAG)])) if (values.some((v) => v === 0)) details.push(`added config sets coverage threshold ${k} to 0`);
  }
  return details;
}

// configCode(text, base): a config file with its comments removed and its strings kept, so a
// commented-out setting reads as removed. JSON, JSONC, and JS configs lose `//` and `/* */`
// comments; YAML, TOML, and INI files lose `#` comments (and INI `;` lines). The legacy
// extensionless .eslintrc, .nycrc, and .c8rc may be JSON or YAML, so they lose both.
export function configCode(text, base) {
  if (!text) return text;
  const c = /\.(json|jsonc|json5|[cm]?[jt]s)$/.test(base) || /^\.(eslintrc|nycrc|c8rc|stylelintrc)$/.test(base);
  const hash = /\.(ya?ml|toml|cfg|ini)$/.test(base) || /^\.(coveragerc|eslintrc|nycrc|c8rc|stylelintrc)$/.test(base);
  let out = text;
  if (c) {
    let r = '';
    for (let i = 0; i < out.length;) {
      const ch = out[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < out.length && out[j] !== ch && out[j] !== '\n') j += out[j] === '\\' ? 2 : 1;
        r += out.slice(i, j + 1);
        i = j + 1;
      } else if (out.startsWith('//', i)) {
        while (i < out.length && out[i] !== '\n') i++;
      } else if (out.startsWith('/*', i)) {
        const e = out.indexOf('*/', i + 2);
        const stop = e < 0 ? out.length : e + 2;
        r += out.slice(i, stop).replace(/[^\n]/g, ' ');
        i = stop;
      } else {
        r += ch;
        i++;
      }
    }
    out = r;
  }
  if (hash) {
    const ini = /\.(cfg|ini)$/.test(base) || base === '.coveragerc';
    out = out.split('\n').map((line) => {
      if (ini && /^\s*;/.test(line)) return '';
      let quote = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
      }
      return line;
    }).join('\n');
  }
  return out;
}

// deletedConfig(file, oldText): the reasons a deleted config file weakens a check, or [].
function deletedConfig(file, oldText) {
  const base = file.split('/').at(-1);
  if (DEDICATED.test(base) || ESLINT_FILE.test(base) || BIOME_FILE.test(base) || TSCONFIG_FILE.test(base)) return [`config file ${base} deleted`];
  const details = configFindings(file, oldText, '');
  if (TOOLCHAIN_FILE.has(base) && toolchainVersion(base, oldText)) details.push(`toolchain pin in ${base} deleted`);
  return details;
}

function configFindings(file, rawOld, rawNew) {
  const base = file.split('/').at(-1);
  const oldText = configCode(rawOld, base);
  const newText = configCode(rawNew, base);
  const details = [];
  if (COVERAGE_FILE.test(base)) details.push(...coverageWeakened(oldText, newText));
  if (ESLINT_FILE.test(base)) details.push(...lintWeakened(oldText, newText, true));
  if (BIOME_FILE.test(base)) details.push(...lintWeakened(oldText, newText, false));
  if (TSCONFIG_FILE.test(base)) details.push(...tsconfigWeakened(oldText, newText));
  if (TOOLCHAIN_FILE.has(base)) {
    const o = toolchainVersion(base, oldText);
    const n = toolchainVersion(base, newText);
    if (o && n && lower(o, n)) details.push(`toolchain version lowered from ${o.join('.')} to ${n.join('.')}`);
  }
  return details;
}

// ---- the diff ----

function changes(root, from, to) {
  const raw = git(root, ['diff', '--name-status', '-M', '-z', from, to, '--']);
  const parts = raw.split('\0');
  const out = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    if (!status) continue;
    if (status[0] === 'R' || status[0] === 'C') out.push({ status: status[0], oldPath: parts[i++], newPath: parts[i++] });
    else { const p = parts[i++]; out.push({ status: status[0], oldPath: p, newPath: p }); }
  }
  return out;
}

const norm = (p) => p.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
const under = (p, prot) => p === prot || p.startsWith(`${prot}/`);

export function check(root, base, head, protectedPaths = [], protectedBase = null) {
  let from;
  let to;
  let pfrom = null;
  try {
    to = git(root, ['rev-parse', '--verify', '--quiet', `${head}^{commit}`]).trim();
    const b = git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).trim();
    from = git(root, ['merge-base', b, to]).trim();
    if (protectedBase) pfrom = git(root, ['rev-parse', '--verify', '--quiet', `${protectedBase}^{commit}`]).trim();
  } catch {
    throw new UsageError(`cannot resolve ${base}, ${head}${protectedBase ? `, and ${protectedBase}` : ''} to commits with a merge base in ${root}`);
  }
  const prot = protectedPaths.map(norm).filter(Boolean);
  const findings = [];
  const diff = changes(root, from, to);
  for (const { status, oldPath, newPath } of pfrom ? changes(root, pfrom, to) : diff) {
    for (const p of status === 'R' ? [oldPath, newPath] : [newPath]) {
      const hit = prot.find((x) => under(p, x));
      if (hit) findings.push({ kind: 'protected-changed', path: p, detail: `change to protected path ${hit} (${status})` });
    }
  }
  for (const { status, oldPath, newPath } of diff) {
    const oldIsTest = isTestPath(oldPath);
    const newIsTest = isTestPath(newPath);
    if (status === 'D' && oldIsTest) findings.push({ kind: 'test-deleted', path: oldPath, detail: 'test file deleted' });
    // A rename can stop collection by name alone, even when the file stays under tests/.
    const uncollected = isCollected(oldPath) && !isCollected(newPath);
    if (status === 'R' && ((oldIsTest && !newIsTest) || uncollected)) findings.push({ kind: 'test-deleted', path: oldPath, detail: `test file renamed to ${newPath}, which is no longer collected as a test` });

    const oldText = status === 'A' || status === 'C' ? '' : show(root, from, oldPath) ?? '';
    if (status === 'D') {
      for (const detail of deletedConfig(oldPath, oldText)) findings.push({ kind: 'config-weakened', path: oldPath, detail });
      continue;
    }
    const newText = show(root, to, newPath) ?? '';
    const oldCode = blank(oldText, oldPath);
    const newCode = blank(newText, newPath);

    const skips = skipCount(newCode, newIsTest) - skipCount(oldCode, newIsTest);
    if (skips > 0) findings.push({ kind: 'skip-added', path: newPath, detail: `${skips} skip or focus marker(s) added` });

    if ((status === 'M' || status === 'R') && oldIsTest && newIsTest) {
      const before = count(oldCode, ASSERTION);
      const after = count(newCode, ASSERTION);
      if (after < before) findings.push({ kind: 'assertions-dropped', path: newPath, detail: `assertion-like calls fell from ${before} to ${after}` });
    }

    if (status === 'M' || status === 'R') {
      for (const detail of configFindings(newPath, oldText, newText)) findings.push({ kind: 'config-weakened', path: newPath, detail });
    }
    if (status === 'A' || status === 'C') {
      for (const detail of addedConfig(newPath, newText)) findings.push({ kind: 'config-weakened', path: newPath, detail });
    }

    const pragmas = PROSE.test(newPath) ? 0 : count(newText, PRAGMA) - count(oldText, PRAGMA);
    if (pragmas > 0) findings.push({ kind: 'pragma-added', path: newPath, detail: `${pragmas} disable or ignore pragma(s) added` });
  }
  return findings;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    const all = check(opts.root, opts.positional[0], opts.positional[1], opts.protected, opts.protectedBase);
    const findings = all.filter((f) => !opts.allow.includes(f.kind));
    const verdict = findings.length ? 'fail' : 'pass';
    fs.writeSync(1, `${JSON.stringify({ verdict, findings })}\n`);
    process.exit(verdict === 'pass' ? 0 : 1);
  } catch (e) {
    if (e instanceof UsageError) {
      fs.writeSync(2, `test-integrity: ${e.message}\nusage: test-integrity.mjs <base> <head> [--protected <path>...] [--protected-base <rev>] [--allow <kind>...] [--root <dir>]\n`);
      process.exit(64);
    }
    // Anything else means the diff could not be read; never report a pass.
    fs.writeSync(2, `test-integrity: cannot evaluate the diff: ${e && e.message ? e.message.split('\n')[0] : e}\n`);
    process.exit(64);
  }
}

const real = (p) => { try { return fs.realpathSync.native(p); } catch { return null; } };
const invoked = process.argv[1] ? real(process.argv[1]) : null;
if (invoked && invoked === real(fileURLToPath(import.meta.url))) main();
