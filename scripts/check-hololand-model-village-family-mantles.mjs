#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  encodePng,
  objectProperties,
  sha256,
} from './check-hololand-model-village-resident-rig.mjs';
import { loadMantleTextureTile } from './check-hololand-model-village-cloth-mantle.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog-manifest.holo';
const PUBLIC_CATALOG_REL =
  'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo';
const LINEUP_REL =
  'docs/assets/model-village/model-village-six-family-mantle-lineup-2026-07-26.png';
const GRAYSCALE_REL =
  'docs/assets/model-village/model-village-six-family-mantle-grayscale-2026-07-26.png';
const CVD_REL =
  'docs/assets/model-village/model-village-six-family-mantle-deuteranopia-2026-07-26.png';
const DEFAULT_OUTPUT_REL = '.tmp/hololand/model-village/family-mantle-witness';
const PROFILE = 'village_story_unblinded';
const DENIED_PROFILE = 'research_live_blinded';
const DISCLOSURE =
  'HoloLand-authored visual interpretation; not affiliated with or endorsed by the named providers.';
const RENDER_SIZE = 384;
const CLEAR = Object.freeze([0.02, 0.04, 0.07, 1]);
const CAMERA = Object.freeze([0, 1.05, 6]);
const LIGHT = Object.freeze([0.4, 0.86, 0.36]);
const FRAME_HEIGHT_SCALE = 1.25;
const SAMPLE_TIME = 0.6;
const REQUIRED_MODELS = Object.freeze(['skin-sss', 'woven-cloth', 'lambert', 'woven-cloth']);
const RESEARCH_BINDING_FIELDS = Object.freeze([
  'researchResidentBinding',
  'researchSeatBinding',
  'researchPersonaBinding',
  'researchRoleBinding',
  'adapterAssignmentBinding',
]);

export const FAMILY_MANTLES = Object.freeze([
  Object.freeze({
    name: 'Claude',
    familyId: 'anthropic',
    agentSurfaceId: 'claude-desktop',
    modelFamily: 'claude',
    catalogObject: 'ClaudeEmbodiment',
    style: 'anthropic_quiet_nested_arcs',
    mantleId: 'stormglass-mantle-anthropic-v1',
    patternId: 'quiet_nested_open_arcs',
    glyphId: 'open_arc_weave',
    accent: '#C16F45',
    slug: 'claude',
  }),
  Object.freeze({
    name: 'OpenAI',
    familyId: 'openai',
    agentSurfaceId: 'codex-hardware',
    modelFamily: 'gpt',
    catalogObject: 'OpenAIEmbodiment',
    style: 'openai_recursive_interlock',
    mantleId: 'stormglass-mantle-openai-v1',
    patternId: 'recursive_cell_interlock',
    glyphId: 'recursive_interlock_glyph',
    accent: '#D6D1C7',
    slug: 'openai',
  }),
  Object.freeze({
    name: 'Gemini',
    familyId: 'google',
    agentSurfaceId: 'gemini-antigravity',
    modelFamily: 'gemini',
    catalogObject: 'GeminiEmbodiment',
    style: 'google_paired_prism_panels',
    mantleId: 'stormglass-mantle-google-v1',
    patternId: 'paired_offset_prismatic_panels',
    glyphId: 'paired_prism_weave',
    accent: '#3F6D7A',
    slug: 'gemini',
  }),
  Object.freeze({
    name: 'Grok',
    familyId: 'xai',
    agentSurfaceId: 'grok-hardware',
    modelFamily: 'grok',
    catalogObject: 'GrokEmbodiment',
    style: 'xai_off_axis_signal_bands',
    mantleId: 'stormglass-mantle-xai-v1',
    patternId: 'off_axis_signal_bands',
    glyphId: 'diagonal_signal_weave',
    accent: '#A64B3C',
    slug: 'grok',
  }),
  Object.freeze({
    name: 'GLM',
    familyId: 'ollama',
    agentSurfaceId: 'ollama-cloud',
    modelFamily: 'glm',
    catalogObject: 'GLMEmbodiment',
    style: 'glm_modular_phase_lattice',
    mantleId: 'stormglass-mantle-ollama-v1',
    patternId: 'modular_phase_lattice',
    glyphId: 'phase_lattice_glyph',
    accent: '#C8A84E',
    slug: 'glm',
  }),
  Object.freeze({
    name: 'Brittney',
    familyId: 'sovereign',
    agentSurfaceId: 'brittney-holoshell',
    modelFamily: 'brittney',
    catalogObject: 'BrittneyEmbodiment',
    style: 'sovereign_locality_mesh',
    mantleId: 'stormglass-mantle-sovereign-v1',
    patternId: 'sovereign_locality_mesh',
    glyphId: 'owned_mesh_glyph',
    accent: '#6D5A8C',
    slug: 'brittney',
  }),
]);

const bundleRel = (family) =>
  `assets/model-village/residents/stormglass-${family.slug}-mantle-lod0.character.json`;

function parseArgs(argv) {
  const args = {
    holoscriptRoot: process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, DEFAULT_OUTPUT_REL),
    writeArtifacts: false,
    skipManifest: false,
    skipGpu: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index];
    else if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') args.writeArtifacts = true;
    else if (arg === '--skip-manifest') args.skipManifest = true;
    else if (arg === '--skip-gpu') args.skipGpu = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-family-mantles.mjs [options]

Options:
  --holoscript-root <path>  Built HoloScript checkout
  --output-dir <path>       Runtime receipt directory
  --write-artifacts         Refresh six bundles and three native GPU lineup witnesses
  --skip-manifest           Bootstrap before the immutable manifest exists
  --skip-gpu                Validate source, catalog, runtime, materials, and compiler only
  --json                    Emit the receipt as JSON`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function flattenObjects(ast) {
  const objects = [...(ast.objects ?? [])];
  const walk = (group) => {
    objects.push(...(group.objects ?? []));
    for (const child of group.groups ?? []) walk(child);
  };
  for (const group of ast.spatialGroups ?? []) walk(group);
  return objects;
}

function trait(object, name) {
  return object?.traits?.find((candidate) => candidate.name === name);
}

export function validateFamilyMantleCatalogSource(ast, publicCatalogAst) {
  const metadata = ast.metadata ?? {};
  const state = objectProperties(ast.state);
  assert(metadata.presentationProfile === PROFILE, `Presentation profile must be ${PROFILE}`);
  assert(metadata.researchLiveBlindedAllowed === false, 'Live blinded research must be denied');
  assert(metadata.canonicalWriteAuthority === false, 'Catalog must not have write authority');
  assert(metadata.causalEffect === false, 'Catalog must be non-causal');
  assert(metadata.providerEndorsementClaimed === false, 'Catalog must not claim endorsement');
  assert(metadata.independentProjectDisclosure === DISCLOSURE, 'Independent disclosure drifted');
  assert(metadata.exactModelRevisions === 'absent', 'Exact model revisions must remain absent');
  assert(state.namedFamilyMantlesBuilt === 6, 'Catalog must claim exactly six built mantles');
  assert(state.targetNamedFamilyMantles === 6, 'Catalog target must remain six');
  assert(state.browserConsumerBuilt === false, 'MV-V5 must not claim the browser consumer');
  assert(state.completeMvP2Claimed === false, 'Catalog must not claim complete MV-P2');
  assert(state.catalogOrderDefinesResearchSeat === false, 'Catalog order became a seat join');
  assert(state.catalogObjectIdDefinesResearchSeat === false, 'Object id became a seat join');
  assert(state.catalogHasStaticResearchJoin === false, 'Catalog gained a static research join');
  assert(state.staticTransformsMayTargetResearchSeats === false, 'Static seat transforms enabled');
  assert(equal(state.catalogRestPosition, [0, 0, 0]), 'Catalog rest position drifted');
  assert(
    state.prohibitedPresentationProfiles?.includes(DENIED_PROFILE),
    'Live blinded profile is not explicitly denied'
  );

  const shared = (ast.templates ?? []).find(
    (template) => template.name === 'StormglassSharedResidentBody'
  );
  assert(shared, 'Shared resident template is missing');
  const sharedProps = objectProperties(shared);
  assert(equal(sharedProps.position, [0, 0, 0]), 'Shared template has a non-neutral transform');
  assert(sharedProps.detachablePresentationOverlay === true, 'Mantles are not detachable');
  assert(sharedProps.researchLiveBlindedAllowed === false, 'Shared template leaked to research');
  for (const field of RESEARCH_BINDING_FIELDS) {
    assert(sharedProps[field] === 'none', `Shared template ${field} must remain none`);
  }

  const sourceObjects = ast.objects ?? [];
  const publicObjects = flattenObjects(publicCatalogAst);
  const aligned = [];
  for (const family of FAMILY_MANTLES) {
    const object = sourceObjects.find((candidate) => candidate.name === family.name);
    assert(object, `Missing source object ${family.name}`);
    assert(object.template === shared.name, `${family.name} does not use the shared body`);
    const props = objectProperties(object);
    const clothing = trait(object, 'clothing')?.config;
    assert(clothing, `${family.name} has no @clothing`);
    assert(clothing.style === 'stormglass_hooded_tunic', `${family.name} changed garment`);
    assert(clothing.color === '#557F91', `${family.name} changed shared garment colour`);
    assert(clothing.mantle_style === family.style, `${family.name} mantle style drifted`);
    assert(clothing.mantle_color === family.accent, `${family.name} mantle colour drifted`);
    assert(clothing.mantle_detachable === true, `${family.name} mantle is not detachable`);
    assert(props.position === undefined, `${family.name} authors a static placement`);
    const expected = {
      publicDisplayName: family.name,
      familyId: family.familyId,
      agentSurfaceId: family.agentSurfaceId,
      modelFamily: family.modelFamily,
      familyMantleId: family.mantleId,
      familyMantlePatternId: family.patternId,
      familyMantleGlyphId: family.glyphId,
      familyMantleAccentColor: family.accent,
    };
    for (const [field, value] of Object.entries(expected)) {
      assert(props[field] === value, `${family.name} source ${field} drifted`);
    }
    const publicObject = publicObjects.find(
      (candidate) => candidate.name === family.catalogObject
    );
    assert(publicObject, `Missing keyed public catalog object ${family.catalogObject}`);
    const publicProps = objectProperties(publicObject).properties;
    assert(publicProps, `${family.name} public catalog properties are missing`);
    for (const [field, value] of Object.entries(expected)) {
      assert(publicProps[field] === value, `${family.name} public ${field} drifted`);
    }
    for (const field of RESEARCH_BINDING_FIELDS) {
      assert(publicProps[field] === 'none', `${family.name} public ${field} must remain none`);
    }
    aligned.push({ name: family.name, ...expected, style: family.style });
  }

  const attachment = sourceObjects.find(
    (object) => object.name === 'FamilyMantleObserverStoryAttachment'
  );
  assert(attachment, 'Receipt-gated observer attachment is missing');
  const attachmentProps = objectProperties(attachment);
  assert(
    attachmentProps.targetObjectSource ===
      'verified_family_binding_receipt.residentTargetObject',
    'Observer target must come from the verified binding receipt'
  );
  assert(
    attachmentProps.targetSeatIdSource === 'verified_family_binding_receipt.seatId',
    'Observer seat must come from the verified binding receipt'
  );
  assert(
    attachmentProps.publicEmbodimentSource === 'verified_family_binding_receipt.familyId',
    'Public embodiment must be keyed by a verified family receipt'
  );
  for (const field of RESEARCH_BINDING_FIELDS) {
    assert(attachmentProps[field] === 'none', `Attachment ${field} must remain none`);
  }
  assert(attachmentProps.mayWriteCanonicalWorld === false, 'Attachment gained world writes');
  assert(
    attachmentProps.mayWriteResidentObservation === false,
    'Attachment gained observation writes'
  );
  return { metadata, state, sharedTemplate: shared.name, families: aligned };
}

function stripMantles(ast) {
  const clone = globalThis.structuredClone(ast);
  for (const family of FAMILY_MANTLES) {
    const object = clone.objects.find((candidate) => candidate.name === family.name);
    const clothing = trait(object, 'clothing')?.config;
    assert(clothing, `Cannot strip ${family.name} mantle`);
    for (const key of [
      'mantle_style',
      'mantle_color',
      'mantle_detachable',
      'mantle_albedo_map',
      'mantle_normal_map',
      'mantle_roughness_map',
    ]) {
      delete clothing[key];
    }
  }
  return clone;
}

function typedArrayHash(value) {
  return sha256(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
}

function meshIdentity(spec) {
  return {
    jointCount: spec.jointCount,
    vertexCount: spec.mesh.vertexCount,
    positions: typedArrayHash(spec.mesh.positions),
    normals: typedArrayHash(spec.mesh.normals),
    tangents: typedArrayHash(spec.mesh.tangents),
    indices: typedArrayHash(spec.mesh.indices),
    jointIndices: typedArrayHash(spec.mesh.jointIndices),
    jointWeights: typedArrayHash(spec.mesh.jointWeights),
  };
}

export function validateFamilyRuntimeInvariance(engine, ast) {
  const neutralAst = stripMantles(ast);
  const neutralIdentities = [];
  const families = [];
  const mantlePositionHashes = new Set();

  for (const family of FAMILY_MANTLES) {
    const neutral = engine.CharacterRender.buildCharacterHostFromComposition(neutralAst, {
      objectId: family.name,
      entityId: `${family.slug}-neutral-invariance`,
      lodLevel: 0,
    });
    const built = engine.CharacterRender.buildCharacterHostFromComposition(ast, {
      objectId: family.name,
      entityId: `${family.slug}-mantle-invariance`,
      lodLevel: 0,
    });
    assert(neutral.ok && neutral.host, `Neutral ${family.name} host did not resolve`);
    assert(built.ok && built.host, `${family.name} mantle host did not resolve`);
    assert(!neutral.mantle, `Neutral ${family.name} retained a mantle`);
    assert(built.mantle?.style === family.style, `${family.name} runtime style drifted`);
    assert(built.mantle.detachable === true, `${family.name} runtime mantle is not detachable`);
    assert(built.cloth?.solver === 'xpbd', `${family.name} cloth solver did not map`);
    assert(built.cloth?.fixedStepHz === 120, `${family.name} cloth step is not 120 Hz`);
    assert(built.report.stubbed.length === 0, `${family.name} has stubbed authored traits`);

    const neutralSpec = neutral.host.getDrawSpec();
    const spec = built.host.getDrawSpec();
    const neutralPositionLength = neutralSpec.mesh.positions.length;
    const neutralIndexLength = neutralSpec.mesh.indices.length;
    assert(
      equal(
        Array.from(spec.mesh.positions.slice(0, neutralPositionLength)),
        Array.from(neutralSpec.mesh.positions)
      ),
      `${family.name} mantle changed shared body/garment positions`
    );
    assert(
      equal(
        Array.from(spec.mesh.indices.slice(0, neutralIndexLength)),
        Array.from(neutralSpec.mesh.indices)
      ),
      `${family.name} mantle changed shared body/garment indices`
    );
    const materialModels = spec.materialGroups.map((group) => group.material.shadingModel);
    assert(equal(materialModels, REQUIRED_MODELS), `${family.name} material groups drifted`);
    const neutralIdentity = meshIdentity(neutralSpec);
    neutralIdentities.push(neutralIdentity);
    const mantlePositionHash = typedArrayHash(
      spec.mesh.positions.slice(neutralPositionLength)
    );
    mantlePositionHashes.add(mantlePositionHash);
    families.push({
      name: family.name,
      style: family.style,
      jointCount: spec.jointCount,
      vertexCount: spec.mesh.vertexCount,
      triangleCount: spec.mesh.indices.length / 3,
      neutralVertexCount: neutralSpec.mesh.vertexCount,
      mantleVertexCount: spec.mesh.vertexCount - neutralSpec.mesh.vertexCount,
      neutralIdentity,
      mantlePositionHash,
      materialModels,
      cloth: built.cloth,
      mantle: built.mantle,
      host: built.host,
    });
  }

  assert(
    neutralIdentities.every((identity) => equal(identity, neutralIdentities[0])),
    'Family variants do not resolve to one byte-identical neutral body/garment'
  );
  assert(mantlePositionHashes.size === FAMILY_MANTLES.length, 'Mantle silhouettes are not unique');
  assert(
    new Set(families.map((family) => family.vertexCount)).size === 1,
    'Mantle topology count differs across families'
  );
  return {
    neutralIdentity: neutralIdentities[0],
    uniqueMantleSilhouetteCount: mantlePositionHashes.size,
    families,
  };
}

function validateBundle(bundle, family, runtime) {
  assert(bundle.format === 'character-webgpu/drawspec', `${family.name} bundle format drifted`);
  assert(bundle.version === 1, `${family.name} bundle version drifted`);
  assert(bundle.report?.objectId === family.name, `${family.name} compiler selected wrong object`);
  assert(bundle.report?.resolvedVia === 'objectId', `${family.name} compiler ignored objectId`);
  assert(bundle.report?.stubbed?.length === 0, `${family.name} bundle contains stubbed traits`);
  assert(bundle.mantle?.style === family.style, `${family.name} bundle style drifted`);
  assert(bundle.mantle?.detachable === true, `${family.name} bundle mantle is not detachable`);
  assert(bundle.cloth?.solver === 'xpbd', `${family.name} bundle cloth solver drifted`);
  assert(bundle.cloth?.fixedStepHz === 120, `${family.name} bundle cloth step drifted`);
  assert(bundle.jointCount === runtime.jointCount, `${family.name} joint count drifted`);
  assert(bundle.vertexCount === runtime.vertexCount, `${family.name} vertex count drifted`);
  assert(
    Array.isArray(bundle.mesh?.uvs) && bundle.mesh.uvs.length === bundle.vertexCount * 2,
    `${family.name} bundle does not carry one UV pair per vertex`
  );
  assert(
    equal(
      bundle.materialGroups.map((group) => group.material.shadingModel),
      REQUIRED_MODELS
    ),
    `${family.name} bundle materials drifted`
  );
  return {
    jointCount: bundle.jointCount,
    vertexCount: bundle.vertexCount,
    triangleCount: bundle.mesh.indices.length / 3,
    uvPairs: bundle.mesh.uvs.length / 2,
    cloth: bundle.cloth,
    mantle: bundle.mantle,
  };
}

function changedPixelCount(left, right) {
  assert(left.length === right.length, 'Pixel grids must have equal lengths');
  let changed = 0;
  for (let index = 0; index < left.length; index += 4) {
    if (
      left[index] !== right[index] ||
      left[index + 1] !== right[index + 1] ||
      left[index + 2] !== right[index + 2]
    ) {
      changed += 1;
    }
  }
  return changed;
}

function visiblePixelCount(grid) {
  const background = CLEAR.map((channel) => Math.round(channel * 255));
  let visible = 0;
  for (let index = 0; index < grid.data.length; index += 4) {
    const distance =
      Math.abs(grid.data[index] - background[0]) +
      Math.abs(grid.data[index + 1] - background[1]) +
      Math.abs(grid.data[index + 2] - background[2]);
    if (distance > 8) visible += 1;
  }
  return visible;
}

const FONT = Object.freeze({
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
});

function drawLabel(data, width, x, y, text, color = [220, 228, 232], scale = 3) {
  const advance = 6 * scale;
  for (let characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
    const glyph = FONT[text[characterIndex]];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue;
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            const offset = ((y + row * scale + py) * width + x + characterIndex * advance + column * scale + px) * 4;
            data[offset] = color[0];
            data[offset + 1] = color[1];
            data[offset + 2] = color[2];
            data[offset + 3] = 255;
          }
        }
      }
    }
  }
}

function accentRgb(value) {
  const packed = Number.parseInt(value.replace('#', ''), 16);
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

function decorateBackground(grid, accent) {
  const data = new Uint8Array(grid.data);
  const clear = CLEAR.map((channel) => Math.round(channel * 255));
  const [accentR, accentG, accentB] = accentRgb(accent);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const index = (y * grid.width + x) * 4;
      const clearDistance =
        Math.abs(data[index] - clear[0]) +
        Math.abs(data[index + 1] - clear[1]) +
        Math.abs(data[index + 2] - clear[2]);
      if (clearDistance > 8) continue;
      const nx = (x / grid.width - 0.5) / 0.52;
      const ny = (y / grid.height - 0.58) / 0.72;
      const halo = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny));
      const floorY = y / grid.height;
      const floor =
        floorY > 0.77
          ? Math.max(0, 1 - Math.abs(x / grid.width - 0.5) / 0.42) *
            Math.max(0, 1 - (floorY - 0.87) * 7)
          : 0;
      const glow = halo * 0.14 + floor * 0.1;
      const vertical = Math.max(0, 1 - y / grid.height) * 5;
      data[index] = Math.round(6 + vertical + accentR * glow);
      data[index + 1] = Math.round(14 + vertical + accentG * glow);
      data[index + 2] = Math.round(26 + vertical + accentB * glow);
    }
  }
  return { width: grid.width, height: grid.height, data };
}

function makeLabeledSheet(grids, names, accents, columns = 3, gap = 10, border = 16) {
  const rows = Math.ceil(grids.length / columns);
  const labelHeight = 32;
  const cellWidth = grids[0].width;
  const cellHeight = grids[0].height + labelHeight;
  const width = border * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = border * 2 + rows * cellHeight + (rows - 1) * gap;
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 7;
    data[index + 1] = 17;
    data[index + 2] = 31;
    data[index + 3] = 255;
  }
  grids.forEach((grid, gridIndex) => {
    const column = gridIndex % columns;
    const row = Math.floor(gridIndex / columns);
    const offsetX = border + column * (cellWidth + gap);
    const offsetY = border + row * (cellHeight + gap) + labelHeight;
    for (let y = 0; y < grid.height; y += 1) {
      const sourceStart = y * grid.width * 4;
      const targetStart = ((offsetY + y) * width + offsetX) * 4;
      data.set(grid.data.subarray(sourceStart, sourceStart + grid.width * 4), targetStart);
    }
    const text = names[gridIndex].toUpperCase();
    const textWidth = Math.max(0, text.length * 18 - 3);
    const accent = accentRgb(accents[gridIndex]);
    for (let x = 0; x < cellWidth; x += 1) {
      const top = ((offsetY - labelHeight) * width + offsetX + x) * 4;
      data[top] = Math.round(accent[0] * 0.42);
      data[top + 1] = Math.round(accent[1] * 0.42);
      data[top + 2] = Math.round(accent[2] * 0.42);
    }
    drawLabel(
      data,
      width,
      offsetX + Math.floor((cellWidth - textWidth) / 2),
      offsetY - 27,
      text,
      accent.map((channel) => Math.min(255, Math.round(channel * 0.62 + 110)))
    );
  });
  return { width, height, data };
}

function transformGrid(grid, transform) {
  const data = new Uint8Array(grid.data);
  for (let index = 0; index < data.length; index += 4) {
    const [r, g, b] = transform(data[index], data[index + 1], data[index + 2]);
    data[index] = Math.max(0, Math.min(255, Math.round(r)));
    data[index + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[index + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }
  return { width: grid.width, height: grid.height, data };
}

const grayscale = (r, g, b) => {
  const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [value, value, value];
};
const deuteranopia = (r, g, b) => [
  0.625 * r + 0.375 * g,
  0.7 * r + 0.3 * g,
  0.3 * g + 0.7 * b,
];

async function renderGrid(engine, device, host) {
  host.applyLocomotion('idle', 0.35, 1);
  const cloth = host.sampleClothSimulation(SAMPLE_TIME);
  const started = performance.now();
  const grid = await engine.CharacterRender.renderCharacter(device, host.getDrawSpec(), {
    size: RENDER_SIZE,
    clear: CLEAR,
    cameraPos: CAMERA,
    lightDir: LIGHT,
    heightScale: FRAME_HEIGHT_SCALE,
  });
  return { cloth, grid, renderMs: performance.now() - started };
}

async function renderLineup(engine, gpu, ast, runtime, textures) {
  const context = new gpu.WebGPUContext({ fallbackToCPU: false });
  await context.initialize();
  assert(context.isSupported(), 'Native WebGPU device did not initialize');
  const device = context.getDevice();
  assert(typeof device.createRenderPipeline === 'function', 'No live GPUDevice');

  const neutralAst = stripMantles(ast);
  const neutralBuild = engine.CharacterRender.buildCharacterHostFromComposition(neutralAst, {
    objectId: FAMILY_MANTLES[0].name,
    entityId: 'family-mantle-neutral-render',
    lodLevel: 0,
  });
  assert(neutralBuild.ok && neutralBuild.host, 'Neutral render host did not resolve');
  neutralBuild.host.applyWorldState({ position: { x: 0, y: 0, z: 0 }, rotationY: -0.12 });
  const neutral = await renderGrid(engine, device, neutralBuild.host);

  const samples = [];
  for (let index = 0; index < FAMILY_MANTLES.length; index += 1) {
    const family = FAMILY_MANTLES[index];
    const runtimeFamily = runtime.families[index];
    runtimeFamily.host.setMantleTextureTile(textures[index].tile);
    runtimeFamily.host.applyWorldState({
      position: { x: 0, y: 0, z: 0 },
      rotationY: -0.12,
    });
    const rendered = await renderGrid(engine, device, runtimeFamily.host);
    const replay = await renderGrid(engine, device, runtimeFamily.host);
    assert(rendered.cloth, `${family.name} produced no cloth receipt`);
    assert(
      rendered.cloth.fixedSteps === Math.round(SAMPLE_TIME * 120),
      `${family.name} cloth fixed steps drifted`
    );
    assert(
      rendered.cloth.maxDisplacement <= 0.180001 &&
        rendered.cloth.maxDisplacement > 0.001,
      `${family.name} cloth motion is outside the authored bound`
    );
    assert(
      rendered.cloth.positionDigest === replay.cloth.positionDigest,
      `${family.name} cloth replay digest drifted`
    );
    assert(
      changedPixelCount(rendered.grid.data, replay.grid.data) === 0,
      `${family.name} native GPU replay changed pixels`
    );
    const detachedChangedPixels = changedPixelCount(rendered.grid.data, neutral.grid.data);
    assert(detachedChangedPixels >= 64, `${family.name} mantle is not visibly detachable`);
    const gray = transformGrid(rendered.grid, grayscale);
    const cvd = transformGrid(rendered.grid, deuteranopia);
    samples.push({
      name: family.name,
      style: family.style,
      grid: rendered.grid,
      gray,
      cvd,
      pixelSha256: sha256(rendered.grid.data),
      grayscaleSha256: sha256(gray.data),
      deuteranopiaSha256: sha256(cvd.data),
      visiblePixels: visiblePixelCount(rendered.grid),
      detachedChangedPixels,
      cloth: rendered.cloth,
      renderMs: Math.round(rendered.renderMs * 100) / 100,
    });
  }

  assert(new Set(samples.map((sample) => sample.pixelSha256)).size === 6, 'Colour lineup collapsed');
  assert(
    new Set(samples.map((sample) => sample.grayscaleSha256)).size === 6,
    'Mantles collapse in grayscale'
  );
  assert(
    new Set(samples.map((sample) => sample.deuteranopiaSha256)).size === 6,
    'Mantles collapse under deuteranopia simulation'
  );
  const names = FAMILY_MANTLES.map((family) => family.name);
  const accents = FAMILY_MANTLES.map((family) => family.accent);
  const decorated = samples.map((sample, index) =>
    decorateBackground(sample.grid, accents[index])
  );
  const decoratedGray = decorated.map((grid) => transformGrid(grid, grayscale));
  const decoratedCvd = decorated.map((grid) => transformGrid(grid, deuteranopia));
  const adapter = context.getAdapter();
  const adapterInfo = adapter.info
    ? Object.fromEntries(
        ['vendor', 'architecture', 'device', 'description'].map((key) => [
          key,
          adapter.info[key] ?? '',
        ])
      )
    : {};
  return {
    samples,
    lineupPng: encodePng(makeLabeledSheet(decorated, names, accents)),
    grayscalePng: encodePng(makeLabeledSheet(decoratedGray, names, accents)),
    cvdPng: encodePng(makeLabeledSheet(decoratedCvd, names, accents)),
    adapterInfo,
    verifiedDeviceMethods: [
      'createShaderModule',
      'createRenderPipeline',
      'createTexture',
      'createBuffer',
      'createCommandEncoder',
    ].filter((method) => typeof device[method] === 'function'),
  };
}

function validateManifest(core, text, expected) {
  const parsed = core.parseHolo(text);
  assert(parsed.success && parsed.errors.length === 0, 'Family mantle manifest did not parse');
  const metadata = parsed.ast.metadata ?? {};
  const state = objectProperties(parsed.ast.state);
  assert(metadata.schema === 'hololand.model-village.family-mantles.v1', 'Bad manifest schema');
  assert(metadata.sourceSha256 === expected.sourceHash, 'Manifest source hash is stale');
  assert(equal(metadata.bundleSha256, expected.bundleHashes), 'Manifest bundle hashes are stale');
  assert(equal(metadata.materialMapSha256, expected.mapHashes), 'Manifest map hashes are stale');
  assert(metadata.lineupSha256 === expected.lineupHash, 'Manifest lineup hash is stale');
  assert(metadata.grayscaleSha256 === expected.grayscaleHash, 'Manifest grayscale hash is stale');
  assert(metadata.deuteranopiaSha256 === expected.cvdHash, 'Manifest CVD hash is stale');
  assert(state.namedFamilyMantlesObserved === 6, 'Manifest does not observe all six mantles');
  assert(state.sharedBodyInvarianceObserved === true, 'Manifest lacks body invariance proof');
  assert(state.nativeGpuLineupObserved === true, 'Manifest lacks native GPU proof');
  assert(state.researchLiveBlindedAllowed === false, 'Manifest leaked to live research');
  assert(state.browserConsumerBuilt === false, 'Manifest overclaims the browser consumer');
  assert(state.completeMvP2Claimed === false, 'Manifest overclaims complete MV-P2');
  return { schema: metadata.schema, validated: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const relative of [
    'packages/core/dist/index.js',
    'packages/engine/dist/index.js',
    'packages/engine/dist/gpu/index.js',
  ]) {
    assert(
      fs.existsSync(path.join(args.holoscriptRoot, relative)),
      `Missing built HoloScript dependency: ${relative}`
    );
  }

  const guardedPaths = [
    'source/layers/vr/frontier/model-village/model-village.holo',
    'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
    PUBLIC_CATALOG_REL,
    'source/layers/vr/frontier/model-village/model-village-resident-production-body.holo',
  ]
    .map((relative) => path.join(REPO_ROOT, relative))
    .filter(fs.existsSync);
  const guardedBefore = Object.fromEntries(
    guardedPaths.map((filePath) => [path.relative(REPO_ROOT, filePath), sha256(fs.readFileSync(filePath))])
  );

  let fetchCalls = 0;
  const fetchTargets = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...requestArgs) => {
    fetchCalls += 1;
    fetchTargets.push(String(requestArgs[0]));
    throw new Error(`Network denied during family mantle witness: ${requestArgs[0]}`);
  };

  try {
    const core = await import(
      pathToFileURL(path.join(args.holoscriptRoot, 'packages/core/dist/index.js')).href
    );
    const engine = await import(
      pathToFileURL(path.join(args.holoscriptRoot, 'packages/engine/dist/index.js')).href
    );
    const gpu = args.skipGpu
      ? null
      : await import(
          pathToFileURL(path.join(args.holoscriptRoot, 'packages/engine/dist/gpu/index.js')).href
        );
    const sourceText = fs.readFileSync(path.join(REPO_ROOT, SOURCE_REL), 'utf8');
    const sourceHash = sha256(sourceText);
    const parsed = core.parseHolo(sourceText);
    assert(parsed.success && parsed.errors.length === 0, 'Family mantle source did not parse');
    const publicParsed = core.parseHolo(
      fs.readFileSync(path.join(REPO_ROOT, PUBLIC_CATALOG_REL), 'utf8')
    );
    assert(publicParsed.success && publicParsed.errors.length === 0, 'Public catalog did not parse');
    const policy = validateFamilyMantleCatalogSource(parsed.ast, publicParsed.ast);
    const runtime = validateFamilyRuntimeInvariance(engine, parsed.ast);
    const textures = runtime.families.map((family) =>
      loadMantleTextureTile(REPO_ROOT, family.mantle)
    );

    const compiler = [];
    const bundleBytes = [];
    for (let index = 0; index < FAMILY_MANTLES.length; index += 1) {
      const family = FAMILY_MANTLES[index];
      const compile = async () =>
        new core.ExportManager({
          useCircuitBreaker: false,
          useFallback: false,
          useMemoryMonitoring: false,
        }).export('character-webgpu', parsed.ast, {
          compilerOptions: {
            objectId: family.name,
            entityId: `model-village-${family.slug}-story-resident`,
            lodLevel: 0,
          },
        });
      const first = await compile();
      const second = await compile();
      assert(first.success && second.success, `${family.name} compilation failed`);
      assert(!first.usedFallback && !second.usedFallback, `${family.name} used compiler fallback`);
      assert(first.output === second.output, `${family.name} compile was not byte-identical`);
      const bytes = Buffer.from(first.output, 'utf8');
      const summary = validateBundle(JSON.parse(first.output), family, runtime.families[index]);
      compiler.push({
        name: family.name,
        objectId: family.name,
        target: 'character-webgpu',
        repeatedCompileByteIdentical: true,
        fallbackUsed: false,
        bundlePath: bundleRel(family),
        bundleSha256: sha256(bytes),
        bundleBytes: bytes.length,
        ...summary,
      });
      bundleBytes.push(bytes);
    }

    const render = args.skipGpu
      ? null
      : await renderLineup(engine, gpu, parsed.ast, runtime, textures);
    const lineupPath = path.join(REPO_ROOT, LINEUP_REL);
    const grayscalePath = path.join(REPO_ROOT, GRAYSCALE_REL);
    const cvdPath = path.join(REPO_ROOT, CVD_REL);

    if (args.writeArtifacts) {
      assert(render, '--write-artifacts requires the GPU witness');
      for (let index = 0; index < FAMILY_MANTLES.length; index += 1) {
        const outputPath = path.join(REPO_ROOT, bundleRel(FAMILY_MANTLES[index]));
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, bundleBytes[index]);
      }
      fs.mkdirSync(path.dirname(lineupPath), { recursive: true });
      fs.writeFileSync(lineupPath, render.lineupPng);
      fs.writeFileSync(grayscalePath, render.grayscalePng);
      fs.writeFileSync(cvdPath, render.cvdPng);
    } else {
      for (let index = 0; index < FAMILY_MANTLES.length; index += 1) {
        const outputPath = path.join(REPO_ROOT, bundleRel(FAMILY_MANTLES[index]));
        assert(fs.existsSync(outputPath), `Missing committed ${FAMILY_MANTLES[index].name} bundle`);
        assert(
          sha256(fs.readFileSync(outputPath)) === compiler[index].bundleSha256,
          `${FAMILY_MANTLES[index].name} committed bundle is stale`
        );
      }
      if (render) {
        assert(sha256(fs.readFileSync(lineupPath)) === sha256(render.lineupPng), 'Lineup PNG is stale');
        assert(
          sha256(fs.readFileSync(grayscalePath)) === sha256(render.grayscalePng),
          'Grayscale PNG is stale'
        );
        assert(sha256(fs.readFileSync(cvdPath)) === sha256(render.cvdPng), 'CVD PNG is stale');
      }
    }

    const lineupPng = render?.lineupPng ?? fs.readFileSync(lineupPath);
    const grayscalePng = render?.grayscalePng ?? fs.readFileSync(grayscalePath);
    const cvdPng = render?.cvdPng ?? fs.readFileSync(cvdPath);
    const expected = {
      sourceHash,
      bundleHashes: compiler.map((entry) => entry.bundleSha256),
      mapHashes: textures.flatMap((texture) => texture.maps.map((map) => map.sha256)),
      lineupHash: sha256(lineupPng),
      grayscaleHash: sha256(grayscalePng),
      cvdHash: sha256(cvdPng),
    };
    const manifest = args.skipManifest
      ? { validated: false, reason: 'bootstrap_skip_requested' }
      : validateManifest(
          core,
          fs.readFileSync(path.join(REPO_ROOT, MANIFEST_REL), 'utf8'),
          expected
        );
    const externalFetchTargets = fetchTargets.filter((target) => /^https?:\/\//iu.test(target));
    assert(externalFetchTargets.length === 0, 'Family mantle witness attempted external fetches');
    const guardedAfter = Object.fromEntries(
      guardedPaths.map((filePath) => [path.relative(REPO_ROOT, filePath), sha256(fs.readFileSync(filePath))])
    );
    assert(equal(guardedBefore, guardedAfter), 'Witness mutated experiment or blinded source');

    const receipt = {
      schema: 'hololand.model-village.family-mantle-witness.v1',
      generatedAt: new Date().toISOString(),
      milestone: 'MV-V5 Typed Six-Family Mantle Catalog + Native GPU Lineup',
      status: 'PASS',
      source: {
        path: SOURCE_REL,
        sha256: sourceHash,
        parseErrors: parsed.errors.length,
        presentationProfile: policy.metadata.presentationProfile,
        independentProjectDisclosure: policy.metadata.independentProjectDisclosure,
        researchLiveBlindedAllowed: false,
        canonicalWriteAuthority: false,
        causalEffect: false,
      },
      families: compiler.map((entry, index) => ({
        ...entry,
        familyId: FAMILY_MANTLES[index].familyId,
        style: FAMILY_MANTLES[index].style,
        patternId: FAMILY_MANTLES[index].patternId,
        glyphId: FAMILY_MANTLES[index].glyphId,
        accent: FAMILY_MANTLES[index].accent,
        materialTileId: textures[index].tileId,
        materialMaps: textures[index].maps,
        mantlePositionHash: runtime.families[index].mantlePositionHash,
      })),
      invariance: {
        sharedTemplate: policy.sharedTemplate,
        sharedNeutralBodyAndGarmentByteIdentical: true,
        sharedNeutralIdentity: runtime.neutralIdentity,
        sharedMantleTopologyCount: true,
        uniqueMantleSilhouetteCount: runtime.uniqueMantleSilhouetteCount,
        researchBindingFields: Object.fromEntries(
          RESEARCH_BINDING_FIELDS.map((field) => [field, 'none'])
        ),
        staticResearchJoin: false,
      },
      cloth: {
        solver: 'xpbd',
        fixedStepHz: 120,
        sampleTime: SAMPLE_TIME,
        samples:
          render?.samples.map((sample) => ({
            name: sample.name,
            fixedSteps: sample.cloth.fixedSteps,
            iterations: sample.cloth.iterations,
            dynamicVertexCount: sample.cloth.dynamicVertexCount,
            maxDisplacement: sample.cloth.maxDisplacement,
            rmsDisplacement: sample.cloth.rmsDisplacement,
            positionDigest: sample.cloth.positionDigest,
            replayPixelDelta: 0,
            detachedChangedPixels: sample.detachedChangedPixels,
            renderMs: sample.renderMs,
          })) ?? [],
      },
      gpu: render
        ? {
            live: true,
            api: 'WebGPU',
            implementation: 'local Node WebGPU/Dawn device',
            adapterInfo: render.adapterInfo,
            verifiedDeviceMethods: render.verifiedDeviceMethods,
            renderSize: RENDER_SIZE,
            clear: CLEAR,
            camera: CAMERA,
            light: LIGHT,
          }
        : { live: false, skippedByCaller: true },
      visuals: {
        lineupPath: LINEUP_REL,
        lineupSha256: expected.lineupHash,
        grayscalePath: GRAYSCALE_REL,
        grayscaleSha256: expected.grayscaleHash,
        deuteranopiaPath: CVD_REL,
        deuteranopiaSha256: expected.cvdHash,
        distinctColorWitnesses: render ? new Set(render.samples.map((sample) => sample.pixelSha256)).size : null,
        distinctGrayscaleWitnesses: render ? new Set(render.samples.map((sample) => sample.grayscaleSha256)).size : null,
        distinctDeuteranopiaWitnesses: render ? new Set(render.samples.map((sample) => sample.deuteranopiaSha256)).size : null,
      },
      custody: {
        attemptedFetchCount: fetchCalls,
        deniedFetchTargets: fetchTargets,
        externalNetworkFetchCount: externalFetchTargets.length,
        externalDccRequired: false,
        providerAssetRequired: false,
        guardedSourceHashesBefore: guardedBefore,
        guardedSourceHashesAfter: guardedAfter,
      },
      manifest,
      claimBoundary: {
        proved:
          'One .holo catalog selects and compiles six named story residents through a typed sovereign character compiler; each uses the same neutral body, rig, garment, LOD, and XPBD cloth contract while a detachable local-custody mantle changes silhouette, texture, and colour in native WebGPU pixels.',
        notProved: [
          'permission to reveal family identity during live blinded research',
          'exact provider model revisions or static provider-to-seat assignments',
          'provider affiliation or endorsement',
          'the browser/Studio lineup consumer',
          'production high-resolution authored cloth assets',
          'cloth self-collision, body collision, or imported production garment topology',
          'real-time headset frame-rate performance',
          'complete MV-P2 production readiness',
        ],
      },
    };
    fs.mkdirSync(args.outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(args.outputDir, 'family-mantle-witness.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(
        `PASS MV-V5 family mantles: ${FAMILY_MANTLES.length} residents, ` +
          `${runtime.uniqueMantleSilhouetteCount} silhouettes, ` +
          `${externalFetchTargets.length} external fetches`
      );
      console.log(`Receipt: ${path.join(args.outputDir, 'family-mantle-witness.json')}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-V5 family mantles: ${error.message}`);
      process.exit(1);
    });
}
