// Payment gateway error codes. Declines are a final answer about the card.
export const DECLINE_CODES = new Set(['card_declined', 'insufficient_funds', 'expired_card']);
// Errors the gateway documents as transient.
export const RETRYABLE_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'rate_limited', 'api_error']);
