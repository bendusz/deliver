// Contact records imported from CSV uploads: { email, name, source }.
export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}
