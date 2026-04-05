/**
 * Ant Colony Optimization Engine
 *
 * Implements ACO algorithm for path-finding and task sequencing.
 * Uses pheromone trails to find optimal ordering of choreography steps.
 */

export interface ACOConfig {
  antCount: number;
  maxIterations: number;
  convergenceThreshold: number;
  alpha: number; // Pheromone importance
  beta: number; // Heuristic importance
  evaporationRate: number;
  q: number; // Pheromone deposit factor
  elitistWeight: number;
}

export interface ACOResult {
  bestPath: number[];
  bestCost: number;
  converged: boolean;
  iterations: number;
  costHistory: number[];
}

const DEFAULT_CONFIG: ACOConfig = {
  antCount: 20,
  maxIterations: 100,
  convergenceThreshold: 0.001,
  alpha: 1.0,
  beta: 2.0,
  evaporationRate: 0.1,
  q: 100,
  elitistWeight: 2.0,
};

/**
 * Ant Colony Optimization engine for path/sequence optimization
 */
export class ACOEngine {
  private config: ACOConfig;

  constructor(config: Partial<ACOConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find optimal path through nodes (e.g., task execution order)
   *
   * @param nodes Number of nodes to visit
   * @param distanceMatrix Distance/cost between nodes [i][j]
   * @returns Optimization result with best path
   */
  async optimize(nodes: number, distanceMatrix: number[][]): Promise<ACOResult> {
    const { antCount, maxIterations, convergenceThreshold } = this.config;

    // Initialize pheromone trails
    const pheromones = this.initializePheromones(nodes);
    const heuristics = this.computeHeuristics(distanceMatrix);

    let bestPath: number[] = [];
    let bestCost = Infinity;
    const costHistory: number[] = [];
    let converged = false;
    let iteration = 0;

    // Main optimization loop
    for (iteration = 0; iteration < maxIterations; iteration++) {
      const paths: number[][] = [];
      const costs: number[] = [];

      // Each ant constructs a solution
      for (let ant = 0; ant < antCount; ant++) {
        const path = this.constructSolution(nodes, pheromones, heuristics);
        const cost = this.calculatePathCost(path, distanceMatrix);

        paths.push(path);
        costs.push(cost);

        if (cost < bestCost) {
          bestCost = cost;
          bestPath = [...path];
        }
      }

      costHistory.push(bestCost);

      // Evaporate pheromones
      this.evaporatePheromones(pheromones);

      // Deposit pheromones based on path quality
      this.depositPheromones(pheromones, paths, costs);

      // Elitist reinforcement: extra pheromone on best path
      this.reinforceBestPath(pheromones, bestPath, bestCost);

      // Check convergence
      if (iteration > 10) {
        const recentImprovement = costHistory[iteration - 10] - bestCost;
        if (Math.abs(recentImprovement) < convergenceThreshold * bestCost) {
          converged = true;
          break;
        }
      }
    }

    return {
      bestPath,
      bestCost,
      converged,
      iterations: iteration + 1,
      costHistory,
    };
  }

  /**
   * Initialize pheromone matrix with uniform values
   */
  private initializePheromones(nodes: number): number[][] {
    const initial = 1.0 / nodes;
    return Array.from({ length: nodes }, () => Array.from({ length: nodes }, () => initial));
  }

  /**
   * Compute heuristic values (inverse distance)
   */
  private computeHeuristics(distanceMatrix: number[][]): number[][] {
    const nodes = distanceMatrix.length;
    return Array.from({ length: nodes }, (_, i) =>
      Array.from({ length: nodes }, (_, j) => {
        const dist = distanceMatrix[i][j];
        return dist > 0 ? 1.0 / dist : 0;
      })
    );
  }

  /**
   * Construct a solution path for one ant
   */
  private constructSolution(
    nodes: number,
    pheromones: number[][],
    heuristics: number[][]
  ): number[] {
    const { alpha, beta } = this.config;
    const path: number[] = [];
    const visited = new Set<number>();

    // Start from random node
    let current = Math.floor(Math.random() * nodes);
    path.push(current);
    visited.add(current);

    // Visit all remaining nodes
    while (path.length < nodes) {
      const probabilities: number[] = [];
      let sum = 0;

      // Calculate selection probabilities
      for (let next = 0; next < nodes; next++) {
        if (visited.has(next)) {
          probabilities.push(0);
        } else {
          const phero = Math.pow(pheromones[current][next], alpha);
          const heur = Math.pow(heuristics[current][next], beta);
          const prob = phero * heur;
          probabilities.push(prob);
          sum += prob;
        }
      }

      // Normalize and select next node
      if (sum === 0) {
        // Fallback: choose random unvisited
        const unvisited = Array.from({ length: nodes }, (_, i) => i).filter((n) => !visited.has(n));
        current = unvisited[Math.floor(Math.random() * unvisited.length)];
      } else {
        // Roulette wheel selection
        const r = Math.random() * sum;
        let cumulative = 0;
        for (let next = 0; next < nodes; next++) {
          cumulative += probabilities[next];
          if (cumulative >= r) {
            current = next;
            break;
          }
        }
      }

      path.push(current);
      visited.add(current);
    }

    return path;
  }

  /**
   * Calculate total path cost
   */
  private calculatePathCost(path: number[], distanceMatrix: number[][]): number {
    let cost = 0;
    for (let i = 0; i < path.length - 1; i++) {
      cost += distanceMatrix[path[i]][path[i + 1]];
    }
    return cost;
  }

  /**
   * Evaporate pheromones
   */
  private evaporatePheromones(pheromones: number[][]): void {
    const { evaporationRate } = this.config;
    const minPheromone = 0.001;

    for (let i = 0; i < pheromones.length; i++) {
      for (let j = 0; j < pheromones[i].length; j++) {
        pheromones[i][j] *= 1 - evaporationRate;
        pheromones[i][j] = Math.max(minPheromone, pheromones[i][j]);
      }
    }
  }

  /**
   * Deposit pheromones based on solution quality
   */
  private depositPheromones(pheromones: number[][], paths: number[][], costs: number[]): void {
    const { q } = this.config;

    for (let ant = 0; ant < paths.length; ant++) {
      const path = paths[ant];
      const deposit = q / costs[ant];

      for (let i = 0; i < path.length - 1; i++) {
        pheromones[path[i]][path[i + 1]] += deposit;
        pheromones[path[i + 1]][path[i]] += deposit; // Symmetric
      }
    }
  }

  /**
   * Elitist reinforcement of best path
   */
  private reinforceBestPath(pheromones: number[][], bestPath: number[], bestCost: number): void {
    const { q, elitistWeight } = this.config;
    const deposit = (q / bestCost) * elitistWeight;

    for (let i = 0; i < bestPath.length - 1; i++) {
      pheromones[bestPath[i]][bestPath[i + 1]] += deposit;
      pheromones[bestPath[i + 1]][bestPath[i]] += deposit;
    }
  }

  /**
   * Get recommended ant count for problem
   */
  getRecommendedAntCount(nodes: number): number {
    // Heuristic: roughly equal to node count, min 10, max 50
    return Math.min(50, Math.max(10, nodes));
  }
}
