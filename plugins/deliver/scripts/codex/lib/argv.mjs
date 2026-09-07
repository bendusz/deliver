// The Codex flags every mode must pass, in one place so they cannot drift apart.
//
// Codex runs without an OS sandbox in every mode. sandbox_mode is set through -c because
// `codex exec review` rejects --sandbox, and -c is accepted by both subcommands. The
// user's config.toml, MCP servers, and web search all apply, so `codex` here has what it
// has in the user's own shell. Hooks and subagents stay off: they would run outside the
// runner's timeout and, for build and fix, outside the after-run worktree audit that is
// now the only guard.
//
// Deliberately absent: --sandbox, -C, --color, --skip-git-repo-check, --output-schema,
// and -o. `codex exec review` rejects several of those, so each mode appends its own
// directory, environment, schema, and output arguments.

// lockedExecArgs(o, {search, searchOff}): the shared flags for one `codex exec` invocation.
// Pass search: true only when the caller asked for live web search and the installed CLI
// supports --search; pass searchOff: true when the caller asked for no web search at all.
// Otherwise the user's web_search setting, or the CLI default, applies.
export function lockedExecArgs(o, { search = false, searchOff = false } = {}) {
  return [
    '--ignore-rules', '--ephemeral',
    '-m', o.model, '-c', `model_reasoning_effort=${o.effort}`,
    '-c', 'sandbox_mode="danger-full-access"',
    '-c', 'features.hooks=false', '-c', 'agents.enabled=false',
    ...(search ? ['--search'] : []),
    ...(searchOff ? ['-c', 'web_search="disabled"'] : []),
  ];
}
