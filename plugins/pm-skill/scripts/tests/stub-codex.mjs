// Fake `codex` for quota-free tests. Behaviour is driven by STUB_* environment variables.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const env = process.env;
const append = (file, text) => fs.appendFileSync(file, text);
append(env.STUB_ACTIONS, `${argv.join(' ')}\n`);

if (argv[0] === '--version') { console.log('codex-cli 9.9.9-stub'); process.exit(0); }
if (argv[0] === 'login' && argv[1] === 'status') process.exit(Number(env.STUB_LOGIN_EXIT || 0));
if (argv[0] === 'exec' && argv[1] === '--help') {
  const flags = ['--cd', '--sandbox', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config', '--output-schema', '--output-last-message'];
  if (env.STUB_HAS_SEARCH === '1') flags.push('--search');
  console.log(flags.join('\n'));
  process.exit(0);
}
if (argv[0] !== 'exec') { console.error('unexpected stub command'); process.exit(2); }

const rest = argv.slice(1);
const isReview = rest[0] === 'review';
fs.writeFileSync(env.STUB_ARGS, '');
let out = ''; let worktree = process.cwd(); let positional = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  append(env.STUB_ARGS, `${a}\n`);
  if (['-o', '--output-last-message', '-C', '--cd', '-m', '--model', '-c', '--config', '--sandbox', '--color', '--output-schema', '--commit'].includes(a)) {
    const v = rest[++i]; append(env.STUB_ARGS, `${v}\n`);
    if (a === '-o' || a === '--output-last-message') out = v;
    if (a === '-C' || a === '--cd') worktree = v;
  } else if (a === '-') {
    fs.writeFileSync(env.STUB_PROMPT, fs.readFileSync(0, 'utf8'));
  } else if (!a.startsWith('--') && a !== 'review') {
    positional.push(a);
  }
}
if (positional.length) fs.writeFileSync(env.STUB_PROMPT, positional.join('\n'));

if (isReview) {
  if (env.STUB_EXEC_EXIT && env.STUB_EXEC_EXIT !== '0') { console.error('stub review failure'); process.exit(Number(env.STUB_EXEC_EXIT)); }
  fs.writeFileSync(out, '# Review\n\n- [major] stub finding\n');
  process.exit(0);
}

if (env.STUB_STAGE_GIT === '1') {
  fs.writeFileSync(path.join(worktree, 'src', 'staged.txt'), 'staged by stub\n');
  execFileSync('git', ['-C', worktree, 'add', 'src/staged.txt']);
}
if (env.STUB_CREATE_REF === '1') execFileSync('git', ['-C', worktree, 'branch', 'codex-mutated-ref']);
let writePath = env.STUB_WRITE_PATH || '';
if (writePath) {
  fs.mkdirSync(path.dirname(path.join(worktree, writePath)), { recursive: true });
  fs.writeFileSync(path.join(worktree, writePath), 'fixed by stub\n');
}
if (env.STUB_CHMOD_PATH) {
  fs.chmodSync(path.join(worktree, env.STUB_CHMOD_PATH), 0o755);
  writePath = env.STUB_CHMOD_PATH;
}
if (env.STUB_SLEEP === '1') {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
  fs.writeFileSync(env.STUB_CHILD_PID, `${child.pid}\n`);
  await new Promise((resolve) => child.on('exit', resolve));
}
if (env.STUB_EXEC_EXIT && env.STUB_EXEC_EXIT !== '0') { console.error('stub codex failure'); process.exit(Number(env.STUB_EXEC_EXIT)); }
if (env.STUB_ANSWER === '1') { fs.writeFileSync(out, 'stub answer\n'); process.exit(0); }

if (env.STUB_BAD_RESULT === '1') {
  fs.writeFileSync(out, '{"status":"done"}\n');
} else if (env.STUB_BLOCKED_RESULT === '1') {
  fs.writeFileSync(out, JSON.stringify({ status: 'blocked', root_cause: 'The bounded fix could not be completed.', files_changed: [], summary: ['Stopped without changing files.'], tests: [{ command: 'true', status: 'not-run', summary: 'blocked before verification' }], out_of_scope_changes: [], risks: [] }));
} else {
  const reportPath = env.STUB_OMIT_REPORT === '1' ? '' : (env.STUB_REPORT_PATH || writePath);
  let files = reportPath ? [reportPath] : [];
  if (env.STUB_DUPLICATE_REPORT === '1' && reportPath) files = [reportPath, reportPath];
  fs.writeFileSync(out, JSON.stringify({ status: 'done', root_cause: null, files_changed: files, summary: ['Applied the focused fix.'], tests: [{ command: 'true', status: 'passed', summary: 'verification passed' }], out_of_scope_changes: [], risks: [] }));
}
console.log('stub complete');
