const tick = () => new Promise((resolve) => setImmediate(resolve));

// Async document store with the same API as the production client.
export class DocStore {
  constructor() {
    this.docs = new Map();
  }

  async get(id) {
    await tick();
    return this.docs.has(id) ? structuredClone(this.docs.get(id)) : null;
  }

  async insert(id, doc) {
    await tick();
    if (this.docs.has(id)) throw new Error(`document ${id} already exists`);
    this.docs.set(id, structuredClone(doc));
  }

  async update(id, doc) {
    await tick();
    if (!this.docs.has(id)) throw new Error(`document ${id} does not exist`);
    this.docs.set(id, structuredClone(doc));
  }
}
