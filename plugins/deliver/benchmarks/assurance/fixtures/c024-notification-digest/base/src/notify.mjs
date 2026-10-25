// Email notification payloads.
export function digestSubject(count) {
  return count === 1 ? '1 new notification' : `${count} new notifications`;
}
