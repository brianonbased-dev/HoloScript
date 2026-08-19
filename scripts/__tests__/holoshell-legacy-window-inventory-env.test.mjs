import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  compactPowerShellEnv,
  envBlockUtf16Bytes,
} from '../holoshell-legacy-window-inventory.mjs';

const bloatedEnv = { ...process.env };
for (let index = 0; index < 180; index += 1) {
  bloatedEnv[`npm_config_holoshell_bloat_${index}`] = 'x'.repeat(512);
}
bloatedEnv.npm_lifecycle_script = 'x'.repeat(8192);

const compact = compactPowerShellEnv(bloatedEnv);

assert.ok(envBlockUtf16Bytes(bloatedEnv) > 65535, 'fixture should exceed the Windows Add-Type environment threshold');
assert.ok(envBlockUtf16Bytes(compact) < 65535, 'compact PowerShell environment should stay below the Windows Add-Type threshold');
assert.equal(compact.npm_lifecycle_script, undefined);
assert.equal(compact.npm_config_holoshell_bloat_0, undefined);
assert.ok(compact.Path || compact.PATH, 'compact environment preserves PATH');

const selfTest = spawnSync(process.execPath, [
  'scripts/holoshell-legacy-window-inventory.mjs',
  '--self-test',
  '--json',
], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
  env: bloatedEnv,
  encoding: 'utf8',
  timeout: 30000,
  windowsHide: true,
});

assert.equal(selfTest.status, 0, `${selfTest.stdout}\n${selfTest.stderr}`);
const report = JSON.parse(selfTest.stdout);
assert.equal(report.schemaVersion, 'hololand.holoshell.legacy-window-inventory.v0.1.0');
assert.equal(report.safety.destructiveActionsTaken, false);
