import { EventEmitter } from 'node:events';

// The app's domain event bus.
export const bus = new EventEmitter();
