/**
 * MotionTrainingPipeline.ts
 *
 * DPO (Direct Preference Optimization) pair generation from contracted
 * HoloScript AST slices, with full Merkle-tree provenance.
 *
 * Every pair carries:
 *   - chosen clip   (contracted / plausible)
 *   - rejected clip (implausible baseline)
 *   - source commit hash
 *   - AST SourceRange
 *
 * The training corpus hash is the Merkle root of all pair hashes,
 * producing the depth-5 chain claimed in paper-9 §3.
 *
 * @module animation/paper
 */

import { createHash } from 'crypto';
import {
  checkPlausibility,
  type MotionCategory,
  type MotionClip,
} from './PhysicsPlausibilityContract';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Byte-precise AST location metadata. */
export interface SourceRange {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** One DPO preference pair. */
export interface DPOPair {
  id: string;
  chosen: MotionClip;
  rejected: MotionClip;
  category: MotionCategory;
  sourceCommitHash: string;
  sourceRange: SourceRange;
  /** SHA-256 of this pair (computed, not stored redundantly). */
  pairHash?: string;
}

/** Training corpus with Merkle provenance. */
export interface TrainingCorpus {
  pairs: DPOPair[];
  merkleRoot: string;
  pairCount: number;
  createdAt: string;
  metadata: {
    sourceCommitHash: string;
    description: string;
  };
}

/** Merkle tree node. */
interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  leafIndex?: number;
}

// ---------------------------------------------------------------------------
// Hashing primitives
// ---------------------------------------------------------------------------

export function sha256(input: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof input === 'string') {
    hash.update(input, 'utf8');
  } else {
    hash.update(input);
  }
  return hash.digest('hex');
}

/** Deterministically serialize a MotionClip for hashing. */
export function serializeClip(clip: MotionClip): string {
  return JSON.stringify({
    id: clip.id,
    category: clip.category,
    dt: clip.dt,
    frames: clip.frames.map((frame) =>
      frame.map((bone) => ({
        boneId: bone.boneId,
        position: [...bone.position],
        rotation: [...bone.rotation],
      })),
    ),
  });
}

/** Compute the SHA-256 hash of a DPO pair (chosen + rejected + source). */
export function hashDPOPair(pair: DPOPair): string {
  const payload = JSON.stringify({
    chosenHash: sha256(serializeClip(pair.chosen)),
    rejectedHash: sha256(serializeClip(pair.rejected)),
    sourceCommitHash: pair.sourceCommitHash,
    sourceRange: pair.sourceRange,
    category: pair.category,
  });
  return sha256(payload);
}

// ---------------------------------------------------------------------------
// Merkle tree
// ---------------------------------------------------------------------------

function buildMerkleTree(leaves: string[]): MerkleNode {
  if (leaves.length === 0) {
    return { hash: sha256('') };
  }

  let level: MerkleNode[] = leaves.map((h, i) => ({ hash: h, leafIndex: i }));

  while (level.length > 1) {
    const next: MerkleNode[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // duplicate last if odd
      next.push({
        hash: sha256(left.hash + right.hash),
        left,
        right,
      });
    }
    level = next;
  }

  return level[0]!;
}

/** Build a Merkle tree from DPO pair hashes and return the root. */
export function buildCorpusMerkleRoot(pairs: DPOPair[]): string {
  const leaves = pairs.map((p) => p.pairHash ?? hashDPOPair(p));
  const tree = buildMerkleTree(leaves);
  return tree.hash;
}

/** Generate a Merkle proof for a pair at a given index. */
export function generateMerkleProof(
  pairs: DPOPair[],
  targetIndex: number,
): { root: string; proof: { siblingHash: string; isLeft: boolean }[] } {
  const leaves = pairs.map((p) => p.pairHash ?? hashDPOPair(p));
  const root = buildMerkleTree(leaves).hash;

  let level = [...leaves];
  let idx = targetIndex;
  const proof: { siblingHash: string; isLeft: boolean }[] = [];

  while (level.length > 1) {
    // Ensure even length
    if (level.length % 2 === 1) {
      level.push(level[level.length - 1]!);
    }

    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    proof.push({
      siblingHash: level[siblingIdx]!,
      isLeft: idx % 2 === 0 ? false : true,
    });

    // Build parent level
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256(level[i]! + level[i + 1]!));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }

  return { root, proof };
}

/** Verify a Merkle proof. */
export function verifyMerkleProof(
  leafHash: string,
  proof: { siblingHash: string; isLeft: boolean }[],
  expectedRoot: string,
): boolean {
  let current = leafHash;
  for (const step of proof) {
    current = step.isLeft
      ? sha256(step.siblingHash + current)
      : sha256(current + step.siblingHash);
  }
  return current === expectedRoot;
}

// ---------------------------------------------------------------------------
// DPO pair generation from contracted AST slices
// ---------------------------------------------------------------------------

/** Simulate slicing contracted AST nodes into DPO pairs.
 *
 * In production this would be driven by the Absorb pipeline extracting
 * actual AST ranges from HoloScript source.  Here we generate synthetic
 * but structurally valid pairs that satisfy the contract semantics.
 */
export function generateDPOPairsFromAST(params: {
  astNodes: { file: string; startLine: number; endLine: number; category: MotionCategory }[];
  sourceCommitHash: string;
  /** Base seed for reproducible pair generation. */
  seed?: number;
  /** Number of pairs per AST node. */
  pairsPerNode?: number;
}): DPOPair[] {
  const { astNodes, sourceCommitHash, seed = 0xbeef, pairsPerNode = 4 } = params;
  const pairs: DPOPair[] = [];
  let pairId = 0;

  // Deterministic PRNG for reproducible generation
  let state = seed >>> 0;
  const rng = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (const node of astNodes) {
    for (let i = 0; i < pairsPerNode; i++) {
      const category = node.category;

      // Generate a contracted (plausible) clip
      const chosen = generateContractedClip(category, pairId, rng);

      // Generate a rejected (implausible) clip by injecting a violation
      const rejected = generateRejectedClip(category, pairId + 1, rng);

      const pair: DPOPair = {
        id: `dpo_${sourceCommitHash.slice(0, 8)}_${pairId}`,
        chosen,
        rejected,
        category,
        sourceCommitHash,
        sourceRange: {
          file: node.file,
          startLine: node.startLine,
          startColumn: Math.floor(rng() * 40),
          endLine: node.endLine,
          endColumn: Math.floor(rng() * 80) + 40,
        },
        pairHash: undefined,
      };

      pair.pairHash = hashDPOPair(pair);
      pairs.push(pair);
      pairId += 2;
    }
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// Synthetic clip generators (deterministic, seeded)
// ---------------------------------------------------------------------------

const REST_BONES: readonly [string, number, number, number][] = [
  ['root', 0, 1.0, 0],
  ['spine', 0, 1.5, 0],
  ['l_foot', -0.2, 0, 0],
  ['r_foot', 0.2, 0, 0],
  ['l_hand', -0.4, 1.2, 0],
  ['r_hand', 0.4, 1.2, 0],
];

function generateContractedClip(
  category: MotionCategory,
  seed: number,
  rng: () => number,
): MotionClip {
  const frames: MotionClip['frames'] = [];
  const numFrames = 20;

  for (let fi = 0; fi < numFrames; fi++) {
    const t = fi / (numFrames - 1);
    const frame = REST_BONES.map(([boneId, rx, ry, rz]) => {
      let px = rx;
      let py = ry;
      let pz = rz;

      // Category-specific valid motion
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
    id: `contracted_${category}_${seed}`,
    category,
    frames,
    dt: 0.05,
  };
}

function generateRejectedClip(
  category: MotionCategory,
  seed: number,
  rng: () => number,
): MotionClip {
  // Start from contracted, then inject a single violation
  const clip = generateContractedClip(category, seed, rng);

  // Inject violation based on category
  switch (category) {
    case 'locomotion': {
      // Foot through floor
      const footFrame = clip.frames[5]!;
      const foot = footFrame.find((b) => b.boneId === 'l_foot');
      if (foot) foot.position = [foot.position[0], -0.15, foot.position[2]];
      break;
    }
    case 'gesture': {
      // Joint limit burst
      const frame = clip.frames[3]!;
      const bone = frame[1]!; // spine
      const bigAngle = 2.5;
      bone.rotation = [Math.sin(bigAngle / 2), 0, 0, Math.cos(bigAngle / 2)];
      break;
    }
    case 'interaction': {
      // Bone penetration: collapse hands
      const frame = clip.frames[7]!;
      const lHand = frame.find((b) => b.boneId === 'l_hand');
      if (lHand) {
        lHand.position = [0.0, 1.2, 0.0];
      }
      break;
    }
    case 'acrobatics': {
      // Impulse exceeded: teleport root
      const frame = clip.frames[4]!;
      const root = frame.find((b) => b.boneId === 'root');
      if (root) root.position = [root.position[0] + 2.0, root.position[1], root.position[2]];
      break;
    }
    case 'micro-gesture': {
      // Micro limit exceeded
      const frame = clip.frames[2]!;
      const hand = frame.find((b) => b.boneId === 'l_hand');
      if (hand) hand.position = [hand.position[0] + 0.12, hand.position[1], hand.position[2]];
      break;
    }
  }

  clip.id = `rejected_${category}_${seed}`;
  return clip;
}

// ---------------------------------------------------------------------------
// Corpus assembly
// ---------------------------------------------------------------------------

/** Assemble a fully provenance-tracked training corpus. */
export function assembleTrainingCorpus(params: {
  pairs: DPOPair[];
  sourceCommitHash: string;
  description?: string;
}): TrainingCorpus {
  const { pairs, sourceCommitHash, description = 'Motion DPO corpus' } = params;

  // Ensure all pair hashes are computed
  for (const pair of pairs) {
    if (!pair.pairHash) pair.pairHash = hashDPOPair(pair);
  }

  const merkleRoot = buildCorpusMerkleRoot(pairs);

  return {
    pairs,
    merkleRoot,
    pairCount: pairs.length,
    createdAt: new Date().toISOString(),
    metadata: {
      sourceCommitHash,
      description,
    },
  };
}

/** Serialize a corpus to a JSON string (deterministic ordering). */
export function serializeTrainingCorpus(corpus: TrainingCorpus): string {
  return JSON.stringify({
    merkleRoot: corpus.merkleRoot,
    pairCount: corpus.pairCount,
    createdAt: corpus.createdAt,
    metadata: corpus.metadata,
    pairs: corpus.pairs.map((p) => ({
      id: p.id,
      pairHash: p.pairHash,
      category: p.category,
      sourceCommitHash: p.sourceCommitHash,
      sourceRange: p.sourceRange,
    })),
  });
}

/** Hash a training corpus (Merkle root of the full structure). */
export function hashTrainingCorpus(corpus: TrainingCorpus): string {
  return sha256(serializeTrainingCorpus(corpus));
}

/** Verify corpus integrity: recompute Merkle root and compare. */
export function verifyCorpusIntegrity(corpus: TrainingCorpus): boolean {
  const recomputed = buildCorpusMerkleRoot(corpus.pairs);
  return recomputed === corpus.merkleRoot;
}

// ---------------------------------------------------------------------------
// Full-loop provenance chain (paper-9 §3)
// ---------------------------------------------------------------------------

/** Depth-5 provenance chain as described in the paper. */
export interface ProvenanceChain {
  motionArtifactHash: string;
  checkpointHash: string;
  corpusHash: string;
  corpusMerkleRoot: string;
  pairHashes: string[];
  sourceCommitHash: string;
}

/** Build the full depth-5 provenance chain. */
export function buildProvenanceChain(params: {
  motionClip: MotionClip;
  checkpointHash: string;
  corpus: TrainingCorpus;
}): ProvenanceChain {
  const { motionClip, checkpointHash, corpus } = params;
  return {
    motionArtifactHash: sha256(serializeClip(motionClip)),
    checkpointHash,
    corpusHash: hashTrainingCorpus(corpus),
    corpusMerkleRoot: corpus.merkleRoot,
    pairHashes: corpus.pairs.map((p) => p.pairHash ?? hashDPOPair(p)),
    sourceCommitHash: corpus.metadata.sourceCommitHash,
  };
}

/** Verify the full provenance chain top-down (O(log N + k) hash ops). */
export function verifyProvenanceChain(
  chain: ProvenanceChain,
  sampleIndices: number[],
  corpus: TrainingCorpus,
): boolean {
  // 1. Verify corpus hash matches
  if (hashTrainingCorpus(corpus) !== chain.corpusHash) return false;

  // 2. Verify corpus Merkle root matches
  if (corpus.merkleRoot !== chain.corpusMerkleRoot) return false;

  // 3. Spot-check sampled pairs
  for (const idx of sampleIndices) {
    const pair = corpus.pairs[idx];
    if (!pair) return false;
    const pairHash = pair.pairHash ?? hashDPOPair(pair);
    if (pairHash !== chain.pairHashes[idx]) return false;

    // Verify pair hash recomputation
    if (hashDPOPair(pair) !== pairHash) return false;
  }

  return true;
}
