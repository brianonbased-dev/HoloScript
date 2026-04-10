/**
 * Swarm Coordinator
 *
 * Implements ISwarmCoordinator interface for agent-task optimization.
 * Supports PSO, ACO, and hybrid algorithms.
 */

import type { ISwarmConfig, ISwarmResult, ISwarmCoordinator } from '@holoscript/core';
import { PSOEngine } from './PSOEngine';
import { ACOEngine } from './ACOEngine';

export interface AgentInfo {
  id: string;
  capacity: number;
  load: number;
}

export interface TaskInfo {
  id: string;
  complexity: number;
  priority: number;
}

const DEFAULT_CONFIG: ISwarmConfig = {
  algorithm: 'hybrid',
  populationSize: 30,
  maxIterations: 100,
  convergenceThreshold: 0.001,
  adaptiveSizing: true,
};

/**
 * Main swarm coordinator for multi-agent task optimization
 */
export class SwarmCoordinator implements ISwarmCoordinator {
  private psoEngine: PSOEngine;
  private acoEngine: ACOEngine;
  private defaultConfig: ISwarmConfig;

  constructor(config: Partial<ISwarmConfig> = {}) {
    this.defaultConfig = { ...DEFAULT_CONFIG, ...config };
    this.psoEngine = new PSOEngine({
      populationSize: this.defaultConfig.populationSize,
      maxIterations: this.defaultConfig.maxIterations,
      convergenceThreshold: this.defaultConfig.convergenceThreshold,
    });
    this.acoEngine = new ACOEngine({
      antCount: this.defaultConfig.populationSize,
      maxIterations: this.defaultConfig.maxIterations,
      convergenceThreshold: this.defaultConfig.convergenceThreshold,
    });
  }

  /**
   * Optimize agent-task assignment
   *
   * Uses PSO to find optimal task-to-agent mapping that:
   * - Balances load across agents
   * - Respects capacity constraints
   * - Prioritizes high-priority tasks
   * - Minimizes complexity/load mismatch
   */
  async optimize(
    agents: AgentInfo[],
    tasks: TaskInfo[],
    config?: Partial<ISwarmConfig>
  ): Promise<ISwarmResult> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const { algorithm, adaptiveSizing, populationSize } = mergedConfig;

    // Adjust population if adaptive sizing enabled
    const problemSize = agents.length * tasks.length;
    const effectivePopulation = adaptiveSizing
      ? this.getRecommendedPopulation(problemSize)
      : populationSize;

    // Create fitness function based on assignment quality
    const fitnessFunction = this.createFitnessFunction(agents, tasks);

    // Choose algorithm
    if (algorithm === 'pso' || algorithm === 'hybrid') {
      // Use PSO for assignment optimization
      const psoEngine = new PSOEngine({
        populationSize: effectivePopulation,
        maxIterations: mergedConfig.maxIterations,
        convergenceThreshold: mergedConfig.convergenceThreshold,
      });

      const psoResult = await psoEngine.optimize(agents.length, tasks.length, fitnessFunction);

      // For hybrid, optionally refine with ACO if not converged
      if (algorithm === 'hybrid' && !psoResult.converged) {
        const acoRefinement = await this.refineWithACO(
          psoResult.bestSolution,
          agents,
          tasks,
          mergedConfig
        );

        if (acoRefinement.bestFitness > psoResult.bestFitness) {
          return this.formatResult(acoRefinement.bestSolution, acoRefinement, agents, tasks);
        }
      }

      return this.formatResult(psoResult.bestSolution, psoResult, agents, tasks);
    }

    if (algorithm === 'aco') {
      // Use ACO - create distance matrix from task complexity/agent capacity
      const distanceMatrix = this.createDistanceMatrix(agents, tasks);
      const acoResult = await this.acoEngine.optimize(tasks.length, distanceMatrix);

      // Convert path to assignment (using modular agent mapping)
      const assignment = acoResult.bestPath.map((_, i) => i % agents.length);

      return {
        bestSolution: assignment,
        bestFitness: 1 / (acoResult.bestCost + 1),
        converged: acoResult.converged,
        iterations: acoResult.iterations,
        improvementPercent: this.calculateImprovement(assignment, fitnessFunction),
      };
    }

    if (algorithm === 'bees') {
      // Bees algorithm - simplified implementation using modified PSO
      const beesEngine = new PSOEngine({
        populationSize: Math.floor((effectivePopulation ?? 30) * 0.5), // Scout bees
        maxIterations: mergedConfig.maxIterations,
        convergenceThreshold: mergedConfig.convergenceThreshold,
        inertiaWeight: 0.5, // Less inertia for local search
        cognitiveWeight: 2.0, // Stronger local attraction
        socialWeight: 1.0,
      });

      const beesResult = await beesEngine.optimize(agents.length, tasks.length, fitnessFunction);

      return this.formatResult(beesResult.bestSolution, beesResult, agents, tasks);
    }

    // Fallback to PSO
    const result = await this.psoEngine.optimize(agents.length, tasks.length, fitnessFunction);

    return this.formatResult(result.bestSolution, result, agents, tasks);
  }

  /**
   * Get recommended population size based on problem complexity
   */
  getRecommendedPopulation(problemSize: number): number {
    // Logarithmic scaling with min/max bounds
    const base = Math.ceil(10 * Math.log2(problemSize + 1));
    return Math.min(100, Math.max(15, base));
  }

  /**
   * Create fitness function for task assignment
   */
  private createFitnessFunction(
    agents: AgentInfo[],
    tasks: TaskInfo[]
  ): (assignment: number[]) => number {
    return (assignment: number[]): number => {
      let fitness = 0;
      const agentLoads = new Map<number, number>();

      // Initialize agent loads
      for (let i = 0; i < agents.length; i++) {
        agentLoads.set(i, agents[i].load);
      }

      // Evaluate each task assignment
      for (let taskIdx = 0; taskIdx < tasks.length; taskIdx++) {
        const agentIdx = assignment[taskIdx];
        if (agentIdx < 0 || agentIdx >= agents.length) {
          fitness -= 100; // Penalty for invalid assignment
          continue;
        }

        const agent = agents[agentIdx];
        const task = tasks[taskIdx];
        const currentLoad = agentLoads.get(agentIdx) ?? 0;
        const newLoad = currentLoad + task.complexity;

        // Capacity check
        if (newLoad > agent.capacity) {
          fitness -= 10 * (newLoad - agent.capacity); // Capacity violation penalty
        } else {
          // Reward for valid assignment
          fitness += task.priority; // Prioritize high-priority tasks

          // Reward for good capacity utilization (sweet spot at 70-90%)
          const utilization = newLoad / agent.capacity;
          if (utilization >= 0.7 && utilization <= 0.9) {
            fitness += 2;
          } else if (utilization < 0.3) {
            fitness -= 1; // Slight penalty for underutilization
          }
        }

        agentLoads.set(agentIdx, newLoad);
      }

      // Load balancing bonus - reward even distribution
      const loads = Array.from(agentLoads.values());
      const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
      const variance =
        loads.reduce((sum, load) => sum + Math.pow(load - avgLoad, 2), 0) / loads.length;
      const stdDev = Math.sqrt(variance);

      // Lower stdDev = better balance = higher fitness
      fitness += 10 / (1 + stdDev);

      return fitness;
    };
  }

  /**
   * Create distance matrix for ACO from agents/tasks
   */
  private createDistanceMatrix(agents: AgentInfo[], tasks: TaskInfo[]): number[][] {
    const n = tasks.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 0;
        } else {
          // Distance based on complexity difference and priority
          const complexityDiff = Math.abs(tasks[i].complexity - tasks[j].complexity);
          const priorityFactor = 1 / (tasks[j].priority + 1);
          matrix[i][j] = complexityDiff + priorityFactor;
        }
      }
    }

    return matrix;
  }

  /**
   * Refine PSO solution using ACO local search
   */
  private async refineWithACO(
    initialSolution: number[],
    agents: AgentInfo[],
    tasks: TaskInfo[],
    _config: ISwarmConfig
  ): Promise<{
    bestSolution: number[];
    bestFitness: number;
    converged: boolean;
    iterations: number;
  }> {
    const fitnessFunction = this.createFitnessFunction(agents, tasks);

    // Create local search neighborhood
    let bestSolution = [...initialSolution];
    let bestFitness = fitnessFunction(bestSolution);
    let iterations = 0;

    // Simple local search: try swapping assignments
    for (let i = 0; i < initialSolution.length; i++) {
      for (let agent = 0; agent < agents.length; agent++) {
        iterations++;
        if (agent !== initialSolution[i]) {
          const candidate = [...bestSolution];
          candidate[i] = agent;
          const candidateFitness = fitnessFunction(candidate);

          if (candidateFitness > bestFitness) {
            bestFitness = candidateFitness;
            bestSolution = candidate;
          }
        }
      }
    }

    return { bestSolution, bestFitness, converged: true, iterations };
  }

  /**
   * Format result with improvement percentage
   */
  private formatResult(
    solution: number[],
    engineResult: {
      bestFitness: number;
      converged: boolean;
      iterations: number;
      fitnessHistory?: number[];
    },
    agents: AgentInfo[],
    tasks: TaskInfo[]
  ): ISwarmResult {
    const fitnessFunction = this.createFitnessFunction(agents, tasks);

    // Calculate improvement over random assignment
    const randomAssignment = tasks.map(() => Math.floor(Math.random() * agents.length));
    const randomFitness = fitnessFunction(randomAssignment);

    const improvement =
      randomFitness > 0
        ? ((engineResult.bestFitness - randomFitness) / randomFitness) * 100
        : engineResult.bestFitness > 0
          ? 100
          : 0;

    return {
      bestSolution: solution,
      bestFitness: engineResult.bestFitness,
      converged: engineResult.converged,
      iterations: engineResult.iterations,
      improvementPercent: Math.max(0, improvement),
    };
  }

  /**
   * Calculate improvement over baseline
   */
  private calculateImprovement(
    solution: number[],
    fitnessFunction: (a: number[]) => number
  ): number {
    const solutionFitness = fitnessFunction(solution);

    // Generate random baseline
    const randomSolution = solution.map(() => Math.floor(Math.random() * solution.length));
    const randomFitness = fitnessFunction(randomSolution);

    if (randomFitness <= 0) return solutionFitness > 0 ? 100 : 0;
    return Math.max(0, ((solutionFitness - randomFitness) / randomFitness) * 100);
  }
}
