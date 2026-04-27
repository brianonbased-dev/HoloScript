/**
 * Narupa Orchestrator v1.0
 * Multi-agent coordination for VR-based drug discovery
 * Supports dependency graphs, HITL gates, parallel execution, fallbacks, and retries
 */

import { EventEmitter } from 'events';
import { NarupaProcessManager } from './narupa-process-manager';
import { MolecularDynamicsConfig, NarupaServerStatus } from './types';

/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WAITING_HITL = 'waiting_hitl',
  RETRYING = 'retrying',
}

/**
 * Task configuration
 */
export interface Task {
  id: string;
  name: string;
  type: 'simulation' | 'docking' | 'analysis' | 'visualization';
  config: MolecularDynamicsConfig;
  dependencies?: string[]; // Task IDs that must complete first
  hitlGate?: boolean; // Require human-in-the-loop approval
  fallback?: Task; // Fallback task if this fails
  maxRetries?: number; // Max retry attempts
  parallel?: boolean; // Can run in parallel with siblings
  capability?: string[]; // Required capabilities
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  serverId?: number;
  port?: number;
  startTime: Date;
  endTime?: Date;
  error?: Error;
  retryCount: number;
  hitlApproved?: boolean;
}

/**
 * Dependency graph node
 */
interface GraphNode {
  task: Task;
  result: TaskResult;
  children: GraphNode[];
  parents: GraphNode[];
}

/**
 * HITL gate callback
 */
export type HITLCallback = (task: Task, result: Partial<TaskResult>) => Promise<boolean>;

/**
 * Narupa Orchestrator
 * Coordinates multi-agent molecular dynamics simulations
 */
export class NarupaOrchestrator extends EventEmitter {
  private processManager: NarupaProcessManager;
  private tasks: Map<string, GraphNode> = new Map();
  private results: Map<string, TaskResult> = new Map();
  private hitlCallback: HITLCallback | null = null;
  private maxParallel: number = 4;
  private runningTasks: number = 0;

  constructor(processManager?: NarupaProcessManager, maxParallel: number = 4) {
    super();
    this.processManager = processManager || new NarupaProcessManager();
    this.maxParallel = maxParallel;
  }

  /**
   * Set HITL callback for human-in-the-loop gates
   */
  setHITLCallback(callback: HITLCallback): void {
    this.hitlCallback = callback;
  }

  /**
   * Add a task to the orchestration graph
   */
  addTask(task: Task): void {
    const node: GraphNode = {
      task,
      result: {
        taskId: task.id,
        status: TaskStatus.PENDING,
        startTime: new Date(),
        retryCount: 0,
      },
      children: [],
      parents: [],
    };

    this.tasks.set(task.id, node);
    this.results.set(task.id, node.result);
  }

  /**
   * Build dependency graph from tasks
   */
  private buildDependencyGraph(): void {
    // Link parent-child relationships
    for (const [id, node] of this.tasks.entries()) {
      if (node.task.dependencies) {
        for (const depId of node.task.dependencies) {
          const parentNode = this.tasks.get(depId);
          if (parentNode) {
            node.parents.push(parentNode);
            parentNode.children.push(node);
          } else {
            throw new Error(`Dependency not found: ${depId} for task ${id}`);
          }
        }
      }
    }
  }

  /**
   * Get tasks ready to execute (dependencies met, capacity available)
   */
  private getReadyTasks(): GraphNode[] {
    const ready: GraphNode[] = [];

    for (const node of this.tasks.values()) {
      if (node.result.status !== TaskStatus.PENDING) {
        continue;
      }

      // Check if all dependencies are completed
      const depsComplete = node.parents.every(
        (parent) => parent.result.status === TaskStatus.COMPLETED
      );

      if (depsComplete) {
        // Check capability requirements
        if (this.hasRequiredCapabilities(node.task)) {
          ready.push(node);
        }
      }
    }

    return ready;
  }

  /**
   * Check if system has required capabilities for task
   */
  private hasRequiredCapabilities(task: Task): boolean {
    if (!task.capability || task.capability.length === 0) {
      return true;
    }

    // For now, assume all capabilities available
    // In production, check against process manager capabilities
    return true;
  }

  /**
   * Execute a single task
   */
  private async executeTask(node: GraphNode): Promise<void> {
    const { task } = node;
    const result = node.result;

    try {
      // Update status
      result.status = TaskStatus.RUNNING;
      this.emit('task-started', task);

      // Initialize process manager if needed
      if (!this.processManager.isRunning()) {
        await this.processManager.initialize();
      }

      // Start Narupa server
      const serverStatus = await this.processManager.startServer({
        pdbPath: task.config.protein,
        port: 0, // Auto-assign
        mdEngine: task.config.mdEngine,
        temperature: task.config.temperature,
        timestep: task.config.timestep,
        steps: task.config.steps,
      });

      result.serverId = serverStatus.pid;
      result.port = serverStatus.port;

      // HITL gate check
      if (task.hitlGate) {
        result.status = TaskStatus.WAITING_HITL;
        this.emit('hitl-required', task, result);

        if (this.hitlCallback) {
          const approved = await this.hitlCallback(task, result);
          result.hitlApproved = approved;

          if (!approved) {
            throw new Error('HITL gate rejected');
          }
        } else {
          throw new Error('HITL gate required but no callback set');
        }

        result.status = TaskStatus.RUNNING;
      }

      // Wait for simulation to complete
      // In real implementation, monitor server status
      await this.waitForCompletion(serverStatus.pid, task.config.steps || 100000);

      // Mark as completed
      result.status = TaskStatus.COMPLETED;
      result.endTime = new Date();
      this.emit('task-completed', task, result);
    } catch (error) {
      const err = error as Error;
      result.error = err;

      // Handle retries
      if (task.maxRetries && result.retryCount < task.maxRetries) {
        result.retryCount++;
        result.status = TaskStatus.RETRYING;
        this.emit('task-retrying', task, result);

        // Retry after delay
        await new Promise((resolve) => setTimeout(resolve, 1000 * result.retryCount));
        return this.executeTask(node);
      }

      // Handle fallback
      if (task.fallback) {
        this.emit('task-fallback', task, result);
        const fallbackNode: GraphNode = {
          task: task.fallback,
          result: {
            taskId: task.fallback.id,
            status: TaskStatus.PENDING,
            startTime: new Date(),
            retryCount: 0,
          },
          children: node.children, // Inherit children
          parents: node.parents,
        };

        this.tasks.set(task.fallback.id, fallbackNode);
        this.results.set(task.fallback.id, fallbackNode.result);
        return this.executeTask(fallbackNode);
      }

      // Mark as failed
      result.status = TaskStatus.FAILED;
      result.endTime = new Date();
      this.emit('task-failed', task, result, err);

      throw err;
    } finally {
      this.runningTasks--;
    }
  }

  /**
   * Wait for simulation completion
   */
  private async waitForCompletion(serverId: number, steps: number): Promise<void> {
    // Estimate completion time (rough approximation)
    const estimatedSeconds = steps / 1000; // Assume 1000 steps/second
    await new Promise((resolve) => setTimeout(resolve, estimatedSeconds * 1000));

    // Poll server status
    const status = await this.processManager.getServerStatus(serverId);
    if (!status || !status.running) {
      throw new Error(`Server ${serverId} stopped unexpectedly`);
    }
  }

  /**
   * Execute all tasks with dependency management and parallelization
   */
  async executeAll(): Promise<Map<string, TaskResult>> {
    this.buildDependencyGraph();
    this.emit('orchestration-started', {
      totalTasks: this.tasks.size,
      maxParallel: this.maxParallel,
    });

    const executionQueue: Promise<void>[] = [];

    while (this.hasIncompleteTasks()) {
      const readyTasks = this.getReadyTasks();

      // Execute ready tasks up to parallel limit
      for (const node of readyTasks) {
        if (this.runningTasks >= this.maxParallel) {
          break; // Wait for slots to free up
        }

        this.runningTasks++;
        const taskPromise = this.executeTask(node);
        executionQueue.push(taskPromise);

        // If not parallel, wait for completion
        if (!node.task.parallel) {
          await taskPromise;
        }
      }

      // Wait for at least one task to complete before checking again
      if (executionQueue.length > 0) {
        await Promise.race(executionQueue);
      } else if (this.hasIncompleteTasks()) {
        // No ready tasks but still incomplete - likely waiting on dependencies or HITL
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Wait for all remaining tasks
    await Promise.allSettled(executionQueue);

    this.emit('orchestration-completed', this.results);
    return this.results;
  }

  /**
   * Check if there are incomplete tasks
   */
  private hasIncompleteTasks(): boolean {
    for (const result of this.results.values()) {
      if (
        result.status === TaskStatus.PENDING ||
        result.status === TaskStatus.RUNNING ||
        result.status === TaskStatus.WAITING_HITL ||
        result.status === TaskStatus.RETRYING
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Run parallel docking simulations (helper method)
   */
  async runParallelDocking(configs: MolecularDynamicsConfig[]): Promise<Map<string, TaskResult>> {
    configs.forEach((config, i) => {
      this.addTask({
        id: `docking_${i}`,
        name: `Docking ${i + 1}`,
        type: 'docking',
        config,
        parallel: true,
      });
    });

    return this.executeAll();
  }

  /**
   * Run sequential pipeline with HITL gates
   */
  async runPipelineWithHITL(tasks: Task[]): Promise<Map<string, TaskResult>> {
    // Add tasks with sequential dependencies
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (i > 0) {
        task.dependencies = [tasks[i - 1].id];
      }
      this.addTask(task);
    }

    return this.executeAll();
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    await this.processManager.shutdown();
    this.tasks.clear();
    this.results.clear();
    this.runningTasks = 0;
    this.emit('cleanup-completed');
  }

  /**
   * Get task result
   */
  getResult(taskId: string): TaskResult | undefined {
    return this.results.get(taskId);
  }

  /**
   * Get all results
   */
  getAllResults(): Map<string, TaskResult> {
    return new Map(this.results);
  }

  /**
   * Get task statistics
   */
  getStatistics(): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
  } {
    let completed = 0;
    let failed = 0;
    let pending = 0;
    let running = 0;

    for (const result of this.results.values()) {
      switch (result.status) {
        case TaskStatus.COMPLETED:
          completed++;
          break;
        case TaskStatus.FAILED:
          failed++;
          break;
        case TaskStatus.PENDING:
          pending++;
          break;
        case TaskStatus.RUNNING:
        case TaskStatus.RETRYING:
        case TaskStatus.WAITING_HITL:
          running++;
          break;
      }
    }

    return {
      total: this.results.size,
      completed,
      failed,
      pending,
      running,
    };
  }
}
