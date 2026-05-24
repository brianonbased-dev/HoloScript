// THE GOLD GAME — Gate 23: full GOLD data inspection verifier.
//
// Proves the game can show the full markdown body for a real GOLD entry, not
// just count/index metadata.

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const server = require('./server.cjs');
const source = readFileSync(join(here, 'drive-build.mjs'), 'utf8');
const htmlPath = join(here, 'drive-build', 'index.html');
const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
const entry = server.vaultEntry('W.GOLD.535');

const checks = [
  ['server exposes /api/vault-entry full-entry endpoint', /\/api\/vault-entry/.test(readFileSync(join(here, 'server.cjs'), 'utf8'))],
  ['server resolves a real GOLD file by ID', entry.found === true && /wisdom\/w_gold_535\.md/.test(entry.relativePath || '')],
  ['server returns full markdown content, not metadata only', /CapabilityToken/.test(entry.content || '') && Buffer.byteLength(entry.content || '') > 1000],
  ['drive build embeds static full-entry data for offline mode', /entryData/.test(source) && /readVaultEntry/.test(source)],
  ['generated build contains a full-data panel body', /entryBody/.test(html) && /No full entry body/.test(html)],
  ['generated build can request live full data by ID', /api\/vault-entry\?id=/.test(html)],
];

let ok = true;
console.log('GATE-23 (FULL GOLD DATA INSPECTION) VERIFICATION:');
for (const [label, pass] of checks) {
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
  ok = ok && pass;
}
console.log('  => GATE 23', ok ? 'VERIFIED' : 'BROKEN');
process.exit(ok ? 0 : 1);
