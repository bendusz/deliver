// Structured JSON logger: one JSON object per line.
export function formatLine(level, msg, fields = {}) {
  return JSON.stringify({ level, msg, ...fields });
}
