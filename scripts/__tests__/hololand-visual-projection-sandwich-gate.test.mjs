#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'hololand', 'self-test', 'visual-projection-sandwich', 'geolocation-gis-map-room');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const HTML_PATH = path.join(OUTPUT_DIR, 'gate.html');
const JS_PATH = path.join(OUTPUT_DIR, 'gate-receipt.js');
const BROWSER_RECEIPT_PATH = path.join(OUTPUT_DIR, 'browser-receipt.json');
const BROWSER_JS_PATH = path.join(OUTPUT_DIR, 'browser-receipt.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });

run(process.execPath, [
  'scripts/hololand-visual-projection-sandwich-gate.mjs',
  '--output-dir',
  OUTPUT_DIR,
  '--receipt',
  RECEIPT_PATH,
  '--html',
  HTML_PATH,
  '--js',
  JS_PATH,
  '--json',
]);

const receipt = readJson(RECEIPT_PATH);
assert.equal(receipt.schema, 'hololand.visual-projection-sandwich-gate.receipt.v0.1.0');
assert.equal(receipt.status, 'pass');
assert.equal(receipt.gate.id, 'geolocation-gis-map-room');
assert.equal(receipt.gate.packageClass, 'enterprise_business_solution');
assert.equal(receipt.gate.developerPackageSurface, false);
assert.equal(receipt.source.path, 'apps/holoshell/source/hololand-visual-projection-geolocation-gis-gate.hsplus');
assert.equal(receipt.source.format, 'hsplus');
assert.match(receipt.source.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.sourceProjection.contractOwner, 'HoloScript');
assert.equal(receipt.sourceProjection.schemaVersion, 'holoscript.visual.projection.v1');
assert.equal(receipt.sourceProjection.sourcePackage, '@holoscript/plugin-geolocation-gis');
assert.equal(receipt.sourceProjection.projectionId, 'geolocation-gis.base-map-room');
assert.equal(
  receipt.sourceProjection.manifest.path,
  '../HoloScript/packages/plugins/geolocation-gis-plugin/visual.projection.json',
);
assert.match(receipt.sourceProjection.manifest.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.sourceProjection.manifest.objectMappingCount, 4);
assert.equal(receipt.sourceProjection.manifest.panelMappingCount, 3);
assert.equal(receipt.sourceProjection.manifest.interactionCount, 3);
assert.deepEqual(receipt.sourceProjection.requiredObjectMappings, [
  'map-layer',
  'poi-marker',
  'route-path',
  'geofence-zone',
]);
assert.deepEqual(receipt.sourceProjection.requiredPanelMappings, [
  'location-detail-panel',
  'route-timeline-panel',
  'geo-receipt-panel',
]);
assert.deepEqual(receipt.sourceProjection.requiredInteractions, [
  'inspect_location',
  'compare_routes',
  'review_geofence',
]);
assert.equal(receipt.hololandLayer.adapterId, '@hololand/plugin-geolocation-gis');
assert.equal(receipt.hololandLayer.adapterRole, 'visual_runtime_sandwich');
assert.equal(receipt.hololandLayer.sourceSemanticsOwner, 'HoloScript');
assert.equal(receipt.hololandLayer.sourceSemanticsRewritten, false);
assert.equal(receipt.hololandLayer.localRewriteAllowed, false);
assert.equal(receipt.visualRuntimeAdapter.status, 'ready');
assert.equal(receipt.visualRuntimeAdapter.adapterId, '@hololand/plugin-geolocation-gis');
assert.equal(receipt.visualRuntimeAdapter.consumesSourceProjectionManifest, true);
assert.equal(receipt.visualRuntimeAdapter.sourceSemanticsRewritten, false);
assert.deepEqual(receipt.visualRuntimeAdapter.runtimeTargets, ['2d', '3d', 'xr', 'ar']);
assert.deepEqual(
  receipt.visualRuntimeAdapter.objectMappings.map((mapping) => mapping.id),
  ['map-layer', 'poi-marker', 'route-path', 'geofence-zone'],
);
assert.deepEqual(
  receipt.visualRuntimeAdapter.panelMappings.map((panel) => panel.id),
  ['location-detail-panel', 'route-timeline-panel', 'geo-receipt-panel'],
);
assert.deepEqual(
  receipt.visualRuntimeAdapter.interactions.map((interaction) => interaction.verb),
  ['inspect_location', 'compare_routes', 'review_geofence'],
);
assert.deepEqual(
  receipt.visualRuntimeAdapter.receiptHooks.map((hook) => hook.id),
  ['geo-selection-receipt', 'geo-agent-action-receipt'],
);
assert.equal(receipt.validation.status, 'pass');
assert.equal(receipt.validation.local.status, 'pass');
assert.equal(receipt.validation.local.source.status, 'pass');
assert.equal(receipt.validation.local.manifest.status, 'pass');
assert.equal(receipt.validation.local.sourceProjectionManifest.status, 'pass');
assert.equal(receipt.validation.mcp.status, 'not_embedded');
assert.ok(receipt.validation.local.source.policies.includes('HoloScriptOwnsBaseProjection'));
assert.ok(receipt.validation.local.source.policies.includes('HoloLandOwnsVisualSandwich'));
assert.ok(receipt.validation.local.source.policies.includes('EnterpriseVisualPackagesAreGates'));
assert.deepEqual(receipt.requiredReceipts ?? receipt.enterpriseReceipt.requiredReceipts, [
  'source',
  'visual_projection_source',
  'validation',
  'hololand_visual_adapter',
  'runtime',
  'render',
  'interaction',
  'enterprise_receipt',
]);
assert.ok(receipt.holoscriptPackages.some((pkg) => pkg.name === '@holoscript/plugin-geolocation-gis'));
assert.ok(receipt.holoscriptPackages.some((pkg) => pkg.name === '@holoscript/visual'));
assert.equal(receipt.benchmarkGates[0].id, 'holoscript_visual_projection_geolocation_gis');
assert.equal(receipt.runtime.status, 'ready');
assert.equal(receipt.render.status, 'ready');
assert.equal(receipt.render.sourceSemanticsRewritten, false);
assert.equal(receipt.render.adapterConsumesSourceProjectionManifest, true);
assert.equal(receipt.interaction.status, 'pending_browser_receipt');
assert.equal(receipt.enterpriseReceipt.status, 'ready');
assert.equal(receipt.promotion.status, 'adapter_contract_ready');
assert.equal(receipt.openWork.length, 0);
assert.equal(receipt.closedWork[0].id, 'hololand-visual-runtime-adapter');
assert.ok(existsSync(HTML_PATH), 'gate HTML missing');
assert.ok(existsSync(JS_PATH), 'gate receipt JS missing');

const html = readFileSync(HTML_PATH, 'utf8');
assert.match(html, /Geolocation GIS Map Room/);
assert.match(html, /geolocation-gis\.base-map-room/);
assert.match(html, /visual\.projection\.json/);
assert.match(html, /runtime-adapter-proof/);
assert.match(html, /map-layer/);
assert.match(html, /poi-marker/);
assert.match(html, /route-path/);
assert.match(html, /geofence-zone/);
assert.match(html, /location-detail-panel/);
assert.match(html, /route-timeline-panel/);
assert.match(html, /geo-receipt-panel/);
assert.match(html, /@hololand\/plugin-geolocation-gis/);
assert.match(html, /@holoscript\/visual/);
assert.match(html, /sourceSemanticsRewritten/);
assert.match(html, /visual-sandwich-verify/);
assert.match(html, /inspect_location/);
assert.match(html, /compare_routes/);
assert.match(html, /review_geofence/);
assert.match(html, /Interaction receipt pending/);

run(process.execPath, [
  'scripts/hololand-visual-projection-sandwich-browser-receipt.mjs',
  '--html',
  HTML_PATH,
  '--output-dir',
  OUTPUT_DIR,
  '--output',
  BROWSER_RECEIPT_PATH,
  '--js-output',
  BROWSER_JS_PATH,
  '--json',
], {
  timeout: 120_000,
});

const browserReceipt = readJson(BROWSER_RECEIPT_PATH);
assert.equal(browserReceipt.schema, 'hololand.visual-projection-sandwich-browser-receipt.v0.1.0');
assert.equal(browserReceipt.status, 'pass');
assert.equal(browserReceipt.interaction.status, 'pass');
assert.equal(browserReceipt.state.assertions.rootVisible, true);
assert.equal(browserReceipt.state.assertions.workflowVisible, true);
assert.equal(browserReceipt.state.assertions.projectionVisible, true);
assert.equal(browserReceipt.state.assertions.projectionManifestVisible, true);
assert.equal(browserReceipt.state.assertions.adapterVisible, true);
assert.equal(browserReceipt.state.assertions.runtimeAdapterVisible, true);
assert.equal(browserReceipt.state.assertions.runtimeAdapterReceiptReady, true);
assert.equal(browserReceipt.state.assertions.sourceSemanticsVisible, true);
assert.equal(browserReceipt.state.assertions.sourceSemanticsNotRewritten, true);
assert.equal(browserReceipt.state.assertions.validationVisible, true);
assert.equal(browserReceipt.state.assertions.objectMappingsVisible, true);
assert.equal(browserReceipt.state.assertions.panelMappingsVisible, true);
assert.equal(browserReceipt.state.assertions.interactionsVisible, true);
assert.equal(browserReceipt.state.assertions.receiptHooksVisible, true);
assert.equal(browserReceipt.state.assertions.responsibilitiesVisible, true);
assert.equal(browserReceipt.state.assertions.packageListVisible, true);
assert.equal(browserReceipt.state.assertions.receiptVisible, true);
assert.equal(browserReceipt.state.assertions.interactionCaptured, true);
assert.equal(browserReceipt.state.assertions.embeddedReceiptPresent, true);
assert.match(browserReceipt.evidence.screenshotSha256, /^[a-f0-9]{64}$/);
assert.match(browserReceipt.evidence.domSha256, /^[a-f0-9]{64}$/);
assert.ok(existsSync(path.resolve(REPO_ROOT, browserReceipt.evidence.screenshot)), 'screenshot file missing');
assert.ok(existsSync(path.resolve(REPO_ROOT, browserReceipt.evidence.dom)), 'DOM file missing');
assert.ok(existsSync(BROWSER_JS_PATH), 'browser receipt bootstrap JS missing');

console.log('hololand visual projection sandwich gate test passed');
