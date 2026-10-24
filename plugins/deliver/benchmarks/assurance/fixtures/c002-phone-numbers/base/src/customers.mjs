// Customer profile helpers.
export function displayName({ firstName, lastName }) {
  return [firstName, lastName].filter(Boolean).join(' ');
}
