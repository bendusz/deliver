// Webhook helpers for the payment provider's callbacks.
export function deliveryId(headers) {
  return headers['x-delivery-id'] ?? null;
}
