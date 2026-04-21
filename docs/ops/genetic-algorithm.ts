/**
 * genetic-algorithm.ts  (P.007.02)
 *
 * Self-contained genetic-algorithm orchestrator for the HoloScript optimizer.
 *
 * Combines:
 *   - performance-based selection  (tournament, rank, Boltzmann, SUS)
 *   - trait mutation strategies    (Gaussian, polynomial, inversion)
 *   - crossover operators          (imported from ./crossover-operators)
 *   - elitism / Hall of Fame
 *   - schema-biased reproduction   (via CrossGenerationLearner-compatible Schema)
 *
 * Main export: GeneticAlgorithm
 *
 * @example
 * const ga = new GeneticAlgorithm({
 *   populationSize: 80,
 *   maxGenerations: 200,
 *   genomeLength: 10,
 *   evaluateFitness: (g) => -g.reduce((s, x) => s + x * x, 0), // minimise sphere
 * });
 * const result = await ga.run();
 * console.log(result.best.fitness);
 */

import {
  ConcreteGenome,
  CrossoverMethod,
  CrossoverOperator,
  Schema,
  createCrossoverOperator,
} from './crossover-operators';

// ── Shared types ─────────────────────────────────────────────────────────────

export type { ConcreteGenome };

export interface Individual {
  id: string;
  genome: ConcreteGenome;
  fitness: number;
  /** Generation in which this individual was created. */
  generationBorn: number;
}

// ── Fitness function ──────────────────────────────────────────────────────────

export type FitnessFunction = (genome: ConcreteGenome) => number | Promise<number>;

// ── Selection ─────────────────────────────────────────────────────────────────

export type SelectionMethod = 'tournament' | 'rank' | 'boltzmann' | 'sus';

interface SelectionOperator {
  select(population: Individual[], n: number): Individual[];
}

// ─── Tournament selection ────────────────────────────────────────────────────

class TournamentSelection implements SelectionOperator {
  constructor(private readonly k: number = 3) {}

  select(population: Individual[], n: number): Individual[] {
    const winners: Individual[] = [];
    for (let i = 0; i < n; i++) {
      let best = population[Math.floor(Math.random() * population.length)];
      for (let j = 1; j < this.k; j++) {
        const challenger = population[Math.floor(Math.random() * population.length)];
        if (challenger.fitness > best.fitness) best = challenger;
      }
      winners.push(best);
    }
    return winners;
  }
}

// ─── Rank selection ──────────────────────────────────────────────────────────

class RankSelection implements SelectionOperator {
  select(population: Individual[], n: number): Individual[] {
    const sorted = [...population].sort((a, b) => a.fitness - b.fitness);
    const total = (sorted.length * (sorted.length + 1)) / 2;
    const out: Individual[] = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random() * total;
      for (let j = 0; j < sorted.length; j++) {
        r -= j + 1;
        if (r <= 0) {
          out.push(sorted[j]);
          break;
        }
      }
    }
    return out;
  }
}

// ─── Boltzmann (softmax temperature-annealed) ────────────────────────────────

class BoltzmannSelection implements SelectionOperator {
  private temperature: number;

  constructor(initialTemp = 1.0) {
    this.temperature = initialTemp;
  }

  /** Call once per generation to anneal the temperature. */
  anneal(factor = 0.95): void {
    this.temperature = Math.max(0.01, this.temperature * factor);
  }

  select(population: Individual[], n: number): Individual[] {
    const scaled = population.map((ind) => Math.exp(ind.fitness / this.temperature));
    const sum = scaled.reduce((a, b) => a + b, 0);
    const probs = scaled.map((s) => s / sum);
    const out: Individual[] = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random();
      for (let j = 0; j < probs.length; j++) {
        r -= probs[j];
        if (r <= 0) {
          out.push(population[j]);
          break;
        }
      }
      if (out.length < i + 1) out.push(population[population.length - 1]);
    }
    return out;
  }
}

// ─── Stochastic Universal Sampling ───────────────────────────────────────────

class SUSSelection implements SelectionOperator {
  select(population: Individual[], n: number): Individual[] {
    const totalFitness = population.reduce((s, ind) => s + ind.fitness, 0);
    if (totalFitness === 0) return Array.from({ length: n }, () => population[Math.floor(Math.random() * population.length)]);
    const step = totalFitness / n;
    let pointer = Math.random() * step;
    let cumulative = 0;
    const out: Individual[] = [];
    let j = 0;
    for (let i = 0; i < n; i++, pointer += step) {
      while (cumulative + population[j].fitness < pointer) {
        cumulative += population[j].fitness;
        j = (j + 1) % population.length;
      }
      out.push(population[j]);
    }
    return out;
  }
}

function buildSelector(method: SelectionMethod): SelectionOperator {
  switch (method) {
    case 'tournament': return new TournamentSelection();
    case 'rank':       return new RankSelection();
    case 'boltzmann':  return new BoltzmannSelection();
    case 'sus':        return new SUSSelection();
  }
}

// ── Mutation ──────────────────────────────────────────────────────────────────

export type MutationMethod = 'gaussian' | 'polynomial' | 'inversion';

// ─── Gaussian mutation ────────────────────────────────────────────────────────

function gaussianMutate(genome: ConcreteGenome, rate: number, sigma: number): ConcreteGenome {
  return genome.map((g) =>
    Math.random() < rate ? g + sigma * (Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())) : g,
  );
}

// ─── Polynomial mutation (NSGA-II, boundary-aware) ───────────────────────────

function polynomialMutate(
  genome: ConcreteGenome,
  rate: number,
  etaM = 20,
  lo = -1,
  hi = 1,
): ConcreteGenome {
  return genome.map((g) => {
    if (Math.random() >= rate) return g;
    const u = Math.random();
    const delta =
      u < 0.5
        ? Math.pow(2 * u, 1 / (etaM + 1)) - 1
        : 1 - Math.pow(2 * (1 - u), 1 / (etaM + 1));
    return Math.max(lo, Math.min(hi, g + delta * (hi - lo)));
  });
}

// ─── Inversion mutation (reverses a random sub-segment) ──────────────────────

function inversionMutate(genome: ConcreteGenome): ConcreteGenome {
  if (genome.length < 2) return [...genome];
  let a = Math.floor(Math.random() * genome.length);
  let b = Math.floor(Math.random() * genome.length);
  if (a > b) [a, b] = [b, a];
  const copy = [...genome];
  copy.splice(a, b - a + 1, ...copy.slice(a, b + 1).reverse());
  return copy;
}

function applyMutation(
  genome: ConcreteGenome,
  rate: number,
  method: MutationMethod,
): ConcreteGenome {
  switch (method) {
    case 'gaussian':   return gaussianMutate(genome, rate, 0.1);
    case 'polynomial': return polynomialMutate(genome, rate);
    case 'inversion':  return Math.random() < rate ? inversionMutate(genome) : [...genome];
  }
}

// ── Hall of Fame ──────────────────────────────────────────────────────────────

class HallOfFame {
  private readonly elites: Individual[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }

  update(population: Individual[]): void {
    for (const ind of population) {
      const worst = this.elites.length < this.maxSize
        ? null
        : this.elites.reduce((w, e) => (e.fitness < w.fitness ? e : w));
      if (worst === null || ind.fitness > worst.fitness) {
        if (worst !== null) this.elites.splice(this.elites.indexOf(worst), 1);
        this.elites.push({ ...ind, genome: [...ind.genome] });
      }
    }
    this.elites.sort((a, b) => b.fitness - a.fitness);
  }

  get best(): Individual | null {
    return this.elites[0] ?? null;
  }

  slice(n: number): Individual[] {
    return this.elites.slice(0, n);
  }
}

// ── Configuration ─────────────────────────────────────────────────────────────

export interface GeneticAlgorithmConfig {
  /** Number of individuals per generation. Default: 100. */
  populationSize?: number;
  /** Maximum generations before stopping. Default: 200. */
  maxGenerations?: number;
  /** Probability of performing crossover on a selected pair. Default: 0.8. */
  crossoverRate?: number;
  /** Per-gene probability of mutation. Default: 0.05. */
  mutationRate?: number;
  /** Length of each genome (number of real-valued genes). Required. */
  genomeLength: number;
  /** Stop early when any individual reaches this fitness. */
  targetFitness?: number;
  /** Number of top individuals carried unchanged into the next gen. Default: 2. */
  eliteCount?: number;
  /** Selection strategy. Default: 'tournament'. */
  selectionMethod?: SelectionMethod;
  /** Crossover strategy. Default: 'uniform'. */
  crossoverMethod?: CrossoverMethod;
  /** Mutation strategy. Default: 'gaussian'. */
  mutationMethod?: MutationMethod;
  /**
   * Fitness function. Higher is better.
   * May be sync or async (e.g. for network / GPU evaluation).
   */
  evaluateFitness: FitnessFunction;
  /**
   * Optional schemas for schema-biased crossover.
   * When provided and crossoverMethod is 'uniform', the dominant schema's
   * fixed genes are preserved in offspring (CrossGenerationLearner-compatible).
   */
  schemas?: Schema[];
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface GAResult {
  /** Best individual found across all generations. */
  best: Individual;
  /** Number of generations completed. */
  generationsRun: number;
  /** True if targetFitness was reached before maxGenerations. */
  converged: boolean;
  /** Per-generation statistics. */
  history: GenerationStats[];
}

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  diversity: number;
}

// ── GeneticAlgorithm ──────────────────────────────────────────────────────────

export class GeneticAlgorithm {
  private readonly cfg: Required<Omit<GeneticAlgorithmConfig, 'targetFitness' | 'schemas'>> &
    Pick<GeneticAlgorithmConfig, 'targetFitness' | 'schemas' | 'evaluateFitness'>;

  private population: Individual[] = [];
  private generationCount = 0;
  private readonly selector: SelectionOperator;
  private readonly crossoverOp: CrossoverOperator;
  private readonly hof: HallOfFame;

  constructor(config: GeneticAlgorithmConfig) {
    this.cfg = {
      populationSize: 100,
      maxGenerations: 200,
      crossoverRate: 0.8,
      mutationRate: 0.05,
      eliteCount: 2,
      selectionMethod: 'tournament',
      crossoverMethod: 'uniform',
      mutationMethod: 'gaussian',
      ...config,
    };
    this.selector = buildSelector(this.cfg.selectionMethod);
    this.crossoverOp = createCrossoverOperator(this.cfg.crossoverMethod);
    this.hof = new HallOfFame(Math.max(this.cfg.eliteCount, 5));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async run(): Promise<GAResult> {
    this.generationCount = 0;
    this.population = [];
    const history: GenerationStats[] = [];

    this.initializePopulation();
    await this.evaluatePopulation();

    while (this.generationCount < this.cfg.maxGenerations) {
      this.hof.update(this.population);
      const stats = this.computeStats();
      history.push(stats);

      if (this.cfg.targetFitness !== undefined && stats.bestFitness >= this.cfg.targetFitness) break;

      this.population = await this.evolve();
      await this.evaluatePopulation();
      this.generationCount++;
    }

    // Final update
    this.hof.update(this.population);

    const best = this.hof.best ?? this.getBest();
    return {
      best,
      generationsRun: this.generationCount,
      converged: this.cfg.targetFitness !== undefined && best.fitness >= this.cfg.targetFitness,
      history,
    };
  }

  /** Current population snapshot (read-only intent). */
  getPopulation(): readonly Individual[] {
    return this.population;
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  private initializePopulation(): void {
    for (let i = 0; i < this.cfg.populationSize; i++) {
      this.population.push({
        id: uid(),
        genome: randomGenome(this.cfg.genomeLength),
        fitness: 0,
        generationBorn: 0,
      });
    }
  }

  // ── Evaluation ─────────────────────────────────────────────────────────────

  private async evaluatePopulation(): Promise<void> {
    await Promise.all(
      this.population.map(async (ind) => {
        ind.fitness = await this.cfg.evaluateFitness(ind.genome);
      }),
    );
  }

  // ── Evolution step ─────────────────────────────────────────────────────────

  private async evolve(): Promise<Individual[]> {
    const nextGen: Individual[] = [];
    const schemas = this.cfg.schemas ?? [];

    // 1. Elitism — copy best individuals unchanged
    const elites = this.hof.slice(this.cfg.eliteCount);
    for (const e of elites) {
      nextGen.push({ ...e, id: uid(), generationBorn: this.generationCount + 1 });
    }

    // 2. Fill remainder via selection → crossover → mutation
    const need = this.cfg.populationSize - nextGen.length;
    const parents = this.selector.select(this.population, need + (need % 2));

    for (let i = 0; i < need; i += 2) {
      const p1 = parents[i];
      const p2 = parents[i + 1] ?? parents[0];
      let g1 = p1.genome;
      let g2 = p2.genome;

      if (Math.random() < this.cfg.crossoverRate) {
        [g1, g2] = this.crossoverOp.crossover(g1, g2, schemas.length > 0 ? schemas : undefined);
      }

      g1 = applyMutation(g1, this.cfg.mutationRate, this.cfg.mutationMethod);
      g2 = applyMutation(g2, this.cfg.mutationRate, this.cfg.mutationMethod);

      if (nextGen.length < this.cfg.populationSize) {
        nextGen.push({ id: uid(), genome: g1, fitness: 0, generationBorn: this.generationCount + 1 });
      }
      if (nextGen.length < this.cfg.populationSize) {
        nextGen.push({ id: uid(), genome: g2, fitness: 0, generationBorn: this.generationCount + 1 });
      }
    }

    return nextGen;
  }

  // ── Statistics ─────────────────────────────────────────────────────────────

  private computeStats(): GenerationStats {
    const fits = this.population.map((i) => i.fitness);
    const best = Math.max(...fits);
    const mean = fits.reduce((a, b) => a + b, 0) / fits.length;
    const diversity = computeDiversity(this.population.map((i) => i.genome));
    return { generation: this.generationCount, bestFitness: best, meanFitness: mean, diversity };
  }

  private getBest(): Individual {
    return this.population.reduce((b, i) => (i.fitness > b.fitness ? i : b));
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

function randomGenome(length: number): ConcreteGenome {
  return Array.from({ length }, () => Math.random() * 2 - 1);
}

/**
 * Normalised mean pairwise Euclidean distance between genomes (0 = all equal, 1 = max spread).
 * Samples at most 50 random pairs for performance.
 */
function computeDiversity(genomes: ConcreteGenome[]): number {
  if (genomes.length < 2) return 0;
  const sampleSize = Math.min(50, genomes.length);
  let totalDist = 0;
  let count = 0;
  for (let i = 0; i < sampleSize; i++) {
    const a = genomes[Math.floor(Math.random() * genomes.length)];
    const b = genomes[Math.floor(Math.random() * genomes.length)];
    let d = 0;
    for (let k = 0; k < a.length; k++) d += (a[k] - b[k]) ** 2;
    totalDist += Math.sqrt(d / a.length);
    count++;
  }
  return count > 0 ? totalDist / count : 0;
}
