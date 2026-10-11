export function parseDue(text) {
  return new Date(`${text}T00:00:00Z`);
}
