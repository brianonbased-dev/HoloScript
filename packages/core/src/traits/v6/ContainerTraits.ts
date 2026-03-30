/**
 * @holoscript/core v6 Universal Container & Deployment Traits
 *
 * Trait handlers for container definitions, deployment configurations,
 * auto-scaling policies, and infrastructure as code.
 *
 * @example
 * ```hsplus
 * object "UserService" {
 *   @container {
 *     image: "node:20-alpine"
 *     port: 3000
 *     env: { NODE_ENV: "production" }
 *   }
 *
 *   @deployment {
 *     replicas: 3
 *     strategy: "rolling"
 *     region: "us-east-1"
 *   }
 *
 *   @scaling {
 *     metric: "cpu"
 *     target: 70
 *     min_replicas: 2
 *     max_replicas: 10
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── Container Trait ────────────────────────────────────────────────────────────

export interface ContainerConfig {
  /** Container image */
  image: string;
  /** Exposed port */
  port: number;
  /** Environment variables */
  env: Record<string, string>;
  /** Resource limits */
  cpu_limit: string;
  /** Memory limit */
  memory_limit: string;
  /** CPU request */
  cpu_request: string;
  /** Memory request */
  memory_request: string;
  /** Volume mounts (host:container) */
  volumes: string[];
  /** Entrypoint command */
  entrypoint: string[];
  /** Working directory */
  workdir: string;
}

export const containerHandler: TraitHandler<ContainerConfig> = {
  name: 'container' as any,
  defaultConfig: {
    image: 'node:20-alpine',
    port: 3000,
    env: {},
    cpu_limit: '500m',
    memory_limit: '512Mi',
    cpu_request: '100m',
    memory_request: '128Mi',
    volumes: [],
    entrypoint: [],
    workdir: '/app',
  },
  onAttach(_node: HSPlusNode, _config: ContainerConfig, _context: TraitContext) {
    // v6 stub: container spec generation
  },
};

// ── Deployment Trait ──────────────────────────────────────────────────────────

export type DeployStrategy = 'rolling' | 'blue_green' | 'canary' | 'recreate';

export interface DeploymentConfig {
  /** Number of replicas */
  replicas: number;
  /** Deployment strategy */
  strategy: DeployStrategy;
  /** Target region */
  region: string;
  /** Deployment namespace/environment */
  namespace: string;
  /** Max surge during rolling update */
  max_surge: number;
  /** Max unavailable during rolling update */
  max_unavailable: number;
  /** Revision history limit */
  revision_history: number;
  /** Deployment labels */
  labels: Record<string, string>;
}

export const deploymentHandler: TraitHandler<DeploymentConfig> = {
  name: 'deployment' as any,
  defaultConfig: {
    replicas: 1,
    strategy: 'rolling',
    region: '',
    namespace: 'default',
    max_surge: 1,
    max_unavailable: 0,
    revision_history: 10,
    labels: {},
  },
  onAttach(_node: HSPlusNode, _config: DeploymentConfig, _context: TraitContext) {
    // v6 stub: deployment manifest generation
  },
};

// ── Scaling Trait ──────────────────────────────────────────────────────────────

export type ScalingMetric = 'cpu' | 'memory' | 'requests_per_second' | 'queue_depth' | 'custom';

export interface ScalingConfig {
  /** Scaling metric */
  metric: ScalingMetric;
  /** Target value for the metric (percentage or absolute) */
  target: number;
  /** Minimum replicas */
  min_replicas: number;
  /** Maximum replicas */
  max_replicas: number;
  /** Scale-up cooldown (seconds) */
  scale_up_cooldown: number;
  /** Scale-down cooldown (seconds) */
  scale_down_cooldown: number;
  /** Custom metric query (when metric = custom) */
  custom_query: string;
}

export const scalingHandler: TraitHandler<ScalingConfig> = {
  name: 'scaling' as any,
  defaultConfig: {
    metric: 'cpu',
    target: 70,
    min_replicas: 1,
    max_replicas: 10,
    scale_up_cooldown: 60,
    scale_down_cooldown: 300,
    custom_query: '',
  },
  onAttach(_node: HSPlusNode, _config: ScalingConfig, _context: TraitContext) {
    // v6 stub: HPA/auto-scaler registration
  },
};

// ── Secret Trait ──────────────────────────────────────────────────────────────

export type SecretSource =
  | 'env'
  | 'vault'
  | 'aws_secrets_manager'
  | 'gcp_secret_manager'
  | 'kubernetes';

export interface SecretConfig {
  /** Secret name */
  name: string;
  /** Secret source backend */
  source: SecretSource;
  /** Secret path/key in the backend */
  key: string;
  /** Mount as environment variable name */
  mount_as: string;
  /** Auto-rotate interval (seconds, 0 = no rotation) */
  rotation_interval: number;
  /** Required (fail if missing) */
  required: boolean;
}

export const secretHandler: TraitHandler<SecretConfig> = {
  name: 'secret' as any,
  defaultConfig: {
    name: '',
    source: 'env',
    key: '',
    mount_as: '',
    rotation_interval: 0,
    required: true,
  },
  onAttach(_node: HSPlusNode, _config: SecretConfig, _context: TraitContext) {
    // v6 stub: secret resolution
  },
};
