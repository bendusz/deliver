// In-memory user repository with the same API as the SQL-backed one. Each method is one query.
export class UserRepo {
  constructor(users) {
    this.users = new Map(users.map((u) => [u.id, u]));
    this.queries = 0;
  }

  async findById(id) {
    this.queries++;
    return this.users.get(id) ?? null;
  }

  async findByIds(ids) {
    this.queries++;
    return [...new Set(ids)].map((id) => this.users.get(id)).filter(Boolean);
  }
}
