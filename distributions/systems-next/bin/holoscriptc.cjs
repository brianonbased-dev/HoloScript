#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const requireFromPackage = createRequire(__filename);
const platformPackages = {
  'linux-x64': '@holoscript/systems-linux-x64',
  'win32-x64': '@holoscript/systems-win32-x64',
};
const host = `${process.platform}-${process.arch}`;
const platformPackage = platformPackages[host];

if (!platformPackage) {
  console.error(
    `@holoscript/systems native compiler does not support ${host}; supported hosts: ${Object.keys(
      platformPackages
    ).join(', ')}`
  );
  process.exit(1);
}

let compiler;
try {
  compiler = requireFromPackage.resolve(`${platformPackage}/holoscriptc`);
} catch {
  console.error(
    `@holoscript/systems could not resolve ${platformPackage}@0.2.0 for ${host}; ` +
      'reinstall without omitting optional dependencies'
  );
  process.exit(1);
}

const result = spawnSync(compiler, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
