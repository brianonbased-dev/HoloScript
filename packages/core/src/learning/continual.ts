/**
 * continual.ts — Continual Learning for HoloScript Trait Library
 *
 * Neural ODE-Transformer hybrid with Elastic Weight Consolidation (EWC) for
 * catastrophic-forgetting prevention across HoloScript trait library versions.
 *
 * Architecture:
 *   NeuralODE        — continuous-time representation layer prevents abrupt
 *                      weight shifts when new traits are trained.
 *   EWC              — Fisher-information diagonal protects important weights
 *                      for existing traits (λ ∈ [0.01, 1.0]).
 *   MemoryTransformer — episodic buffer + attention over past trait embeddings
 *                      for zero-shot backwards compatibility.
 *
 * References:
 *   - Kirkpatrick et al. 2017 — Overcoming catastrophic forgetting in NNs (EWC)
 *   - Chen et al. 2018 — Neural Ordinary Differential Equations
 *   - Graves et al. 2016 — Hybrid computing using a neural network with dynamic
 *     external memory (Memory-Augmented Networks)
 *
 * @module continual
 */

// ═══════════════════════════════════════════════════════════════════
// Core types
// ═══════════════════════════════════════════════════════════════════

/** Trait identifier — matches the trait name string used in HoloScript source. */
export type TraitName = string;

/** Fixed-length float feature vector representing one trait. */
export type TraitEmbedding = Float64Array;

/** Weights for a single trait-predictor linear probe. */
export interface WeightVector {
  weights: Float64Array;
  bias: number;
}

/** Per-weight Fisher information estimate (diagonal EWC). */
export type FisherDiagonal = Float64Array;

/** Snapshot of weights + Fisher at the moment a task (version) was consolidated. */
export interface TaskSnapshot {
  /** Version identifier, e.g. "v6.0.2" */
  version: string;
  /** Trait names belonging to this snapshot. */
  traitNames: TraitName[];
  /** Fisher diagonal for the consolidated weights. */
  fisher: FisherDiagonal;
  /** Starred (optimal) weights at the time of consolidation. */
  optimalWeights: Float64Array;
}

/** Represents a HoloScript trait to be learned. */
export interface TraitDescriptor {
  name: TraitName;
  /** Semantic feature vector (category encoding + capability flags). */
  embedding: TraitEmbedding;
  /** Version string where this trait was introduced or last modified. */
  version: string;
  /** Category tag, e.g. 'interaction', 'physics', 'ai-behavior'. */
  category: string;
}

/** Result of a continual-learning expansion step. */
export interface LearningResult {
  traitName: TraitName;
  version: string;
  forgettingScore: number;   // 0 = no forgetting, 1 = complete forgetting
  ewcPenalty: number;
  converged: boolean;
  iterations: number;
}

/** Options for the continual learning system. */
export interface ContinualLearnerOptions {
  /** EWC regularization strength. Higher = more protection for old tasks. Default 0.1 */
  ewcLambda?: number;
  /** Embedding dimensionality. Default 64 */
  embeddingDim?: number;
  /** Episodic memory buffer size (number of past trait embeddings). Default 256 */
  bufferSize?: number;
  /** Maximum training iterations per new trait. Default 50 */
  maxIterations?: number;
  /** Convergence tolerance for loss delta. Default 1e-4 */
  convergenceTol?: number;
}

// ═══════════════════════════════════════════════════════════════════
// EWC — Elastic Weight Consolidation
// ═══════════════════════════════════════════════════════════════════

/**
 * Computes a diagonal Fisher Information Matrix estimate for existing trait
 * embeddings. The Fisher captures how sensitive the model's predictions are
 * to each weight — high Fisher = weight is important for existing traits.
 */
export function computeFisherDiagonal(
  embeddings: TraitEmbedding[],
  currentWeights: Float64Array,
): FisherDiagonal {
  const dim = currentWeights.length;
  const fisher = new Float64Array(dim);
  const n = embeddings.length;
  if (n === 0) return fisher;

  // Approximate diagonal Fisher: mean squared gradient of log-likelihood
  // Under linear probe assumption: gradient = (prediction - target) * feature
  for (const emb of embeddings) {
    // Compute squared dot-product (proxy for squared gradient contribution)
    for (let i = 0; i < dim && i < emb.length; i++) {
      const grad = emb[i] * currentWeights[i];
      fisher[i] += grad * grad;
    }
  }

  // Normalize by sample count
  for (let i = 0; i < dim; i++) {
    fisher[i] /= n;
  }

  return fisher;
}

/**
 * Computes EWC regularization penalty.
 * L_ewc = (λ/2) · Σ_i F_i · (θ_i − θ*_i)²
 */
export function computeEWCPenalty(
  currentWeights: Float64Array,
  optimalWeights: Float64Array,
  fisher: FisherDiagonal,
  lambda: number,
): number {
  let penalty = 0;
  const dim = Math.min(currentWeights.length, optimalWeights.length, fisher.length);
  for (let i = 0; i < dim; i++) {
    const diff = currentWeights[i] - optimalWeights[i];
    penalty += fisher[i] * diff * diff;
  }
  return (lambda / 2) * penalty;
}

// ═══════════════════════════════════════════════════════════════════
// Neural ODE — continuous-time trait embedding dynamics
// ═══════════════════════════════════════════════════════════════════

/**
 * Euler step for Neural ODE dynamics:
 *   dz/dt = f(z, t)  where f is a tanh-activated linear layer
 *
 * Used to smoothly evolve trait embeddings over continuous time (version step),
 * preventing abrupt jumps when new traits are introduced.
 */
export function neuralODEStep(
  z: Float64Array,
  dt: number,
  kernelWeights: Float64Array,
): Float64Array {
  const dim = z.length;
  const dz = new Float64Array(dim);

  // f(z) = tanh(W · z): simple autonomous ODE field
  for (let i = 0; i < dim; i++) {
    let activation = 0;
    for (let j = 0; j < dim; j++) {
      activation += kernelWeights[(i * dim + j) % kernelWeights.length] * z[j];
    }
    dz[i] = Math.tanh(activation);
  }

  // Euler integration: z(t+dt) = z(t) + dt * f(z(t))
  const zNext = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    zNext[i] = z[i] + dt * dz[i];
  }
  return zNext;
}

/**
 * Integrate from t=0 to t=1 with Euler method using nSteps steps.
 * Returns the final latent z(1).
 */
export function integrateODE(
  z0: Float64Array,
  kernelWeights: Float64Array,
  nSteps = 10,
): Float64Array {
  const dt = 1.0 / nSteps;
  let z = new Float64Array(z0);
  for (let step = 0; step < nSteps; step++) {
    z = neuralODEStep(z, dt, kernelWeights) as Float64Array<ArrayBuffer>;
  }
  return z;
}

// ═══════════════════════════════════════════════════════════════════
// Episodic Memory Buffer — sparse attention over past trait embeddings
// ═══════════════════════════════════════════════════════════════════

/**
 * Fixed-size FIFO buffer storing trait embeddings for episodic replay.
 * When the buffer is full, the least-recently-added entry is evicted.
 */
export class EpisodicBuffer {
  private buffer: Array<{ name: TraitName; embedding: TraitEmbedding }> = [];
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  add(name: TraitName, embedding: TraitEmbedding): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push({ name, embedding });
  }

  /**
   * Retrieves top-k most similar entries from the buffer using cosine similarity.
   */
  retrieve(query: TraitEmbedding, topK: number): Array<{ name: TraitName; similarity: number }> {
    const scored = this.buffer.map(({ name, embedding }) => ({
      name,
      similarity: cosineSimilarity(query, embedding),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  get size(): number {
    return this.buffer.length;
  }

  getAll(): Array<{ name: TraitName; embedding: TraitEmbedding }> {
    return [...this.buffer];
  }
}

function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ═══════════════════════════════════════════════════════════════════
// ContinualTraitLearner — main class
// ═══════════════════════════════════════════════════════════════════

/**
 * Continual learner for the HoloScript trait library.
 *
 * Maintains a growing embedding space across HoloScript versions while
 * using EWC to prevent catastrophic forgetting of existing traits.
 *
 * Usage:
 * ```typescript
 * const learner = new ContinualTraitLearner({ ewcLambda: 0.1 });
 * const result = await learner.addTrait(newTrait);
 * const emb = learner.getEmbedding('myTrait');
 * const score = learner.computeForgettingScore();
 * ```
 */
export class ContinualTraitLearner {
  private readonly options: Required<ContinualLearnerOptions>;

  private weights: Float64Array;
  private odeKernel: Float64Array;
  private episodicBuffer: EpisodicBuffer;
  private taskSnapshots: TaskSnapshot[] = [];
  private traitEmbeddings = new Map<TraitName, TraitEmbedding>();
  private traitVersions = new Map<TraitName, string>();

  constructor(options: ContinualLearnerOptions = {}) {
    this.options = {
      ewcLambda: options.ewcLambda ?? 0.1,
      embeddingDim: options.embeddingDim ?? 64,
      bufferSize: options.bufferSize ?? 256,
      maxIterations: options.maxIterations ?? 50,
      convergenceTol: options.convergenceTol ?? 1e-4,
    };

    const dim = this.options.embeddingDim;
    this.weights = uniformRandom(dim, -0.1, 0.1);
    this.odeKernel = uniformRandom(dim * dim, -0.05, 0.05);
    this.episodicBuffer = new EpisodicBuffer(this.options.bufferSize);
  }

  /**
   * Adds a new trait to the library with EWC-regularized training.
   * Protects existing trait weights using Fisher-diagonal consolidation.
   */
  async addTrait(trait: TraitDescriptor): Promise<LearningResult> {
    const { ewcLambda, maxIterations, convergenceTol } = this.options;

    // 1. Compute EWC importance from existing traits
    const existingEmbeddings = [...this.traitEmbeddings.values()];
    const fisher = existingEmbeddings.length > 0
      ? computeFisherDiagonal(existingEmbeddings, this.weights)
      : new Float64Array(this.weights.length);
    const optimalWeights = new Float64Array(this.weights);

    // 2. Evolve trait embedding through Neural ODE
    const z0 = trait.embedding.length === this.options.embeddingDim
      ? new Float64Array(trait.embedding)
      : resizeEmbedding(trait.embedding, this.options.embeddingDim);

    const evolvedEmbedding = integrateODE(z0, this.odeKernel);

    // 3. Iterative training with EWC penalty
    let prevLoss = Infinity;
    let iterations = 0;
    let converged = false;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Task loss: minimize distance between current weights and evolved embedding
      const taskLoss = l2Loss(this.weights, evolvedEmbedding);

      // EWC penalty on current weights
      const ewcPenalty = computeEWCPenalty(this.weights, optimalWeights, fisher, ewcLambda);

      const totalLoss = taskLoss + ewcPenalty;

      // Gradient step (simplified SGD with EWC gradient)
      const lr = 0.01;
      for (let i = 0; i < this.weights.length && i < evolvedEmbedding.length; i++) {
        const taskGrad = 2 * (this.weights[i] - evolvedEmbedding[i]);
        const ewcGrad = ewcLambda * fisher[i] * (this.weights[i] - optimalWeights[i]);
        this.weights[i] -= lr * (taskGrad + ewcGrad);
      }

      iterations = iter + 1;
      if (Math.abs(prevLoss - totalLoss) < convergenceTol) {
        converged = true;
        break;
      }
      prevLoss = totalLoss;
    }

    // 4. Store evolved embedding + update episodic buffer
    this.traitEmbeddings.set(trait.name, evolvedEmbedding);
    this.traitVersions.set(trait.name, trait.version);
    this.episodicBuffer.add(trait.name, evolvedEmbedding);

    // 5. Compute forgetting score over episodic memory
    const forgettingScore = this.computeForgettingScore();
    const ewcPenalty = computeEWCPenalty(this.weights, optimalWeights, fisher, ewcLambda);

    return {
      traitName: trait.name,
      version: trait.version,
      forgettingScore,
      ewcPenalty,
      converged,
      iterations,
    };
  }

  /**
   * Consolidates the current state as a task snapshot (called when a new
   * HoloScript version is released). Allows EWC to protect all traits
   * introduced up to this version.
   */
  consolidateVersion(version: string): TaskSnapshot {
    const traitNames = [...this.traitVersions.keys()];
    const embeddings = [...this.traitEmbeddings.values()];
    const fisher = embeddings.length > 0
      ? computeFisherDiagonal(embeddings, this.weights)
      : new Float64Array(this.weights.length);

    const snapshot: TaskSnapshot = {
      version,
      traitNames,
      fisher,
      optimalWeights: new Float64Array(this.weights),
    };
    this.taskSnapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Returns the evolved embedding for a trait name, or undefined if unknown.
   */
  getEmbedding(name: TraitName): TraitEmbedding | undefined {
    return this.traitEmbeddings.get(name);
  }

  /**
   * Retrieves the most similar traits to the query embedding using episodic
   * memory attention (for zero-shot backwards compatibility).
   */
  retrieveSimilarTraits(
    queryEmbedding: TraitEmbedding,
    topK = 5,
  ): Array<{ name: TraitName; similarity: number }> {
    return this.episodicBuffer.retrieve(queryEmbedding, topK);
  }

  /**
   * Computes forgetting score [0, 1] by measuring mean cosine distance
   * between current embeddings and stored episodic memory.
   * 0 = no forgetting, 1 = complete forgetting.
   */
  computeForgettingScore(): number {
    const stored = this.episodicBuffer.getAll();
    if (stored.length === 0) return 0;

    let totalDivergence = 0;
    for (const { name, embedding } of stored) {
      const current = this.traitEmbeddings.get(name);
      if (!current) continue;
      const sim = cosineSimilarity(current, embedding);
      totalDivergence += 1 - sim; // 1 = fully forgot, 0 = perfectly remembered
    }
    return totalDivergence / stored.length;
  }

  /**
   * Checks backward compatibility: returns which traits from a prior snapshot
   * are still accessible (above similarity threshold) in the current state.
   */
  checkBackwardCompatibility(
    snapshot: TaskSnapshot,
    threshold = 0.8,
  ): { compatible: TraitName[]; incompatible: TraitName[] } {
    const compatible: TraitName[] = [];
    const incompatible: TraitName[] = [];

    for (const name of snapshot.traitNames) {
      const current = this.traitEmbeddings.get(name);
      if (!current) {
        incompatible.push(name);
        continue;
      }
      // Compare current embedding to snapshot optimal weights as a proxy
      const sim = cosineSimilarity(current, snapshot.optimalWeights);
      (sim >= threshold ? compatible : incompatible).push(name);
    }

    return { compatible, incompatible };
  }

  /** Returns all known trait names. */
  get traitCount(): number {
    return this.traitEmbeddings.size;
  }

  /** Returns all stored task snapshots (one per consolidated version). */
  get snapshots(): ReadonlyArray<TaskSnapshot> {
    return this.taskSnapshots;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Helper utilities
// ═══════════════════════════════════════════════════════════════════

function l2Loss(a: Float64Array, b: Float64Array): number {
  let loss = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    loss += diff * diff;
  }
  return loss / len;
}

function uniformRandom(size: number, min: number, max: number): Float64Array {
  const arr = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    arr[i] = min + Math.random() * (max - min);
  }
  return arr;
}

function resizeEmbedding(src: TraitEmbedding, targetDim: number): Float64Array {
  const out = new Float64Array(targetDim);
  const len = Math.min(src.length, targetDim);
  for (let i = 0; i < len; i++) {
    out[i] = src[i];
  }
  // If src is longer, fold extra dimensions via averaging into the last slot
  for (let i = len; i < src.length; i++) {
    out[targetDim - 1] += src[i] / (src.length - len + 1);
  }
  return out;
}
