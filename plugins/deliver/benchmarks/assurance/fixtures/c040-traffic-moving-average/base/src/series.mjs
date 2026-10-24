// Time-series helpers for the traffic charts. Series are arrays of integer counts.
export function total(series) {
  let sum = 0;
  for (const v of series) sum += v;
  return sum;
}
