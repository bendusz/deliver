import fs from 'node:fs';
import path from 'node:path';
import { pmRelpath } from '../../../hooks/lib.mjs';
import { RunnerError } from './result.mjs';

const BUILDERS = new Set(['expert-builder', 'codex-builder', 'auto']);
const hasControl = (s) => [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
const blocked = (reason) => new RunnerError('blocked', reason);

// parseStory(root, storyRel): the machine pm-meta scope of a story. pm-meta is authoritative.
// Stories written before 0.17 also carry visible Builder and Touches fields; when present they
// must still agree, so a stale header cannot mislead a reader.
export function parseStory(root, storyRel) {
  const head = fs.readFileSync(path.join(root, storyRel), 'utf8').split(/\r?\n/).slice(0, 12);
  const metas = head.map((l) => l.match(/^\s*<!--\s*pm-meta:\s*(.*?)\s*-->\s*$/)).filter(Boolean).map((m) => m[1]).filter((m) => m !== '');
  if (metas.length !== 1) throw blocked('story needs exactly one pm-meta JSON comment in its first 12 lines');
  let meta;
  try { meta = JSON.parse(metas[0]); } catch { meta = null; }
  const valid = meta && typeof meta === 'object' && !Array.isArray(meta)
    && JSON.stringify(Object.keys(meta).sort()) === '["builder","touches"]'
    && BUILDERS.has(meta.builder)
    && Array.isArray(meta.touches) && meta.touches.length > 0
    && new Set(meta.touches).size === meta.touches.length
    && meta.touches.every((t) => typeof t === 'string' && t.length > 0 && !hasControl(t));
  if (!valid) throw blocked('story pm-meta must contain only a valid builder and non-empty unique touches array');

  const scopes = [];
  for (const item of meta.touches) {
    if (item.startsWith('/') || /[*?\[\]<>]/.test(item)) throw blocked('story pm-meta touches must use repo-relative paths without globs or placeholders');
    if (/\/\.\.\//.test(`/${item}/`) || /\/\.\//.test(`/${item}/`)) throw blocked('story pm-meta touches must not contain traversal segments');
    const scope = pmRelpath(root, item.replace(/\/+$/, ''));
    if (scope === null) throw blocked('story pm-meta touches contains a path outside the worktree');
    if (scope === '.') throw blocked('story pm-meta touches may not grant the whole worktree');
    scopes.push(scope);
  }
  // `src` and `src/` are distinct raw strings but one scope, so uniqueness has to be
  // rechecked after normalisation or a story can smuggle a duplicate past the raw check.
  const machine = [...new Set(scopes)].sort();
  if (machine.length !== meta.touches.length) throw blocked('story pm-meta must contain only a valid builder and non-empty unique touches array');

  const builderLine = head.map((l) => l.match(/^Builder:\s*(.*?)\s*$/)).find(Boolean);
  if (builderLine && builderLine[1] !== meta.builder) throw blocked('story pm-meta builder does not match the visible Builder field');

  // The legacy Touches field only ever sat in the pre-0.17 header, on lines 3 to 5 of the
  // file. Anchoring the search to that window keeps a "Touches:" mentioned in the story's
  // Context from being mistaken for the legacy field. The capture starts after the FIRST
  // `Touches:` on the line, so a second label stays in the value and fails the path checks
  // below. That is the safe reading of an odd line.
  const touchesLine = head.slice(2, 5).map((l) => l.match(/Touches:\s*(.*)$/)).find(Boolean);
  if (touchesLine) {
    const visibleRaw = touchesLine[1].trim();
    if (visibleRaw === '' || visibleRaw === '-' || /[<>]/.test(visibleRaw)) throw blocked('visible Touches must match bounded story pm-meta touches');
    const visible = [];
    for (let item of visibleRaw.split(',')) {
      item = item.trim().replace(/\/+$/, '');
      if (!item) throw blocked('visible Touches contains an empty path');
      const scope = pmRelpath(root, item);
      if (scope === null) throw blocked('visible Touches contains an invalid path');
      visible.push(scope);
    }
    if (JSON.stringify([...new Set(visible)].sort()) !== JSON.stringify(machine)) throw blocked('story pm-meta touches does not match the visible Touches field');
  }
  return { builder: meta.builder, scopes: machine };
}
