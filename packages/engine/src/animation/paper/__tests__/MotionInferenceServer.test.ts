import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  MotionInferenceServer,
  batchVerifyClips,
  createServerWithSyntheticCorpus,
} from '../MotionInferenceServer';
import { generateDPOPairsFromAST, assembleTrainingCorpus, sha256 } from '../MotionTrainingPipeline';

describe('MotionInferenceServer', () => {
  describe('HTTP endpoints', () => {
    let server: MotionInferenceServer;
    let port: number;
    let baseUrl: string;

    beforeAll(async () => {
      const { server: s } = createServerWithSyntheticCorpus({
        astNodeCount: 3,
        pairsPerNode: 2,
        sourceCommitHash: 'a'.repeat(40),
      });
      server = s;
      port = await server.start(0);
      baseUrl = `http://localhost:${port}`;
    });

    afterAll(async () => {
      await server.stop();
    });

    it('GET /health returns ok with contract version', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.contractVersion).toBe('paper-9-v1.0');
      expect(body.categories).toHaveLength(5);
      expect(body.totalRequests).toBe(0);
    });

    it('POST /generate returns a contracted MotionClip', async () => {
      const res = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'locomotion', seed: 0xbeef }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.clip).toBeTruthy();
      expect(body.clip.category).toBe('locomotion');
      expect(body.latencyMs).toBeGreaterThanOrEqual(0);
      expect(body.provenance).toBeTruthy();
      expect(body.provenance.corpusMerkleRoot).toBeTruthy();
    });

    it('POST /generate with retryOnReject tolerates transient violations', async () => {
      const res = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'acrobatics',
          seed: 0xbadf00d,
          retryOnReject: true,
          maxRetries: 5,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // With retries enabled, we should eventually get a passing clip
      expect(body.success).toBe(true);
      expect(body.retryCount).toBeGreaterThanOrEqual(0);
    });

    it('POST /verify returns pass=true for a contracted clip', async () => {
      // First generate a clip
      const genRes = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'gesture', seed: 0x1234 }),
      });
      const genBody = await genRes.json();
      const clip = genBody.clip;

      // Now verify it explicitly
      const res = await fetch(`${baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pass).toBe(true);
      expect(body.result.pass).toBe(true);
    });

    it('POST /verify returns pass=false for an obviously bad clip', async () => {
      const badClip = {
        id: 'bad_test',
        category: 'locomotion',
        dt: 0.05,
        frames: [
          [
            { boneId: 'l_foot', position: [0, -0.2, 0], rotation: [0, 0, 0, 1] },
            { boneId: 'root', position: [0, 1, 0], rotation: [0, 0, 0, 1] },
            { boneId: 'spine', position: [0, 1.5, 0], rotation: [0, 0, 0, 1] },
            { boneId: 'r_foot', position: [0.2, 0, 0], rotation: [0, 0, 0, 1] },
            { boneId: 'l_hand', position: [-0.4, 1.2, 0], rotation: [0, 0, 0, 1] },
            { boneId: 'r_hand', position: [0.4, 1.2, 0], rotation: [0, 0, 0, 1] },
          ],
        ],
      };

      const res = await fetch(`${baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip: badClip }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pass).toBe(false);
      expect(body.result.violatedConstraint).toBe('foot_below_floor');
    });

    it('increments totalRequests on each call', async () => {
      const before = server.getStats().totalRequests;

      await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'micro-gesture', seed: 1 }),
      });

      const after = server.getStats().totalRequests;
      expect(after).toBe(before + 1);
    });

    it('returns 404 for unknown routes', async () => {
      const res = await fetch(`${baseUrl}/unknown`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('batchVerifyClips', () => {
    it('returns aggregate stats for a batch', () => {
      const { corpus } = createServerWithSyntheticCorpus({
        astNodeCount: 2,
        pairsPerNode: 2,
      });

      const clips = corpus.pairs.map((p) => p.chosen);
      const result = batchVerifyClips({ clips });

      expect(result.total).toBe(clips.length);
      expect(result.passed).toBe(clips.length);
      expect(result.failed).toBe(0);
      expect(result.passRate).toBe(1);
    });

    it('detects rejected clips in a batch', () => {
      const { corpus } = createServerWithSyntheticCorpus({
        astNodeCount: 2,
        pairsPerNode: 2,
      });

      const clips = corpus.pairs.map((p) => p.rejected);
      const result = batchVerifyClips({ clips });

      expect(result.total).toBe(clips.length);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(clips.length);
      expect(result.passRate).toBe(0);
    });
  });

  describe('createServerWithSyntheticCorpus', () => {
    it('produces a server with a valid corpus', () => {
      const { server, corpus } = createServerWithSyntheticCorpus({
        astNodeCount: 5,
        pairsPerNode: 4,
        sourceCommitHash: 'b'.repeat(40),
      });

      expect(corpus.pairCount).toBe(20);
      expect(corpus.merkleRoot).toBeTruthy();
      expect(server.corpus).toBe(corpus);
      expect(server.checkpointHash).toBeTruthy();
    });
  });

  describe('standalone server without corpus', () => {
    let server: MotionInferenceServer;
    let port: number;
    let baseUrl: string;

    beforeAll(async () => {
      server = new MotionInferenceServer();
      port = await server.start(0);
      baseUrl = `http://localhost:${port}`;
    });

    afterAll(async () => {
      await server.stop();
    });

    it('generates clips without provenance when corpus is absent', async () => {
      const res = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'gesture', seed: 42 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.provenance).toBeUndefined();
    });
  });
});
