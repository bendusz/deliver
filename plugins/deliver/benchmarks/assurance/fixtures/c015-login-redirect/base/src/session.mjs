// Login session helpers.
export const DEFAULT_LANDING = '/dashboard';

export function sessionCookie(id) {
  return `sid=${id}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
