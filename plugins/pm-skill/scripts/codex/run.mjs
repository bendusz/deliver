#!/usr/bin/env node
// pm-skill Codex runner — the only way any pm-skill agent invokes `codex`.
//   node run.mjs --mode build|fix|review|advise|research ...
// Prints exactly one JSON envelope on stdout and exits with the documented code.
import { parseArgs, UsageError, USAGE } from './lib/args.mjs';
import { emit, fail, EXIT } from './lib/result.mjs';
import { runBuild } from './modes/build.mjs';
import { runReview } from './modes/review.mjs';
import { runAdvise } from './modes/advise.mjs';

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) { process.stderr.write(`codex-runner: ${e.message}\n${USAGE}\n`); process.exit(EXIT.USAGE); }
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
