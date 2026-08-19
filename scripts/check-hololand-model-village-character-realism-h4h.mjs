#!/usr/bin/env node

// H4H preserves the promoted H4G shared-submit graph while proving that exact
// source-authored @hair(color) RGB survives the compiler bridge, draw spec,
// material uniform, native WGSL shader, and final RTX pixels.

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4H',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h4h-material-identity'],
});
const H4G_CHECKER_REL = 'scripts/check-hololand-model-village-character-realism-h4g.mjs';
const SLUG = 'model-village-character-realism-h4h-material-model-family-identity-convergence';
const SOURCE_REL = `source/layers/vr/frontier/model-village/${SLUG}.holo`;
const POLICY_REL = `source/proofs/${SLUG}-policy.hsplus`;
const SEED_REL = `source/proofs/${SLUG}-seed.hs`;
const MANIFEST_REL = `source/layers/vr/frontier/model-village/${SLUG}-manifest.holo`;
const CHECKER_REL = 'scripts/check-hololand-model-village-character-realism-h4h.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-realism-h4h.test.mjs';
const REPORT_REL = `docs/reports/${SLUG}-2026-08-01.md`;
const HERO_REL = `docs/assets/model-village/${SLUG}-2026-08-01.png`;
const EVIDENCE_REL = `docs/assets/model-village/${SLUG}-2026-08-01.json`;
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4h-material-identity';
const EXPECTED_COMMIT = '712698cf465b15c8552c3c5e545800543b929c78';
const PREVIOUS_COMMIT = '7a09fa27ba78694ad0751eabf9befea08aa973e3';
const EXPECTED_IDENTITIES = [
  { displayLabel: 'OpenAI', modelFamilyId: 'openai', hairColor: 0x2f2928 },
  { displayLabel: 'Claude', modelFamilyId: 'anthropic', hairColor: 0x6b4633 },
  { displayLabel: 'Gemini', modelFamilyId: 'google', hairColor: 0x303641 },
  { displayLabel: 'Grok', modelFamilyId: 'xai', hairColor: 0x171d22 },
];
const SOURCE_COLOR_WEIGHT = 0.55;
const MATERIAL_HASH_BINDINGS = [
  ['packages/engine/src/native-render/draw-spec.ts', '346f6e8be79a9a27d8e644ead9a7c6dd6b87044464def8994baf1a62a9a00d9b'],
  ['packages/engine/src/character-render/AgentAvatarHair.ts', '3cf398e760067f18e03c6940a2c6d11c9bc1bcb964fe0e7b298cc1c6f83fd090'],
  ['packages/engine/src/character-render/CharacterHost.ts', '1252aa436237a79efda7c67e5dbc731bcd1a3e7c00bef8b28085679aaf720b80'],
  ['packages/engine/src/character-render/CharacterHostFromComposition.ts', 'b61487173803bcaffbf1fa04468497900d6c42a67f82729da6c9e7c482718219'],
  ['packages/engine/src/character-render/character-render.ts', 'a4342c713adfc43abbcec4c9dd44c04444955638cfb007dfc6a78d3f93b37beb'],
  ['packages/engine/src/rendering/webgpu/shaders/skin-skinning.wgsl', 'c5b24531e4958ec42b7c9caf1463904c8bbb920c4175cba6cdc3178e80900d84'],
];
const DURABLE_FILES = [
  SOURCE_REL,
  POLICY_REL,
  SEED_REL,
  CHECKER_REL,
  TEST_REL,
  REPORT_REL,
  HERO_REL,
  EVIDENCE_REL,
];

// The HEAD-equality assertion this replaced demanded one exact commit; eighteen gates
// demanded eighteen different ones, so the set could never be satisfied at once. See
// scripts/lib/model-village-upstream-commit-pin.mjs for the full reasoning.
function upstreamPinFailures(holoScriptRoot) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    EXPECTED_COMMIT,
    MATERIAL_HASH_BINDINGS.map(([relative, sha256]) => ({ pathKey: relative, relative, sha256 })),
  ).errors;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function portableSha256(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.holo', '.hsplus', '.hs', '.mjs', '.md', '.json'].includes(extension)) {
    return sha256(readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n'));
  }
  return sha256File(filePath);
}

function gitHead(root) {
  const require = createRequire(import.meta.url);
  const { execFileSync } = require('node:child_process');
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

export function deriveH4HRunnerSource(h4gSource, root = ROOT) {
  let source = h4gSource
    .replaceAll('\r\n', '\n')
    .replaceAll('H4G', 'H4H')
    .replaceAll('h4g', 'h4h');
  source = source.replaceAll(/^import (.+) from '\.\/([^']+)';$/gm, (_match, binding, relativePath) => {
    const absoluteUrl = pathToFileURL(path.join(root, 'scripts', relativePath)).href;
    return `import ${binding} from '${absoluteUrl}';`;
  });
  const replacements = [
    ['model-village-character-realism-h4h-shared-character-world-frame', SLUG],
    ['MV_CHARACTER_REALISM_H4H_SHARED_CHARACTER_WORLD_FRAME', 'MV_CHARACTER_REALISM_H4H_MATERIAL_MODEL_FAMILY_IDENTITY_CONVERGENCE'],
    ['C:/holorepo-worktrees/holoscript-h4h-shared-world-frame', 'C:/holorepo-worktrees/holoscript-h4h-material-identity'],
    ['.tmp/hololand/model-village/character-realism-h4h', OUTPUT_REL],
    [PREVIOUS_COMMIT, EXPECTED_COMMIT],
  ];
  for (const [before, after] of replacements) {
    assert(source.includes(before), `H4G runner anchor drifted: ${before}`);
    source = source.replaceAll(before, after);
  }
  return source;
}

function validateMaterialPins(holoScriptRoot) {
  const errors = [];
  errors.push(...upstreamPinFailures(holoScriptRoot));
  for (const [relativePath, expected] of MATERIAL_HASH_BINDINGS) {
    const absolute = path.join(holoScriptRoot, relativePath);
    if (!existsSync(absolute)) errors.push(`${relativePath} is missing`);
    else if (sha256File(absolute) !== expected) errors.push(`${relativePath} hash drifted`);
  }
  return errors;
}

function positionsSha256(positions) {
  return sha256(Buffer.from(Float32Array.from(positions).buffer));
}

function colorHex(color) {
  return `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
}

export function validateH4HIdentityAdmission(records, payload) {
  const errors = [];
  const residents = [];
  if (records.length !== EXPECTED_IDENTITIES.length) errors.push('compiler resident count drifted');
  if (payload?.residents?.length !== EXPECTED_IDENTITIES.length) errors.push('payload resident count drifted');
  for (let index = 0; index < EXPECTED_IDENTITIES.length; index += 1) {
    const expected = EXPECTED_IDENTITIES[index];
    const record = records[index];
    const resident = payload?.residents?.[index];
    const receipt = record?.groom?.material;
    const hairGroup = resident?.spec?.materialGroups?.find((group) => group.materialRole === 'hair');
    const drawMaterial = hairGroup?.material;
    if (record?.displayLabel !== expected.displayLabel) {
      errors.push(`${expected.displayLabel}: compiler label drifted`);
    }
    if (record?.modelFamilyId !== expected.modelFamilyId) {
      errors.push(`${expected.displayLabel}: model-family id drifted`);
    }
    if (receipt?.schemaVersion !== 'holoscript.agent-avatar-hair-material.v2') {
      errors.push(`${expected.displayLabel}: v2 hair material receipt missing`);
    }
    if (receipt?.sourceColor !== expected.hairColor) {
      errors.push(`${expected.displayLabel}: receipt source color drifted`);
    }
    if (Math.abs((receipt?.sourceColorWeight ?? -1) - SOURCE_COLOR_WEIGHT) > 1e-9) {
      errors.push(`${expected.displayLabel}: receipt source color weight drifted`);
    }
    if (drawMaterial?.color !== expected.hairColor) {
      errors.push(`${expected.displayLabel}: draw-spec source color drifted`);
    }
    if (Math.abs((drawMaterial?.sourceColorWeight ?? -1) - SOURCE_COLOR_WEIGHT) > 1e-9) {
      errors.push(`${expected.displayLabel}: draw-spec source color weight drifted`);
    }
    residents.push({
      displayLabel: expected.displayLabel,
      modelFamilyId: expected.modelFamilyId,
      sourceColor: colorHex(expected.hairColor),
      sourceColorPackedRgb: expected.hairColor,
      drawSpecColorPackedRgb: drawMaterial?.color ?? null,
      sourceColorWeight: drawMaterial?.sourceColorWeight ?? null,
      materialSchema: receipt?.schemaVersion ?? null,
      sourceColorRetained: drawMaterial?.color === expected.hairColor,
      faceProfile: record?.face?.facialDetailProfile ?? null,
      groomProfile: record?.groom?.profile ?? null,
      positionSha256: resident?.spec?.mesh?.positions
        ? positionsSha256(resident.spec.mesh.positions)
        : null,
    });
  }
  if (new Set(residents.map((resident) => resident.sourceColorPackedRgb)).size !== 4) {
    errors.push('source hair colors are not four-way distinct');
  }
  if (new Set(residents.map((resident) => resident.positionSha256)).size !== 4) {
    errors.push('resident geometry payloads are not four-way distinct');
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    schema: 'hololand.model-village.character-realism-h4h-identity-admission.v1',
    sourceColorWeight: SOURCE_COLOR_WEIGHT,
    distinctSourceHairColorCount: new Set(
      residents.map((resident) => resident.sourceColorPackedRgb)
    ).size,
    distinctGeometryPayloadCount: new Set(residents.map((resident) => resident.positionSha256)).size,
    residents,
  };
}

async function materializeIdentityAdmission(root, holoScriptRoot, outputDir) {
  const frameDir = path.join(outputDir, 'frame-0');
  const generatedPath = path.join(frameDir, 'h4h-derived-payload-0.mjs');
  assert(existsSync(generatedPath), `generated compiler harness missing: ${generatedPath}`);
  const harness = await import(`${pathToFileURL(generatedPath).href}?identity=${Date.now()}`);
  const stack = await harness.parseH4AStack(root, holoScriptRoot, frameDir);
  try {
    const plan = stack.h4aContract?.objects || [];
    const compiled = await harness.buildCompiledPayload(stack, plan, holoScriptRoot, frameDir);
    return validateH4HIdentityAdmission(compiled.compilerRecords, compiled.payload);
  } finally {
    stack.esbuild.stop?.();
  }
}

export function validateH4HManifest(root = ROOT) {
  const errors = [];
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { status: 'fail', errors: ['H4H manifest is missing'] };
  const source = readFileSync(manifestPath, 'utf8');
  const entries = new Map();
  const pattern = /path:\s*"([^"]+)"\s+sha256:\s*"([0-9a-f]{64})"/gu;
  for (const match of source.matchAll(pattern)) entries.set(match[1], match[2]);
  for (const relativePath of DURABLE_FILES) {
    const expected = entries.get(relativePath);
    const absolute = path.join(root, relativePath);
    if (!expected) errors.push(`manifest binding missing: ${relativePath}`);
    else if (!existsSync(absolute)) errors.push(`durable file missing: ${relativePath}`);
    else if (portableSha256(absolute) !== expected) errors.push(`manifest hash drifted: ${relativePath}`);
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function milliseconds(statistics) {
  return (statistics.median / 1_000_000).toFixed(3);
}

function reportMarkdown(receipt) {
  const shared = receipt.gpuTimestampAdmission.sharedStageTimingStatistics;
  const lines = [
    '# H4H material and model-family identity convergence',
    '',
    `Status: **${receipt.status.toUpperCase()}**`,
    '',
    'H4H fixes a real compiler-to-shader identity loss: exact `@hair(color)` RGB now remains operative alongside the melanin response. The four residents still render through the promoted H4G persistent shared WebGPU graph in one command buffer and one queue submission.',
    '',
    '## Source-compiled identity',
    '',
    '| Resident | Source hair | Material receipt | Source weight | Geometry digest |',
    '|---|---:|---|---:|---|',
    ...receipt.identityAdmission.residents.map(
      (resident) => `| ${resident.displayLabel} | ${resident.sourceColor} | ${resident.materialSchema} | ${resident.sourceColorWeight} | \`${resident.positionSha256.slice(0, 12)}\` |`
    ),
    '',
    '## Live RTX scope',
    '',
    `- Shared four-resident aggregate median: ${milliseconds(shared.aggregateNanoseconds)} ms.`,
    `- Shared 2x2 composite median: ${milliseconds(shared.compositeNanoseconds)} ms.`,
    `- Samples: ${receipt.gpuTimestampAdmission.sampleCount} measured shared frames after 4 warmups.`,
    '- Per sample: one command buffer, one queue submission, 26 GPU timestamp queries, and zero measured pixel readbacks.',
    `- Browser/GPU: ${receipt.browserWebgpuAdmission.browser.product}; ${receipt.browserWebgpuAdmission.gpu.vendor}/${receipt.browserWebgpuAdmission.gpu.architecture}.`,
    '',
    '## Honest boundary',
    '',
    'This is a bounded four-resident character/composite measurement and material-identity witness. It is not a complete HoloLand world frame, a Quest/headset result, a production whole-frame budget, or a photorealism claim.',
  ];
  return `${lines.join('\n')}\n`;
}

export async function runCharacterRealismH4H(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validateMaterialPins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  mkdirSync(outputDir, { recursive: true });
  const h4gSource = readFileSync(path.join(root, H4G_CHECKER_REL), 'utf8');
  const generatedSource = deriveH4HRunnerSource(h4gSource);
  const runnerPath = path.join(outputDir, 'h4h-derived-shared-frame-runner.mjs');
  writeFileSync(runnerPath, generatedSource);
  const runner = await import(`${pathToFileURL(runnerPath).href}?sha=${sha256(generatedSource)}`);
  const baseReceipt = await runner.runCharacterRealismH4H({
    root,
    holoScriptRoot,
    outputDir,
    browser: options.browser,
    writeArtifacts: options.writeArtifacts === true,
    skipManifest: true,
  });
  const identityAdmission = await materializeIdentityAdmission(root, holoScriptRoot, outputDir);
  assert(identityAdmission.status === 'pass', identityAdmission.errors.join('\n'));
  const receipt = {
    ...baseReceipt,
    schema: 'hololand.model-village.character-realism-h4h-material-model-family-identity-witness.v1',
    capturedAt: new Date().toISOString(),
    milestone: 'MV_CHARACTER_REALISM_H4H_MATERIAL_MODEL_FAMILY_IDENTITY_CONVERGENCE',
    sourceAdmission: {
      ...baseReceipt.sourceAdmission,
      holoScriptCommit: EXPECTED_COMMIT,
      sourceSha256: portableSha256(path.join(root, SOURCE_REL)),
      policySha256: portableSha256(path.join(root, POLICY_REL)),
      seedSha256: portableSha256(path.join(root, SEED_REL)),
      operativeAppearanceSource:
        'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo',
      materialRuntimeHashBindings: Object.fromEntries(MATERIAL_HASH_BINDINGS),
    },
    identityAdmission,
  };
  if (options.writeArtifacts) {
    mkdirSync(path.dirname(path.join(root, EVIDENCE_REL)), { recursive: true });
    mkdirSync(path.dirname(path.join(root, REPORT_REL)), { recursive: true });
    writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(path.join(root, REPORT_REL), reportMarkdown(receipt));
  }
  if (!options.skipManifest) {
    const manifest = validateH4HManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return receipt;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { writeArtifacts: false, skipManifest: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs();
  runCharacterRealismH4H(options)
    .then((receipt) => {
      if (options.json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      else {
        const shared = receipt.gpuTimestampAdmission.sharedStageTimingStatistics;
        process.stdout.write(
          `PASS H4H material identity: ${receipt.identityAdmission.distinctSourceHairColorCount} source colors; ` +
            `shared median ${milliseconds(shared.aggregateNanoseconds)} ms; ` +
            `${receipt.gpuTimestampAdmission.sampleCount} RTX timestamp samples\n`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
