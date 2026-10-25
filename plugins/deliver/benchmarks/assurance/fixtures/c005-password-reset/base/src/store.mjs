// In-memory key-value store with the same async API as the production Redis wrapper.
export class MemoryStore {
  constructor() {
    this.map = new Map();
  }
  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async set(key, value) {
    this.map.set(key, value);
  }
  async delete(key) {
    return this.map.delete(key);
  }
}
