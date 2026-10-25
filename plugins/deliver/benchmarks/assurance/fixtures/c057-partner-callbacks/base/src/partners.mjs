// Integration partners receive order events by webhook. Codes worth one retry:
export const RETRYABLE = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);
