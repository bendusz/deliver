// In-memory advisory locks keyed by name, with the same API as the Redis-backed locks.
export class LockManager {
  constructor() {
    this.held = new Set();
  }

  async acquire(name) {
    if (this.held.has(name)) return false;
    this.held.add(name);
    return true;
  }

  async release(name) {
    this.held.delete(name);
  }
}
