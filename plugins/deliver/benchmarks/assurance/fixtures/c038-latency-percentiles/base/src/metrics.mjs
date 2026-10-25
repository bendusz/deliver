// Metric helpers for the status dashboard. Samples are response times in milliseconds.
export function mean(samples) {
  return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
}
