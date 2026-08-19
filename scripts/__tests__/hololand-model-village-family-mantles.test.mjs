import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  FAMILY_MANTLES,
  validateFamilyMantleCatalogSource,
  validateFamilyRuntimeInvariance,
} from '../check-hololand-model-village-family-mantles.mjs';
import { loadMantleTextureTile } from '../check-hololand-model-village-cloth-mantle.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);
const engine = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/engine/dist/index.js')).href
);
const source = core.parseHolo(
  fs.readFileSync(
    path.join(
      REPO_ROOT,
      'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog.holo'
    ),
    'utf8'
  )
);
const publicCatalog = core.parseHolo(
  fs.readFileSync(
    path.join(
      REPO_ROOT,
      'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo'
    ),
    'utf8'
  )
);

test('six-family mantle catalog is story-only and keyed to the public catalog', () => {
  assert.equal(source.errors.length, 0);
  assert.equal(publicCatalog.errors.length, 0);
  const policy = validateFamilyMantleCatalogSource(source.ast, publicCatalog.ast);
  assert.equal(policy.families.length, 6);
  assert.deepEqual(
    policy.families.map((family) => family.publicDisplayName),
    ['Claude', 'OpenAI', 'Gemini', 'Grok', 'GLM', 'Brittney']
  );
  assert.equal(policy.metadata.researchLiveBlindedAllowed, false);
  assert.equal(policy.state.browserConsumerBuilt, false);
  assert.equal(policy.state.completeMvP2Claimed, false);
});

test('all six mantles preserve one neutral body and use distinct same-topology silhouettes', () => {
  const runtime = validateFamilyRuntimeInvariance(engine, source.ast);
  assert.equal(runtime.families.length, 6);
  assert.equal(runtime.uniqueMantleSilhouetteCount, 6);
  assert.equal(new Set(runtime.families.map((family) => family.jointCount)).size, 1);
  assert.equal(new Set(runtime.families.map((family) => family.vertexCount)).size, 1);
  assert.ok(runtime.families.every((family) => family.mantleVertexCount > 0));
});

test('all six mantles resolve local 4x4 albedo, normal, and roughness tiles', () => {
  const runtime = validateFamilyRuntimeInvariance(engine, source.ast);
  const textures = runtime.families.map((family) =>
    loadMantleTextureTile(REPO_ROOT, family.mantle)
  );
  assert.equal(textures.length, 6);
  assert.equal(new Set(textures.map((texture) => texture.tileId)).size, 6);
  assert.ok(textures.every((texture) => texture.maps.length === 3));
  assert.ok(
    textures.every(
      (texture) =>
        JSON.stringify(texture.maps.map((map) => map.valueCount)) ===
        JSON.stringify([16, 32, 16])
    )
  );
});

test('character-webgpu compiler honors objectId for every named resident', async () => {
  for (const family of FAMILY_MANTLES) {
    const result = await new core.ExportManager({
      useCircuitBreaker: false,
      useFallback: false,
      useMemoryMonitoring: false,
    }).export('character-webgpu', source.ast, {
      compilerOptions: {
        objectId: family.name,
        entityId: `${family.slug}-compiler-test`,
        lodLevel: 0,
      },
    });
    assert.equal(result.success, true, family.name);
    assert.equal(result.usedFallback, false, family.name);
    const bundle = JSON.parse(result.output);
    assert.equal(bundle.report.objectId, family.name);
    assert.equal(bundle.report.resolvedVia, 'objectId');
    assert.equal(bundle.mantle.style, family.style);
    assert.equal(bundle.cloth.solver, 'xpbd');
    assert.equal(bundle.mesh.uvs.length, bundle.vertexCount * 2);
  }
});
