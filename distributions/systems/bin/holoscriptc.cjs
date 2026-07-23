#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error(
    `@holoscript/systems native compiler supports win32-x64; received ${process.platform}-${process.arch}`
  );
  process.exit(1);
}

const compiler = join(__dirname, '..', 'native', 'win32-x64', 'holoscriptc.exe');
const result = spawnSync(compiler, process.argv.slice(2), { stdio: 'inherit', windowsHide: true });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
