export function format(tasks, opts = {}) {
  if (opts.json) return JSON.stringify(tasks);
  return tasks.map((t) => `- ${t.title}`).join('\n');
}
