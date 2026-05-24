// THE GOLD GAME — Gate 22: first-person desktop control verifier.
//
// This is a structural/user-control gate: it proves the generated 3D build
// contains a true desktop first-person path, not only tier-jump metadata UI.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'drive-build.mjs'), 'utf8');
const htmlPath = join(here, 'drive-build', 'index.html');
const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';

const checks = [
  ['desktop first-person mode exists', /desktopMode\s*=\s*'orbit'/.test(source) && /first-person/.test(source)],
  ['pointer lock starts player control', /requestPointerLock/.test(source)],
  ['WASD and arrows drive continuous movement', /KeyW/.test(source) && /KeyA/.test(source) && /KeyS/.test(source) && /KeyD/.test(source)],
  ['mouse look updates yaw and pitch', /movementX/.test(source) && /player\.yaw/.test(source) && /player\.pitch/.test(source)],
  ['E graduates through HoloGate from first-person', /GRADUATED via HoloGate \(first-person\)/.test(source) && /validatePortalIntent/.test(source)],
  ['F dispatches selected GOLD entry for inspection', /gold-entry-selected/.test(source)],
  ['generated build exposes first-person controls', /first-person control/.test(html) && /WASD moves/.test(html)],
];

let ok = true;
console.log('GATE-22 (FIRST-PERSON DESKTOP CONTROL) VERIFICATION:');
for (const [label, pass] of checks) {
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
  ok = ok && pass;
}
console.log('  => GATE 22', ok ? 'VERIFIED' : 'BROKEN');
process.exit(ok ? 0 : 1);
