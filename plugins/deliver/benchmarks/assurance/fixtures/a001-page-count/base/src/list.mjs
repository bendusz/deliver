// Helpers for listing tasks.
export function sortByTitle(items) {
  return [...items].sort((a, b) => a.title.localeCompare(b.title));
}
