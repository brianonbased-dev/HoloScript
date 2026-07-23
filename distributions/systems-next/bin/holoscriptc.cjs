#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const requireFromPackage = createRequire(__filename);
const packageManifest = require('../package.json');
const knownPlatformPackages = {
  'darwin-arm64': '@holoscript/systems-darwin-arm64',
  'linux-x64': '@holoscript/systems-linux-x64',
  'win32-x64': '@holoscript/systems-win32-x64',
};
const platformPackages = Object.fromEntries(
  Object.entries(knownPlatformPackages).filter(([, packageName]) =>
    Object.hasOwn(packageManifest.optionalDependencies || {}, packageName)
  )
);
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
  const expectedVersion = packageManifest.optionalDependencies?.[platformPackage];
  console.error(
    `@holoscript/systems could not resolve ${platformPackage}` +
      `${expectedVersion ? `@${expectedVersion}` : ''} for ${host}; ` +
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
