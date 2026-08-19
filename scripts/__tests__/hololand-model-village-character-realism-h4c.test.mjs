import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH4CHarnessSource,
  measureH4CFramePair,
  offsetH4CMotionSource,
  validateH4CCompilerRecords,
} from '../check-hololand-model-village-character-realism-h4c.mjs';
import { deriveH4AHarnessSource } from '../check-hololand-model-village-character-appearance-h4a.mjs';
import { deriveH3YHarnessSource } from '../check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from '../check-hololand-model-village-character-appearance-h3z.mjs';
import { deriveH4BHarnessSource } from '../check-hololand-model-village-character-realism-h4b.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4c-native-gaze-breathing.holo';

test('H4C source owns native gaze and breathing for the named model families', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.equal((source.match(/@micro_motion\(/g) || []).length, 4);
  assert.match(source, /nativeBlinkApplied: true/);
  assert.match(source, /nativeGazeTransformApplied: true/);
  assert.match(source, /nativeBreathTransformApplied: true/);
  assert.match(source, /nativeClothSimulationApplied: false/);
  assert.match(source, /measuredFrameOffsetsSeconds: \[0, 0\.84, 1\.68\]/);
  assert.match(source, /productionTaaIntegrated: false/);
  assert.match(source, /gpuTimestampMeasured: false/);
  assert.doesNotMatch(source, /__HOLOSCRIPT_H4C_COMMIT__/);
});

test('H4C absolute-time offset advances exactly four source profiles', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  const shifted = offsetH4CMotionSource(source, 0.84);
  assert.equal((shifted.match(/source_time_seconds:/g) || []).length, 4);
  assert.match(shifted, /source_time_seconds: 3\.780911/);
  assert.match(shifted, /source_time_seconds: 2\.349830/);
  const inheritedPins = [
    'eb0f40bacb1745ce2e3464b08f0470f7d6227274d6502841f95499e9978bafdf',
    'c7af37118977dccd585f6c4c616a3d8144e0b8a07c9ceb8c5e32c350d8bedfe9',
  ].join('\n');
  const restamped = offsetH4CMotionSource(
    `${inheritedPins}\n${source}`,
    0.84
  );
  assert.match(
    restamped,
    /4b2d315429a6b816c21afcbdf8589593b6ce9a15b58f31aab08bf2e900df7bd7/
  );
  assert.match(
    restamped,
    /47e272029606fe34db37eba253d7f9a95d4e33867a6508aa5b7d3f247dce9ccc/
  );
  assert.doesNotMatch(restamped, /eb0f40bacb1745ce2e3464b08f0470f7d6227274d6502841f95499e9978bafdf/);
  assert.throws(() => offsetH4CMotionSource(source, -1), /finite non-negative/);
});

test('H4C harness derivation retimes the H4B source path and pins promoted HoloScript', () => {
  const base = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-appearance-h3x.mjs'),
    'utf8'
  );
  const h4b = deriveH4BHarnessSource(
    deriveH4AHarnessSource(deriveH3ZHarnessSource(deriveH3YHarnessSource(base)))
  );
  const h4c = deriveH4CHarnessSource(h4b, 0.84);
  assert.match(h4c, /offsetH4CMotionSource/);
  assert.match(h4c, /model-village-character-realism-h4c-native-gaze-breathing\.holo/);
  assert.match(h4c, /c96c6bf7314be5d8849c6da256e92464f461b846/);
  assert.match(h4c, /native gaze and upper-chest breathing/);
  assert.doesNotMatch(h4c, /1f295ee62e255883dc95394f5249700023bb39df/);
});

test('H4C compiler admission fails closed over geometry bindings and cloth boundary', () => {
  const makeRecord = (displayLabel) => ({
    displayLabel,
    repeatedCompileByteIdentity: true,
    microMotion: {
      config: {
        schemaVersion: 'holoscript.character-micro-motion-config.v1',
        profile: 'human-presence-v1',
      },
      sample: {
        schemaVersion: 'holoscript.character-micro-motion-sample.v1',
        absoluteTime: true,
        sampleDigest: 'fnv1a32:sample',
        gaze: { nativeTransformApplied: false },
        breath: { nativeTransformApplied: false },
        cloth: { nativeSimulationApplied: false },
      },
      application: {
        schemaVersion: 'holoscript.character-micro-motion-application.v2',
        nativeBlinkApplied: true,
        nativeGazeApplied: true,
        nativeBreathApplied: true,
        facialChangedVertexCount: 64,
        gazeChangedVertexCount: 32,
        breathChangedVertexCount: 128,
        changedVertexCount: 224,
        positionDigest: 'fnv1a32:position',
        normalDigest: 'fnv1a32:normal',
      },
      bindings: {
        blink: 'native-procedural-head-morph',
        gaze: 'native-ocular-globe-rotation',
        breath: 'native-upper-chest-deformation',
        cloth: 'sampled-channel-only',
      },
    },
    bundleMicroMotion: {
      sample: { sampleDigest: 'fnv1a32:sample' },
      application: {
        positionDigest: 'fnv1a32:position',
        normalDigest: 'fnv1a32:normal',
      },
    },
  });
  const records = ['OpenAI', 'Claude', 'Gemini', 'Grok'].map(makeRecord);
  assert.equal(validateH4CCompilerRecords(records).status, 'pass');
  records[0].microMotion.bindings.cloth = 'native-cloth-simulation';
  assert.equal(validateH4CCompilerRecords(records).status, 'fail');
});

test('H4C frame-pair evidence measures each resident region independently', () => {
  const width = 1100;
  const height = 820;
  const first = Buffer.alloc(width * height * 4, 0);
  const second = Buffer.from(first);
  const points = [
    [60, 200],
    [720, 200],
    [60, 510],
    [720, 510],
  ];
  for (const [x, y] of points) {
    const index = (y * width + x) * 4;
    second[index] = 255;
    second[index + 1] = 128;
    second[index + 2] = 64;
  }
  const result = measureH4CFramePair(first, second, width, height, 0, 1);
  assert.equal(result.residentRegions.length, 4);
  for (const resident of result.residentRegions) {
    assert.equal(resident.changedPixelCount, 1);
    assert.equal(resident.absoluteChannelDifference, 447);
  }
});

test('H4C typed policy and flat seed preserve native and claim boundaries', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4c-native-gaze-breathing-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4c-native-gaze-breathing-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /nativeHsplusActionExecutionClaimed: false/);
  assert.match(policy, /native_ocular_rotation_missing/);
  assert.match(policy, /native_upper_chest_deformation_missing/);
  assert.match(policy, /cloth_binding_overclaimed/);
  assert.match(seed, /measuredBrowserFrameCount: 3/);
  assert.match(seed, /productionTaaIntegrated: false/);
  assert.match(seed, /wallClockUsedAsGpuTime: false/);
  assert.match(seed, /freshRtxBenchmarkClaimed: false/);
});
