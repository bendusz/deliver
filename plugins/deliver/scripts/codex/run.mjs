#!/usr/bin/env node
// deliver Codex runner: the only way any deliver agent invokes `codex`.
//   node run.mjs --mode build|fix|review|advise|research ...
// Prints exactly one JSON envelope on stdout and exits with the documented code.
// The one exception is a usage error: it exits 64 with a message on stderr and no envelope.
//   --emit-prompt (any mode, never with --preflight) runs every check a real run makes before
//   codex starts, then prints { mode, model, effort, cwd, readOnly, prompt } and never launches
//   codex (lib/emit.mjs). It is taken here, not in lib/args.mjs, whose hash stamps the
//   codex-reviewer calibration.
import fs from 'node:fs';
import { parseArgs, UsageError, USAGE } from './lib/args.mjs';
import { emit, fail, EXIT } from './lib/result.mjs';
import { runBuild } from './modes/build.mjs';
import { runReview } from './modes/review.mjs';
import { runAdvise } from './modes/advise.mjs';

let opts;
try {
  // Only a flag position counts: every other flag but --preflight takes a value, which may itself
  // read "--emit-prompt" (an objective, say) and must reach parseArgs untouched.
  const argv = []; let emitPrompt = false;
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '--emit-prompt') { emitPrompt = true; continue; }
    argv.push(raw[i]);
    if (raw[i] !== '--preflight' && i + 1 < raw.length) argv.push(raw[++i]);
  }
  opts = parseArgs(argv);
  if (emitPrompt && opts.preflight) throw new UsageError('--preflight and --emit-prompt are exclusive');
  opts.emitPrompt = emitPrompt;
} catch (e) {
  // Synchronous write: a stream write immediately followed by process.exit() can be
  // truncated when stderr is a pipe.
  if (e instanceof UsageError) { fs.writeSync(2, `codex-runner: ${e.message}\n${USAGE}\n`); process.exit(EXIT.USAGE); }
  throw e;
}

const MODES = { build: runBuild, fix: runBuild, review: runReview, advise: runAdvise, research: runAdvise };
try {
  const { envelope, exit } = await MODES[opts.mode](opts);
  emit(envelope);
  process.exit(exit);
} catch (e) {
  fail(e);
}
