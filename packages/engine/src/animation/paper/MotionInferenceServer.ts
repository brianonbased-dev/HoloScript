/**
 * MotionInferenceServer.ts
 *
 * HTTP inference service for motion generation with contract enforcement.
 *
 * - POST /generate  — accepts constraints, returns a contracted MotionClip
 * - POST /verify    — runs plausibility contract on an externally supplied clip
 * - GET  /health    — liveness + contract version
 *
 * Every generated clip is checked against PhysicsPlausibilityContract
 * before emission.  Violating outputs are hard-rejected with structured
 * diagnostics (never silently returned).
 *
 * The server also maintains a provenance log so the full depth-5 chain
 * (motion → checkpoint → corpus → pair → source) can be reconstructed.
 *
 * @module animation/paper
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import {
  checkPlausibility,
  batchCheckPlausibility,
  type MotionCategory,
  type MotionClip,
  type PlausibilityResult,
} from './PhysicsPlausibilityContract';
import {
  type DPOPair,
  type ProvenanceChain,
  type TrainingCorpus,
  assembleTrainingCorpus,
  buildProvenanceChain,
  generateDPOPairsFromAST,
  hashDPOPair,
  hashTrainingCorpus,
  serializeClip,
  sha256,
  verifyCorpusIntegrity,
} from './MotionTrainingPipeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InferenceRequest {
  category: MotionCategory;
  /** Optional seed for deterministic generation. */
  seed?: number;
  /** Number of frames (default 20). */
  numFrames?: number;
  /** Frame timestep in seconds (default 0.05). */
  dt?: number;
  /** Enable constrained-decoding retry on rejection. */
  retryOnReject?: boolean;
  /** Max retries (default 3). */
  maxRetries?: number;
}

export interface InferenceResponse {
  success: boolean;
  clip?: MotionClip;
  rejection?: PlausibilityResult;
  retryCount?: number;
  latencyMs: number;
  provenance?: ProvenanceChain;
}

export interface VerifyRequest {
  clip: MotionClip;
}

export interface VerifyResponse {
  pass: boolean;
  result: PlausibilityResult;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  contractVersion: string;
  uptimeSeconds: number;
  totalRequests: number;
  totalRejections: number;
  categories: MotionCategory[];
}

// ---------------------------------------------------------------------------
// Deterministic generation (synthetic placeholder for neural model)
// ---------------------------------------------------------------------------

const REST_BONES: readonly [string, number, number, number][] = [
  ['root', 0, 1.0, 0],
  ['spine', 0, 1.5, 0],
  ['l_foot', -0.2, 0, 0],
  ['r_foot', 0.2, 0, 0],
  ['l_hand', -0.4, 1.2, 0],
  ['r_hand', 0.4, 1.2, 0],
];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMotionClip(req: InferenceRequest): MotionClip {
  const category = req.category;
  const numFrames = req.numFrames ?? 20;
  const dt = req.dt ?? 0.05;
  const seed = req.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = mulberry32(seed);

  const frames: MotionClip['frames'] = [];

  for (let fi = 0; fi < numFrames; fi++) {
    const t = fi / (numFrames - 1);
    const frame = REST_BONES.map(([boneId, rx, ry, rz]) => {
      let px = rx;
      let py = ry;
      let pz = rz;

      if (category === 'locomotion' && (boneId === 'l_foot' || boneId === 'r_foot')) {
        const phase = boneId === 'l_foot' ? 0 : Math.PI;
        py = 0.03 * Math.max(0, Math.sin(t * Math.PI * 2 + phase));
        if (boneId === 'r_foot') px += t * 0.15;
      } else if (category === 'acrobatics' && boneId === 'root') {
        py = ry + Math.sin(t * Math.PI) * 0.25;
      } else if (category === 'micro-gesture' && (boneId === 'l_hand' || boneId === 'r_hand')) {
        const dir = boneId === 'l_hand' ? 1 : -1;
        px = rx + dir * 0.003 * Math.sin(t * Math.PI * 6);
      }

      const angle = 0.15 * Math.sin(t * Math.PI * 2 + seed);
      const sinHalf = Math.sin(angle / 2);
      const cosHalf = Math.cos(angle / 2);
      const rot: [number, number, number, number] = [sinHalf * 0.1, sinHalf * 0.995, 0, cosHalf];
      const mag = Math.sqrt(rot[0] ** 2 + rot[1] ** 2 + rot[2] ** 2 + rot[3] ** 2);
      rot[0] /= mag; rot[1] /= mag; rot[2] /= mag; rot[3] /= mag;

      return {
        boneId,
        position: [px, py, pz] as [number, number, number],
        rotation: rot as [number, number, number, number],
      };
    });
    frames.push(frame);
  }

  return {
    id: `inference_${category}_${seed.toString(16)}`,
    category,
    frames,
    dt,
  };
}

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

const CONTRACT_VERSION = 'paper-9-v1.0';

export class MotionInferenceServer {
  private server?: Server;
  private startTime = 0;
  private totalRequests = 0;
  private totalRejections = 0;
  private port = 0;

  /** Optional training corpus for provenance chain construction. */
  corpus?: TrainingCorpus;
  /** Optional checkpoint hash for provenance. */
  checkpointHash?: string;

  constructor(options?: {
    corpus?: TrainingCorpus;
    checkpointHash?: string;
  }) {
    this.corpus = options?.corpus;
    this.checkpointHash = options?.checkpointHash;
  }

  /** Start the HTTP server. Returns the actual bound port. */
  start(port = 0): Promise<number> {
    return new Promise((resolve) => {
      this.startTime = Date.now();
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(port, () => {
        const addr = this.server?.address();
        this.port = typeof addr === 'object' && addr !== null ? addr.port : 0;
        resolve(this.port);
      });
    });
  }

  /** Stop the server. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }

  getStats(): { totalRequests: number; totalRejections: number; uptimeSeconds: number } {
    return {
      totalRequests: this.totalRequests,
      totalRejections: this.totalRejections,
      uptimeSeconds: (Date.now() - this.startTime) / 1000,
    };
  }

  // ── Request router ────────────────────────────────────────────────────────

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    res.setHeader('Content-Type', 'application/json');

    const send = (status: number, body: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };

    const readBody = (): Promise<unknown> =>
      new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve({});
          }
        });
      });

    if (url === '/health' && method === 'GET') {
      const stats = this.getStats();
      const health: HealthResponse = {
        status: 'ok',
        contractVersion: CONTRACT_VERSION,
        uptimeSeconds: stats.uptimeSeconds,
        totalRequests: stats.totalRequests,
        totalRejections: stats.totalRejections,
        categories: ['locomotion', 'gesture', 'interaction', 'acrobatics', 'micro-gesture'],
      };
      send(200, health);
      return;
    }

    if (url === '/generate' && method === 'POST') {
      readBody()
        .then((body) => {
          const request = body as InferenceRequest;
          const response = this.handleGenerate(request);
          send(response.success ? 200 : 422, response);
        })
        .catch(() => send(400, { error: 'Invalid request body' }));
      return;
    }

    if (url === '/verify' && method === 'POST') {
      readBody()
        .then((body) => {
          const request = body as VerifyRequest;
          const response = this.handleVerify(request);
          send(200, response);
        })
        .catch(() => send(400, { error: 'Invalid request body' }));
      return;
    }

    send(404, { error: 'Not found' });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleGenerate(req: InferenceRequest): InferenceResponse {
    this.totalRequests++;
    const t0 = Date.now();
    const maxRetries = req.maxRetries ?? 3;
    let retryCount = 0;

    let clip = generateMotionClip(req);
    let result = checkPlausibility(clip);

    // Hard rejection + optional constrained-decoding retry
    while (!result.pass && req.retryOnReject && retryCount < maxRetries) {
      this.totalRejections++;
      retryCount++;
      // Re-seed deterministically for retry
      const retryReq: InferenceRequest = {
        ...req,
        seed: (req.seed ?? 0) + retryCount,
      };
      clip = generateMotionClip(retryReq);
      result = checkPlausibility(clip);
    }

    if (!result.pass) {
      this.totalRejections++;
      return {
        success: false,
        rejection: result,
        retryCount,
        latencyMs: Date.now() - t0,
      };
    }

    // Build provenance chain if corpus/checkpoint are configured
    let provenance: ProvenanceChain | undefined;
    if (this.corpus && this.checkpointHash) {
      provenance = buildProvenanceChain({
        motionClip: clip,
        checkpointHash: this.checkpointHash,
        corpus: this.corpus,
      });
    }

    return {
      success: true,
      clip,
      retryCount,
      latencyMs: Date.now() - t0,
      provenance,
    };
  }

  private handleVerify(req: VerifyRequest): VerifyResponse {
    const result = checkPlausibility(req.clip);
    return {
      pass: result.pass,
      result,
    };
  }
}

// ---------------------------------------------------------------------------
// Batch verification utility (for CI / benchmark pipelines)
// ---------------------------------------------------------------------------

export interface BatchVerifyRequest {
  clips: MotionClip[];
}

export interface BatchVerifyResponse {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: PlausibilityResult[];
}

/** Batch-verify a set of clips without starting the HTTP server. */
export function batchVerifyClips(req: BatchVerifyRequest): BatchVerifyResponse {
  const results = req.clips.map((clip) => checkPlausibility(clip));
  const passed = results.filter((r) => r.pass).length;
  return {
    total: req.clips.length,
    passed,
    failed: req.clips.length - passed,
    passRate: passed / req.clips.length,
    results,
  };
}

// ---------------------------------------------------------------------------
// Convenience: build a server pre-loaded with a synthetic corpus
// ---------------------------------------------------------------------------

export function createServerWithSyntheticCorpus(options?: {
  astNodeCount?: number;
  pairsPerNode?: number;
  checkpointHash?: string;
  sourceCommitHash?: string;
}): { server: MotionInferenceServer; corpus: TrainingCorpus } {
  const {
    astNodeCount = 5,
    pairsPerNode = 4,
    checkpointHash = sha256('synthetic_checkpoint_v1'),
    sourceCommitHash = 'a'.repeat(40),
  } = options ?? {};

  const astNodes = Array.from({ length: astNodeCount }, (_, i) => ({
    file: `src/animation/motion_${i}.hs`,
    startLine: i * 10 + 1,
    endLine: i * 10 + 8,
    category: (['locomotion', 'gesture', 'interaction', 'acrobatics', 'micro-gesture'] as MotionCategory[])[i % 5],
  }));

  const pairs = generateDPOPairsFromAST({
    astNodes,
    sourceCommitHash,
    pairsPerNode,
    seed: 0xdeadbeef,
  });

  const corpus = assembleTrainingCorpus({
    pairs,
    sourceCommitHash,
    description: 'Synthetic motion DPO corpus for paper-9 inference server',
  });

  const server = new MotionInferenceServer({ corpus, checkpointHash });

  return { server, corpus };
}
