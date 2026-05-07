#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const target = join(__dirname, '..', 'dist', 'index.js');

if (!existsSync(target)) {
  console.error('[holoscript-agent] build output is missing. Run `pnpm --filter @holoscript/holoscript-agent run build` first.');
  process.exit(1);
}

import(pathToFileURL(target).href).catch((error) => {
  console.error(error);
  process.exit(1);
});
