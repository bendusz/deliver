// Markdown helpers for the docs site.
export function headingAnchor(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
}
