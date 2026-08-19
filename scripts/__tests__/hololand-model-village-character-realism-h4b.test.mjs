import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveH4BHarnessSource,
  measureStaticTaaConvergence,
  mergeH4BMotionSource,
  validateH4BCompilerRecords,
} from '../check-hololand-model-village-character-realism-h4b.mjs';
import { deriveH4AHarnessSource } from '../check-hololand-model-village-character-appearance-h4a.mjs';
import { deriveH3YHarnessSource } from '../check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from '../check-hololand-model-village-character-appearance-h3z.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4b-micro-motion-timing.holo';
const INHERITED_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h4a-facial-volume-garment-framing.holo';

test('H4B source owns deterministic motion for the four named model families', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.equal((source.match(/@micro_motion\(/g) || []).length, 4);
  assert.equal((source.match(/profile: "human_presence_v1"/g) || []).length, 4);
  assert.match(source, /nativeBlinkApplied: true/);
  assert.match(source, /nativeGazeTransformApplied: false/);
  assert.match(source, /productionTaaIntegrated: false/);
  assert.match(source, /gpuTimestampMeasured: false/);
  assert.doesNotMatch(source, /__HOLOSCRIPT_H4B_COMMIT__/);
});

test('H4B overlay merges onto the inherited H4A resident AST without replacing appearance source', () => {
  const merged = mergeH4BMotionSource(
    readFileSync(path.join(ROOT, INHERITED_REL), 'utf8'),
    readFileSync(path.join(ROOT, SOURCE_REL), 'utf8')
  );
  assert.match(merged, /1f295ee62e255883dc95394f5249700023bb39df/);
  assert.equal((merged.match(/@micro_motion\(/g) || []).length, 4);
  for (const objectId of [
    'OpenAIResident',
    'ClaudeResident',
    'GeminiResident',
    'GrokResident',
  ]) {
    assert.match(
      merged,
      new RegExp(`object "${objectId}"[\\s\\S]*?@micro_motion\\(`)
    );
  }
  assert.match(merged, /portrait_facial_volume_v5/);
  assert.match(merged, /stormglass_portrait_fieldcoat/);
});

test('H4B harness derivation adds motion receipts and browser feature readback', () => {
  const base = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-appearance-h3x.mjs'),
    'utf8'
  );
  const h4b = deriveH4BHarnessSource(
    deriveH4AHarnessSource(
      deriveH3ZHarnessSource(deriveH3YHarnessSource(base))
    )
  );
  assert.match(h4b, /mergeH4BMotionSource/);
  assert.match(h4b, /microMotion: canonical\(built\.microMotion\)/);
  assert.match(h4b, /bundleMicroMotion: canonical\(bundle\.microMotion\)/);
  assert.match(h4b, /adapterFeatures: Array\.from/);
  assert.match(h4b, /timestampQuerySupported/);
  assert.match(h4b, /1f295ee62e255883dc95394f5249700023bb39df/);
});

test('H4B compiler admission fails closed over native blink and sampled-only channels', () => {
  const makeRecord = (displayLabel) => ({
    displayLabel,
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
        nativeBlinkApplied: true,
        blinkWeight: 0.5,
        changedVertexCount: 64,
        positionDigest: 'fnv1a32:position',
      },
      bindings: {
        blink: 'native-procedural-head-morph',
        gaze: 'sampled-channel-only',
        breath: 'sampled-channel-only',
        cloth: 'sampled-channel-only',
      },
    },
    bundleMicroMotion: {
      sample: { sampleDigest: 'fnv1a32:sample' },
      application: { positionDigest: 'fnv1a32:position' },
    },
  });
  const records = ['OpenAI', 'Claude', 'Gemini', 'Grok'].map(makeRecord);
  assert.equal(validateH4BCompilerRecords(records).status, 'pass');
  records[0].microMotion.sample.gaze.nativeTransformApplied = true;
  assert.equal(validateH4BCompilerRecords(records).status, 'fail');
});

test('H4B static TAA reference reports deterministic settling', () => {
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      raw[index] = x * 24;
      raw[index + 1] = y * 24;
      raw[index + 2] = (x + y) * 12;
      raw[index + 3] = 255;
    }
  }
  const first = measureStaticTaaConvergence(raw, width, height);
  const second = measureStaticTaaConvergence(raw, width, height);
  assert.equal(first.historySettled, true);
  assert.equal(first.sampleCount, 8);
  assert.equal(first.final.equals(second.final), true);
  assert.equal(
    first.terminalHistoryMeanAbsoluteDelta < first.firstHistoryMeanAbsoluteDelta,
    true
  );
});

test('H4B typed policy and flat seed preserve timing and claim boundaries', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4b-micro-motion-timing-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4b-micro-motion-timing-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /nativeHsplusActionExecutionClaimed: false/);
  assert.match(policy, /sampled_channel_overclaimed/);
  assert.match(seed, /staticTaaSampleCount: 8/);
  assert.match(seed, /productionTaaIntegrated: false/);
  assert.match(seed, /wallClockUsedAsGpuTime: false/);
  assert.match(seed, /freshRtxBenchmarkClaimed: false/);
});
