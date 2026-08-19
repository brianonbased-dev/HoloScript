import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  sampleContinuousClip,
  validateContinuousClips,
  validateLodBundles,
} from '../check-hololand-model-village-production-body.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE_PATH = path.join(
  REPO_ROOT,
  'source/layers/vr/frontier/model-village/model-village-resident-production-body.holo'
);
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';
const core = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/core/dist/index.js')).href
);
const engine = await import(
  pathToFileURL(path.join(HOLOSCRIPT_ROOT, 'packages/engine/dist/index.js')).href
);
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const parsed = core.parseHolo(source);

test('production body parses and authors four continuously interpolated clips', () => {
  assert.equal(parsed.errors.length, 0);
  const clips = validateContinuousClips(parsed.ast, engine.CharacterRender.BONE_ORDER);
  assert.deepEqual(
    clips.map((clip) => clip.clipId),
    ['idle', 'listen', 'propose', 'settle']
  );
  assert.equal(new Set(clips.map((clip) => clip.authoredClipHash)).size, 4);
});

test('continuous clip sampling produces unit quaternions between authored keys', () => {
  const clip = validateContinuousClips(parsed.ast, engine.CharacterRender.BONE_ORDER).find(
    (candidate) => candidate.clipId === 'propose'
  );
  const pose = sampleContinuousClip(clip, 0.375, engine.CharacterRender.SkinMath);
  assert.ok(pose.size >= 5);
  for (const quaternion of pose.values()) {
    assert.ok(
      Math.abs(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) - 1) < 1e-6
    );
  }
});

test('continuous clip gate rejects an unknown skeleton bone', () => {
  const ast = structuredClone(parsed.ast);
  const clip = ast.objects.find((object) => object.name === 'SemanticClipListen');
  const properties = Object.fromEntries(
    clip.properties.map((property) => [property.key, property.value])
  );
  properties.frames[1].rotations[0].bone = 'imaginary_elbow';
  assert.throws(
    () => validateContinuousClips(ast, engine.CharacterRender.BONE_ORDER),
    /unknown bone/
  );
});

test('sovereign compiler emits three monotonic source-authored LOD meshes', async () => {
  const bundles = [];
  for (const level of [0, 1, 2]) {
    const result = await new core.ExportManager({
      useCircuitBreaker: false,
      useFallback: false,
      useMemoryMonitoring: false,
    }).export('character-webgpu', parsed.ast, {
      compilerOptions: {
        entityId: 'model-village-production-body-test',
        lodLevel: level,
      },
    });
    assert.equal(result.success, true);
    assert.equal(result.usedFallback, false);
    bundles.push(JSON.parse(result.output));
  }
  const summaries = validateLodBundles(bundles);
  assert.deepEqual(
    summaries.map((summary) => summary.garmentSegments),
    [24, 14, 8]
  );
  assert.ok(summaries[0].triangleCount > summaries[1].triangleCount);
  assert.ok(summaries[1].triangleCount > summaries[2].triangleCount);
});
