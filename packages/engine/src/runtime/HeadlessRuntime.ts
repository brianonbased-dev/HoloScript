/**
 * Headless Runtime for CLI operations
 * Provides headless execution without VR/UI dependencies
 */

    // @ts-expect-error migration TS2307
import type { HSPlusAST } from '@holoscript/core';
    // @ts-expect-error migration TS2307
import type { HostCapabilities } from '@holoscript/core';

export interface HeadlessRuntimeOptions {
  profile?: RuntimeProfile;
  tickRate?: number;
  debug?: boolean;
  hostCapabilities?: HostCapabilities;
}

export interface RuntimeProfile {
  name: string;
  renderer: 'headless' | 'webgl' | 'webgpu';
  features: {
    physics: boolean;
    audio: boolean;
    networking: boolean;
  };
}

export const HEADLESS_PROFILE: RuntimeProfile = {
  name: 'headless',
  renderer: 'headless',
  features: {
    physics: false,
    audio: false,
    networking: false,
  },
};

const PROFILES: Record<string, RuntimeProfile> = {
  headless: HEADLESS_PROFILE,
  minimal: {
    name: 'minimal',
    renderer: 'headless',
    features: {
      physics: true,
      audio: false,
      networking: false,
    },
  },
  full: {
    name: 'full',
    renderer: 'webgl',
    features: {
      physics: true,
      audio: true,
      networking: true,
    },
  },
};

export function getProfile(profileName: string): RuntimeProfile {
  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unknown profile: ${profileName}`);
  }
  return profile;
}

export type ActionHandler = (
  params: Record<string, unknown>,
  blackboard: Record<string, unknown>,
  context: { emit: (event: string, payload?: unknown) => void; hostCapabilities?: HostCapabilities }
) => Promise<boolean> | boolean;

export interface HeadlessRuntime {
  start(): void;
  stop(): void;
  tick(): void;
  getStats(): RuntimeStats;
  getState(key: string): unknown;
  setState(key: string, value: unknown): void;
  getAllState(): Record<string, unknown>;
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  registerAction(name: string, handler: ActionHandler): void;
}

export interface RuntimeStats {
  tickCount: number;
  uptime: number;
  nodesProcessed: number;
}

class HeadlessRuntimeImpl implements HeadlessRuntime {
  private ast: HSPlusAST;
  private options: HeadlessRuntimeOptions;
  private running = false;
  private tickCount = 0;
  private startTime = 0;
  private intervalId?: NodeJS.Timeout;
  private state = new Map<string, unknown>();
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  private actionRegistry = new Map<string, ActionHandler>();

  constructor(ast: HSPlusAST, options: HeadlessRuntimeOptions = {}) {
    this.ast = ast;
    this.options = options;
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();

    // Debug logging removed per lint rules

    // Start tick loop
    if (this.options.tickRate && this.options.tickRate > 0) {
      const interval = 1000 / this.options.tickRate;
      this.intervalId = setInterval(() => this.tick(), interval);
    }
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Debug logging removed per lint rules
  }

  tick(): void {
    if (!this.running) return;

    this.tickCount++;

    // Process AST nodes (simplified)
    // In a real implementation, this would execute the scene graph
    // Debug logging removed per lint rules
  }

  getStats(): RuntimeStats {
    return {
      tickCount: this.tickCount,
      uptime: this.running ? Date.now() - this.startTime : 0,
      nodesProcessed: this.ast?.body?.length || 0,
    };
  }

  getState(key: string): unknown {
    return this.state.get(key);
  }

  setState(key: string, value: unknown): void {
    this.state.set(key, value);
  }

  getAllState(): Record<string, unknown> {
    return Object.fromEntries(this.state);
  }

  emit(event: string, payload?: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch {
          // best effort
        }
      }
    }

    if (event.startsWith('action:') && event !== 'action:result') {
      const actionName = event.slice(7);
      const actionHandler = this.actionRegistry.get(actionName);
      if (!actionHandler) return;

      const p = (payload ?? {}) as Record<string, unknown>;
      const requestId = p.requestId as string | undefined;
      const params = (p.params as Record<string, unknown>) ?? {};
      const blackboard = (p.blackboard as Record<string, unknown>) ?? {};

      Promise.resolve(
        actionHandler(params, blackboard, {
          emit: this.emit.bind(this),
          hostCapabilities: this.options.hostCapabilities,
        })
      )
        .then((success) => {
          this.emit('action:result', {
            requestId,
            status: success ? 'success' : 'failure',
            success,
          });
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.emit('action:result', {
            requestId,
            status: 'failure',
            success: false,
            error: message,
          });
        });
    }
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  registerAction(name: string, handler: ActionHandler): void {
    this.actionRegistry.set(name, handler);
  }
}

export function createHeadlessRuntime(
  ast: HSPlusAST,
  options: HeadlessRuntimeOptions = {}
): HeadlessRuntime {
  return new HeadlessRuntimeImpl(ast, options);
}
