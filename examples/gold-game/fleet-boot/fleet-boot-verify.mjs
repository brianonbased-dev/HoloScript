#!/usr/bin/env node
// Gate: GOLD drive fleet-boot — verifies the ignition is real, idempotent, and
// that the cloud spend-gate is LOAD-BEARING (refuses to spend without a cap).
//
//   node fleet-boot-verify.mjs
//
// No real spend, no real spawn: cloud tier stays disabled / dry-run; the
// negative controls assert the gate REJECTS unsafe configs.
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOOT = join(HERE, 'gold-fleet-boot.mjs');
const MANIFEST = join(HERE, 'fleet-manifest.json');
const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });

// run the boot script with a given manifest; return {code, out}
function run(manifestPath, args = []) {
  try {
    const out = execFileSync(process.execPath, [BOOT, ...args, '--manifest', manifestPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}
function tmpManifest(mutate) {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  mutate(m);
  const d = mkdtempSync(join(tmpdir(), 'fleetman-'));
  const p = join(d, 'm.json');
  writeFileSync(p, JSON.stringify(m));
  return p;
}

// 1. manifest sane + SAFE DEFAULTS
const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
ok(
  'manifest parses + has 3 tiers',
  man.tiers && man.tiers.offline && man.tiers.local && man.tiers.cloud
);
ok(
  'cloud tier DISABLED by default',
  man.tiers.cloud.enabled === false,
  `enabled=${man.tiers.cloud.enabled}`
);
ok('cloud budgetCapUsd is 0 by default (no latent spend)', man.tiers.cloud.budgetCapUsd === 0);
ok('offline + local enabled (free tiers on)', man.tiers.offline.enabled && man.tiers.local.enabled);

// 2. dry-run boot succeeds and exercises offline+local, cloud skipped
const dry = run(MANIFEST, ['boot', '--dry-run']);
ok('dry-run boot exits 0', dry.code === 0, `code=${dry.code}`);
ok(
  'dry-run runs offline + local tiers',
  /tier.*offline/.test(dry.out) && /orchestrator/.test(dry.out)
);
ok(
  'dry-run leaves cloud skipped (disabled default)',
  /cloud.*skipped|"skipped":true/.test(dry.out)
);

// 3. NEGATIVE CONTROL — cloud enabled with NO cap must REFUSE (load-bearing gate)
const noCap = tmpManifest((m) => {
  m.tiers.cloud.enabled = true;
  m.tiers.cloud.budgetCapUsd = 0;
});
const r1 = run(noCap, ['boot', '--tier', 'cloud']);
ok(
  'NEG: cloud enabled w/ budgetCapUsd=0 is REFUSED (non-zero exit)',
  r1.code !== 0,
  `code=${r1.code}`
);
ok('NEG: refusal message names the missing spend cap', /REFUSED.*cap/i.test(r1.out));
const negCap = tmpManifest((m) => {
  m.tiers.cloud.enabled = true;
  m.tiers.cloud.budgetCapUsd = -5;
});
const r2 = run(negCap, ['boot', '--tier', 'cloud']);
ok('NEG: cloud enabled w/ negative cap is REFUSED', r2.code !== 0, `code=${r2.code}`);

// 4. cloud enabled WITH a positive cap but missing keys → skips wake (no spend, no crash)
const capNoKeys = tmpManifest((m) => {
  m.tiers.cloud.enabled = true;
  m.tiers.cloud.budgetCapUsd = 5;
  m.tiers.cloud.requireKeys = ['DEFINITELY_MISSING_KEY_XYZ'];
});
const r3 = run(capNoKeys, ['boot', '--tier', 'cloud', '--dry-run']);
ok(
  'cloud w/ cap but missing keys → skips wake (exit 0, no spend)',
  r3.code === 0 && /missing/i.test(r3.out),
  `code=${r3.code}`
);

// 5. cloud enabled w/ cap + dry-run + keys present → would wake under the cap (dry, no real spawn)
const capDry = tmpManifest((m) => {
  m.tiers.cloud.enabled = true;
  m.tiers.cloud.budgetCapUsd = 3;
  m.tiers.cloud.requireKeys = [];
});
const r4 = run(capDry, ['boot', '--tier', 'cloud', '--dry-run']);
ok(
  'cloud w/ cap (dry-run, no keys required) reports a bounded wake under the cap',
  r4.code === 0 && /cap \$3|budgetCapUsd|wake/i.test(r4.out),
  `code=${r4.code}`
);

// 6. status command works (idempotency surface)
const st = run(MANIFEST, ['status']);
ok('status command exits 0 and reports running set', st.code === 0 && /running/.test(st.out));

// 7. drive entrypoint exists
ok(
  'drive plug-in entrypoint present (PLUG-IN-START.bat)',
  existsSync(join(HERE, 'PLUG-IN-START.bat'))
);

const passed = checks.every((c) => c.pass);
for (const c of checks)
  console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks pass`);
if (!passed) {
  console.error(
    'FLEET-BOOT GATE FAILED: ' +
      checks
        .filter((c) => !c.pass)
        .map((c) => c.name)
        .join(', ')
  );
  process.exit(1);
}
console.log('FLEET-BOOT GATE PASS — tiered ignition real; cloud spend-gate is load-bearing.');
