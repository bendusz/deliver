#!/usr/bin/env node
// Measure review assurance against the frozen corpus in benchmarks/assurance. No model is called
// here: /deliver:calibrate runs the lenses, records each trial with `trial-record`, then `calc`.
//   node assurance.mjs list [--class <c>] [--kind seeded|clean] [--split select|certify]
//   node assurance.mjs witness [--id <case>]
//   node assurance.mjs prepare --id <case> --variant defect|clean
//   node assurance.mjs manifest --check | --write
//   node assurance.mjs trial-record --lens <agent> --model <m> --effort <e> --case <id> --trial <1|2>
//       --caught <true|false> --false-positive <true|false> [--phase select|certify] [--tokens <n>] [--out <jsonl>]
//   node assurance.mjs calc [--in <jsonl>] [--targets T0=0.10,T1=0.05,T2=0.02] [--write] [--json]
// Every command takes --corpus <dir> (default benchmarks/assurance) and --agents <dir> (default
// the plugin's agents/). Exit 0 ok, 1 a violation, 64 usage, 66 unreadable input.
//
// Calibration has two stages. `select` trials choose each tier's panel; `certify` trials, on
// cases the selection never saw, give the bound that panel is reported with. Choosing the panel
// on the same cases that bound it would overstate the coverage of the 95% bound.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REVIEW_DEFAULTS } from './codex/lib/args.mjs';
import { isMain } from '../hooks/lib.mjs';

export { REVIEW_DEFAULTS };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.join(HERE, '..');
// The Codex runner's argument file: its review defaults choose codex-reviewer's model and effort.
const CODEX_ARGS = path.join(HERE, 'codex', 'lib', 'args.mjs');
export const CORPUS_ROOT = path.join(PLUGIN, 'benchmarks', 'assurance');
export const AGENTS_DIR = path.join(PLUGIN, 'agents');
const MANIFEST = 'MANIFEST.sha256';
// Calibration output lives beside the corpus but is not part of it: `calibrate` rewrites these
// without touching the frozen fixtures.
const UNFROZEN = new Set(['results', 'panels.json']);
export const CLASSES = ['correctness', 'security', 'criterion-unmet', 'test-integrity', 'async', 'performance', 'error-handling', 'data'];
export const SPLITS = ['select', 'certify'];
export const DEFAULT_TARGETS = { T0: 0.10, T1: 0.05, T2: 0.02 };
// A panel holds at most this many lens trials in total. A lens at two trials fills two slots.
export const MAX_SLOTS = 6;
const ALPHA = 0.05;

// ---------- statistics ----------

// Lanczos approximation of ln(Gamma(x)), x > 0.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i += 1) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Continued fraction for the incomplete beta function (modified Lentz).
function betaCf(a, b, x) {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

// incBeta(x, a, b): the regularized incomplete beta function I_x(a, b).
export function incBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaCf(a, b, x)) / a : 1 - (front * betaCf(b, a, 1 - x)) / b;
}

// betaQuantile(p, a, b): the x with I_x(a, b) = p, by bisection.
export function betaQuantile(p, a, b) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200 && hi - lo > 1e-12; i += 1) {
    const mid = (lo + hi) / 2;
    if (incBeta(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// upperBound(x, n): the one-sided 95% Clopper-Pearson upper bound on a rate seen x times in n.
// No trials prove nothing, so n = 0 gives 1.
export function upperBound(x, n, alpha = ALPHA) {
  if (!(n > 0) || x >= n) return 1;
  if (x <= 0) return 1 - alpha ** (1 / n);
  return betaQuantile(1 - alpha, x + 1, n - x);
}

// ceil4(x): x rounded up to four decimals, so a stored bound never claims more than was shown.
export const ceil4 = (x) => Math.ceil(x * 10000 - 1e-9) / 10000;

// ---------- corpus ----------

export function loadCases(root = CORPUS_ROOT) {
  const cases = JSON.parse(fs.readFileSync(path.join(root, 'cases.json'), 'utf8'));
  if (!Array.isArray(cases)) throw new Error('cases.json must be an array');
  return cases;
}

// listCases: what the calibration may name. Never the witness, never the patches.
export function listCases(root = CORPUS_ROOT, { cls = null, kind = null, split = null } = {}) {
  return loadCases(root)
    .filter((c) => (!cls || c.class === cls) && (!kind || c.kind === kind) && (!split || c.split === split))
    .map((c) => ({ id: c.id, class: c.class, kind: c.kind, split: c.split }));
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (dir === base && (UNFROZEN.has(e.name) || e.name === MANIFEST)) continue;
    // Dotfiles are host litter (.DS_Store and the like), never corpus content.
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...walk(full, base));
    else out.push(rel);
  }
  return out;
}

export function manifest(root = CORPUS_ROOT) {
  return walk(root)
    .map((rel) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')}  ${rel}`)
    .join('\n') + '\n';
}

const sha256File = (file) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; }
};
// corpusSha256: the identity of the frozen corpus, the hash of its recorded manifest.
export const corpusSha256 = (root = CORPUS_ROOT) => sha256File(path.join(root, MANIFEST));
// promptSha256: the hash of a lens's agent file, or null when there is no such lens.
export const promptSha256 = (lens, agentsDir = AGENTS_DIR) => (/^[a-z0-9-]+$/.test(String(lens)) ? sha256File(path.join(agentsDir, `${lens}.md`)) : null);

// Children run without the caller's repository (GIT_DIR and friends) and without a parent test
// runner's context: under NODE_TEST_CONTEXT a child `node --test` reports to its parent and exits
// 0 even when its tests fail, which would admit every witness.
const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'NODE_TEST_CONTEXT' && k !== 'NODE_OPTIONS'));
const GIT_FLAGS = ['-c', 'core.autocrlf=false', '-c', 'user.email=assurance@deliver.invalid', '-c', 'user.name=assurance', '-c', 'commit.gpgsign=false'];
const gitSync = (dir, args) => execFileSync('git', ['-C', dir, ...GIT_FLAGS, ...args], { encoding: 'utf8', env: childEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

function run(cmd, args, cwd, timeout = 60000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, env: childEnv(), encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, timedOut: Boolean(err && err.killed), out: `${stdout}${stderr}`, stdout: String(stdout) });
    });
  });
}

const testFiles = (dir) => {
  const out = [];
  const visit = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full);
      else if (/\.test\.m?js$/.test(e.name)) out.push(path.relative(dir, full));
    }
  };
  visit(path.join(dir, 'test'));
  return out.sort();
};

const mjsFiles = (dir) => {
  const out = [];
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules') visit(full); } else if (/\.m?js$/.test(e.name)) out.push(full);
    }
  };
  visit(dir);
  return out;
};

// tapSummary(stdout, file): the counts node --test prints at the end of its TAP report, the
// number of real tests, and whether a failing test failed on an assertion (AssertionError, code
// ERR_ASSERTION) rather than on a load error, a missing module, a plain throw, or a timeout.
// node reports a file that defines no test, or that crashes before defining one, as a single
// test named after the file, so those entries never count as tests.
export function tapSummary(stdout, file = 'witness.test.mjs') {
  const num = (key) => {
    const m = String(stdout).match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const points = [...String(stdout).matchAll(/^\s*(?:not )?ok \d+ - (.*?)\s*$/gm)].map((m) => m[1]);
  return {
    tests: points.filter((name) => name !== file && !name.endsWith(`/${file}`) && !name.endsWith(`\\${file}`)).length,
    pass: num('pass'),
    fail: num('fail'),
    cancelled: num('cancelled'),
    assertionFailed: /^\s*not ok \d+/m.test(stdout) && /^\s*code: '?ERR_ASSERTION'?\s*$/m.test(stdout),
  };
}

// stage(caseDir, patch, scratch): copy base/ into a fresh git repository, commit it, and apply
// the patch to the index and working tree. Returns { dir, error }.
async function stage(caseDir, patch, scratch) {
  const dir = fs.mkdtempSync(path.join(scratch, 'case-'));
  fs.cpSync(path.join(caseDir, 'base'), dir, { recursive: true });
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'base']]) {
    const r = await run('git', ['-C', dir, ...GIT_FLAGS, ...args], dir);
    if (!r.ok) return { dir, error: `git ${args[0]} failed: ${r.out.trim()}` };
  }
  const r = await run('git', ['-C', dir, ...GIT_FLAGS, 'apply', '--index', '--whitespace=nowarn', path.join(caseDir, patch)], dir);
  return { dir, error: r.ok ? null : `${patch} does not apply to base/: ${r.out.trim()}` };
}

const indent = (text) => text.trim().split(/\r?\n/).slice(-15).map((l) => `      ${l}`).join('\n');

// One variant: the patch applies, every module parses, the patch's own tests pass (the gates
// would catch a defect they fail on), and the witness gives `expect`. A demonstrated defect is
// at least one test run and at least one assertion failure; a clean pass is at least one test
// run, all passing.
async function checkVariant(caseDir, patch, scratch, expect) {
  const problems = [];
  const s = await stage(caseDir, patch, scratch);
  if (s.error) return [s.error];
  for (const f of mjsFiles(s.dir)) {
    const r = await run(process.execPath, ['--check', f], s.dir);
    if (!r.ok) problems.push(`${patch}: ${path.relative(s.dir, f)} does not parse`);
  }
  const own = testFiles(s.dir);
  if (own.length) {
    const r = await run(process.execPath, ['--test', ...own], s.dir);
    if (!r.ok) problems.push(`${patch}: the patch's own tests fail, so a gate would catch it\n${indent(r.out)}`);
  }
  if (expect === null) return problems;
  if (fs.existsSync(path.join(s.dir, 'witness.test.mjs'))) problems.push(`${patch} creates witness.test.mjs`);
  fs.copyFileSync(path.join(caseDir, 'witness.test.mjs'), path.join(s.dir, 'witness.test.mjs'));
  const r = await run(process.execPath, ['--test', '--test-reporter=tap', 'witness.test.mjs'], s.dir);
  const t = tapSummary(r.stdout);
  if (r.timedOut) problems.push(`the witness timed out with ${patch} applied`);
  else if (!(t.tests >= 1)) problems.push(`the witness ran no test with ${patch} applied`);
  else if (expect === 'fail') {
    if (r.ok) problems.push(`the witness passes with ${patch} applied; the defect is not shown`);
    else if (!t.assertionFailed) problems.push(`the witness fails with ${patch} applied, but no assertion failed (a load error, missing module, plain throw, or timeout proves nothing)\n${indent(r.out)}`);
  } else if (!r.ok || t.fail !== 0 || t.cancelled || !(t.pass >= 1)) {
    problems.push(`the witness fails with ${patch} applied\n${indent(r.out)}`);
  }
  return problems;
}

// checkCase: every rule a case must meet to be admitted. Returns a list of problems.
export async function checkCase(c, root, scratch) {
  const problems = [];
  const caseDir = path.join(root, 'fixtures', String(c.id));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(c.id))) problems.push('id must be lowercase letters, digits, and hyphens');
  if (!CLASSES.includes(c.class)) problems.push(`class "${c.class}" is not one of ${CLASSES.join(', ')}`);
  if (c.kind !== 'seeded' && c.kind !== 'clean') problems.push(`kind "${c.kind}" is neither seeded nor clean`);
  if (!SPLITS.includes(c.split)) problems.push(`split "${c.split}" is neither select nor certify`);
  if (!/^batch-\d+$/.test(String(c.batch))) problems.push(`batch "${c.batch}" is not batch-<n>`);
  const need = ['story.md', 'base', 'clean.patch', ...(c.kind === 'seeded' ? ['defect.patch', 'witness.test.mjs'] : [])];
  for (const f of need) if (!fs.existsSync(path.join(caseDir, f))) problems.push(`missing ${f}`);
  if (c.kind === 'clean') for (const f of ['defect.patch', 'witness.test.mjs']) if (fs.existsSync(path.join(caseDir, f))) problems.push(`a clean case carries ${f}`);
  if (problems.some((p) => p.startsWith('missing') || p.startsWith('a clean case'))) return problems;
  if (c.kind === 'seeded') {
    problems.push(...await checkVariant(caseDir, 'defect.patch', scratch, 'fail'));
    problems.push(...await checkVariant(caseDir, 'clean.patch', scratch, 'pass'));
  } else {
    problems.push(...await checkVariant(caseDir, 'clean.patch', scratch, null));
  }
  return problems;
}

// witness(root, ids): check cases in parallel. Returns [{ id, kind, problems }].
export async function witness(root = CORPUS_ROOT, { id = null } = {}) {
  const all = loadCases(root);
  const cases = id ? all.filter((c) => c.id === id) : all;
  if (id && !cases.length) throw new Error(`no case ${id}`);
  const results = [];
  const seen = new Set();
  for (const c of all) {
    if (seen.has(c.id)) results.push({ id: c.id, kind: c.kind, problems: ['duplicate id in cases.json'] });
    seen.add(c.id);
  }
  const listed = new Set(all.map((c) => c.id));
  const fixtures = fs.existsSync(path.join(root, 'fixtures')) ? fs.readdirSync(path.join(root, 'fixtures')).filter((f) => !f.startsWith('.')) : [];
  if (!id) for (const f of fixtures) if (!listed.has(f)) results.push({ id: f, kind: null, problems: ['fixture directory not listed in cases.json'] });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-'));
  try {
    const width = Math.max(1, Math.min(8, (os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
    let next = 0;
    const worker = async () => {
      while (next < cases.length) {
        const c = cases[next++];
        results.push({ id: c.id, kind: c.kind, problems: await checkCase(c, root, scratch) });
      }
    };
    await Promise.all(Array.from({ length: width }, worker));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
  return results.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// prepare: a fresh git repository under the system temporary directory, with an opaque random
// name that says nothing about the case or the corpus. Its one commit holds base/, the story at
// docs/story.md, and a .gitignore for the Codex runner's report directories; the chosen patch is
// staged, for a lens that reads a repository (codex-reviewer, `worktree` scope). Returns
// { dir, diff }; the diff is what every lens receives. Only the caller knows which case dir is.
export function prepare(root, id, variant) {
  const c = loadCases(root).find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  if (variant === 'defect' && c.kind !== 'seeded') throw new Error(`${id} is a clean case and has no defect variant`);
  const caseDir = path.join(root, 'fixtures', id);
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'r'));
  try {
    fs.cpSync(path.join(caseDir, 'base'), dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.copyFileSync(path.join(caseDir, 'story.md'), path.join(dir, 'docs', 'story.md'));
    fs.writeFileSync(path.join(dir, '.gitignore'), '/codex/\n/untracked/\n');
    gitSync(dir, ['init', '-q']);
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-qm', 'base']);
    gitSync(dir, ['apply', '--index', '--whitespace=nowarn', path.join(caseDir, `${variant}.patch`)]);
    return { dir, diff: gitSync(dir, ['diff', '--cached']) };
  } catch (err) {
    // A half-built repository is never left behind for a lens to be pointed at.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    throw err;
  }
}

// ---------- trials ----------

export function readTrials(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let r;
    try { r = JSON.parse(line); } catch { throw new Error(`${file}:${i + 1} is not JSON`); }
    if (!r || typeof r.lens !== 'string' || typeof r.case !== 'string' || !Number.isInteger(r.trial)) throw new Error(`${file}:${i + 1} lacks lens, case, or trial`);
    rows.push(r);
  });
  return rows;
}

// trialLine: one JSONL record. Each line carries the prompt and corpus it was produced against and
// the UTC time it was recorded, so old evidence can never be restamped as new. A codex-reviewer
// line also carries the hash of the Codex runner's argument file, whose review defaults chose its
// model and effort.
export function trialLine({ lens, model, effort, promptSha256: hash, corpusSha256: corpus, codexArgsSha256: args, recordedAt, phase, caseId, trial, caught, falsePositive, tokens = null }) {
  return JSON.stringify({ lens, model, effort, promptSha256: hash, corpusSha256: corpus, ...(args ? { codexArgsSha256: args } : {}), recordedAt, phase, case: caseId, trial, caught, falsePositive, tokens });
}

const trialKey = (r) => `${r.lens}\u0000${r.case}\u0000${r.trial}\u0000${r.phase}`;
// recordedAt is exactly what Date.prototype.toISOString writes: milliseconds and a Z.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// parseUtc(s): milliseconds since the epoch for a timestamp in exactly that form, else NaN.
export const parseUtc = (s) => (typeof s === 'string' && ISO_UTC.test(s) ? Date.parse(s) : NaN);
const timeOf = (r) => parseUtc(r.recordedAt);

// validateTrials(records, cases, { corpusSha256 }): throws on any record calc cannot trust. When
// corpusSha256 is given, every record must have been made against that corpus. Select trials must
// all precede the first certify trial, in time and in file order: a select phase reopened after
// certify results were seen would let those results steer the choice.
export function validateTrials(records, cases, { corpusSha256: corpus = null } = {}) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const seen = new Set();
  const config = new Map();
  for (const r of records) {
    const where = `${r.lens} ${r.case} trial ${r.trial}`;
    if (r.trial !== 1 && r.trial !== 2) throw new Error(`${where}: trial must be 1 or 2`);
    if (!SPLITS.includes(r.phase)) throw new Error(`${where}: phase must be select or certify`);
    const c = byId.get(r.case);
    if (!c) throw new Error(`${where}: no such case in cases.json`);
    if (c.split !== r.phase) throw new Error(`${where}: phase ${r.phase} on a ${c.split}-split case`);
    if (typeof r.promptSha256 !== 'string' || !r.promptSha256) throw new Error(`${where}: no promptSha256; re-record the trial with trial-record`);
    if (typeof r.corpusSha256 !== 'string' || !r.corpusSha256) throw new Error(`${where}: no corpusSha256; re-record the trial with trial-record`);
    if (corpus !== null && r.corpusSha256 !== corpus) throw new Error(`${where}: recorded on another corpus (manifest ${r.corpusSha256.slice(0, 12)}); re-run /deliver:calibrate on the corpus today`);
    if (!Number.isFinite(timeOf(r))) throw new Error(`${where}: no recordedAt UTC timestamp (YYYY-MM-DDTHH:MM:SS.sssZ); re-record the trial with trial-record`);
    if (r.lens === 'codex-reviewer' && (typeof r.codexArgsSha256 !== 'string' || !r.codexArgsSha256)) throw new Error(`${where}: a codex-reviewer trial needs codexArgsSha256; re-record the trial with trial-record`);
    const key = trialKey(r);
    if (seen.has(key)) throw new Error(`${where} (${r.phase}): duplicate trial`);
    seen.add(key);
    const conf = `${r.model}/${r.effort}/${r.promptSha256}/${r.corpusSha256}${r.lens === 'codex-reviewer' ? `/${r.codexArgsSha256}` : ''}`;
    if (!config.has(r.lens)) config.set(r.lens, new Set());
    config.get(r.lens).add(conf);
  }
  for (const r of records) {
    if (r.trial === 2 && !seen.has(trialKey({ ...r, trial: 1 }))) throw new Error(`${r.lens} ${r.case} (${r.phase}): trial 2 without trial 1`);
  }
  const firstCertify = records.findIndex((r) => r.phase === 'certify');
  const after = firstCertify < 0 ? undefined : records.slice(firstCertify + 1).find((r) => r.phase === 'select');
  if (after) throw new Error(`select trial ${after.lens} ${after.case} trial ${after.trial} comes after the first certify line in the trials file. Start a fresh trials file and re-run both phases.`);
  const certify = records.filter((r) => r.phase === 'certify').map(timeOf);
  if (certify.length) {
    const began = Math.min(...certify);
    const late = records.find((r) => r.phase === 'select' && timeOf(r) > began);
    if (late) throw new Error(`select trial ${late.lens} ${late.case} trial ${late.trial} was recorded at ${late.recordedAt}, after certify began at ${new Date(began).toISOString()}. Start a fresh trials file and re-run both phases.`);
  }
  const mixed = [...config].filter(([, s]) => s.size > 1).map(([lens, s]) => `${lens} (${[...s].join(', ')})`);
  if (mixed.length) throw new Error(`trials mix models, efforts, prompts, corpora, or runner defaults for ${mixed.join('; ')}. Calibrate one configuration per lens.`);
}

// ---------- the calculator ----------

const panelKey = (panel) => panel.map((m) => `${m.lens}x${m.trials}`).join('+');

// lensTable(records): per lens, per case, the outcome of trial 1 and trial 2. A lens's cost is
// known only when every one of its records carries a token count.
function lensTable(records) {
  const lenses = new Map();
  for (const r of records) {
    if (!lenses.has(r.lens)) lenses.set(r.lens, { cases: new Map(), tokens: [], unpriced: false, model: r.model ?? null, effort: r.effort ?? null, promptSha256: r.promptSha256 });
    const L = lenses.get(r.lens);
    if (!L.cases.has(r.case)) L.cases.set(r.case, {});
    L.cases.get(r.case)[r.trial] = { caught: r.caught === true, fp: r.falsePositive === true };
    if (Number.isFinite(r.tokens) && r.tokens >= 0) L.tokens.push(r.tokens); else L.unpriced = true;
  }
  for (const L of lenses.values()) {
    L.meanTokens = L.unpriced || !L.tokens.length ? null : L.tokens.reduce((a, b) => a + b, 0) / L.tokens.length;
    // Two trials are a candidate only where trial 2 exists wherever trial 1 does.
    const rows = [...L.cases.values()];
    L.canRepeat = rows.some((row) => row[2]) && rows.every((row) => !row[1] || row[2]);
  }
  return lenses;
}

const hasTrials = (L, caseId, trials) => {
  const row = L && L.cases.get(caseId);
  if (!row) return false;
  for (let t = 1; t <= trials; t += 1) if (!row[t]) return false;
  return true;
};

// A member's counted trials: trial 1, or trials 1 and 2.
function memberHit(L, caseId, trials, field) {
  const row = L && L.cases.get(caseId);
  if (!row) return false;
  for (let t = 1; t <= trials; t += 1) if (row[t] && row[t][field]) return true;
  return false;
}

export function enumeratePanels(lenses, maxSlots = MAX_SLOTS, canRepeat = null) {
  const names = [...lenses].sort();
  const out = [];
  const visit = (i, panel, slots) => {
    if (i === names.length) { if (panel.length) out.push(panel); return; }
    visit(i + 1, panel, slots);
    for (const t of [1, 2]) {
      if (t === 2 && canRepeat && !canRepeat.has(names[i])) continue;
      if (slots + t <= maxSlots) visit(i + 1, [...panel, { lens: names[i], trials: t }], slots + t);
    }
  };
  visit(0, [], 0);
  return out;
}

// evaluate(panel, table, cases): the joint escape over every seeded case of one split. A seeded
// case is caught when any member caught it in a counted trial; a lens never run on a case counts
// as missing it, so a specialist lens cannot claim classes it was not shown. No independence is
// assumed: two lenses that miss the same case add one escape, not a product of rates. The
// false-positive rate is known only when every member ran its counted trials on every clean case.
export function evaluate(panel, table, cases) {
  const seeded = cases.filter((c) => c.kind === 'seeded');
  const clean = cases.filter((c) => c.kind === 'clean');
  const L = (m) => table.get(m.lens);
  let escapes = 0;
  for (const c of seeded) if (!panel.some((m) => memberHit(L(m), c.id, m.trials, 'caught'))) escapes += 1;
  const fpCovered = clean.length > 0 && panel.every((m) => clean.every((c) => hasTrials(L(m), c.id, m.trials)));
  let fp = 0;
  for (const c of clean) if (panel.some((m) => memberHit(L(m), c.id, m.trials, 'fp'))) fp += 1;
  const priced = panel.every((m) => L(m) && L(m).meanTokens !== null);
  const n = seeded.length;
  return {
    panel,
    key: panelKey(panel),
    members: panel.length,
    slots: panel.reduce((s, m) => s + m.trials, 0),
    escapes,
    n,
    escapeRate: n ? escapes / n : null,
    bound: upperBound(escapes, n),
    falsePositives: fpCovered ? fp : null,
    cleanN: clean.length,
    fpRate: fpCovered ? fp / clean.length : null,
    tokens: priced ? panel.reduce((s, m) => s + L(m).meanTokens * m.trials, 0) : null,
    complete: panel.every((m) => cases.every((c) => hasTrials(L(m), c.id, m.trials))),
  };
}

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
// Priced panels first, cheapest first; panels with an unknown cost after them. Within either
// group, ties go to fewer select escapes, then a lower false-positive rate, then fewer slots.
const rank = (a, b) => {
  const ua = a.tokens === null;
  const ub = b.tokens === null;
  if (ua !== ub) return ua ? 1 : -1;
  return (ua ? 0 : a.tokens - b.tokens) || a.escapes - b.escapes || (a.fpRate ?? 1) - (b.fpRate ?? 1) || a.slots - b.slots || a.members - b.members || byKey(a, b);
};
const selectRate = (r) => (r.n > 0 ? r.escapes / r.n : 1);

// selectTier(results, target): the panel the select split chooses for one target, or null with
// the panel that escaped least. Selection uses the observed escape rate, a point estimate, never
// a bound: the select split ranks panels and the certify split alone measures the chosen one.
// Only a panel with a known false-positive rate is eligible.
export function selectTier(results, target) {
  const ok = results.filter((r) => r.fpRate !== null && selectRate(r) <= target).sort(rank);
  if (ok.length) return { chosen: ok[0], panel: ok[0].panel };
  const best = [...results].sort((a, b) => selectRate(a) - selectRate(b) || rank(a, b))[0] || null;
  return { chosen: null, panel: [], best };
}

export function parseTargets(text) {
  const out = {};
  for (const part of String(text).split(',')) {
    const m = part.trim().match(/^(T\d)=(0(?:\.\d+)?|1(?:\.0+)?)$/);
    if (!m) throw new Error(`bad target "${part}"`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}

// certifyCasesNeeded(target): the fewest certify seeded cases whose zero-escape bound meets the
// target, the smallest n with 1 - 0.05^(1/n) <= target.
export function certifyCasesNeeded(target) {
  if (!(target > 0)) return Infinity;
  if (target >= 1) return 1;
  let n = Math.max(1, Math.ceil(Math.log(ALPHA) / Math.log(1 - target)));
  while (upperBound(0, n) > target) n += 1;
  while (n > 1 && upperBound(0, n - 1) <= target) n -= 1;
  return n;
}

const splitTables = (records, cases) => {
  const casesOf = (split) => cases.filter((c) => c.split === split);
  return {
    sel: { cases: casesOf('select'), table: lensTable(records.filter((r) => r.phase === 'select')) },
    cert: { cases: casesOf('certify'), table: lensTable(records.filter((r) => r.phase === 'certify')) },
  };
};

// selectPanels(records, cases, targets): stage 1. Per tier, the panel the select split chooses,
// and whether the certify split is large enough to reach the target at all.
export function selectPanels(records, cases, targets = DEFAULT_TARGETS) {
  const { sel, cert } = splitTables(records, cases);
  const canRepeat = new Set([...sel.table].filter(([, L]) => L.canRepeat).map(([name]) => name));
  const results = enumeratePanels(sel.table.keys(), MAX_SLOTS, canRepeat).map((p) => evaluate(p, sel.table, sel.cases));
  const nSelect = sel.cases.filter((c) => c.kind === 'seeded').length;
  const nCertify = cert.cases.filter((c) => c.kind === 'seeded').length;
  const selection = {};
  for (const [tier, target] of Object.entries(targets)) {
    const pick = selectTier(results, target);
    const needed = certifyCasesNeeded(target);
    selection[tier] = { target, nSelect, nCertify, needed, reachable: nCertify >= needed, chosen: pick.chosen, best: pick.best || null };
  }
  return { results, selection };
}

// certifyPlan(selection): what the certify phase runs. The lenses of every reachable tier's chosen
// panel, once each, at the most trials any of those panels gives the lens.
export function certifyPlan(selection) {
  const trials = new Map();
  for (const s of Object.values(selection)) {
    if (!s.reachable || !s.chosen) continue;
    for (const m of s.chosen.panel) trials.set(m.lens, Math.max(trials.get(m.lens) || 0, m.trials));
  }
  return [...trials].sort(([a], [b]) => (a < b ? -1 : 1)).map(([lens, t]) => ({ lens, trials: t }));
}

// certifyPanels(records, cases, selection): stage 2. Each tier's status, bound, and false-positive
// rate from the certify trials of exactly its chosen panel: one test per tier, on cases the
// selection never saw. A tier the certify split cannot reach, a tier with no chosen panel, and a
// chosen panel without complete certify trials are unmeasured.
export function certifyPanels(records, cases, selection) {
  const { cert } = splitTables(records, cases);
  const tiers = {};
  for (const [tier, s] of Object.entries(selection)) {
    const base = { target: s.target, nSelect: s.nSelect, nCertify: s.nCertify, certifyBound: null, fpRate: null, bound: null };
    const fromSelect = (r) => (r ? { selectEscapes: r.escapes, selectRate: selectRate(r), tokens: r.tokens } : { selectEscapes: null, selectRate: null, tokens: null });
    if (!s.reachable) {
      const r = s.chosen || s.best;
      tiers[tier] = { ...base, ...fromSelect(r), status: 'unmeasured', reason: `corpus too small: needs ≥ ${s.needed} certify cases`, panel: [], bestPanel: r ? r.panel : [] };
      continue;
    }
    if (!s.chosen) {
      tiers[tier] = { ...base, ...fromSelect(s.best), status: 'unmeasured', reason: 'no panel meets the target on the select split', panel: [], bestPanel: s.best ? s.best.panel : [] };
      continue;
    }
    const shared = { ...base, ...fromSelect(s.chosen) };
    const c = evaluate(s.chosen.panel, cert.table, cert.cases);
    if (!c.complete) {
      tiers[tier] = { ...shared, status: 'unmeasured', reason: 'certify trials missing or incomplete for the chosen panel', panel: [], bestPanel: s.chosen.panel };
    } else if (c.bound > s.target) {
      tiers[tier] = { ...shared, status: 'unmeasured', reason: 'the certify bound is over the target', panel: [], bestPanel: s.chosen.panel, bound: c.bound, certifyBound: c.bound, fpRate: c.fpRate };
    } else {
      tiers[tier] = { ...shared, status: 'measured', panel: s.chosen.panel, bound: c.bound, certifyBound: c.bound, fpRate: c.fpRate };
    }
  }
  return tiers;
}

// calc(records, cases, targets, { corpusSha256 }): validate the trials, select, then certify.
// calibratedAt is the latest trial's recordedAt, so the same trials always give the same stamp.
export function calc(records, cases, targets = DEFAULT_TARGETS, opts = {}) {
  validateTrials(records, cases, opts);
  const { results, selection } = selectPanels(records, cases, targets);
  const tiers = certifyPanels(records, cases, selection);
  const { sel, cert } = splitTables(records, cases);
  const lenses = {};
  for (const name of [...new Set([...sel.table.keys(), ...cert.table.keys()])].sort()) {
    const L = sel.table.get(name) || cert.table.get(name);
    const solo = (split) => (split.table.has(name) ? evaluate([{ lens: name, trials: 1 }], split.table, split.cases) : null);
    const s = solo(sel);
    const k = solo(cert);
    lenses[name] = {
      model: L.model, effort: L.effort, promptSha256: L.promptSha256, meanTokens: sel.table.has(name) ? sel.table.get(name).meanTokens : null,
      select: s ? { caughtTrial1: s.n - s.escapes, seeded: s.n, falsePositivesTrial1: s.falsePositives, clean: s.cleanN } : null,
      certify: k ? { caughtTrial1: k.n - k.escapes, seeded: k.n, falsePositivesTrial1: k.falsePositives, clean: k.cleanN } : null,
    };
  }
  const corpora = [...new Set(records.map((r) => r.corpusSha256))];
  const codexArgs = [...new Set(records.filter((r) => r.lens === 'codex-reviewer').map((r) => r.codexArgsSha256))];
  const latest = records.reduce((best, r) => (best === null || timeOf(r) > timeOf(best) ? r : best), null);
  return {
    lenses, results, tiers, plan: certifyPlan(selection),
    calibratedAt: latest ? latest.recordedAt : null,
    corpusSha256: corpora.length === 1 ? corpora[0] : null,
    codexArgsSha256: codexArgs.length === 1 ? codexArgs[0] : null,
  };
}

export function pluginVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return null; }
}

// promptDrift(records, agentsDir): lenses whose recorded prompt hash no longer matches their
// agent file. calc refuses these rather than stamp old evidence with a new prompt.
export function promptDrift(records, agentsDir = AGENTS_DIR) {
  const out = new Set();
  for (const r of records) if (r.promptSha256 !== promptSha256(r.lens, agentsDir)) out.add(r.lens);
  return [...out].sort();
}

// panelsDoc: the panels.json body, a pure function of the trials. Each lens is stamped with the
// model, effort, and prompt hash its trials were recorded under; the corpus with the manifest hash
// the trials were recorded against; the time with the latest trial's; and the Codex runner's
// argument file with the hash its codex-reviewer trials recorded (null without any), since its
// review defaults pick codex-reviewer's model. `deliver`, the plugin version calc ran under, is the
// one field not taken from the trials; it is informational and never read for staleness.
export function panelsDoc(result) {
  const lenses = {};
  for (const [name, L] of Object.entries(result.lenses)) lenses[name] = { model: L.model, effort: L.effort, promptSha256: L.promptSha256 };
  const r4 = (x) => (typeof x === 'number' ? ceil4(x) : x);
  const tiers = {};
  for (const [tier, t] of Object.entries(result.tiers)) {
    tiers[tier] = {
      status: t.status, panel: t.panel, bound: r4(t.bound), target: t.target, fpRate: t.fpRate === null ? null : Math.round(t.fpRate * 10000) / 10000,
      tokens: t.tokens === null ? null : Math.round(t.tokens), selectEscapes: t.selectEscapes, selectRate: t.selectRate === null ? null : Math.round(t.selectRate * 10000) / 10000,
      certifyBound: r4(t.certifyBound), nSelect: t.nSelect, nCertify: t.nCertify,
    };
    if (t.status === 'unmeasured') Object.assign(tiers[tier], { reason: t.reason, bestPanel: t.bestPanel });
  }
  return {
    stamp: { deliver: pluginVersion(), corpusSha256: result.corpusSha256, codexArgsSha256: result.codexArgsSha256, lenses, calibratedAt: result.calibratedAt },
    tiers,
  };
}

// staleness(doc): why panels.json no longer describes the shipped lenses and corpus, or [] when
// it does. Stale means: the corpus manifest changed; a lens on a measured panel has no stamp, a
// null hash, or a hash that differs from its agent file today; measured tiers with no lens stamps
// at all; or, with codex-reviewer on a measured panel, a stamped model or effort that differs from
// the Codex runner's review default, or a changed scripts/codex/lib/args.mjs. A stale document is
// no calibration: every tier runs the maximum panel.
export function staleness(doc, { agentsDir = AGENTS_DIR, corpusRoot = CORPUS_ROOT } = {}) {
  if (!doc || !doc.stamp || !doc.tiers) return ['panels.json has no stamp'];
  const reasons = [];
  if (doc.stamp.corpusSha256 !== corpusSha256(corpusRoot)) reasons.push('the corpus changed since calibration');
  const stamped = doc.stamp.lenses && typeof doc.stamp.lenses === 'object' ? doc.stamp.lenses : {};
  const measured = Object.values(doc.tiers).filter((t) => t && t.status === 'measured');
  if (measured.length && !Object.keys(stamped).length) reasons.push('measured tiers but no lens stamps');
  const lenses = new Set(measured.flatMap((t) => panelLenses(t.panel)));
  for (const lens of [...lenses].sort()) reasons.push(...lensStaleness(doc, lens, agentsDir));
  return reasons;
}

const panelLenses = (panel) => (Array.isArray(panel) ? panel.map((m) => m && m.lens) : []);

// lensStaleness(doc, lens, agentsDir): why one lens's stamp no longer matches the shipped lens.
function lensStaleness(doc, lens, agentsDir) {
  const reasons = [];
  const s = doc.stamp.lenses && typeof doc.stamp.lenses === 'object' ? doc.stamp.lenses[lens] : undefined;
  const now = promptSha256(lens, agentsDir);
  if (!s || typeof s.promptSha256 !== 'string') reasons.push(`${lens} has no prompt stamp`);
  else if (now === null) reasons.push(`${lens} has no agent file`);
  else if (s.promptSha256 !== now) reasons.push(`${lens} prompt changed since calibration`);
  if (lens === 'codex-reviewer' && s) {
    if (s.model !== REVIEW_DEFAULTS.model) reasons.push(`codex-reviewer was calibrated on model ${s.model}, but the runner's review default is ${REVIEW_DEFAULTS.model}`);
    if (s.effort !== REVIEW_DEFAULTS.effort) reasons.push(`codex-reviewer was calibrated at effort ${s.effort}, but the runner's review default is ${REVIEW_DEFAULTS.effort}`);
    if (doc.stamp.codexArgsSha256 !== sha256File(CODEX_ARGS)) reasons.push('scripts/codex/lib/args.mjs changed since calibration');
  }
  return reasons;
}

// boundStaleness(doc, tier): why the tier's certify bound may not be shown, or [] when it may. The
// whole document must be current, and so must every lens behind the bound: the measured panel's,
// or an unmeasured tier's best panel. A bound with no lens recorded behind it is never shown.
// docReasons, when given, is staleness(doc) already computed, so a caller checking every tier
// computes it once.
export function boundStaleness(doc, tier, { agentsDir = AGENTS_DIR, corpusRoot = CORPUS_ROOT, docReasons = null } = {}) {
  const reasons = [...(docReasons ?? staleness(doc, { agentsDir, corpusRoot }))];
  if (!doc || !doc.stamp || !doc.tiers) return reasons;
  const t = doc.tiers[tier] || {};
  const behind = [...new Set(panelLenses(t.panel).length ? panelLenses(t.panel) : panelLenses(t.bestPanel))];
  if (!behind.length || behind.some((l) => typeof l !== 'string')) return [...reasons, `${tier} records no lens behind its bound`];
  for (const lens of behind.sort()) for (const r of lensStaleness(doc, lens, agentsDir)) if (!reasons.includes(r)) reasons.push(r);
  return reasons;
}

const pct = (x) => (x === null || x === undefined ? '-' : `${(x * 100).toFixed(1)}%`);
const fmtPanel = (p) => (p && p.length ? p.map((m) => (m.trials > 1 ? `${m.lens} x${m.trials}` : m.lens)).join(' + ') : '-');
const fmtTokens = (t) => (t === null || t === undefined ? 'unknown' : String(Math.round(t)));

export function renderCalc(result) {
  const frac = (s, key, of) => (s ? `${s[key] === null ? '?' : s[key]}/${s[of]}` : '-');
  const out = ['| lens | model | effort | select: caught / seeded | select: FP / clean | certify: caught / seeded | certify: FP / clean | mean tokens |',
    '|------|-------|--------|-------------------------|--------------------|--------------------------|---------------------|-------------|'];
  for (const [name, L] of Object.entries(result.lenses)) {
    out.push(`| ${name} | ${L.model} | ${L.effort} | ${frac(L.select, 'caughtTrial1', 'seeded')} | ${frac(L.select, 'falsePositivesTrial1', 'clean')} | ${frac(L.certify, 'caughtTrial1', 'seeded')} | ${frac(L.certify, 'falsePositivesTrial1', 'clean')} | ${fmtTokens(L.meanTokens)} |`);
  }
  out.push('', '| tier | target | status | panel | select escapes (not assurance) | certify bound | certify fp rate | tokens |', '|------|--------|--------|-------|--------------------------------|---------------|-----------------|--------|');
  for (const [tier, t] of Object.entries(result.tiers)) {
    const panel = t.status === 'measured' ? fmtPanel(t.panel) : `maximum panel (candidate: ${fmtPanel(t.bestPanel)}; ${t.reason})`;
    const selected = t.selectEscapes === null ? '-' : `${t.selectEscapes}/${t.nSelect}`;
    out.push(`| ${tier} | ${pct(t.target)} | ${t.status} | ${panel} | ${selected} | ${pct(t.certifyBound)} | ${pct(t.fpRate)} | ${fmtTokens(t.tokens)} |`);
  }
  out.push('', result.plan.length
    ? `Certify plan: ${result.plan.map((m) => (m.trials > 1 ? `${m.lens} x${m.trials}` : m.lens)).join(', ')}, on every certify case.`
    : 'Certify plan: nothing to certify.');
  const top = [...result.results].sort((a, b) => selectRate(a) - selectRate(b) || rank(a, b)).slice(0, 10);
  out.push('', 'Fewest select-split escapes (ranking only, not assurance):', '| panel | escapes | fp rate | tokens |', '|-------|---------|---------|--------|');
  for (const r of top) out.push(`| ${fmtPanel(r.panel)} | ${r.escapes}/${r.n} | ${r.fpRate === null ? 'unknown' : pct(r.fpRate)} | ${fmtTokens(r.tokens)} |`);
  return out.join('\n') + '\n';
}

// ---------- CLI ----------

// isMain compares real paths, so a symlinked path to this file still runs it.
if (isMain(import.meta.url)) {
  const die = (message, code) => { fs.writeSync(2, `${message}\n`); process.exit(code); };
  const usage = () => die('usage: assurance.mjs list [--class c] [--kind seeded|clean] [--split select|certify] | witness [--id x] | prepare --id x --variant defect|clean | manifest --check|--write | trial-record --lens l --model m --effort e --case id --trial 1|2 --caught true|false --false-positive true|false [--phase select|certify] [--tokens n] [--out f] | calc [--in f] [--targets T0=0.10,T1=0.05,T2=0.02] [--write] [--json]  (all take --corpus d, --agents d)', 64);
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = {};
  const BOOL = new Set(['--write', '--check', '--json']);
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) usage();
    if (BOOL.has(rest[i])) flags[rest[i]] = true;
    else if (rest[i + 1] === undefined) usage();
    else { flags[rest[i]] = rest[i + 1]; i += 1; }
  }
  const allowed = (...names) => { for (const k of Object.keys(flags)) if (!['--corpus', '--agents', ...names].includes(k)) usage(); };
  const root = path.resolve(flags['--corpus'] || CORPUS_ROOT);
  const agentsDir = path.resolve(flags['--agents'] || AGENTS_DIR);
  const print = (value) => fs.writeSync(1, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  const cases = () => { try { return loadCases(root); } catch (err) { return die(`assurance: cannot read ${path.join(root, 'cases.json')}: ${err.message}`, 66); } };

  if (cmd === 'list') {
    allowed('--class', '--kind', '--split');
    if (flags['--kind'] && !['seeded', 'clean'].includes(flags['--kind'])) usage();
    if (flags['--split'] && !SPLITS.includes(flags['--split'])) usage();
    cases();
    print(listCases(root, { cls: flags['--class'] || null, kind: flags['--kind'] || null, split: flags['--split'] || null }));
  } else if (cmd === 'manifest') {
    allowed('--check', '--write');
    if (flags['--write'] === flags['--check']) usage();
    if (flags['--write']) fs.writeFileSync(path.join(root, MANIFEST), manifest(root));
    else {
      let recorded = null;
      try { recorded = fs.readFileSync(path.join(root, MANIFEST), 'utf8'); } catch { /* reported below */ }
      if (recorded !== manifest(root)) die('assurance: the corpus differs from MANIFEST.sha256. The corpus is frozen; a new batch re-runs `manifest --write` and is committed alone.', 1);
    }
  } else if (cmd === 'witness') {
    allowed('--id');
    cases();
    let results;
    try { results = await witness(root, { id: flags['--id'] || null }); } catch (err) { die(`assurance: ${err.message}`, 66); }
    const bad = results.filter((r) => r.problems.length);
    const seeded = results.filter((r) => r.kind === 'seeded').length;
    const clean = results.filter((r) => r.kind === 'clean').length;
    if (bad.length) {
      const lines = [`assurance: ${bad.length} of ${results.length} cases violate the witness rule:`];
      for (const r of bad) for (const p of r.problems) lines.push(`  ${r.id}: ${p}`);
      die(lines.join('\n'), 1);
    }
    print(`assurance: ${seeded} seeded witnesses fail with the defect and pass clean; ${clean} clean patches apply.\n`);
  } else if (cmd === 'prepare') {
    allowed('--id', '--variant');
    if (!flags['--id'] || !['defect', 'clean'].includes(flags['--variant'])) usage();
    try { print(prepare(root, flags['--id'], flags['--variant'])); } catch (err) { die(`assurance: ${err.message}`, 66); }
  } else if (cmd === 'trial-record') {
    allowed('--lens', '--model', '--effort', '--case', '--trial', '--caught', '--false-positive', '--phase', '--tokens', '--out');
    const bool = (v) => (v === 'true' ? true : v === 'false' ? false : usage());
    for (const k of ['--lens', '--model', '--effort', '--case', '--trial', '--caught', '--false-positive']) if (!flags[k]) usage();
    if (!/^[12]$/.test(flags['--trial'])) usage();
    if (flags['--tokens'] !== undefined && !/^\d+$/.test(flags['--tokens'])) usage();
    const phase = flags['--phase'] || 'select';
    if (!SPLITS.includes(phase)) usage();
    const hash = promptSha256(flags['--lens'], agentsDir);
    if (hash === null) die(`assurance: no agent file for lens ${flags['--lens']} in ${agentsDir}`, 64);
    const c = cases().find((x) => x.id === flags['--case']);
    if (!c) die(`assurance: no case ${flags['--case']} in cases.json`, 64);
    if (c.split !== phase) die(`assurance: ${c.id} is a ${c.split}-split case; record it with --phase ${c.split}`, 64);
    const out = path.resolve(flags['--out'] || path.join(root, 'results', 'trials.jsonl'));
    const corpus = corpusSha256(root);
    if (corpus === null) die(`assurance: no ${MANIFEST} in ${root}`, 66);
    const line = {
      lens: flags['--lens'], model: flags['--model'], effort: flags['--effort'], promptSha256: hash, corpusSha256: corpus,
      codexArgsSha256: flags['--lens'] === 'codex-reviewer' ? sha256File(CODEX_ARGS) : null, recordedAt: new Date().toISOString(),
      phase, caseId: c.id, trial: Number(flags['--trial']),
      caught: bool(flags['--caught']), falsePositive: bool(flags['--false-positive']), tokens: flags['--tokens'] === undefined ? null : Number(flags['--tokens']),
    };
    let existing = [];
    if (fs.existsSync(out)) { try { existing = readTrials(out); } catch (err) { die(`assurance: cannot read ${out}: ${err.message}`, 66); } }
    const key = (trial) => trialKey({ lens: line.lens, case: line.caseId, trial, phase });
    if (existing.some((r) => trialKey(r) === key(line.trial))) die(`assurance: ${line.lens} ${line.caseId} trial ${line.trial} (${phase}) is already recorded`, 1);
    if (line.trial === 2 && !existing.some((r) => trialKey(r) === key(1))) die(`assurance: ${line.lens} ${line.caseId} (${phase}): record trial 1 before trial 2`, 1);
    if (phase === 'select' && existing.some((r) => r.phase === 'certify')) die(`assurance: ${out} already holds certify trials, so the select phase is closed. To redo selection, start a fresh trials file and re-run both phases.`, 1);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.appendFileSync(out, trialLine(line) + '\n');
  } else if (cmd === 'calc') {
    allowed('--in', '--targets', '--write', '--json');
    let targets = DEFAULT_TARGETS;
    if (flags['--targets']) { try { targets = parseTargets(flags['--targets']); } catch { usage(); } }
    const file = path.resolve(flags['--in'] || path.join(root, 'results', 'trials.jsonl'));
    let records;
    try { records = readTrials(file); } catch (err) { die(`assurance: cannot read ${file}: ${err.message}`, 66); }
    let result;
    try { result = calc(records, cases(), targets, { corpusSha256: corpusSha256(root) }); } catch (err) { die(`assurance: ${err.message}`, 1); }
    const drift = promptDrift(records, agentsDir);
    if (drift.length) die(`assurance: trials for ${drift.join(', ')} were recorded under a prompt that differs from the agent file today. Re-run /deliver:calibrate for them.`, 1);
    if (flags['--write']) fs.writeFileSync(path.join(root, 'panels.json'), JSON.stringify(panelsDoc(result), null, 2) + '\n');
    print(flags['--json'] ? { lenses: result.lenses, tiers: result.tiers } : renderCalc(result));
  } else usage();
}
