/**
 * Particle Swarm Optimization Engine
 *
 * Implements PSO algorithm for agent-task assignment optimization.
 * Each particle represents a potential solution (task-to-agent mapping).
 */

export interface PSOConfig {
  populationSize: number;
  maxIterations: number;
  convergenceThreshold: number;
  inertiaWeight: number;
  cognitiveWeight: number;
  socialWeight: number;
  velocityClamp: number;
}

export interface Particle {
  position: number[];
  velocity: number[];
  personalBest: number[];
  personalBestFitness: number;
}

export interface PSOResult {
  bestSolution: number[];
  bestFitness: number;
  converged: boolean;
  iterations: number;
  fitnessHistory: number[];
}

const DEFAULT_CONFIG: PSOConfig = {
  populationSize: 30,
  maxIterations: 100,
  convergenceThreshold: 0.001,
  inertiaWeight: 0.729,
  cognitiveWeight: 1.49445,
  socialWeight: 1.49445,
  velocityClamp: 4.0,
};

/**
 * Particle Swarm Optimization engine for task assignment
 */
export class PSOEngine {
  private config: PSOConfig;

  constructor(config: Partial<PSOConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Optimize task assignment using PSO
   *
   * @param agentCount Number of available agents
   * @param taskCount Number of tasks to assign
   * @param fitnessFunction Function to evaluate solution quality (higher is better)
   * @returns Optimization result with best assignment
   */
  async optimize(
    agentCount: number,
    taskCount: number,
    fitnessFunction: (assignment: number[]) => number
  ): Promise<PSOResult> {
    const { populationSize, maxIterations, convergenceThreshold } = this.config;

    // Initialize swarm
    const particles = this.initializeSwarm(populationSize, taskCount, agentCount);

    // Track global best
    let globalBest: number[] = [...particles[0].personalBest];
    let globalBestFitness = particles[0].personalBestFitness;

    // Find initial global best
    for (const particle of particles) {
      if (particle.personalBestFitness > globalBestFitness) {
        globalBestFitness = particle.personalBestFitness;
        globalBest = [...particle.personalBest];
      }
    }

    const fitnessHistory: number[] = [globalBestFitness];
    let converged = false;
    let iteration = 0;

    // Main optimization loop
    for (iteration = 0; iteration < maxIterations; iteration++) {
      const previousBest = globalBestFitness;

      // Update each particle
      for (const particle of particles) {
        this.updateVelocity(particle, globalBest);
        this.updatePosition(particle, agentCount);

        // Evaluate new position
        const fitness = fitnessFunction(this.discretize(particle.position, agentCount));

        // Update personal best
        if (fitness > particle.personalBestFitness) {
          particle.personalBestFitness = fitness;
          particle.personalBest = [...particle.position];

          // Update global best
          if (fitness > globalBestFitness) {
            globalBestFitness = fitness;
            globalBest = [...particle.personalBest];
          }
        }
      }

      fitnessHistory.push(globalBestFitness);

      // Check convergence
      const improvement = Math.abs(globalBestFitness - previousBest);
      if (improvement < convergenceThreshold && iteration > 10) {
        converged = true;
        break;
      }
    }

    return {
      bestSolution: this.discretize(globalBest, agentCount),
      bestFitness: globalBestFitness,
      converged,
      iterations: iteration + 1,
      fitnessHistory,
    };
  }

  /**
   * Initialize the particle swarm with random positions
   */
  private initializeSwarm(
    populationSize: number,
    dimensions: number,
    agentCount: number
  ): Particle[] {
    const particles: Particle[] = [];

    for (let i = 0; i < populationSize; i++) {
      const position = Array.from({ length: dimensions }, () => Math.random() * agentCount);
      const velocity = Array.from({ length: dimensions }, () => (Math.random() - 0.5) * 2);

      particles.push({
        position,
        velocity,
        personalBest: [...position],
        personalBestFitness: -Infinity,
      });
    }

    return particles;
  }

  /**
   * Update particle velocity based on PSO equations
   */
  private updateVelocity(particle: Particle, globalBest: number[]): void {
    const { inertiaWeight, cognitiveWeight, socialWeight, velocityClamp } = this.config;

    for (let d = 0; d < particle.position.length; d++) {
      const r1 = Math.random();
      const r2 = Math.random();

      // PSO velocity update equation
      const cognitive = cognitiveWeight * r1 * (particle.personalBest[d] - particle.position[d]);
      const social = socialWeight * r2 * (globalBest[d] - particle.position[d]);

      particle.velocity[d] = inertiaWeight * particle.velocity[d] + cognitive + social;

      // Clamp velocity
      particle.velocity[d] = Math.max(
        -velocityClamp,
        Math.min(velocityClamp, particle.velocity[d])
      );
    }
  }

  /**
   * Update particle position
   */
  private updatePosition(particle: Particle, agentCount: number): void {
    for (let d = 0; d < particle.position.length; d++) {
      particle.position[d] += particle.velocity[d];

      // Clamp to valid range [0, agentCount)
      particle.position[d] = Math.max(0, Math.min(agentCount - 0.001, particle.position[d]));
    }
  }

  /**
   * Convert continuous positions to discrete agent indices
   */
  private discretize(position: number[], agentCount: number): number[] {
    return position.map((p) => Math.floor(Math.max(0, Math.min(agentCount - 1, p))));
  }

  /**
   * Get recommended population size for problem
   */
  getRecommendedPopulation(problemSize: number): number {
    // Heuristic: 10-50 particles based on problem size
    return Math.min(50, Math.max(10, Math.ceil(problemSize * 1.5)));
  }
}
