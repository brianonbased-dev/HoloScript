/**
 * Regenerates pnpm-licenses-summary.md from pnpm-licenses-snapshot.json.
 * Run from repo root:
 *   pnpm licenses list --json > packages/core/src/reconstruction/reports/pnpm-licenses-snapshot.raw.json
 * Or use UTF-8 no BOM; then:
 *   node packages/core/src/reconstruction/reports/generate-pnpm-license-summary.mjs
 *
 * This script strips a leading BOM if present and writes a normalized JSON copy + markdown summary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshotPath = join(__dirname, 'pnpm-licenses-snapshot.json');
const summaryPath = join(__dirname, 'pnpm-licenses-summary.md');

let raw = readFileSync(snapshotPath, 'utf8');
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

const byLicense = JSON.parse(raw);
const licenseKeys = Object.keys(byLicense);

let packageCount = 0;
const rows = [];
for (const lic of licenseKeys) {
  const arr = byLicense[lic];
  const n = Array.isArray(arr) ? arr.length : 0;
  packageCount += n;
  rows.push({ lic, count: n });
}
rows.sort((a, b) => b.count - a.count);

const reviewPatterns = [
  /unknown/i,
  /unlicensed/i,
  /unlicense/i,
  /lgpl/i,
  /\bgpl/i,
  /agpl/i,
  /commercial/i,
  /proprietary/i,
  /wtfpl/i,
  /see license in/i,
  /polyform/i,
  /cc-by/i,
  /apache-2\.0 and lgpl/i,
  /remotion license/i,
  /blueoak/i,
];
const reviewQueue = [];
for (const { lic, count } of rows) {
  if (reviewPatterns.some((re) => re.test(lic))) reviewQueue.push({ lic, count });
}

const generated = new Date().toISOString().slice(0, 10);

const md = `# pnpm license snapshot — summary

**Tool:** \`pnpm licenses list --json\` (third-party dependency licenses; not the HoloScript \`deploy/license-checker\` composition helper).

**Workspace:** holoscript monorepo root

**Generated:** ${generated}

**Packages counted:** ${packageCount}

**Distinct license expressions:** ${licenseKeys.length}

**Machine-readable listing:** [\`pnpm-licenses-snapshot.json\`](./pnpm-licenses-snapshot.json) (name, version, path, license, and metadata from pnpm).

## Counts by declared license

| License (SPDX / composite) | Packages |
| ---: | ---: |
${rows.map((r) => `| ${escapeMdCell(r.lic)} | ${r.count} |`).join('\n')}

## Review queue (spot-check / non-permissive / ambiguous)

Declared \`license\` fields can be wrong or composite. Counsel or OSPO should validate before major distribution changes.

| License | Packages |
| ---: | ---: |
${reviewQueue.length ? reviewQueue.map((r) => `| ${escapeMdCell(r.lic)} | ${r.count} |`).join('\n') : '| (none matched heuristics) | 0 |'}

## How to refresh

\`\`\`powershell
Set-Location <repo-root>
pnpm licenses list --json | Out-File -Encoding utf8NoBOM packages/core/src/reconstruction/reports/pnpm-licenses-snapshot.json
node packages/core/src/reconstruction/reports/generate-pnpm-license-summary.mjs
\`\`\`

On older PowerShell without \`utf8NoBOM\`, run this script after export; it strips BOM and rewrites normalized JSON.
`;

writeFileSync(summaryPath, md, 'utf8');
// Normalize JSON without BOM for reliable tooling
writeFileSync(snapshotPath, JSON.stringify(byLicense, null, 2) + '\n', 'utf8');
console.error('Wrote', summaryPath, 'and normalized', snapshotPath, { packageCount, licenses: licenseKeys.length });

function escapeMdCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
