import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'docs', 'specs', 'hololand-mcp-sovereign-manifest.v1.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

check(manifest.schemaVersion === 'hololand.mcp.sovereign-manifest.v1', 'schemaVersion must be hololand.mcp.sovereign-manifest.v1');
check(manifest.sourcePackage === '@hololand/world-mcp', 'sourcePackage must be @hololand/world-mcp');

const validBuckets = ['keep', 'rename', 'delegate', 'deprecate', 'test'];
const dispositions = manifest.existingToolDisposition || {};
const compatibilityAliases = manifest.compatibilityAliases || {};
const mappedTools = new Map();

for (const bucket of validBuckets) {
  const entries = dispositions[bucket] || {};
  check(Object.keys(entries).length > 0, `bucket ${bucket} must not be empty`);

  for (const [tool, entry] of Object.entries(entries)) {
    check(!mappedTools.has(tool), `${tool} appears in multiple disposition buckets`);
    mappedTools.set(tool, { bucket, ...entry });
    check(typeof entry.family === 'string' && entry.family.length > 0, `${tool} must name a family`);

    if (bucket === 'rename') {
      check(typeof entry.sovereignTool === 'string' && entry.sovereignTool.startsWith('hololand_'), `${tool} rename must target a hololand_ tool`);
    }

    if (bucket === 'delegate') {
      check(typeof entry.delegateTo === 'string' && entry.delegateTo.length > 0, `${tool} delegate entry must name delegateTo`);
    }

    if (bucket === 'deprecate') {
      check(typeof entry.deprecationReason === 'string' && entry.deprecationReason.length > 0, `${tool} deprecate entry must name deprecationReason`);
      check(typeof entry.replacement === 'string' && entry.replacement.length > 0, `${tool} deprecate entry must name replacement`);
    }

    if (bucket === 'test') {
      check(typeof entry.testRequirement === 'string' && entry.testRequirement.length > 0, `${tool} test entry must name testRequirement`);
    }
  }
}

const familyIds = new Set((manifest.requiredFamilies || []).map((family) => family.id));
const familyAliases = new Map();
for (const family of manifest.requiredFamilies || []) {
  check(Array.isArray(family.sovereignTools) && family.sovereignTools.length > 0, `family ${family.id} must list sovereignTools`);
  for (const alias of family.aliases || []) {
    check(typeof alias === 'string' && alias.length > 0, `family ${family.id} alias must be a non-empty string`);
    familyAliases.set(alias, family.id);
  }
  for (const tool of family.sovereignTools || []) {
    check(tool.startsWith('hololand_'), `family ${family.id} contains non-sovereign tool ${tool}`);
  }
}

const requiredFamilies = [
  'shard_world',
  'frontier_gameplay',
  'twin_earth',
  'creator_publishing',
  'agent_stewardship',
  'runtime_receipt',
  'hardware_validation'
];

for (const family of requiredFamilies) {
  check(familyIds.has(family), `required family missing: ${family}`);
}

check(compatibilityAliases.familyIds?.twin_earth === 'twin_universe', 'compatibilityAliases must map twin_earth to twin_universe');
check(compatibilityAliases.familyIds?.twin_earth_robot_ai === 'twin_universe_robot_ai', 'compatibilityAliases must map twin_earth_robot_ai to twin_universe_robot_ai');
check(familyAliases.get('twin_universe') === 'twin_earth', 'twin_earth family must expose twin_universe alias');
check(familyAliases.get('twin_universe_robot_ai') === 'twin_earth_robot_ai', 'twin_earth_robot_ai family must expose twin_universe_robot_ai alias');
check(
  compatibilityAliases.toolIds?.hololand_twin_earth_operational_graph_query === 'hololand_twin_universe_operational_graph_query',
  'compatibilityAliases must map the Twin Universe operational graph tool alias'
);

for (const [tool, entry] of mappedTools) {
  check(familyIds.has(entry.family), `${tool} references unknown family ${entry.family}`);
}

const forbidden = manifest.ownershipBoundaries?.explicitForbiddenDuplication || [];
for (const term of ['parse', 'validate', 'compile', 'trait', 'graph', 'Absorb']) {
  check(forbidden.some((line) => line.toLowerCase().includes(term.toLowerCase())), `forbidden duplication must mention ${term}`);
}

const receiptFields = new Set(manifest.crossMcpReceiptEnvelope?.requiredFields || []);
for (const field of ['sourceTrustStatus', 'holoscriptValidation', 'runtimeOutcome', 'hardwareEvidence', 'rollbackPlan']) {
  check(receiptFields.has(field), `receipt envelope missing required field ${field}`);
}
const conditionalFields = new Set(manifest.crossMcpReceiptEnvelope?.conditionalFields || []);
check(conditionalFields.has('twinEarthAnchorId'), 'receipt envelope must preserve legacy twinEarthAnchorId field');
check(conditionalFields.has('twinUniverseAnchorId'), 'receipt envelope must expose canonical twinUniverseAnchorId alias');

const observedTools = new Set();
const namePattern = /name:\s*['"]([^'"]+)['"]/g;
const toolNamePattern = /^[a-z][a-z0-9_]*$/;

for (const source of manifest.registeredToolSources || []) {
  const sourcePath = path.join(repoRoot, source.path);
  check(fs.existsSync(sourcePath), `registered source path missing: ${source.path}`);
  if (!fs.existsSync(sourcePath)) {
    continue;
  }

  const ignored = new Set(source.ignoreNames || []);
  const text = fs.readFileSync(sourcePath, 'utf8');
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    if (ignored.has(name)) {
      continue;
    }
    if (toolNamePattern.test(name)) {
      observedTools.add(name);
    }
  }
}

for (const tool of observedTools) {
  check(mappedTools.has(tool), `observed registered tool is missing disposition: ${tool}`);
}

for (const tool of mappedTools.keys()) {
  check(observedTools.has(tool), `disposition maps a tool not observed in registered sources: ${tool}`);
}

if (failures.length > 0) {
  console.error('[hololand-mcp-manifest] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[hololand-mcp-manifest] PASS ${observedTools.size} registered tools mapped across ${validBuckets.length} disposition buckets and ${familyIds.size} families.`);
