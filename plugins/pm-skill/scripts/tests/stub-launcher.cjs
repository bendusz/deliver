#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const r = spawnSync(process.execPath, [path.join(__dirname, 'stub-codex.mjs'), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
process.exit(r.status === null ? 1 : r.status);
