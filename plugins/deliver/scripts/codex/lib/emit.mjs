// --emit-prompt: the prompt a run would send codex, for a host that launches Codex itself.
// The envelope is { mode, model, effort, cwd, readOnly, prompt }. `prompt` is the runner's own
// prompt, byte for byte, followed by a contract for what the runner would otherwise enforce out
// of band: the output schema for build and fix, and read-only behaviour plus a report shape for
// review, advise, and research.

// withContract(prompt, contract): the runner's prompt unchanged, then a blank line and the contract.
export function withContract(prompt, contract) {
  return `${prompt}${prompt.endsWith('\n') ? '' : '\n'}\n${contract}\n`;
}

// The runner would start codex in `cwd`; a host child may start elsewhere, so the contract names it.
const readOnlyContract = (cwd) => `Work in ${cwd} and run every command from there. This run is read-only: change no file, write nothing to disk, and make no commit or other git change. Any change fails the whole run.`;

export function builderContract(schemaText) {
  return [
    'Output contract: this run attaches no schema file, so "the supplied schema" is this JSON Schema.',
    'Your final message must be only the result object, in one fenced json block:',
    '```json',
    JSON.stringify(JSON.parse(schemaText)),
    '```',
  ].join('\n');
}

export const reviewContract = (cwd) => `${readOnlyContract(cwd)}\nYour final message is the review report: every finding, most severe first, one line each as \`[block|major|minor] path:line: what is wrong\`, then why it is wrong and a concrete fix. End with a one-line overall assessment, or \`No findings.\` when there are none.`;

export const answerContract = (cwd) => `${readOnlyContract(cwd)}\nYour final message is the answer.`;

export function emitted(o, cwd, readOnly, prompt) {
  return { exit: 0, envelope: { mode: o.mode, model: o.model, effort: o.effort, cwd, readOnly, prompt } };
}
