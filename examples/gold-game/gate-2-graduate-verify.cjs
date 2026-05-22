const path = require('node:path');
const fs = require('node:fs');
const V = require('./vault-ops.cjs');
const dir = path.join(__dirname, 'vault-sandbox');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };

console.log('GATE 2 — graduate verb verification (sandbox vault):');
const seedDigest = V.buildSandbox(dir);
const before = V.readState(dir);
ok(before.tiers.bronze.includes('B.GRADUATE.001'), 'seed: B.GRADUATE.001 starts in bronze');

const r = V.graduate(dir, 'B.GRADUATE.001', 'human-curator');
ok(r.ok, 'graduate() returns ok');
ok(r.receipt && r.receipt.fromTier === 'bronze' && r.receipt.toTier === 'gold', 'receipt: bronze -> gold (silver skipped, per farm.py)');
const after = V.readState(dir);
ok(!after.tiers.bronze.includes('B.GRADUATE.001'), 'entry removed from bronze');
ok(after.tiers.gold.includes('B.GRADUATE.001'), 'entry now in gold (real file move)');
ok(fs.existsSync(path.join(dir, 'gold', 'B.GRADUATE.001.json')), 'gold/B.GRADUATE.001.json exists on disk');
const recDir = path.join(dir, 'receipts');
ok(fs.readdirSync(recDir).some((f) => f.includes('B.GRADUATE.001')), 'graduation receipt written to disk');

// reproducibility: a fresh build + same graduation yields an identical post-state digest
V.buildSandbox(dir);
const r2 = V.graduate(dir, 'B.GRADUATE.001', 'human-curator');
ok(r2.receipt.stateDigest === r.receipt.stateDigest, 'stateDigest reproduces across runs (deterministic)');

// false cases (the variational gate of curation)
V.buildSandbox(dir);
const top = V.graduate(dir, 'P.GOLD.001');
ok(!top.ok && /top tier/.test(top.error), 'refuses to graduate a Diamond (already at top)');
const missing = V.graduate(dir, 'NOPE.999');
ok(!missing.ok, 'refuses unknown entry');

console.log('\n=> GATE 2 ' + (fail === 0 ? 'VERIFIED' : 'FAILED') + ' (' + pass + ' pass / ' + fail + ' fail)');
process.exit(fail === 0 ? 0 : 1);
