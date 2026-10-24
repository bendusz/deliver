// Tiny SQL helpers for the reporting API. Values always go through placeholders.
export function placeholders(n, start = 1) {
  return Array.from({ length: n }, (_, i) => `$${start + i}`).join(', ');
}
