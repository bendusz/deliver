#!/usr/bin/env node
// Score agent prompts against the frozen fixtures in benchmarks/agent-evals. Read-only except
// `manifest --write`. No model is called here: /deliver:agent-evals runs the trials and writes
// the results file this script scores.
//   node agent-evals.mjs list [--split dev|heldout|all] [--agent <name>]
//   node agent-evals.mjs manifest --check | --write
//   node agent-evals.mjs score <results.json>
//   node agent-evals.mjs compare <base.json> <candidate.json>
// Exit 0 ok or ACCEPT, 1 REJECT or manifest mismatch, 64 usage, 66 unreadable input.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isMain } from '../hooks/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVAL_ROOT = path.join(HERE, '..', 'benchmarks', 'agent-evals');
const MANIFEST = 'MANIFEST.sha256';
// A candidate prompt may grow by this much over the base before size alone rejects it.
const SIZE_LIMIT = 1.1;

export function loadCases(root = EVAL_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'cases.json'), 'utf8'));
}

// listCases: what a proposer may read. `expect` is withheld, and so is every held-out case
// unless the caller asks for it by name.
export function listCases(root = EVAL_ROOT, { split = 'dev', agent = null } = {}) {
  return loadCases(root).cases
    .filter((c) => (split === 'all' || c.split === split) && (!agent || c.agent === agent))
    .map((c) => ({ id: c.id, agent: c.agent, split: c.split, dir: path.join(root, 'fixtures', c.id) }));
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.name !== MANIFEST) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function manifest(root = EVAL_ROOT) {
  return walk(root)
    .map((rel) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex')}  ${rel}`)
    .join('\n') + '\n';
}

export function verdictOf(output) {
  const m = String(output).match(/\b(PASS|CONCERNS|FAIL|UNKNOWN|BLOCKED)\b/);
  return m ? m[1] : null;
}

// score(cases, results): per case, how many of the expected trials passed. A trial passes when
// its verdict is one the case allows and every must_match pattern appears in the output. A
// missing trial counts as failed, so a run that died cannot look like a pass.
export function score(cases, results) {
  const perCase = [];
  for (const c of cases.cases.filter((x) => x.agent === results.agent)) {
    const runs = (results.runs || []).filter((r) => r.case === c.id).slice(0, cases.trials);
    let passed = 0;
    for (const r of runs) {
      const ok = c.expect.verdicts.includes(verdictOf(r.output))
        && c.expect.must_match.every((p) => new RegExp(p, 'i').test(String(r.output)));
      if (ok) passed += 1;
    }
    perCase.push({ id: c.id, split: c.split, kind: c.kind, passed, trials: cases.trials });
  }
  const sum = (rows) => rows.reduce((n, r) => n + r.passed, 0);
  const of = (rows) => ({ passed: sum(rows), trials: rows.length * cases.trials });
  return {
    agent: results.agent,
    ref: results.ref ?? null,
    prompt_bytes: Number.isInteger(results.prompt_bytes) ? results.prompt_bytes : null,
    cases: perCase,
    dev: of(perCase.filter((r) => r.split === 'dev')),
    heldout: of(perCase.filter((r) => r.split === 'heldout')),
    seeded: of(perCase.filter((r) => r.kind === 'seeded')),
    clean: of(perCase.filter((r) => r.kind === 'clean')),
  };
}

// compare(base, candidate): ACCEPT only when the candidate is no worse where the proposer could
// not look. With 3 trials over a few cases this detects a large loss, never a small gain, so the
// rule asks for non-inferiority and a prompt that did not grow.
export function compare(base, cand) {
  const reasons = [];
  if (base.agent !== cand.agent) reasons.push(`different agents: ${base.agent} and ${cand.agent}`);
  if (cand.heldout.passed < base.heldout.passed) reasons.push(`held-out passes fell from ${base.heldout.passed} to ${cand.heldout.passed}`);
  if (cand.seeded.passed < base.seeded.passed) reasons.push(`seeded-defect passes fell from ${base.seeded.passed} to ${cand.seeded.passed}`);
  if (cand.clean.passed < base.clean.passed) reasons.push(`clean-case passes fell from ${base.clean.passed} to ${cand.clean.passed}`);
  for (const b of base.cases) {
    const c = cand.cases.find((x) => x.id === b.id);
    if (b.passed === b.trials && (!c || c.passed < c.trials)) reasons.push(`${b.id} passed every base trial and no longer does`);
  }
  if (base.prompt_bytes === null || cand.prompt_bytes === null) reasons.push('prompt_bytes missing from a results file');
  else if (cand.prompt_bytes > base.prompt_bytes * SIZE_LIMIT) reasons.push(`prompt grew from ${base.prompt_bytes} to ${cand.prompt_bytes} bytes, over the ${Math.round((SIZE_LIMIT - 1) * 100)}% limit`);
  return { verdict: reasons.length ? 'REJECT' : 'ACCEPT', reasons, base: summary(base), candidate: summary(cand) };
}

const summary = (s) => ({ ref: s.ref, prompt_bytes: s.prompt_bytes, dev: s.dev, heldout: s.heldout, seeded: s.seeded, clean: s.clean });

// isMain compares real paths, so a symlinked path to this file still runs it.
if (isMain(import.meta.url)) {
  const die = (message, code) => { fs.writeSync(2, `${message}\n`); process.exit(code); };
  const usage = () => die('usage: agent-evals.mjs list [--split dev|heldout|all] [--agent <name>] | manifest --check|--write | score <results.json> | compare <base.json> <candidate.json>', 64);
  const read = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return die(`agent-evals: cannot read ${file}: ${err.message}`, 66); }
  };
  const print = (value) => fs.writeSync(1, JSON.stringify(value, null, 2) + '\n');
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'list') {
    const opts = { split: 'dev', agent: null };
    for (let i = 0; i < rest.length; i += 2) {
      if (rest[i] === '--split' && ['dev', 'heldout', 'all'].includes(rest[i + 1])) opts.split = rest[i + 1];
      else if (rest[i] === '--agent' && rest[i + 1]) opts.agent = rest[i + 1];
      else usage();
    }
    print(listCases(EVAL_ROOT, opts));
  } else if (cmd === 'manifest' && rest.length === 1 && rest[0] === '--write') {
    fs.writeFileSync(path.join(EVAL_ROOT, MANIFEST), manifest());
  } else if (cmd === 'manifest' && rest.length === 1 && rest[0] === '--check') {
    let recorded = null;
    try { recorded = fs.readFileSync(path.join(EVAL_ROOT, MANIFEST), 'utf8'); } catch { /* reported below */ }
    if (recorded !== manifest()) die('agent-evals: the fixtures differ from MANIFEST.sha256. The eval set is frozen; a deliberate change re-runs `manifest --write` in its own commit.', 1);
  } else if (cmd === 'score' && rest.length === 1) {
    print(score(loadCases(), read(rest[0])));
  } else if (cmd === 'compare' && rest.length === 2) {
    const cases = loadCases();
    const result = compare(score(cases, read(rest[0])), score(cases, read(rest[1])));
    print(result);
    process.exit(result.verdict === 'ACCEPT' ? 0 : 1);
  } else usage();
}
