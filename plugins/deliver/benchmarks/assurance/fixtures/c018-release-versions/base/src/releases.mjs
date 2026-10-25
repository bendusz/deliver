// Release metadata helpers.
export function parseTag(tag) {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(String(tag).trim());
  return m ? m[1] : null;
}
