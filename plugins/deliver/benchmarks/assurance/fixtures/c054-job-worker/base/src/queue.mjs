// In-process job queue used by the worker. Jobs: { id, type, payload, attempts }.
export class JobQueue {
  constructor() {
    this.ready = [];
    this.dead = [];
  }

  push(job) {
    this.ready.push({ attempts: 0, ...job });
  }

  shift() {
    return this.ready.shift();
  }

  get length() {
    return this.ready.length;
  }
}
