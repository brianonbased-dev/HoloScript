import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  objectProperties,
  sha256,
  validateCharacterBundle,
  validateNeutralSource,
  validateSemanticClips,
} from '../check-hololand-model-village-resident-rig.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_PATH = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-resident-shared-rig.holo'
);
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);
const engine = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/engine/dist/index.js')).href
);
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const parsed = core.parseHolo(source);

test('shared resident source stays identity-neutral and authors four valid clips', () => {
  assert.equal(parsed.errors.length, 0);
  assert.equal(validateNeutralSource(source).identityNeutral, true);
  const clips = validateSemanticClips(parsed.ast, engine.CharacterRender.BONE_ORDER);
  assert.deepEqual(
    clips.map((clip) => clip.clipId),
    ['idle', 'listen', 'propose', 'settle']
  );
  assert.equal(new Set(clips.map((clip) => clip.authoredClipHash)).size, 4);
});

test('neutral-source gate rejects a detachable family identity', () => {
  assert.throws(
    () => validateNeutralSource(`${source}\n// Claude`),
    /detachable identity term/
  );
});

test('semantic-clip gate rejects an unknown skeleton bone', () => {
  const ast = structuredClone(parsed.ast);
  const clip = ast.objects.find((object) => object.name === 'SemanticClipListen');
  const properties = objectProperties(clip);
  properties.frames[0].rotations[0].bone = 'imaginary_elbow';
  assert.throws(
    () => validateSemanticClips(ast, engine.CharacterRender.BONE_ORDER),
    /unknown bone/
  );
});

test('semantic-clip gate rejects a missing required clip', () => {
  const ast = structuredClone(parsed.ast);
  ast.objects = ast.objects.filter((object) => object.name !== 'SemanticClipSettle');
  assert.throws(
    () => validateSemanticClips(ast, engine.CharacterRender.BONE_ORDER),
    /exactly four semantic clips/
  );
});

test('character-bundle gate accepts a real deterministic compiler output', async () => {
  const manager = new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  });
  const result = await manager.export('character-webgpu', parsed.ast, {
    compilerOptions: { entityId: 'model-village-shared-neutral-resident' },
  });
  assert.equal(result.success, true);
  assert.equal(result.usedFallback, false);
  const summary = validateCharacterBundle(
    JSON.parse(result.output),
    engine.CharacterRender.BONE_ORDER
  );
  assert.equal(summary.jointCount, engine.CharacterRender.BONE_ORDER.length);
  assert.ok(summary.vertexCount > 1000);
  assert.deepEqual(summary.materialModels, [
    'skin-sss',
    'marschner-hair',
    'refractive-eye',
  ]);
  assert.equal(sha256(result.output).length, 64);
});

test('character-bundle gate rejects a detached palette count', async () => {
  const manager = new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  });
  const result = await manager.export('character-webgpu', parsed.ast, {
    compilerOptions: { entityId: 'model-village-shared-neutral-resident' },
  });
  const bundle = JSON.parse(result.output);
  bundle.jointCount += 1;
  assert.throws(
    () => validateCharacterBundle(bundle, engine.CharacterRender.BONE_ORDER),
    /does not match live palette/
  );
});

