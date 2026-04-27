import { describe, it, expect } from 'vitest';
import {
  MOTION_DATA_SCHEMA_VERSION,
  validateTrainingFrame,
  validateMotionCapture,
  validateTrainingCorpus,
  inferenceFrameToTensor,
  type TrainingFrame,
  type MotionCapture,
  type TrainingCorpus,
  type InferenceFrame,
} from '../motion-data-schema';

const validFrame = (i = 0): TrainingFrame => ({
  frameIndex: i,
  timestampMs: 1000 + i * 16,
  pose: { joints: { hip: { position: [0, 1, 0], rotation: [0, 0, 0, 1] } }, timestamp: 0 },
  rootVelocity: { x: 1, y: 0, z: 0 },
  rootAngularVelocity: 0,
  phase: i / 100,
  contactFeatures: { leftFoot: true, rightFoot: false },
  gait: 'walk',
});

const validCapture = (id = 'walk_001'): MotionCapture => ({
  schemaVersion: MOTION_DATA_SCHEMA_VERSION,
  captureId: id,
  skeletonId: 'biped_humanoid_v2',
  source: 'mocap',
  fps: 30,
  license: { spdx: 'MIT', attribution: 'test-author' },
  frames: [validFrame(0), validFrame(1)],
});

describe('motion-data-schema', () => {
  describe('validateTrainingFrame', () => {
    it('accepts a valid frame', () => {
      expect(() => validateTrainingFrame(validFrame())).not.toThrow();
    });

    it('rejects negative frameIndex', () => {
      const f = validFrame();
      f.frameIndex = -1;
      expect(() => validateTrainingFrame(f)).toThrow(/frameIndex/);
    });

    it('rejects phase outside [0, 1)', () => {
      const f1 = validFrame();
      f1.phase = 1.0;
      expect(() => validateTrainingFrame(f1)).toThrow(/phase/);
      const f2 = validFrame();
      f2.phase = -0.1;
      expect(() => validateTrainingFrame(f2)).toThrow(/phase/);
    });

    it('rejects invalid gait label', () => {
      const f = validFrame();
      (f.gait as unknown) = 'sprint';
      expect(() => validateTrainingFrame(f)).toThrow(/gait/);
    });
  });

  describe('validateMotionCapture', () => {
    it('accepts a valid capture', () => {
      expect(() => validateMotionCapture(validCapture())).not.toThrow();
    });

    it('rejects schemaVersion mismatch', () => {
      const c = validCapture();
      (c.schemaVersion as unknown) = 999;
      expect(() => validateMotionCapture(c)).toThrow(/schemaVersion/);
    });

    it('rejects fps out of range', () => {
      const c = validCapture();
      c.fps = 0;
      expect(() => validateMotionCapture(c)).toThrow(/fps/);
      c.fps = 500;
      expect(() => validateMotionCapture(c)).toThrow(/fps/);
    });

    it('rejects empty frames array', () => {
      const c = validCapture();
      c.frames = [];
      expect(() => validateMotionCapture(c)).toThrow(/frames/);
    });

    it('rejects CC-BY-NC licenses (commercial-incompatible per /founder ruling)', () => {
      const c = validCapture();
      c.license.spdx = 'CC-BY-NC-4.0';
      expect(() => validateMotionCapture(c)).toThrow(/incompatible/);
      c.license.spdx = 'GPL-3.0';
      expect(() => validateMotionCapture(c)).toThrow(/incompatible/);
      c.license.spdx = 'CC-BY-NC-SA-4.0';
      expect(() => validateMotionCapture(c)).toThrow(/incompatible/);
    });

    it('accepts permissive licenses (MIT, Apache-2.0, BSD)', () => {
      for (const spdx of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'CC-BY-4.0']) {
        const c = validCapture();
        c.license.spdx = spdx;
        expect(() => validateMotionCapture(c)).not.toThrow();
      }
    });

    it('requires license.spdx', () => {
      const c = validCapture();
      (c.license as any).spdx = undefined;
      expect(() => validateMotionCapture(c)).toThrow(/license/);
    });
  });

  describe('validateTrainingCorpus', () => {
    const validCorpus = (): TrainingCorpus => ({
      schemaVersion: MOTION_DATA_SCHEMA_VERSION,
      corpusId: 'biped_v1_train_2026-Q3',
      skeletonId: 'biped_humanoid_v2',
      splits: {
        train: ['walk_001', 'walk_002'],
        val: ['walk_003'],
        test: ['walk_004'],
      },
      captures: [
        validCapture('walk_001'),
        validCapture('walk_002'),
        validCapture('walk_003'),
        validCapture('walk_004'),
      ],
    });

    it('accepts a valid corpus', () => {
      expect(() => validateTrainingCorpus(validCorpus())).not.toThrow();
    });

    it('rejects split-set referencing unknown captureId', () => {
      const c = validCorpus();
      c.splits.train.push('walk_999_missing');
      expect(() => validateTrainingCorpus(c)).toThrow(/unknown captureId/);
    });

    it('rejects same captureId in multiple splits (data leakage)', () => {
      const c = validCorpus();
      c.splits.val.push('walk_001'); // already in train
      expect(() => validateTrainingCorpus(c)).toThrow(/data leakage/);
    });

    it('rejects skeleton mismatch between corpus and capture', () => {
      const c = validCorpus();
      c.captures[0].skeletonId = 'quadruped_dog_v2';
      expect(() => validateTrainingCorpus(c)).toThrow(/skeleton/);
    });
  });

  describe('inferenceFrameToTensor', () => {
    const baseFrame: InferenceFrame = {
      pose: {
        joints: {
          hip: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
          knee: { position: [0, 0.5, 0.1], rotation: [0.1, 0.2, 0.3, 0.9] },
        },
        timestamp: 0,
      },
      rootVelocity: { x: 1.5, y: 0, z: 0.5 },
      rootAngularVelocity: 0.2,
      phase: 0.42,
    };

    it('produces deterministic flat layout', () => {
      const t1 = inferenceFrameToTensor(baseFrame, ['hip', 'knee']);
      const t2 = inferenceFrameToTensor(baseFrame, ['hip', 'knee']);
      expect(Array.from(t1)).toEqual(Array.from(t2));
    });

    it('layout: [phase, vel.x, vel.y, vel.z, angVel, terrainN.x/y/z, ...joints]', () => {
      const t = inferenceFrameToTensor(baseFrame, ['hip']);
      expect(t[0]).toBeCloseTo(0.42);
      expect(t[1]).toBeCloseTo(1.5);
      expect(t[2]).toBeCloseTo(0);
      expect(t[3]).toBeCloseTo(0.5);
      expect(t[4]).toBeCloseTo(0.2);
      // default terrain normal = up (0,1,0)
      expect(t[5]).toBeCloseTo(0);
      expect(t[6]).toBeCloseTo(1);
      expect(t[7]).toBeCloseTo(0);
      // hip joint at base 8 → pos[0..2] then rot[3..6]
      expect(t[8]).toBeCloseTo(0);
      expect(t[9]).toBeCloseTo(1);
      expect(t[10]).toBeCloseTo(0);
      expect(t[11]).toBeCloseTo(0);
      expect(t[12]).toBeCloseTo(0);
      expect(t[13]).toBeCloseTo(0);
      expect(t[14]).toBeCloseTo(1);
    });

    it('joint order follows sortedJointNames argument', () => {
      const tHipKnee = inferenceFrameToTensor(baseFrame, ['hip', 'knee']);
      const tKneeHip = inferenceFrameToTensor(baseFrame, ['knee', 'hip']);
      // Header is 8 floats, first joint at index 8. Position[1] differs:
      // hip.y=1, knee.y=0.5 — so tHipKnee[9] != tKneeHip[9].
      expect(tHipKnee[9]).toBeCloseTo(1);
      expect(tKneeHip[9]).toBeCloseTo(0.5);
    });

    it('missing joints get zero-padded', () => {
      const t = inferenceFrameToTensor(baseFrame, ['hip', 'phantom_joint']);
      // Phantom joint at base 15 → all zeros
      for (let i = 15; i < 22; i++) expect(t[i]).toBe(0);
    });

    it('respects custom terrain normal', () => {
      const f = { ...baseFrame, terrainNormal: { x: 0.1, y: 0.9, z: 0.4 } };
      const t = inferenceFrameToTensor(f, ['hip']);
      expect(t[5]).toBeCloseTo(0.1);
      expect(t[6]).toBeCloseTo(0.9);
      expect(t[7]).toBeCloseTo(0.4);
    });
  });
});
