import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  loadMantleTextureTile,
  resolveStoryAttachment,
  validatePublicCatalogAlignment,
  validateMantleBundle,
  validateStoryPolicy,
} from '../check-hololand-model-village-cloth-mantle.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_PATH = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-openai-cloth-mantle.holo'
);
const OBSERVER_PATH = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo'
);
const PUBLIC_CATALOG_PATH = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo'
);
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);
const engine = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/engine/dist/index.js')).href
);
const parsed = core.parseHolo(fs.readFileSync(SOURCE_PATH, 'utf8'));
const observerParsed = core.parseHolo(fs.readFileSync(OBSERVER_PATH, 'utf8'));
const publicCatalogParsed = core.parseHolo(fs.readFileSync(PUBLIC_CATALOG_PATH, 'utf8'));

test('OpenAI mantle source is story-only and cannot enter live blinded research', () => {
  assert.equal(parsed.errors.length, 0);
  const story = validateStoryPolicy(parsed.ast);
  assert.equal(story.metadata.presentationProfile, 'village_story_unblinded');
  assert.equal(story.metadata.researchLiveBlindedAllowed, false);
  assert.equal(story.state.publicDisplayName, 'OpenAI');
  assert.equal(story.state.modelFamily, 'gpt');
  assert.equal(story.state.agentSurfaceId, 'codex-hardware');
  assert.equal(story.state.exactModelRevision, 'absent');
});

test('OpenAI mantle identity matches the keyed public catalog without a research join', () => {
  assert.equal(publicCatalogParsed.errors.length, 0);
  const alignment = validatePublicCatalogAlignment(parsed.ast, publicCatalogParsed.ast);
  assert.equal(alignment.publicDisplayName, 'OpenAI');
  assert.equal(alignment.familyMantlePatternId, 'recursive_cell_interlock');
  assert.equal(alignment.familyMantleAccentColor, '#D6D1C7');
});

test('OpenAI mantle resolves three locally custodied 4x4 material maps', () => {
  const built = engine.CharacterRender.buildCharacterHostFromComposition(parsed.ast, {
    entityId: 'openai-material-test',
    lodLevel: 0,
  });
  assert.equal(built.ok, true);
  const texture = loadMantleTextureTile(REPO_ROOT, built.mantle);
  assert.equal(texture.tileId, 'openai-recursive-interlock-v1');
  assert.equal(texture.maps.length, 3);
  assert.deepEqual(
    texture.maps.map((map) => map.valueCount),
    [16, 32, 16]
  );
});

test('story attachment resolves observer seat without changing its blinded source', () => {
  assert.equal(observerParsed.errors.length, 0);
  const attachment = resolveStoryAttachment(parsed.ast, observerParsed.ast);
  assert.equal(attachment.targetObject, 'ObserverResident01');
  assert.equal(attachment.targetSeatId, 'seat-01');
  assert.equal(
    attachment.targetObjectSource,
    'verified_family_binding_receipt.residentTargetObject'
  );
  assert.equal(attachment.canonicalAssignment, false);
  assert.deepEqual(attachment.targetPosition, [-6, 0.84, 3.7]);
  assert.equal(attachment.presentationProfile, 'village_story_unblinded');
});

test('sovereign compiler emits UVs, cloth config, and detachable mantle refs', async () => {
  const result = await new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  }).export('character-webgpu', parsed.ast, {
    compilerOptions: {
      entityId: 'openai-compiler-test',
      lodLevel: 0,
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.usedFallback, false);
  const summary = validateMantleBundle(JSON.parse(result.output));
  assert.equal(summary.uvCount, summary.vertexCount);
  assert.equal(summary.cloth.solver, 'xpbd');
  assert.equal(summary.mantle.detachable, true);
  assert.equal(summary.mantle.style, 'openai_recursive_interlock');
});
