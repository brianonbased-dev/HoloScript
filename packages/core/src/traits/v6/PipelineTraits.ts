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
  onAttach(_node: HSPlusNode, _config: PipelineConfig, _context: TraitContext) {
    // v6 stub: pipeline registration
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
  onAttach(_node: HSPlusNode, _config: StreamConfig, _context: TraitContext) {
    // v6 stub: stream consumer setup
  },
  onDetach(_node: HSPlusNode, _config: StreamConfig, _context: TraitContext) {
    // v6 stub: graceful stream disconnect
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
  onAttach(_node: HSPlusNode, _config: QueueConfig, _context: TraitContext) {
    // v6 stub: queue setup
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
  onAttach(_node: HSPlusNode, _config: WorkerConfig, _context: TraitContext) {
    // v6 stub: worker registration and queue subscription
  },
  onDetach(_node: HSPlusNode, _config: WorkerConfig, _context: TraitContext) {
    // v6 stub: worker graceful shutdown
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
  onAttach(_node: HSPlusNode, _config: SchedulerConfig, _context: TraitContext) {
    // v6 stub: scheduler job registration
  },
};
