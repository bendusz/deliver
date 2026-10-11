export function clamp(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) throw new TypeError('priority must be a number');
  return Math.min(5, Math.max(1, n));
}
