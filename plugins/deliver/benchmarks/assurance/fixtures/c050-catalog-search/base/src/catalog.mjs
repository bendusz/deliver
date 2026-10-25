// Product catalog records: { sku, name, priceCents, stock, tags }.
export function byName(a, b) {
  return a.name.localeCompare(b.name);
}
