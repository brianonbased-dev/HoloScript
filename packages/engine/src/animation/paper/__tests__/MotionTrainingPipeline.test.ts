import { describe, expect, it } from 'vitest';
import {
  assembleTrainingCorpus,
  buildCorpusMerkleRoot,
  buildProvenanceChain,
  generateDPOPairsFromAST,
  generateMerkleProof,
  hashDPOPair,
  hashTrainingCorpus,
  serializeTrainingCorpus,
  verifyCorpusIntegrity,
  verifyMerkleProof,
  verifyProvenanceChain,
} from '../MotionTrainingPipeline';
import { checkPlausibility } from '../PhysicsPlausibilityContract';

describe('MotionTrainingPipeline', () => {
  const SOURCE_COMMIT = 'abc123def456789012345678901234567890abcd';

  const astNodes = [
    { file: 'src/locomotion.hs', startLine: 1, endLine: 10, category: 'locomotion' as const },
    { file: 'src/gesture.hs', startLine: 20, endLine: 30, category: 'gesture' as const },
    { file: 'src/interaction.hs', startLine: 40, endLine: 50, category: 'interaction' as const },
  ];

  it('generates DPO pairs from AST nodes with all required fields', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes,
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    expect(pairs.length).toBe(6); // 3 nodes × 2 pairs

    for (const pair of pairs) {
      expect(pair.id).toBeTruthy();
      expect(pair.chosen).toBeTruthy();
      expect(pair.rejected).toBeTruthy();
      expect(pair.sourceCommitHash).toBe(SOURCE_COMMIT);
      expect(pair.sourceRange.file).toBeTruthy();
      expect(pair.sourceRange.startLine).toBeGreaterThan(0);
      expect(pair.pairHash).toBeTruthy();
    }
  });

  it('chosen clips pass plausibility contract; rejected clips fail', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 4,
      seed: 0xbeef,
    });

    for (const pair of pairs) {
      const chosenResult = checkPlausibility(pair.chosen);
      const rejectedResult = checkPlausibility(pair.rejected);

      expect(chosenResult.pass).toBe(true);
      expect(rejectedResult.pass).toBe(false);
    }
  });

  it('pair hashes are deterministic', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 1,
      seed: 0xbeef,
    });

    const pair = pairs[0]!;
    const h1 = hashDPOPair(pair);
    const h2 = hashDPOPair(pair);
    expect(h1).toBe(h2);
    expect(h1).toBe(pair.pairHash);
  });

  it('different seeds produce different pair hashes', () => {
    const p1 = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 1,
      seed: 0xbeef,
    })[0]!;

    const p2 = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 1,
      seed: 0xcafe,
    })[0]!;

    expect(p1.pairHash).not.toBe(p2.pairHash);
  });

  it('builds a Merkle root from pairs', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes,
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    const root = buildCorpusMerkleRoot(pairs);
    expect(root).toBeTruthy();
    expect(root).toMatch(/^[a-f0-9]{64}$/);
  });

  it('assembles a training corpus with integrity', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes,
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    const corpus = assembleTrainingCorpus({
      pairs,
      sourceCommitHash: SOURCE_COMMIT,
      description: 'Test corpus',
    });

    expect(corpus.pairCount).toBe(pairs.length);
    expect(corpus.merkleRoot).toBeTruthy();
    expect(corpus.metadata.sourceCommitHash).toBe(SOURCE_COMMIT);
    expect(verifyCorpusIntegrity(corpus)).toBe(true);
  });

  it('detects tampered corpus integrity', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    const corpus = assembleTrainingCorpus({ pairs, sourceCommitHash: SOURCE_COMMIT });
    // Tamper with a pair hash
    corpus.pairs[0]!.pairHash = '0000000000000000000000000000000000000000000000000000000000000000';
    expect(verifyCorpusIntegrity(corpus)).toBe(false);
  });

  it('serializes and hashes corpus deterministically', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    const corpus = assembleTrainingCorpus({ pairs, sourceCommitHash: SOURCE_COMMIT });
    const s1 = serializeTrainingCorpus(corpus);
    const s2 = serializeTrainingCorpus(corpus);
    expect(s1).toBe(s2);

    const h1 = hashTrainingCorpus(corpus);
    const h2 = hashTrainingCorpus(corpus);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates and verifies Merkle proofs', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes,
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    const root = buildCorpusMerkleRoot(pairs);
    const { root: proofRoot, proof } = generateMerkleProof(pairs, 0);

    expect(proofRoot).toBe(root);
    expect(proof.length).toBeGreaterThanOrEqual(0);

    const leafHash = pairs[0]!.pairHash!;
    expect(verifyMerkleProof(leafHash, proof, root)).toBe(true);

    // Bad proof should fail
    const badProof = proof.map((p) => ({ ...p, siblingHash: '0'.repeat(64) }));
    expect(verifyMerkleProof(leafHash, badProof, root)).toBe(false);
  });

  it('builds and verifies the full provenance chain (paper-9 §3)', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 2),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 2,
      seed: 0xbeef,
    });

    const corpus = assembleTrainingCorpus({ pairs, sourceCommitHash: SOURCE_COMMIT });
    const checkpointHash = 'deadbeef' + '0'.repeat(56);

    const motionClip = pairs[0]!.chosen;
    const chain = buildProvenanceChain({ motionClip, checkpointHash, corpus });

    expect(chain.motionArtifactHash).toBeTruthy();
    expect(chain.checkpointHash).toBe(checkpointHash);
    expect(chain.corpusHash).toBe(hashTrainingCorpus(corpus));
    expect(chain.corpusMerkleRoot).toBe(corpus.merkleRoot);
    expect(chain.sourceCommitHash).toBe(SOURCE_COMMIT);

    // Verify top-down
    const valid = verifyProvenanceChain(chain, [0, 1], corpus);
    expect(valid).toBe(true);

    // Tampered chain should fail
    const badChain = { ...chain, corpusHash: 'badhash' + '0'.repeat(56) };
    expect(verifyProvenanceChain(badChain, [0], corpus)).toBe(false);
  });

  it('provenance spot-check fails on bad pair index', () => {
    const pairs = generateDPOPairsFromAST({
      astNodes: astNodes.slice(0, 1),
      sourceCommitHash: SOURCE_COMMIT,
      pairsPerNode: 1,
      seed: 0xbeef,
    });

    const corpus = assembleTrainingCorpus({ pairs, sourceCommitHash: SOURCE_COMMIT });
    const chain = buildProvenanceChain({
      motionClip: pairs[0]!.chosen,
      checkpointHash: 'a'.repeat(64),
      corpus,
    });

    // Index out of bounds should fail
    expect(verifyProvenanceChain(chain, [999], corpus)).toBe(false);
  });
});
