#!/usr/bin/env node
'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const target = join(__dirname, '..', 'dist', 'cli.js');

if (!existsSync(target)) {
  console.error(
    '[holollama] build output is missing. Run `pnpm --filter @holoscript/holollama run build` first.'
  );
  process.exit(1);
}

import(pathToFileURL(target).href)
  .then((mod) => mod.runCli(process.argv.slice(2)))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
