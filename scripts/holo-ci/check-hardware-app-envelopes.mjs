#!/usr/bin/env node
/**
 * Verifies that public/hardware app envelopes compose the existing fleet
 * utilities and package-consumption lanes instead of inventing shadow bundles.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'hardware-app-envelopes-manifest.json');
const FLEET_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'fleet-utilities-manifest.json');
const CONSUMPTION_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json');
const PACKAGE_JSON = join(ROOT, 'package.json');

const VALID_HARDWARE_CLASSES = new Set([
  'workstation',
  'edge-node',
  'gpu-worker',
  'hosted-coordinator',
]);
const VALID_COMMAND_KINDS = new Set([
  'repo-command',
  'ecosystem-command',
  'live-service',
  'manual-or-live',
]);
const VALID_TELEMETRY_SOURCE_KINDS = new Set([
  'repo-command',
  'ecosystem-command',
  'live-service',
  'mcp-tool',
  'runtime-library',
  'receipt-family',
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function asSet(values) {
  return new Set((values || []).filter(Boolean));
}

function sorted(values) {
  return [...values].sort();
}

function idLooksValid(id) {
  return /^[a-z0-9][a-z0-9-]*$/.test(String(id || ''));
}

function toolNameLooksValid(name) {
  return /^[a-z0-9][a-z0-9_:-]*$/.test(String(name || ''));
}

function requiredUtilitiesForConsumers(utilities, consumerIds) {
  const wanted = new Set();
  for (const utility of utilities) {
    const requiredBy = asSet(utility.requiredBy);
    for (const consumerId of consumerIds) {
      if (requiredBy.has(consumerId)) wanted.add(utility.id);
    }
  }
  return wanted;
}

function validateManifests({ appsManifest, fleetManifest, consumptionManifest, packageJson }) {
  const errors = [];
  const warnings = [];
  const rows = [];

  if (appsManifest?.schema !== 'holoscript.hardware-app-envelopes/v1') {
    errors.push(`unexpected app envelope schema: ${appsManifest?.schema || '<missing>'}`);
  }
  if (fleetManifest?.schema !== 'holoscript.fleet-utilities/v1') {
    errors.push(`unexpected fleet utility schema: ${fleetManifest?.schema || '<missing>'}`);
  }
  if (consumptionManifest?.schema !== 'holoscript.package-consumption-matrix/v1') {
    errors.push(
      `unexpected package consumption schema: ${consumptionManifest?.schema || '<missing>'}`
    );
  }

  const utilities = fleetManifest?.utilities || [];
  const utilityIds = asSet(utilities.map((utility) => utility.id));
  const consumerIds = asSet((consumptionManifest?.consumers || []).map((consumer) => consumer.id));
  for (const consumer of fleetManifest?.virtualConsumers || []) {
    if (consumer.id) consumerIds.add(consumer.id);
  }
  const scripts = packageJson?.scripts || {};
  const utilityBands = appsManifest?.utilityBands || [];
  const telemetrySignals = appsManifest?.telemetrySignals || [];
  const apps = appsManifest?.apps || [];
  const bandById = new Map();
  const usedBandIds = new Set();
  const telemetrySignalById = new Map();
  const usedTelemetrySignalIds = new Set();
  const appTelemetrySignalIds = new Map();
  const coveredConsumers = new Set();
  const seenApps = new Set();

  if (!Array.isArray(utilityBands) || utilityBands.length === 0) {
    errors.push('utilityBands[] is empty');
  }
  for (const band of utilityBands) {
    if (!idLooksValid(band.id)) {
      errors.push(`utility band id is missing or invalid: ${band.id || '<missing>'}`);
      continue;
    }
    if (bandById.has(band.id)) errors.push(`duplicate utility band id: ${band.id}`);
    bandById.set(band.id, band);
    if (!band.label) errors.push(`${band.id}: missing utility band label`);
    if (!band.hardwarePurpose) errors.push(`${band.id}: missing hardwarePurpose`);
    if (!band.publicRole) errors.push(`${band.id}: missing publicRole`);
    if (!Array.isArray(band.utilityIds) || band.utilityIds.length === 0) {
      errors.push(`${band.id}: missing utilityIds[]`);
    }
    for (const utilityId of band.utilityIds || []) {
      if (!utilityIds.has(utilityId)) {
        errors.push(`${band.id}: unknown utility '${utilityId}'`);
      }
    }
  }

  if (!Array.isArray(telemetrySignals) || telemetrySignals.length === 0) {
    errors.push('telemetrySignals[] is empty');
  }
  for (const signal of telemetrySignals) {
    if (!idLooksValid(signal.id)) {
      errors.push(`telemetry signal id is missing or invalid: ${signal.id || '<missing>'}`);
      continue;
    }
    if (telemetrySignalById.has(signal.id)) {
      errors.push(`duplicate telemetry signal id: ${signal.id}`);
    }
    telemetrySignalById.set(signal.id, signal);
    if (!signal.label) errors.push(`${signal.id}: missing telemetry signal label`);
    if (!signal.captureCadence) errors.push(`${signal.id}: missing captureCadence`);
    if (!signal.retention) errors.push(`${signal.id}: missing retention`);
    if (!signal.privacyBoundary) errors.push(`${signal.id}: missing privacyBoundary`);
    if (!signal.failureMode) errors.push(`${signal.id}: missing failureMode`);
    if (!Array.isArray(signal.requiredFields) || signal.requiredFields.length === 0) {
      errors.push(`${signal.id}: missing requiredFields[]`);
    }
    if (!Array.isArray(signal.requiredByApps) || signal.requiredByApps.length === 0) {
      errors.push(`${signal.id}: missing requiredByApps[]`);
    }

    const source =
      signal.source && typeof signal.source === 'object' && !Array.isArray(signal.source)
        ? signal.source
        : {};
    if (!VALID_TELEMETRY_SOURCE_KINDS.has(source.kind)) {
      errors.push(`${signal.id}: unknown telemetry source kind '${source.kind || '<missing>'}'`);
    }
    if (source.kind === 'repo-command') {
      if (!source.script) {
        errors.push(`${signal.id}: repo-command telemetry source must declare script`);
      } else if (!scripts[source.script]) {
        errors.push(`${signal.id}: package.json script not found: ${source.script}`);
      }
      if (!source.command)
        errors.push(`${signal.id}: repo-command telemetry source missing command`);
    } else if (source.kind === 'mcp-tool') {
      if (!toolNameLooksValid(source.tool)) {
        errors.push(`${signal.id}: mcp-tool telemetry source must declare a valid tool`);
      }
    } else if (
      source.kind === 'ecosystem-command' ||
      source.kind === 'live-service' ||
      source.kind === 'receipt-family'
    ) {
      if (!source.command) {
        errors.push(`${signal.id}: ${source.kind} telemetry source missing command`);
      }
    } else if (source.kind === 'runtime-library') {
      if (!source.path) errors.push(`${signal.id}: runtime-library telemetry source missing path`);
    }
  }

  if (!Array.isArray(apps) || apps.length === 0) {
    errors.push('apps[] is empty');
  }

  for (const app of apps) {
    rows.push({
      id: app.id,
      hardwareClass: app.hardwareClass,
      capabilityBands: app.capabilityBands || [],
      telemetrySignalIds: app.continuousCapability?.telemetrySignalIds || [],
      requiredConsumers: app.requiredConsumers || [],
      requiredUtilityIds: app.requiredUtilityIds || [],
    });

    if (!idLooksValid(app.id))
      errors.push(`app id is missing or invalid: ${app.id || '<missing>'}`);
    if (seenApps.has(app.id)) errors.push(`duplicate app id: ${app.id}`);
    seenApps.add(app.id);
    if (!app.label) errors.push(`${app.id}: missing label`);
    if (!VALID_HARDWARE_CLASSES.has(app.hardwareClass)) {
      errors.push(`${app.id}: unknown hardwareClass '${app.hardwareClass || '<missing>'}'`);
    }
    if (!Array.isArray(app.requiredConsumers) || app.requiredConsumers.length === 0) {
      errors.push(`${app.id}: missing requiredConsumers[]`);
    }
    for (const consumerId of app.requiredConsumers || []) {
      if (!consumerIds.has(consumerId)) {
        errors.push(`${app.id}: unknown consumer '${consumerId}'`);
      } else {
        coveredConsumers.add(consumerId);
      }
    }

    const requiredUtilityIds = asSet(app.requiredUtilityIds || []);
    if (requiredUtilityIds.size === 0) errors.push(`${app.id}: missing requiredUtilityIds[]`);
    const declaredCapabilityBands = app.capabilityBands || [];
    const capabilityBands = Array.isArray(declaredCapabilityBands) ? declaredCapabilityBands : [];
    const bandUtilityIds = new Set();
    if (!Array.isArray(declaredCapabilityBands) || capabilityBands.length === 0) {
      errors.push(`${app.id}: missing capabilityBands[]`);
    }
    for (const bandId of capabilityBands) {
      if (!bandById.has(bandId)) {
        errors.push(`${app.id}: unknown capability band '${bandId}'`);
        continue;
      }
      usedBandIds.add(bandId);
      for (const utilityId of bandById.get(bandId).utilityIds || []) {
        bandUtilityIds.add(utilityId);
      }
    }
    for (const utilityId of requiredUtilityIds) {
      if (capabilityBands.length > 0 && !bandUtilityIds.has(utilityId)) {
        errors.push(
          `${app.id}: required utility '${utilityId}' is not covered by capabilityBands[]`
        );
      }
    }
    for (const utilityId of bandUtilityIds) {
      if (!requiredUtilityIds.has(utilityId)) {
        errors.push(
          `${app.id}: capabilityBands[] include utility '${utilityId}' that is not declared in requiredUtilityIds[]`
        );
      }
    }
    for (const utilityId of requiredUtilityIds) {
      if (!utilityIds.has(utilityId)) errors.push(`${app.id}: unknown utility '${utilityId}'`);
      const utility = utilities.find((candidate) => candidate.id === utilityId);
      if (utility) {
        const utilityConsumers = asSet(utility.requiredBy);
        const supported = (app.requiredConsumers || []).some((consumerId) =>
          utilityConsumers.has(consumerId)
        );
        if (!supported) {
          errors.push(
            `${app.id}: utility '${utilityId}' is not required by any app consumer (${(app.requiredConsumers || []).join(',')})`
          );
        }
      }
    }

    const expectedUtilities = requiredUtilitiesForConsumers(utilities, app.requiredConsumers || []);
    for (const expectedId of expectedUtilities) {
      if (!requiredUtilityIds.has(expectedId)) {
        errors.push(`${app.id}: missing required utility '${expectedId}' for its consumer lane`);
      }
    }

    if (!Array.isArray(app.publicEntrySurfaces) || app.publicEntrySurfaces.length === 0) {
      errors.push(`${app.id}: missing publicEntrySurfaces[]`);
    }
    if (!Array.isArray(app.receiptFamilies) || app.receiptFamilies.length === 0) {
      errors.push(`${app.id}: missing receiptFamilies[]`);
    }
    if (!Array.isArray(app.caveats) || app.caveats.length === 0) {
      errors.push(`${app.id}: missing caveats[]`);
    }
    const publicConsumption = app.publicConsumption || {};
    if (!publicConsumption.persona) {
      errors.push(`${app.id}: missing publicConsumption.persona`);
    }
    if (!publicConsumption.primaryInstallSurface) {
      errors.push(`${app.id}: missing publicConsumption.primaryInstallSurface`);
    }
    if (!publicConsumption.onboardingGoal) {
      errors.push(`${app.id}: missing publicConsumption.onboardingGoal`);
    }
    if (
      !Array.isArray(publicConsumption.mustNotClaim) ||
      publicConsumption.mustNotClaim.length === 0
    ) {
      errors.push(`${app.id}: missing publicConsumption.mustNotClaim[]`);
    }
    const continuousCapability = app.continuousCapability || {};
    if (!continuousCapability.captureMode) {
      errors.push(`${app.id}: missing continuousCapability.captureMode`);
    }
    if (!continuousCapability.staleAfter) {
      errors.push(`${app.id}: missing continuousCapability.staleAfter`);
    }
    if (!continuousCapability.retentionPolicy) {
      errors.push(`${app.id}: missing continuousCapability.retentionPolicy`);
    }
    if (!continuousCapability.privacyBoundary) {
      errors.push(`${app.id}: missing continuousCapability.privacyBoundary`);
    }
    if (!continuousCapability.failureResponse) {
      errors.push(`${app.id}: missing continuousCapability.failureResponse`);
    }
    if (
      !Array.isArray(continuousCapability.readinessRequires) ||
      continuousCapability.readinessRequires.length === 0
    ) {
      errors.push(`${app.id}: missing continuousCapability.readinessRequires[]`);
    }
    const declaredTelemetrySignalIds = continuousCapability.telemetrySignalIds || [];
    const telemetrySignalIds = Array.isArray(declaredTelemetrySignalIds)
      ? declaredTelemetrySignalIds
      : [];
    const appSignalIds = new Set();
    if (!Array.isArray(declaredTelemetrySignalIds) || telemetrySignalIds.length === 0) {
      errors.push(`${app.id}: missing continuousCapability.telemetrySignalIds[]`);
    }
    for (const signalId of telemetrySignalIds) {
      appSignalIds.add(signalId);
      if (!telemetrySignalById.has(signalId)) {
        errors.push(`${app.id}: unknown telemetry signal '${signalId}'`);
      } else {
        usedTelemetrySignalIds.add(signalId);
      }
    }
    appTelemetrySignalIds.set(app.id, appSignalIds);

    const validationCommands = app.validationCommands || [];
    if (!Array.isArray(validationCommands) || validationCommands.length === 0) {
      errors.push(`${app.id}: missing validationCommands[]`);
    }
    for (const command of validationCommands) {
      if (!idLooksValid(command.id)) {
        errors.push(`${app.id}: validation command id is invalid: ${command.id || '<missing>'}`);
      }
      if (!VALID_COMMAND_KINDS.has(command.kind)) {
        errors.push(
          `${app.id}/${command.id}: unknown validation command kind '${command.kind || '<missing>'}'`
        );
      }
      if (!command.command) errors.push(`${app.id}/${command.id}: missing command`);
      if (command.kind === 'repo-command') {
        if (!command.script) {
          errors.push(`${app.id}/${command.id}: repo-command must declare script`);
        } else if (!scripts[command.script]) {
          errors.push(`${app.id}/${command.id}: package.json script not found: ${command.script}`);
        }
      }
    }
  }

  for (const band of utilityBands) {
    if (band?.id && !usedBandIds.has(band.id)) {
      errors.push(`utility band '${band.id}' is not used by any app envelope`);
    }
  }

  for (const signal of telemetrySignals) {
    if (signal?.id && !usedTelemetrySignalIds.has(signal.id)) {
      errors.push(`telemetry signal '${signal.id}' is not used by any app envelope`);
    }
    for (const appId of signal.requiredByApps || []) {
      if (!seenApps.has(appId)) {
        errors.push(`${signal.id}: requiredByApps references unknown app '${appId}'`);
        continue;
      }
      const appSignals = appTelemetrySignalIds.get(appId) || new Set();
      if (!appSignals.has(signal.id)) {
        errors.push(`${appId}: missing required telemetry signal '${signal.id}'`);
      }
    }
  }

  for (const consumerId of consumerIds) {
    if (!coveredConsumers.has(consumerId)) {
      errors.push(`consumer '${consumerId}' is not covered by any hardware app envelope`);
    }
  }

  const utilityCoverage = new Map();
  for (const utility of utilities) utilityCoverage.set(utility.id, []);
  for (const app of apps) {
    for (const utilityId of app.requiredUtilityIds || []) {
      if (utilityCoverage.has(utilityId)) utilityCoverage.get(utilityId).push(app.id);
    }
  }
  for (const [utilityId, appIds] of utilityCoverage) {
    if (appIds.length === 0)
      warnings.push(`utility '${utilityId}' is not included in any app envelope`);
  }

  return {
    ok: errors.length === 0,
    rows,
    coveredConsumers: sorted(coveredConsumers),
    warnings,
    errors,
  };
}

function runSelfTest() {
  const packageJson = { scripts: { 'check:fleet-utilities': 'node x' } };
  const valid = validateManifests({
    packageJson,
    appsManifest: {
      schema: 'holoscript.hardware-app-envelopes/v1',
      utilityBands: [
        {
          id: 'cli-band',
          label: 'CLI Band',
          hardwarePurpose: 'Prove a local command surface.',
          publicRole: 'Expose the CLI to a hardware app.',
          utilityIds: ['cli'],
        },
      ],
      telemetrySignals: [
        {
          id: 'metrics-signal',
          label: 'Metrics Signal',
          source: { kind: 'mcp-tool', tool: 'get_telemetry_metrics' },
          captureCadence: 'on readiness check',
          retention: 'latest aggregate receipt',
          privacyBoundary: 'aggregate metrics only',
          requiredFields: ['status', 'metrics'],
          failureMode: 'block observability claims',
          requiredByApps: ['laptop-app'],
        },
      ],
      apps: [
        {
          id: 'laptop-app',
          label: 'Laptop App',
          hardwareClass: 'workstation',
          requiredConsumers: ['laptop'],
          capabilityBands: ['cli-band'],
          publicConsumption: {
            persona: 'Local operator',
            primaryInstallSurface: 'CLI',
            onboardingGoal: 'Install one app that exposes the CLI.',
            mustNotClaim: ['Do not claim live hardware proof from repo checks.'],
          },
          continuousCapability: {
            captureMode: 'test-continuous',
            telemetrySignalIds: ['metrics-signal'],
            staleAfter: '24h',
            readinessRequires: ['metrics signal'],
            retentionPolicy: 'retain latest receipt',
            privacyBoundary: 'aggregate only',
            failureResponse: 'block public readiness',
          },
          publicEntrySurfaces: ['CLI'],
          requiredUtilityIds: ['cli'],
          validationCommands: [
            {
              id: 'fleet',
              kind: 'repo-command',
              script: 'check:fleet-utilities',
              command: 'corepack pnpm run check:fleet-utilities',
            },
          ],
          receiptFamilies: ['receipt'],
          caveats: ['live hardware requires live check'],
        },
      ],
    },
    fleetManifest: {
      schema: 'holoscript.fleet-utilities/v1',
      utilities: [{ id: 'cli', requiredBy: ['laptop'] }],
      virtualConsumers: [],
    },
    consumptionManifest: {
      schema: 'holoscript.package-consumption-matrix/v1',
      consumers: [{ id: 'laptop' }],
    },
  });
  if (!valid.ok) {
    throw new Error(`expected valid app fixture to pass: ${valid.errors.join('; ')}`);
  }

  const invalid = validateManifests({
    packageJson,
    appsManifest: {
      schema: 'holoscript.hardware-app-envelopes/v1',
      utilityBands: [
        {
          id: 'cli-band',
          label: 'CLI Band',
          hardwarePurpose: 'Prove a local command surface.',
          publicRole: 'Expose the CLI to a hardware app.',
          utilityIds: ['cli'],
        },
      ],
      telemetrySignals: [
        {
          id: 'metrics-signal',
          label: 'Metrics Signal',
          source: { kind: 'mcp-tool', tool: 'get_telemetry_metrics' },
          captureCadence: 'on readiness check',
          retention: 'latest aggregate receipt',
          privacyBoundary: 'aggregate metrics only',
          requiredFields: ['status', 'metrics'],
          failureMode: 'block observability claims',
          requiredByApps: ['bad-app'],
        },
      ],
      apps: [
        {
          id: 'bad-app',
          label: 'Bad App',
          hardwareClass: 'workstation',
          requiredConsumers: ['laptop'],
          publicEntrySurfaces: ['CLI'],
          requiredUtilityIds: [],
          validationCommands: [
            {
              id: 'missing-script',
              kind: 'repo-command',
              script: 'missing',
              command: 'corepack pnpm run missing',
            },
          ],
          receiptFamilies: ['receipt'],
          caveats: ['caveat'],
        },
      ],
    },
    fleetManifest: {
      schema: 'holoscript.fleet-utilities/v1',
      utilities: [{ id: 'cli', requiredBy: ['laptop'] }],
      virtualConsumers: [{ id: 'hosted' }],
    },
    consumptionManifest: {
      schema: 'holoscript.package-consumption-matrix/v1',
      consumers: [{ id: 'laptop' }],
    },
  });
  if (invalid.ok || invalid.errors.length < 3) {
    throw new Error(
      'expected invalid app fixture to surface utility, public-consumption, script, and consumer issues'
    );
  }

  console.log('[hardware-app-envelopes] self-test PASS');
}

function main() {
  if (SELF_TEST) {
    runSelfTest();
    return;
  }

  const missing = [
    ['app envelope manifest', MANIFEST],
    ['fleet utilities manifest', FLEET_MANIFEST],
    ['package consumption manifest', CONSUMPTION_MANIFEST],
    ['package.json', PACKAGE_JSON],
  ].filter(([, path]) => !existsSync(path));

  if (missing.length) {
    const errors = missing.map(([label, path]) => `${label} missing: ${path}`);
    const output = { ok: false, rows: [], coveredConsumers: [], warnings: [], errors };
    if (JSON_OUT) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.error(`[hardware-app-envelopes] FAIL: ${errors.length} issue(s)`);
      for (const error of errors) console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const output = validateManifests({
    appsManifest: readJson(MANIFEST),
    fleetManifest: readJson(FLEET_MANIFEST),
    consumptionManifest: readJson(CONSUMPTION_MANIFEST),
    packageJson: readJson(PACKAGE_JSON),
  });

  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const row of output.rows) {
      console.log(
        `[hardware-app-envelopes] ${row.id} (${row.hardwareClass}) -> consumers=${row.requiredConsumers.join(',')} utilities=${row.requiredUtilityIds.join(',')} telemetry=${row.telemetrySignalIds.join(',')}`
      );
    }
    for (const warning of output.warnings)
      console.warn(`[hardware-app-envelopes] WARN: ${warning}`);
    if (output.errors.length) {
      console.error(`[hardware-app-envelopes] FAIL: ${output.errors.length} issue(s)`);
      for (const error of output.errors) console.error(`  - ${error}`);
    } else {
      console.log(
        '[hardware-app-envelopes] PASS: hardware app envelopes cover declared consumer lanes.'
      );
    }
  }

  process.exit(output.ok ? 0 : 1);
}

main();
