export function csvCell(value) {
  return value.includes(',') ? `"${value}"` : value;
}
