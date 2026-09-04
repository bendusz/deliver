// The Codex flags every mode must pass, in one place so they cannot drift apart.
//
// --ignore-user-config only skips $CODEX_HOME/config.toml. A trusted repository's
// .codex/config.toml can still start MCP server processes (which run OUTSIDE the shell
// sandbox), enable hooks or subagents, or turn web search back on, so --sandbox alone
// does not lock a mode down. Neutralise all four explicitly here.
//
// Deliberately absent: --sandbox, -C, --color, --skip-git-repo-check, --output-schema,
// and -o. `codex exec review` rejects several of those, so each mode appends its own
// sandbox, directory, environment, schema, and output arguments.

// lockedExecArgs(o, {search}): the shared flags for one `codex exec` invocation.
// Pass search: true only when the caller asked for live web search and the installed CLI
// supports --search; otherwise web_search is pinned off.
export function lockedExecArgs(o, { search = false } = {}) {
  return [
    '--ignore-user-config', '--ignore-rules', '--strict-config', '--ephemeral',
    '-m', o.model, '-c', `model_reasoning_effort=${o.effort}`,
    '-c', 'mcp_servers={}', '-c', 'features.hooks=false', '-c', 'agents.enabled=false',
    ...(search ? ['--search'] : ['-c', 'web_search="disabled"']),
  ];
}
