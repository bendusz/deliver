import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpDir, gitIn, newProj, PLUGIN_ROOT, HOOKS_DIR } from './helpers.mjs';

// deliver must run unchanged under plain Claude Code. T3 Code is an optional host: everything it
// adds lives in references/host-t3.md, loaded only after the probe succeeds. These tests keep it so.

const HOST_DOC = path.join('skills', 'project-manager', 'references', 'host-t3.md');
const T3_TOOLS = /mcp__t3-code__|\bdelegate_task\b|\bschedule_task\b|\bt3_thread_|\borchestrator_capabilities\b/;

// Each mention outside host-t3.md must carry its condition on the same line, or sit under a bullet that does. A new mention fails
// here until it is made conditional and listed, so a T3-only step cannot slip into the default path.
const ALLOWED = [
  { file: path.join('skills', 'project-manager', 'SKILL.md'), line: /ToolSearch select:mcp__t3-code__orchestrator_capabilities/ },
  { file: path.join('skills', 'project-manager', 'references', 'environment.md'), line: /Outside T3 Code's `delegate_task` advisory/ },
];
const T3_WORD = /\bT3\b/;
const CONDITIONAL = /Under T3 Code|Outside T3 Code|Only when the probe|scheduled T3 heartbeat|T3's for example|a T3 thread|\(a T3 thread|host-t3\.md/;

// parentOf(lines, i): the nearest earlier line indented less than line i, so a sub-bullet under a
// conditional bullet ("Only when the probe ... succeeds:") inherits its condition.
const indent = (l) => l.match(/^\s*/)[0].length;
function parentOf(lines, i) {
  for (let j = i - 1; j >= 0; j--) if (lines[j].trim() && indent(lines[j]) < indent(lines[i])) return lines[j];
  return '';
}

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['tests', 'benchmarks', 'node_modules'].includes(e.name)) files(p, out);
    } else if (/\.(md|mjs|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

const all = files(PLUGIN_ROOT).map((p) => ({ rel: path.relative(PLUGIN_ROOT, p), text: fs.readFileSync(p, 'utf8') }));

test('host-neutral: T3-only tools are named only in host-t3.md and the conditional lines that point to it', () => {
  const stray = [];
  for (const { rel, text } of all) {
    if (rel === HOST_DOC) continue;
    text.split(/\r?\n/).forEach((l, i) => {
      if (T3_TOOLS.test(l) && !ALLOWED.some((a) => a.file === rel && a.line.test(l))) stray.push(`${rel}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(stray, [], 'move T3-only steps into references/host-t3.md, behind the probe');
});

test('host-neutral: every other mention of T3 is conditional, on its line or its parent bullet', () => {
  const bare = [];
  for (const { rel, text } of all) {
    if (rel === HOST_DOC) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (T3_WORD.test(l) && !CONDITIONAL.test(l) && !CONDITIONAL.test(parentOf(lines, i))) bare.push(`${rel}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(bare, [], 'say "Under T3 Code" (or point to host-t3.md) on the line or its parent bullet');
});

test('host-neutral: SKILL.md loads host-t3.md only on a successful probe, and says what happens otherwise', () => {
  const skill = all.find((f) => f.rel === path.join('skills', 'project-manager', 'SKILL.md')).text;
  assert.match(skill, /on success, load `references\/host-t3\.md`/);
  assert.match(skill, /absent or (the call )?fails, skip it/);
});

test('host-neutral: runtime code (hooks and scripts) never depends on T3', () => {
  const hits = all
    .filter((f) => f.rel.endsWith('.mjs'))
    .flatMap(({ rel, text }) => text.split(/\r?\n/).map((l, i) => [rel, i + 1, l]))
    .filter(([, , l]) => T3_TOOLS.test(l) || /process\.env\.T3_|['"]T3_[A-Z_]+['"]/.test(l))
    .map(([rel, n, l]) => `${rel}:${n}: ${l.trim()}`);
  assert.deepEqual(hits, []);
});

test('host-neutral: the session hook runs cleanly with no T3 environment', () => {
  const p = newProj(true);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^T3_|^CLAUDE_PROJECT_DIR$|^DELIVER_NO_ENFORCE$/.test(k)));
  const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'session-context.mjs')], {
    input: JSON.stringify({ cwd: p }), encoding: 'utf8', env, windowsHide: true,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.doesNotMatch(r.stdout, /\bT3\b|t3-code/);
});

test('host-neutral: the session hook says nothing about host worktrees in a plain repository', () => {
  const d = tmpDir('pmhost-');
  gitIn(d, ['init', '-q', '-b', 'main']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^T3_|^CLAUDE_PROJECT_DIR$/.test(k)));
  const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, 'session-context.mjs')], {
    input: JSON.stringify({ cwd: d }), encoding: 'utf8', env, windowsHide: true,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /host worktrees/);
});
