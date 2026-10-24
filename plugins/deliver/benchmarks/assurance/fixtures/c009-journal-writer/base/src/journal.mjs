// Audit journal entries are written one JSON object per line.
export function formatEntry(entry) {
  return JSON.stringify({ ...entry, v: 1 });
}
