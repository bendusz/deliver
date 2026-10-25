import os from 'node:os';
import path from 'node:path';

// Where the desktop sync client keeps its files.
export const configDir = (home = os.homedir()) => path.join(home, '.syncer');
