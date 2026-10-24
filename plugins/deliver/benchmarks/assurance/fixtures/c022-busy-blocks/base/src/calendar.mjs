// Busy-time blocks for the scheduling page: [start, end) in minutes since midnight.
export function blockLength([start, end]) {
  return end - start;
}
