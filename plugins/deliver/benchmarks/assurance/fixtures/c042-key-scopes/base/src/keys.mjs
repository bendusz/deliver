// API keys carry space-separated scopes such as "invoices:read" or "users:*".
export function parseScopes(header) {
  return String(header || '').split(/\s+/).filter(Boolean);
}
