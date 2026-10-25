#!/usr/bin/env node
// Installs deliver's git-level ship gate in a deliver project's repository: a POSIX sh shim, marked
// `# deliver-merge-gate v1`, at `pre-merge-commit` and `pre-commit` in `git rev-parse --git-path
// hooks` (which honours core.hooksPath), each exec'ing node on git-merge-gate.mjs; and
// `branch.<integration>.mergeoptions --no-ff` in the local config, for each integration branch the
// project's committed plan names (default main), so every merge into it creates a commit and runs
// the hook. The pre-commit shim runs the gate only while MERGE_HEAD exists, so a conflicted merge
// committed by hand is judged too, and ordinary commits never start node.
//
// Idempotent: a current shim is left alone, a marked one pointing elsewhere (after a plugin update)
// is refreshed, and a hook without the marker is never overwritten, only reported. A mergeoptions
// value the user set without --no-ff is reported and left. session-context.mjs calls
// installGitHook() at session start; /deliver:doctor runs the CLI:
//   node git-hook-install.mjs [--check] <project-root>
// --check reports without writing. Exit 0 when the gate is in place, 1 otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, chomp, isMain } from './lib.mjs';
import { project, planName } from './require-verified.mjs';

export const MARKER = '# deliver-merge-gate v1';
export const HOOK_NAMES = ['pre-merge-commit', 'pre-commit'];
export const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'git-merge-gate.mjs');

// shQuote(s): s inside sh double quotes.
const shQuote = (s) => `"${String(s).replace(/["\\$`]/g, '\\$&')}"`;

// shim(gate, name): the hook script for `name`. Forward slashes, so git for Windows' sh runs the
// same script. A missing node or gate script fails open with a warning: deliver's hooks never wedge
// the repository.
export function shim(gate = GATE, name = 'pre-merge-commit') {
  const g = shQuote(path.resolve(gate).replace(/\\/g, '/'));
  return [
    '#!/bin/sh',
    MARKER,
    '# Installed by the deliver plugin (hooks/git-hook-install.mjs) and refreshed at session start.',
    "# It runs deliver's ship gate on a merge commit. DELIVER_NO_ENFORCE=1 disables it.",
    ...(name === 'pre-commit' ? ['[ -f "$(git rev-parse --git-path MERGE_HEAD)" ] || exit 0'] : []),
    `[ -f ${g} ] || { echo "deliver: the merge gate script "${g}" is missing; run /deliver:doctor" >&2; exit 0; }`,
    'command -v node >/dev/null 2>&1 || { echo "deliver: node is not on PATH, so the merge gate did not run" >&2; exit 0; }',
    `exec node ${g} "$@"`,
    '',
  ].join('\n');
}

// integrationBranches(root, top): the integration branches the project's committed plan names:
// the trusted lookup's answer, every name when the plans disagree, else the plan on HEAD, else main.
function integrationBranches(root, top) {
  const prefix = chomp(git(root, ['rev-parse', '--show-prefix']) || '').replace(/\\/g, '/');
  let found = null;
  try { found = project(top, [prefix]); } catch { found = null; }
  if (found?.error) return found.names ?? ['main'];
  if (found?.name) return [found.name];
  return [planName(git(top, ['show', `HEAD:${prefix}docs/plan.md`])) || 'main'];
}

// installGitHook(root, { gate, check }): install, or with check only inspect, the gate for the
// deliver project at root. Returns { project, ok, hooks: { name: state }, branches: { name: state },
// notes }: a hook state is installed, refreshed, current, foreign, stale (check only), missing
// (check only), or error; a branch state set, current, conflict, unset (check only), or error. notes
// are one-line problems for the user; ok is true when every hook and branch is in place.
export function installGitHook(root, { gate = GATE, check = false } = {}) {
  const res = { project: false, ok: false, hooks: {}, branches: {}, notes: [] };
  const abs = path.resolve(root);
  if (!fs.existsSync(path.join(abs, 'docs', 'approval.json'))) return res;
  const top = chomp(git(abs, ['rev-parse', '--show-toplevel']) || '');
  if (!top) return res;
  res.project = true;
  const hooksPath = chomp(git(top, ['rev-parse', '--git-path', 'hooks']) || '');
  if (!hooksPath) { res.notes.push('merge gate: git rev-parse --git-path hooks failed, so the git-level merge gate is not installed'); return res; }
  const dir = path.resolve(top, hooksPath);
  for (const name of HOOK_NAMES) {
    const file = path.join(dir, name);
    const want = shim(gate, name);
    let have = null;
    try { have = fs.readFileSync(file, 'utf8'); } catch { have = null; }
    try {
      if (have !== null && !have.includes(MARKER)) {
        res.hooks[name] = 'foreign';
        res.notes.push(`merge gate: ${file} exists and is not deliver's, so it was left alone and ${name === 'pre-commit' ? 'a conflicted merge committed by hand' : 'a merge commit'} is not judged by deliver's git-level gate; call ${GATE.replace(/\\/g, '/')} from it to add the gate`);
      } else if (have === want) {
        if (!check) fs.chmodSync(file, 0o755);
        res.hooks[name] = 'current';
      } else if (check) {
        res.hooks[name] = have === null ? 'missing' : 'stale';
      } else {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, want);
        fs.chmodSync(file, 0o755);
        res.hooks[name] = have === null ? 'installed' : 'refreshed';
      }
    } catch (e) {
      res.hooks[name] = 'error';
      res.notes.push(`merge gate: cannot write ${file} (${e.code || e.message})`);
    }
  }
  for (const branch of integrationBranches(abs, top)) {
    if (branch.startsWith('pm/')) continue;
    const key = `branch.${branch}.mergeoptions`;
    const value = git(top, ['config', '--get', key]);
    if (value !== null && chomp(value).split(/\s+/).includes('--no-ff')) res.branches[branch] = 'current';
    else if (value !== null && chomp(value) !== '') {
      res.branches[branch] = 'conflict';
      res.notes.push(`merge gate: ${key} is "${chomp(value).replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 80)}", so a merge into ${branch} may fast-forward past the git-level gate; add --no-ff to it`);
    } else if (check) res.branches[branch] = 'unset';
    else if (git(top, ['config', '--local', key, '--no-ff']) !== null) res.branches[branch] = 'set';
    else {
      res.branches[branch] = 'error';
      res.notes.push(`merge gate: cannot set ${key} --no-ff`);
    }
  }
  const good = new Set(['installed', 'refreshed', 'current', 'set']);
  res.ok = [...Object.values(res.hooks), ...Object.values(res.branches)].every((s) => good.has(s));
  return res;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const root = args.find((a) => a !== '--check') || process.cwd();
  const r = installGitHook(root, { check });
  if (!r.project) {
    fs.writeSync(2, `${path.resolve(root)} is not a deliver project (no docs/approval.json in a git checkout)\n`);
    process.exit(1);
  }
  const lines = [
    ...Object.entries(r.hooks).map(([n, s]) => `hook ${n}: ${s}`),
    ...Object.entries(r.branches).map(([n, s]) => `branch.${n}.mergeoptions: ${s}`),
    ...r.notes,
    `gate script: ${GATE.replace(/\\/g, '/')}${fs.existsSync(GATE) ? '' : ' (MISSING)'}`,
  ];
  fs.writeSync(1, `${lines.join('\n')}\n`);
  process.exit(r.ok ? 0 : 1);
}
