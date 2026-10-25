// Stock per SKU: Map<sku, { onHand, reserved }>.
export function available(stock, sku) {
  const s = stock.get(sku);
  return s ? s.onHand - s.reserved : 0;
}
