// A fake database connection that records the statements it runs, for tests and local dev.
export class FakeDb {
  constructor() {
    this.log = [];
  }

  async query(sql, params = []) {
    this.log.push(sql);
    return { sql, params, rows: [] };
  }
}
