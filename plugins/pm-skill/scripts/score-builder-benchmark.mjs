#!/usr/bin/env node
// Validate and score one isolated expert-builder versus codex-builder benchmark.
//   node score-builder-benchmark.mjs <results.json>
// Writes the Markdown summary to stdout. Exit 64 usage, 66 no such file,
// 65 the result does not satisfy the bundled schema, 70 the schema is unreadable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const die = (message, code) => { fs.writeSync(2, `${message}\n`); process.exit(code); };
const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

const argv = process.argv.slice(2);
if (argv.length !== 1) die('usage: score-builder-benchmark.mjs <results.json>', 64);
const input = argv[0];

let raw = null;
try { raw = fs.readFileSync(input, 'utf8'); } catch { die(`score-builder-benchmark: result file not found: ${input}`, 66); }

const SCHEMA_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'schemas', 'builder-benchmark-result.schema.json');
let schema = null;
try { schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')); } catch { die('score-builder-benchmark: bundled result schema is missing or unreadable', 70); }

const invalid = () => die('score-builder-benchmark: invalid benchmark result', 65);

let data = null;
try { data = JSON.parse(raw); } catch { invalid(); }

// matchesType and validate cover the slice of JSON Schema the bundled benchmark schema uses:
// type (single or a nullable pair), const, enum, minLength, minimum, required, properties,
// additionalProperties: false, minItems, maxItems, and items. Anything else is ignored,
// so keep the schema inside this slice.
function matchesType(v, t) {
  if (t === 'object') return isRecord(v);
  if (t === 'array') return Array.isArray(v);
  if (t === 'string') return typeof v === 'string';
  if (t === 'boolean') return typeof v === 'boolean';
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (t === 'integer') return Number.isInteger(v);
  if (t === 'null') return v === null;
  return false;
}

function validate(v, s) {
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => matchesType(v, t))) return false;
  }
  if ('const' in s && v !== s.const) return false;
  if (Array.isArray(s.enum) && !s.enum.includes(v)) return false;
  if (typeof v === 'string' && s.minLength !== undefined && v.length < s.minLength) return false;
  if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) return false;
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) return false;
    if (s.maxItems !== undefined && v.length > s.maxItems) return false;
    if (s.items && !v.every((item) => validate(item, s.items))) return false;
  } else if (isRecord(v)) {
    for (const key of s.required || []) if (!(key in v)) return false;
    const props = s.properties || {};
    for (const [key, sub] of Object.entries(v)) {
      if (props[key]) { if (!validate(sub, props[key])) return false; } else if (s.additionalProperties === false) return false;
    }
  }
  return true;
}

if (!validate(data, schema)) invalid();
// Two cross-field rules the schema cannot state: the pair must be one run of each builder,
// and a run may not pass more gates than it has.
if ([...data.runs].map((r) => r.builder).sort().join() !== 'codex-builder,expert-builder') invalid();
for (const r of data.runs) if (r.gates.passed > r.gates.total) invalid();

// 100 points: 20 for completion, 30 for the final gate pass rate, 20 for passing gates on
// the first attempt, up to 20 for a clean review, 5 for few retries, 5 for relative speed.
const quality = (r) => Math.max(20 - r.review_findings.block * 10 - r.review_findings.major * 4, 0);
const elapsed = data.runs.filter((r) => r.status === 'completed').map((r) => r.elapsed_seconds);
const fastest = elapsed.length ? Math.min(...elapsed) : 0;
const score = (r) => {
  if (r.status !== 'completed') return 0;
  const speed = r.elapsed_seconds === 0 || fastest === 0 ? 5 : (5 * fastest) / r.elapsed_seconds;
  return 20 + (30 * r.gates.passed) / r.gates.total + (r.first_pass_gates ? 20 : 0) + quality(r) + 5 / (1 + r.retries) + speed;
};

const scored = data.runs.map((r) => ({ ...r, score: score(r) })).sort((a, b) => b.score - a.score);
const round1 = (n) => String(Math.round(n * 10) / 10);

const lines = [
  `# Builder benchmark: ${data.benchmark_id}`,
  '',
  `Story: \`${data.story}\``,
  '',
  '| Builder | Status | Time | First-pass gates | Gates | Block | Major | Retries | Paths | Score |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...scored.map((r) => `| ${r.builder} | ${r.status} | ${r.elapsed_seconds}s | ${r.first_pass_gates} | ${r.gates.passed}/${r.gates.total} | ${r.review_findings.block} | ${r.review_findings.major} | ${r.retries} | ${r.changed_paths} | ${round1(r.score)} |`),
  '',
  `Recommendation: \`${scored[0].builder}\` scored ${round1(scored[0].score)}. Treat one run as evidence for routing, not a permanent model verdict.`,
  '',
];
fs.writeSync(1, lines.join('\n'));
