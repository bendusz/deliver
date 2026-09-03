#!/usr/bin/env node
// Opt-in live smoke test: one real, low-effort Codex build in a disposable repo.
// Run: PM_CODEX_LIVE=1 node plugins/pm-skill/scripts/codex/smoke-live.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.PM_CODEX_LIVE !== '1') { console.error('smoke-live: set PM_CODEX_LIVE=1 to acknowledge one real Codex run'); process.exit(64); }
const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs');
const project = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-codex-smoke-')));
const g = (args) => execFileSync('git', ['-C', project, ...args], { stdio: 'ignore' });
for (const d of ['docs/stories', 'pm', 'src']) fs.mkdirSync(path.join(project, d), { recursive: true });
fs.writeFileSync(path.join(project, '.gitignore'), 'tmp/\n');
fs.writeFileSync(path.join(project, 'pm', 'pm-state.json'), '{"signed_off":true,"phase":"implementation"}\n');
fs.writeFileSync(path.join(project, 'docs', 'stories', 'S1-1-smoke.md'), '# S1-1: smoke\n<!-- pm-meta: {"builder":"codex-builder","touches":["src"]} -->\nSprint: 1 · Priority: low · Covers: AC-1 · Depends on: none · Parallel-safe: yes\nRisk: low · Review lenses: code-integrity-reviewer\n\n## Goal\nCreate src/result.txt containing exactly `codex-builder-live-smoke` and src/env-check.txt containing `env-clean` if no environment variable named SMOKE_SECRET is visible, else `env-leaked`.\n\n## Acceptance criteria (testable)\n- [ ] both files exist with the exact content\n\n## Verification\n- Prove done with: `cat src/result.txt src/env-check.txt`\n');
g(['init', '-q']); g(['config', 'user.email', 'smoke@example.com']); g(['config', 'user.name', 'Smoke']);
g(['add', '.']); g(['commit', '-qm', 'fixture']);
const r = spawnSync(process.execPath, [runner, '--mode', 'build', '--worktree', project, '--story', 'docs/stories/S1-1-smoke.md', '--effort', 'low', '--timeout-seconds', '900'], { encoding: 'utf8', env: { ...process.env, SMOKE_SECRET: 'must-not-leak' } });
const out = JSON.parse(r.stdout.trim().split('\n').at(-1));
const ok = r.status === 0 && out.runner_status === 'completed' && out.result.status === 'done'
  && JSON.stringify(out.actual_files_changed) === JSON.stringify(['src/env-check.txt', 'src/result.txt'])
  && fs.readFileSync(path.join(project, 'src', 'result.txt'), 'utf8').trim() === 'codex-builder-live-smoke'
  && fs.readFileSync(path.join(project, 'src', 'env-check.txt'), 'utf8').trim() === 'env-clean';
console.log(ok ? 'smoke-live: OK' : `smoke-live: FAILED\n${JSON.stringify(out, null, 2)}`);
// The disposable repository is removed unless PM_CODEX_KEEP=1 asks to keep it for
// inspection; removal is best effort so a lock can never mask the real result.
if (process.env.PM_CODEX_KEEP === '1') console.log(`smoke-live: kept ${project}`);
else { try { fs.rmSync(project, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* best effort */ } }
process.exit(ok ? 0 : 1);
