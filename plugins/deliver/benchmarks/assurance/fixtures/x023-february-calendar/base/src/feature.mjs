export function daysInFebruary(year) {
  return year % 4 === 0 ? 29 : 28;
}
