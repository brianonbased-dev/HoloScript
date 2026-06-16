/**
 * @EdgeNode — sovereign edge node trait
 *
 * Marks a composition as a persistent edge agent: claims board tasks tagged
 * for this node, runs them local-first, escalates to the fleet on failure.
 * Drives the EdgeCompiler's board-claim loop and local-first dispatch config.
 *
 * Usage:
 *   traits ["edge_node", "sovereign_agent"]   // in .hsplus compositions
 *   @EdgeNode                                 // in .holo/.hs objects
 */

export interface EdgeNodeConfig {
  /** Agent handle on HoloMesh (e.g. "jetson-orin-01") */
  handle?: string;
  /** Domain tag used for task routing (e.g. "robotics-edge") */
  domain?: string;
  /** Capability tags for board task matching */
  capabilityTags?: string[];
  /** HoloMesh board URL (defaults to prod orchestrator) */
  boardUrl?: string;
  /** Interval between board poll ticks in seconds (default: 10) */
  tickIntervalS?: number;
  /** Max consecutive failures before entering degraded mode (default: 5) */
  maxConsecutiveFailures?: number;
  /** Whether to escalate unfinished tasks to fleet on failure (default: true) */
  escalateOnFailure?: boolean;
  /** Tags to skip (e.g. ["frontier-only"]) */
  avoidTags?: string[];
}

export interface EdgeNodeState {
  handle: string;
  domain: string;
  status: 'idle' | 'running' | 'degraded' | 'offline';
  cycles: number;
  tasksClaimed: number;
  tasksDone: number;
  tasksFailed: number;
  consecutiveFailures: number;
  lastTickAt: number | null;
}

export const EDGE_NODE_DEFAULTS: Required<EdgeNodeConfig> = {
  handle: 'holoscript-edge-node',
  domain: 'edge',
  capabilityTags: ['edge-node', 'local-inference'],
  boardUrl: 'https://mcp-orchestrator-production-45f9.up.railway.app',
  tickIntervalS: 10,
  maxConsecutiveFailures: 5,
  escalateOnFailure: true,
  avoidTags: ['frontier-only'],
};

export function resolveEdgeNodeConfig(params?: Partial<EdgeNodeConfig>): Required<EdgeNodeConfig> {
  return { ...EDGE_NODE_DEFAULTS, ...params };
}

export function initialEdgeNodeState(config: Required<EdgeNodeConfig>): EdgeNodeState {
  return {
    handle: config.handle,
    domain: config.domain,
    status: 'idle',
    cycles: 0,
    tasksClaimed: 0,
    tasksDone: 0,
    tasksFailed: 0,
    consecutiveFailures: 0,
    lastTickAt: null,
  };
}
