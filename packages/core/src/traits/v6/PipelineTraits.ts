/**
 * @holoscript/core v6 Universal Pipeline Traits
 *
 * Trait handlers for data pipelines, message streams, task queues,
 * workers, and job schedulers.
 *
 * @example
 * ```hsplus
 * object "DataIngestion" {
 *   @pipeline {
 *     name: "UserEvents"
 *     stages: ["validate", "transform", "store"]
 *   }
 *
 *   @stream {
 *     source: "kafka://events"
 *     consumer_group: "ingestion-v1"
 *   }
 *
 *   @queue {
 *     name: "email-queue"
 *     backend: "redis"
 *     max_retries: 3
 *   }
 *
 *   @scheduler {
 *     name: "cleanup"
 *     cron: "0 2 * * *"
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── Pipeline Trait ─────────────────────────────────────────────────────────────

export type PipelineMode = 'sequential' | 'parallel' | 'fan_out' | 'fan_in';

export interface PipelineConfig {
  /** Pipeline name */
  name: string;
  /** Ordered stage names */
  stages: string[];
  /** Execution mode */
  mode: PipelineMode;
  /** Error handling strategy */
  on_error: 'stop' | 'skip' | 'retry' | 'dead_letter';
  /** Max concurrent executions */
  concurrency: number;
  /** Pipeline timeout (ms) */
  timeout: number;
  /** Enable pipeline metrics */
  metrics: boolean;
}

interface PipelineState {
  config: PipelineConfig;
  executions: number;
  errors: number;
  stageMetrics: Map<string, { count: number; avgDuration: number; errors: number }>;
}

export const pipelineHandler: TraitHandler<PipelineConfig> = {
  name: 'pipeline',
  defaultConfig: {
    name: '',
    stages: [],
    mode: 'sequential',
    on_error: 'stop',
    concurrency: 1,
    timeout: 60000,
    metrics: true,
  },
  onAttach(node: HSPlusNode, config: PipelineConfig, context: TraitContext) {
    node.__pipelineState = {
      config,
      executions: 0,
      errors: 0,
      stageMetrics: new Map(),
    };
    context.emit?.('pipeline_attached', {
      nodeId: node.id,
      name: config.name,
      stages: config.stages,
      mode: config.mode,
    });
  },
  onDetach(node: HSPlusNode, _config: PipelineConfig, context: TraitContext) {
    const state = node.__pipelineState as PipelineState | undefined;
    if (!state) return;
    context.emit?.('pipeline_detached', {
      nodeId: node.id,
      name: state.config.name,
      executions: state.executions,
      errors: state.errors,
    });
    delete node.__pipelineState;
  },
};

// ── Stream Trait ───────────────────────────────────────────────────────────────

export type StreamBackend = 'kafka' | 'rabbitmq' | 'redis_streams' | 'nats' | 'pulsar' | 'sqs';

export interface StreamConfig {
  /** Stream source URI */
  source: string;
  /** Stream backend */
  backend: StreamBackend;
  /** Consumer group name */
  consumer_group: string;
  /** Start from position */
  start_from: 'earliest' | 'latest' | 'timestamp';
  /** Batch size for consuming */
  batch_size: number;
  /** Commit strategy */
  commit: 'auto' | 'manual';
  /** Deserialization format */
  deserialize: 'json' | 'avro' | 'protobuf' | 'raw';
}

interface StreamState {
  config: StreamConfig;
  connected: boolean;
  messagesConsumed: number;
  offsets: Map<string, number>;
}

export const streamHandler: TraitHandler<StreamConfig> = {
  name: 'stream',
  defaultConfig: {
    source: '',
    backend: 'kafka',
    consumer_group: '',
    start_from: 'latest',
    batch_size: 100,
    commit: 'auto',
    deserialize: 'json',
  },
  onAttach(node: HSPlusNode, config: StreamConfig, context: TraitContext) {
    node.__streamState = {
      config,
      connected: false,
      messagesConsumed: 0,
      offsets: new Map(),
    };
    context.emit?.('stream_attached', {
      nodeId: node.id,
      source: config.source,
      backend: config.backend,
      consumerGroup: config.consumer_group,
    });
  },
  onDetach(node: HSPlusNode, _config: StreamConfig, context: TraitContext) {
    const state = node.__streamState as StreamState | undefined;
    if (!state) return;
    context.emit?.('stream_detached', {
      nodeId: node.id,
      source: state.config.source,
      messagesConsumed: state.messagesConsumed,
    });
    delete node.__streamState;
  },
};

// ── Queue Trait ────────────────────────────────────────────────────────────────

export interface QueueConfig {
  /** Queue name */
  name: string;
  /** Queue backend */
  backend: 'redis' | 'rabbitmq' | 'sqs' | 'bullmq' | 'memory';
  /** Max retry attempts */
  max_retries: number;
  /** Retry delay (ms) */
  retry_delay: number;
  /** Job timeout (ms) */
  job_timeout: number;
  /** Dead letter queue name */
  dead_letter_queue: string;
  /** Priority queue support */
  priority: boolean;
  /** Max queue size (0 = unlimited) */
  max_size: number;
}

interface QueueState {
  config: QueueConfig;
  jobs: Array<{ id: string; payload: unknown; attempts: number; priority?: number }>;
  processed: number;
  failed: number;
}

export const queueHandler: TraitHandler<QueueConfig> = {
  name: 'queue',
  defaultConfig: {
    name: '',
    backend: 'redis',
    max_retries: 3,
    retry_delay: 1000,
    job_timeout: 30000,
    dead_letter_queue: '',
    priority: false,
    max_size: 0,
  },
  onAttach(node: HSPlusNode, config: QueueConfig, context: TraitContext) {
    node.__queueState = {
      config,
      jobs: [],
      processed: 0,
      failed: 0,
    };
    context.emit?.('queue_attached', {
      nodeId: node.id,
      name: config.name,
      backend: config.backend,
    });
  },
  onDetach(node: HSPlusNode, _config: QueueConfig, context: TraitContext) {
    const state = node.__queueState as QueueState | undefined;
    if (!state) return;
    context.emit?.('queue_detached', {
      nodeId: node.id,
      name: state.config.name,
      pending: state.jobs.length,
      processed: state.processed,
      failed: state.failed,
    });
    delete node.__queueState;
  },
};

// ── Worker Trait ───────────────────────────────────────────────────────────────

export interface WorkerConfig {
  /** Worker name */
  name: string;
  /** Queue to consume from */
  queue: string;
  /** Concurrent job processing */
  concurrency: number;
  /** Worker group for scaling */
  group: string;
  /** Heartbeat interval (ms) */
  heartbeat: number;
  /** Graceful shutdown timeout (ms) */
  shutdown_timeout: number;
}

interface WorkerState {
  config: WorkerConfig;
  activeJobs: number;
  totalProcessed: number;
  lastHeartbeat: number;
}

export const workerHandler: TraitHandler<WorkerConfig> = {
  name: 'worker',
  defaultConfig: {
    name: '',
    queue: '',
    concurrency: 1,
    group: 'default',
    heartbeat: 30000,
    shutdown_timeout: 10000,
  },
  onAttach(node: HSPlusNode, config: WorkerConfig, context: TraitContext) {
    node.__workerState = {
      config,
      activeJobs: 0,
      totalProcessed: 0,
      lastHeartbeat: Date.now(),
    };
    context.emit?.('worker_attached', {
      nodeId: node.id,
      name: config.name,
      queue: config.queue,
      concurrency: config.concurrency,
      group: config.group,
    });
  },
  onDetach(node: HSPlusNode, _config: WorkerConfig, context: TraitContext) {
    const state = node.__workerState as WorkerState | undefined;
    if (!state) return;
    context.emit?.('worker_detached', {
      nodeId: node.id,
      name: state.config.name,
      totalProcessed: state.totalProcessed,
      activeJobs: state.activeJobs,
    });
    delete node.__workerState;
  },
};

// ── Scheduler Trait ───────────────────────────────────────────────────────────

export interface SchedulerConfig {
  /** Job name */
  name: string;
  /** Cron expression */
  cron: string;
  /** Timezone for cron evaluation */
  timezone: string;
  /** Prevent overlapping executions */
  no_overlap: boolean;
  /** Max execution time (ms) */
  timeout: number;
  /** Job payload */
  payload: Record<string, unknown>;
  /** Enable job (false = paused) */
  enabled: boolean;
}

interface SchedulerState {
  config: SchedulerConfig;
  executions: number;
  failures: number;
  lastRun: number | null;
}

export const schedulerHandler: TraitHandler<SchedulerConfig> = {
  name: 'scheduler',
  defaultConfig: {
    name: '',
    cron: '',
    timezone: 'UTC',
    no_overlap: true,
    timeout: 300000,
    payload: {},
    enabled: true,
  },
  onAttach(node: HSPlusNode, config: SchedulerConfig, context: TraitContext) {
    node.__schedulerState = {
      config,
      executions: 0,
      failures: 0,
      lastRun: null,
    };
    context.emit?.('scheduler_attached', {
      nodeId: node.id,
      name: config.name,
      cron: config.cron,
      enabled: config.enabled,
    });
  },
  onDetach(node: HSPlusNode, _config: SchedulerConfig, context: TraitContext) {
    const state = node.__schedulerState as SchedulerState | undefined;
    if (!state) return;
    context.emit?.('scheduler_detached', {
      nodeId: node.id,
      name: state.config.name,
      executions: state.executions,
      failures: state.failures,
    });
    delete node.__schedulerState;
  },
};
