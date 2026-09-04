// Runner exit codes and the JSON envelope every mode emits on stdout.
import fs from 'node:fs';

export const EXIT = { OK: 0, USAGE: 64, REJECTED: 65, BLOCKED: 66, UNAVAILABLE: 69, FAILED: 70, SAFETY: 74, TIMEOUT: 124, INTERRUPTED: 130 };
const STATUS_EXIT = { rejected: EXIT.REJECTED, blocked: EXIT.BLOCKED, unavailable: EXIT.UNAVAILABLE, failed: EXIT.FAILED, 'safety-violation': EXIT.SAFETY, 'timed-out': EXIT.TIMEOUT, interrupted: EXIT.INTERRUPTED };

export class RunnerError extends Error {
  constructor(status, reason, extra = {}) {
    super(reason);
    this.status = status;
    this.extra = extra;
  }
}

export function envelope(status, reason, extra = {}) {
  const { scratch_dir = '', codex_version = '', codex_exit = '', actual_files_changed } = extra;
  const out = {
    runner_status: status,
    reason,
    scratch_dir,
    codex_version,
    codex_exit: codex_exit === '' || codex_exit === null || codex_exit === undefined ? '' : String(codex_exit),
    // Present only after a model fallback, so a failure envelope names the pair that ran.
    ...(extra.model ? { model: extra.model } : {}),
    ...(extra.effort ? { effort: extra.effort } : {}),
    ...(extra.model_fallback ? { model_fallback: extra.model_fallback } : {}),
    diagnostics_retained: scratch_dir !== '',
  };
  if (Array.isArray(actual_files_changed)) {
    out.diagnostics_retained = true;
    out.actual_files_changed = actual_files_changed;
    // Reported alongside the enforced delta so the PM can raise a touched .env or cache
    // as a review finding. Always present when actual_files_changed is, even when empty.
    out.ignored_files_changed = Array.isArray(extra.ignored_files_changed) ? extra.ignored_files_changed : [];
  }
  if (typeof extra.stderr_path === 'string') out.stderr_path = extra.stderr_path;
  return out;
}

export function emit(obj) {
  // Synchronous write: process.stdout.write() immediately followed by process.exit()
  // can truncate output that exceeds the pipe buffer (envelopes can carry a large
  // actual_files_changed list and exceed 64 KiB).
  fs.writeSync(1, `${JSON.stringify(obj)}\n`);
}

export function fail(err) {
  if (err instanceof RunnerError) {
    emit(envelope(err.status, err.message, err.extra));
    process.exit(STATUS_EXIT[err.status] ?? EXIT.FAILED);
  }
  emit(envelope('failed', String(err && err.message ? err.message : err)));
  process.exit(EXIT.FAILED);
}
