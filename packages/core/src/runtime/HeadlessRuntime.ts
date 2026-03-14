/**
 * Headless Runtime for CLI operations
 * Provides headless execution without VR/UI dependencies
 */

import type { HSPlusAST } from '../types/HoloScriptPlus';

export interface HeadlessRuntimeOptions {
  profile?: RuntimeProfile;
  tickRate?: number;
  debug?: boolean;
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

export interface HeadlessRuntime {
  start(): void;
  stop(): void;
  tick(): void;
  getStats(): RuntimeStats;
  getState(key: string): unknown;
  setState(key: string, value: unknown): void;
  getAllState(): Record<string, unknown>;
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

  constructor(ast: HSPlusAST, options: HeadlessRuntimeOptions = {}) {
    this.ast = ast;
    this.options = options;
  }

  start(): void {
    if (this.running) return;
    
    this.running = true;
    this.startTime = Date.now();
    
    if (this.options.debug) {
      console.log('[HeadlessRuntime] Starting with profile:', this.options.profile?.name);
    }

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

    if (this.options.debug) {
      console.log('[HeadlessRuntime] Stopped after', this.tickCount, 'ticks');
    }
  }

  tick(): void {
    if (!this.running) return;
    
    this.tickCount++;
    
    // Process AST nodes (simplified)
    // In a real implementation, this would execute the scene graph
    if (this.options.debug && this.tickCount % 100 === 0) {
      console.log(`[HeadlessRuntime] Tick ${this.tickCount}`);
    }
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
}

export function createHeadlessRuntime(
  ast: HSPlusAST, 
  options: HeadlessRuntimeOptions = {}
): HeadlessRuntime {
  return new HeadlessRuntimeImpl(ast, options);
}