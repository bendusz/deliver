// --snapshot and --snapshot-compare: the runner's own before/after checks, for a Codex child a host
// launches (references/host-t3.md). Neither launches codex, so neither uses quota. File content is
// hashed from the bytes on disk (git hash-object --stdin-paths), never read from the index, so an
// assume-unchanged or skip-worktree flag cannot hide a rewrite; the flag itself is git metadata.
//   --snapshot --snapshot-out <abs file>   before the child: fingerprint the checkout, write it out
//   --snapshot-compare <abs file> --snapshot-sha256 <hex>   after the child: compare, or refuse
// Both take the mode's usual arguments. The snapshot always covers the whole checkout from its
// root, whatever the cwd, and holds the same state a real build compares: every tracked,
// untracked, and ignored file, the protected PM artifacts even when ignored, and the git metadata
// (HEAD, refs, index, local config, worktrees, hooks, info/exclude). The PM keeps the printed
// sha256, so a child that rewrites the snapshot file is caught too.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { realpath } from '../../../hooks/lib.mjs';
import { RunnerError } from '../lib/result.mjs';
import { toplevel, gitOk } from '../lib/git.mjs';
import { snapshotWorktree, changedPaths, gitMetadataFingerprint } from '../lib/snapshot.mjs';
import { prepareBuild, resolveWorktree, baseline, isProtected, allowed } from './build.mjs';

const FORMAT = 'deliver-codex-snapshot/1';
// The fields of gitMetadataFingerprint, in its order.
const META_PARTS = ['HEAD', 'the checked-out branch', 'the index', 'refs', 'local git config', 'worktree registrations', 'index flags', 'git hooks', 'info/exclude'];
const rejected = (r) => new RunnerError('rejected', r);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const isBuild = (mode) => mode === 'build' || mode === 'fix';
const NO_REPO = 'no git repository: a host-run child needs a checkout to snapshot, so that path is refused here; use the wrapper agent';

// checkoutRoot(o): the root the snapshot covers. A build's is its worktree; any other mode's is the
// top level of the checkout holding the cwd, never the cwd itself.
function checkoutRoot(o) {
  if (isBuild(o.mode)) return resolveWorktree(o);
  if (!gitOk(process.cwd(), ['--version'])) throw new RunnerError('unavailable', 'git is required');
  const top = toplevel(process.cwd());
  const root = top ? realpath(top) : null;
  if (!root) throw new RunnerError('unavailable', NO_REPO);
  return root;
}

// outsideRoot(file, root): the snapshot file must not live in the checkout it describes, or writing
// it would itself be a change.
function outsideRoot(file, root, flag) {
  if (!path.isAbsolute(file)) throw rejected(`${flag} must be an absolute path`);
  const dir = realpath(path.dirname(file));
  if (!dir) throw rejected(`${flag} directory does not exist`);
  if (dir === root || dir.startsWith(root + path.sep)) throw rejected(`${flag} must be outside the checkout it snapshots`);
  return path.join(dir, path.basename(file));
}

export async function runSnapshot(o) {
  let ctx = { storyRel: '', scopes: [], protectedPaths: [] };
  let root;
  if (isBuild(o.mode)) { ctx = prepareBuild(o); root = ctx.worktree; } else {
    root = checkoutRoot(o);
    if (o.mode !== 'review') {
      if (!path.isAbsolute(o.promptFile)) throw rejected('--prompt-file must be an absolute path');
      if (!fs.existsSync(o.promptFile) || !fs.statSync(o.promptFile).isFile()) throw rejected('prompt file does not exist');
    }
  }
  const out = outsideRoot(o.snapshot.out, root, '--snapshot-out');
  const meta = gitMetadataFingerprint(root);
  const files = Object.fromEntries(baseline(root));
  const text = `${JSON.stringify({ format: FORMAT, mode: o.mode, root, story: ctx.storyRel, scopes: ctx.scopes, protected: ctx.protectedPaths, meta, files })}\n`;
  try { fs.writeFileSync(out, text, { flag: 'wx' }); } catch (e) {
    throw rejected(e.code === 'EEXIST' ? '--snapshot-out already exists; name a new file for every run' : `could not write the snapshot: ${e.message}`);
  }
  return { exit: 0, envelope: { runner_status: 'snapshot-taken', mode: o.mode, root, snapshot_path: out, snapshot_sha256: sha256(text), readOnly: !isBuild(o.mode) } };
}

export async function runCompare(o) {
  const root = checkoutRoot(o);
  const file = outsideRoot(o.compare.file, root, '--snapshot-compare');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { throw rejected('snapshot file does not exist'); }
  const fail = (reason, changes) => new RunnerError('safety-violation', reason, changes ? { changes } : {});
  if (sha256(text) !== o.compare.sha256) throw fail('the snapshot file changed since it was taken; treat the run as a safety violation');
  let snap;
  try { snap = JSON.parse(text); } catch { snap = null; }
  if (!snap || snap.format !== FORMAT || typeof snap.files !== 'object' || typeof snap.meta !== 'string') throw rejected('not a runner snapshot file');
  if (snap.mode !== o.mode) throw rejected(`the snapshot was taken for mode ${snap.mode}, not ${o.mode}`);
  if (snap.root !== root) throw rejected(`the snapshot covers ${snap.root}, not ${root}`);

  let after;
  try { after = snapshotWorktree(root); } catch { throw fail('the checkout now holds an unsupported path type or a tab/newline filename'); }
  const metaNow = gitMetadataFingerprint(root).split('\n');
  const metaThen = snap.meta.split('\n');
  const before = new Map(Object.entries(snap.files));
  const gitMetadata = META_PARTS.filter((_, i) => metaThen[i] !== metaNow[i]);
  const delta = changedPaths(before, after);
  const isIgnored = (rel) => (before.get(rel) || '').startsWith('ignored:') || (after.get(rel) || '').startsWith('ignored:');
  const protectedArtifacts = delta.filter(isProtected);
  const ignored = delta.filter((rel) => isIgnored(rel) && !isProtected(rel));
  const content = delta.filter((rel) => !isIgnored(rel) && !isProtected(rel));

  // Read-only: any change at all. A build: the rule a real build applies after codex exits.
  const storyProtected = isBuild(o.mode) ? delta.filter((rel) => allowed(rel, snap.protected)) : [];
  const outOfScope = isBuild(o.mode) ? content.filter((rel) => !allowed(rel, snap.scopes) && !allowed(rel, snap.protected)) : content;
  const changes = {
    git_metadata: gitMetadata,
    protected_artifacts: protectedArtifacts,
    story_protected: storyProtected,
    ignored_files: isBuild(o.mode) ? [] : ignored,
    content: outOfScope,
  };
  const labels = { git_metadata: 'git metadata', protected_artifacts: 'protected PM artifacts', story_protected: "the story's protected paths", ignored_files: 'git-ignored files', content: isBuild(o.mode) ? "tracked or untracked paths outside the story's pm-meta.touches" : 'tracked or untracked content' };
  const named = Object.entries(changes).filter(([, v]) => v.length).map(([k, v]) => `${labels[k]} (${v.join(', ')})`);
  if (named.length) {
    throw fail(`${isBuild(o.mode) ? 'the build child' : 'the read-only child'} changed ${named.join('; ')}; stop the story, preserve the tree, and never grade the run`, changes);
  }
  const actual = delta.filter((rel) => !isIgnored(rel));
  if (!isBuild(o.mode) || delta.length === 0) return { exit: 0, envelope: { runner_status: 'unchanged', mode: o.mode, root } };
  return { exit: 0, envelope: { runner_status: 'in-scope', mode: o.mode, root, actual_files_changed: actual, ignored_files_changed: ignored } };
}
