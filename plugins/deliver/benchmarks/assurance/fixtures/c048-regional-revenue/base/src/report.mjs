// Finance report helpers. Amounts are integer cents.
export function sumCents(values) {
  return values.reduce((a, b) => a + b, 0);
}
