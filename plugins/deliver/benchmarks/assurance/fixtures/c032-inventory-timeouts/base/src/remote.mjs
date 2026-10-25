// Remote calls to the inventory service.
export class TimeoutError extends Error {
  constructor(ms) {
    super(`timed out after ${ms} ms`);
    this.name = 'TimeoutError';
    this.code = 'ETIMEDOUT';
  }
}
