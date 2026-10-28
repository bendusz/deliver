#!/usr/bin/env node
// deliver Codex runner: the only way any deliver agent invokes `codex`.
//   node run.mjs --mode build|fix|review|advise|research ...
// Prints exactly one JSON envelope on stdout and exits with the documented code.
// The one exception is a usage error: it exits 64 with a message on stderr and no envelope.
// Three host-path actions, each exclusive with the others and with --preflight, none launching codex:
//   --emit-prompt runs every check a real run makes before codex starts, then prints
//   { mode, model, effort, cwd, readOnly, prompt } (lib/emit.mjs).
//   --snapshot --snapshot-out <abs file> fingerprints the whole checkout before a host-run child.
//   --snapshot-compare <abs file> --snapshot-sha256 <hex> refuses any change the mode forbids
//   (modes/snapshot.mjs).
// They are taken here, not in lib/args.mjs, whose hash stamps the codex-reviewer calibration.
import fs from 'node:fs';
import { parseArgs, UsageError, USAGE } from './lib/args.mjs';
import { emit, fail, EXIT } from './lib/result.mjs';
import { runBuild } from './modes/build.mjs';
import { runReview } from './modes/review.mjs';
import { runAdvise } from './modes/advise.mjs';
import { runSnapshot, runCompare } from './modes/snapshot.mjs';

const HOST_BOOL = new Set(['--emit-prompt', '--snapshot']);
const HOST_VALUE = new Set(['--snapshot-out', '--snapshot-compare', '--snapshot-sha256']);

let opts;
try {
  // Only a flag position counts: every other flag but --preflight takes a value, which may itself
  // read "--emit-prompt" (an objective, say) and must reach parseArgs untouched.
  const argv = []; const host = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (HOST_BOOL.has(a)) { host[a] = true; continue; }
    if (HOST_VALUE.has(a)) {
      if (raw[i + 1] === undefined) throw new UsageError(`${a} needs a value`);
      host[a] = raw[++i]; continue;
    }
    argv.push(a);
    if (a !== '--preflight' && i + 1 < raw.length) argv.push(raw[++i]);
  }
  opts = parseArgs(argv);
  const actions = ['--emit-prompt', '--snapshot', '--snapshot-compare'].filter((f) => host[f] !== undefined);
  if (actions.length > 1) throw new UsageError(`${actions.join(' and ')} are exclusive`);
  if (actions.length && opts.preflight) throw new UsageError(`--preflight and ${actions[0]} are exclusive`);
  if (Boolean(host['--snapshot']) !== (host['--snapshot-out'] !== undefined)) throw new UsageError('--snapshot and --snapshot-out go together');
  if ((host['--snapshot-compare'] !== undefined) !== (host['--snapshot-sha256'] !== undefined)) throw new UsageError('--snapshot-compare and --snapshot-sha256 go together');
  if (host['--snapshot-sha256'] !== undefined && !/^[0-9a-f]{64}$/.test(host['--snapshot-sha256'])) throw new UsageError('--snapshot-sha256 must be the 64-hex digest --snapshot printed');
  opts.emitPrompt = Boolean(host['--emit-prompt']);
  opts.snapshot = host['--snapshot'] ? { out: host['--snapshot-out'] } : null;
  opts.compare = host['--snapshot-compare'] !== undefined ? { file: host['--snapshot-compare'], sha256: host['--snapshot-sha256'] } : null;
} catch (e) {
  // Synchronous write: a stream write immediately followed by process.exit() can be
  // truncated when stderr is a pipe.
  if (e instanceof UsageError) { fs.writeSync(2, `codex-runner: ${e.message}\n${USAGE}\n`); process.exit(EXIT.USAGE); }
  throw e;
}

const MODES = { build: runBuild, fix: runBuild, review: runReview, advise: runAdvise, research: runAdvise };
try {
  const run = opts.snapshot ? runSnapshot : opts.compare ? runCompare : MODES[opts.mode];
  const { envelope, exit } = await run(opts);
  emit(envelope);
  process.exit(exit);
} catch (e) {
  fail(e);
}
