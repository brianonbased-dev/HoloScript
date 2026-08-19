import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docPath = path.join(repoRoot, 'docs', 'specs', 'HOLOLAND_PRODUCT_AUTHORITY_BOUNDARY.md');
const manifestPath = path.join(repoRoot, 'docs', 'specs', 'hololand-product-authority-boundary.v1.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const docText = fs.readFileSync(docPath, 'utf8');
const normalizedDocText = docText.replace(/\s+/g, ' ');
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function getClass(id) {
  return manifest.changeClasses?.[id] || {};
}

function asSet(values) {
  return new Set(Array.isArray(values) ? values : []);
}

check(manifest.schemaVersion === 'hololand.product-authority-boundary.v1', 'schemaVersion must be hololand.product-authority-boundary.v1');
check(manifest.status === 'governance-manifest', 'status must be governance-manifest');
check(normalizedDocText.includes('HoloLand product direction is controlled by the founder team'), 'doc must state founder-team HoloLand product authority');
check(normalizedDocText.includes('HoloScript substrate direction is controlled by the broader HoloScript ecosystem'), 'doc must state HoloScript ecosystem substrate authority');

const productClass = getClass('founder-team-product');
const substrateClass = getClass('holoscript-substrate');
const crossClass = getClass('cross-boundary');

check(productClass.authority === 'founder-team', 'founder-team-product authority must be founder-team');
check(substrateClass.authority === 'holoscript-ecosystem', 'holoscript-substrate authority must be holoscript-ecosystem');
check(crossClass.authority === 'founder-team-and-holoscript-ecosystem', 'cross-boundary authority must require both sides');

const requiredProductDomains = [
  'art-direction',
  'gamer-loops',
  'assets',
  'shard-choices',
  'product-ux'
];

const requiredSubstrateDomains = [
  'language-syntax',
  'semantic-traits',
  'parser',
  'validator',
  'compiler',
  'runtime-primitives',
  'developer-apis'
];

const productDomains = asSet(productClass.domains);
for (const domain of requiredProductDomains) {
  check(productDomains.has(domain), `founder-team-product missing domain ${domain}`);
}

const substrateDomains = asSet(substrateClass.domains);
for (const domain of requiredSubstrateDomains) {
  check(substrateDomains.has(domain), `holoscript-substrate missing domain ${domain}`);
}

const gates = new Map((manifest.reviewGates || []).map((gate) => [gate.id, gate]));
const requiredGates = [
  'authority-classification',
  'founder-team-product-receipt',
  'holoscript-substrate-routing',
  'holoScript-source-contract',
  'asset-world-shard-review',
  'product-ux-review',
  'world-write-authority'
];

for (const gate of requiredGates) {
  check(gates.has(gate), `review gate missing: ${gate}`);
  check(docText.includes(gate), `doc must mention review gate ${gate}`);
}

for (const gate of gates.values()) {
  check(gate.blocking === true, `review gate ${gate.id} must be blocking`);
  check(Array.isArray(gate.evidence) && gate.evidence.length > 0, `review gate ${gate.id} must list evidence`);
}

const productRequiredGates = asSet(productClass.requiredGates);
for (const gate of ['authority-classification', 'founder-team-product-receipt', 'holoScript-source-contract']) {
  check(productRequiredGates.has(gate), `founder-team-product requiredGates missing ${gate}`);
}

const substrateRequiredGates = asSet(substrateClass.requiredGates);
for (const gate of ['authority-classification', 'holoscript-substrate-routing']) {
  check(substrateRequiredGates.has(gate), `holoscript-substrate requiredGates missing ${gate}`);
}

const crossRequiredGates = asSet(crossClass.requiredGates);
for (const gate of ['founder-team-product-receipt', 'holoscript-substrate-routing', 'world-write-authority']) {
  check(crossRequiredGates.has(gate), `cross-boundary requiredGates missing ${gate}`);
}

const rules = asSet((manifest.governanceRules || []).map((rule) => rule.id));
for (const rule of ['classify-before-review', 'product-not-auto-substrate', 'substrate-not-product-taste', 'cross-boundary-requires-both', 'agent-output-is-advisory', 'live-world-effects-receipted']) {
  check(rules.has(rule), `governance rule missing: ${rule}`);
}

const shortcuts = manifest.prohibitedShortcuts || [];
check(shortcuts.some((shortcut) => shortcut.includes('agent consensus')), 'prohibitedShortcuts must block anonymous agent consensus as product authority');
check(shortcuts.some((shortcut) => shortcut.includes('hand-authored TypeScript')), 'prohibitedShortcuts must block TypeScript as durable product authority');

if (failures.length > 0) {
  console.error('[product-authority-boundary] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[product-authority-boundary] PASS ${requiredProductDomains.length} product domains, ${requiredSubstrateDomains.length} substrate domains, and ${requiredGates.length} review gates validated.`);
