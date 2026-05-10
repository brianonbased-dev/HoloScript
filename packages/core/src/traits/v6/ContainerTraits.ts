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

interface ContainerState {
  config: ContainerConfig;
}

export const containerHandler: TraitHandler<ContainerConfig> = {
  name: 'container',
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
  onAttach(node: HSPlusNode, config: ContainerConfig, context: TraitContext) {
    node.__containerState = { config };
    context.emit?.('container_attached', {
      nodeId: node.id,
      image: config.image,
      port: config.port,
      workdir: config.workdir,
    });
  },
  onDetach(node: HSPlusNode, _config: ContainerConfig, context: TraitContext) {
    const state = node.__containerState as ContainerState | undefined;
    if (!state) return;
    context.emit?.('container_detached', {
      nodeId: node.id,
      image: state.config.image,
    });
    delete node.__containerState;
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

interface DeploymentState {
  config: DeploymentConfig;
}

export const deploymentHandler: TraitHandler<DeploymentConfig> = {
  name: 'deployment',
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
  onAttach(node: HSPlusNode, config: DeploymentConfig, context: TraitContext) {
    node.__deploymentState = { config };
    context.emit?.('deployment_attached', {
      nodeId: node.id,
      replicas: config.replicas,
      strategy: config.strategy,
      region: config.region,
      namespace: config.namespace,
    });
  },
  onDetach(node: HSPlusNode, _config: DeploymentConfig, context: TraitContext) {
    const state = node.__deploymentState as DeploymentState | undefined;
    if (!state) return;
    context.emit?.('deployment_detached', {
      nodeId: node.id,
      replicas: state.config.replicas,
      strategy: state.config.strategy,
    });
    delete node.__deploymentState;
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

interface ScalingState {
  config: ScalingConfig;
  currentReplicas: number;
}

export const scalingHandler: TraitHandler<ScalingConfig> = {
  name: 'scaling',
  defaultConfig: {
    metric: 'cpu',
    target: 70,
    min_replicas: 1,
    max_replicas: 10,
    scale_up_cooldown: 60,
    scale_down_cooldown: 300,
    custom_query: '',
  },
  onAttach(node: HSPlusNode, config: ScalingConfig, context: TraitContext) {
    node.__scalingState = { config, currentReplicas: config.min_replicas };
    context.emit?.('scaling_attached', {
      nodeId: node.id,
      metric: config.metric,
      target: config.target,
      minReplicas: config.min_replicas,
      maxReplicas: config.max_replicas,
    });
  },
  onDetach(node: HSPlusNode, _config: ScalingConfig, context: TraitContext) {
    const state = node.__scalingState as ScalingState | undefined;
    if (!state) return;
    context.emit?.('scaling_detached', {
      nodeId: node.id,
      metric: state.config.metric,
      currentReplicas: state.currentReplicas,
    });
    delete node.__scalingState;
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

interface SecretState {
  config: SecretConfig;
  resolved: boolean;
  value: string | null;
}

export const secretHandler: TraitHandler<SecretConfig> = {
  name: 'secret',
  defaultConfig: {
    name: '',
    source: 'env',
    key: '',
    mount_as: '',
    rotation_interval: 0,
    required: true,
  },
  onAttach(node: HSPlusNode, config: SecretConfig, context: TraitContext) {
    let value: string | null = null;
    if (config.source === 'env' && config.key) {
      value = process.env[config.key] || null;
    }
    node.__secretState = { config, resolved: value !== null, value };
    if (config.required && value === null) {
      context.emit?.('secret_missing', {
        nodeId: node.id,
        name: config.name,
        source: config.source,
        key: config.key,
      });
    } else {
      context.emit?.('secret_attached', {
        nodeId: node.id,
        name: config.name,
        source: config.source,
        mountAs: config.mount_as,
        resolved: value !== null,
      });
    }
  },
  onDetach(node: HSPlusNode, _config: SecretConfig, context: TraitContext) {
    const state = node.__secretState as SecretState | undefined;
    if (!state) return;
    context.emit?.('secret_detached', {
      nodeId: node.id,
      name: state.config.name,
      resolved: state.resolved,
    });
    delete node.__secretState;
  },
};
