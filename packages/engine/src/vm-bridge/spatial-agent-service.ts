/**
 * Spatial Agent Service
 *
 * The missing service/lifecycle layer over the proven vm-bridge primitives
 * (`SpatialCognitiveAgent`, `captureSceneSnapshot`, `applyActions`) and the
 * `@holoscript/uaal` 7-phase VM.
 *
 * Responsibilities:
 *   - `spawnAgent()`  — compile/accept a uAAL program, wire a
 *                       SpatialCognitiveAgent to the shared ECSWorld, register it.
 *   - `despawnAgent()` — clean up the agent's body entity + unregister.
 *   - `tickAll(nowMs)` — drive every live agent's perceive→decide→mutate cycle,
 *                        throttled per-agent by its cognitiveHz, callable from
 *                        the 60fps HoloVM frame loop.
 *
 * This is the destination for marketplace-acquired agent templates: Studio
 * acquires a uAAL program (intent or bytecode) and hands it to `spawnAgent`,
 * after which the agent participates in the next `tickAll` cycle.
 *
 * @packageDocumentation
 */

import type { ECSWorld } from '../vm/executor';
import type { UAALVirtualMachine, UAALBytecode, UAALCompiler } from '@holoscript/uaal';
import { createRequire } from 'node:module';

import { SpatialCognitiveAgent, type CognitiveTickResult } from './bridge';
import { InMemoryAgentRegistry, type IAgentRegistry, type RegisteredAgent } from './agent-registry';

// ---------------------------------------------------------------------------
// Lazy optional-peer loader for @holoscript/uaal
//
// Mirrors the pattern in bridge.ts: @holoscript/uaal is an OPTIONAL
// peerDependency, so we resolve it on first use and fail with an actionable
// message if absent — failing-on-use, not on-load — to keep the engine barrel
// loadable without the peer installed.
// ---------------------------------------------------------------------------

interface UaalModule {
  UAALVirtualMachine: typeof import('@holoscript/uaal').UAALVirtualMachine;
  UAALCompiler: typeof import('@holoscript/uaal').UAALCompiler;
}

let _uaal: UaalModule | undefined;

function getRequire(): NodeRequire {
  if (typeof require !== 'undefined') {
    return require;
  }
  return createRequire(import.meta.url);
}

function lazyUaal(): UaalModule {
  if (_uaal === undefined) {
    try {
      const req = getRequire();
      _uaal = req('@holoscript/uaal') as UaalModule;
    } catch {
      throw new Error(
        "SpatialAgentService requires the optional peer dependency '@holoscript/uaal', which is not installed. " +
          'Install it (e.g. `npm install @holoscript/uaal`) to spawn spatial cognitive agents.'
      );
    }
  }
  return _uaal;
}

// =============================================================================
// SPAWN CONFIG
// =============================================================================

/**
 * Template config a marketplace install (or any caller) passes to spawn a
 * spatial agent. Exactly one of `intent` / `bytecode` is required.
 */
export interface SpawnAgentConfig {
  /** Optional explicit id; auto-generated when omitted. */
  id?: string;
  /** Display / template name. */
  name?: string;
  /** Natural-language or DSL intent, compiled to bytecode via UAALCompiler. */
  intent?: string;
  /** Pre-compiled uAAL bytecode (takes precedence over `intent`). */
  bytecode?: UAALBytecode;
  /** Cognitive cycle frequency in Hz (default 2). */
  cognitiveHz?: number;
  /** Capability tags carried from the template (discovery/delegation). */
  capabilities?: string[];
  /**
   * Spawn a body entity in the ECS world for this agent and record its id.
   * Defaults to true. The body is despawned on `despawnAgent`.
   */
  spawnBody?: boolean;
  /** Pass-through VM options. */
  enableLogging?: boolean;
}

/**
 * Shape emitted by the Studio marketplace `onAgentInstalled` callback
 * (`AgentMarketplaceTab` / `MarketplaceClient.installAgent`). Bridging this to
 * a {@link SpawnAgentConfig} is what wires marketplace acquisition to a live
 * agent — see {@link spawnConfigFromMarketplaceInstall}.
 */
export interface MarketplaceInstallResult {
  templateId: string;
  templateName: string;
  /** uAAL program — either an intent string or serialized bytecode JSON. */
  program: string;
  programType: 'intent' | 'bytecode';
  config: { cognitiveHz: number; capabilities: string[] };
}

/**
 * Map a marketplace install result to a {@link SpawnAgentConfig}.
 *
 * `programType: 'intent'`   → `intent` string (service compiles it).
 * `programType: 'bytecode'` → `program` is parsed as serialized UAALBytecode JSON.
 */
export function spawnConfigFromMarketplaceInstall(
  result: MarketplaceInstallResult
): SpawnAgentConfig {
  const base: SpawnAgentConfig = {
    id: result.templateId,
    name: result.templateName,
    cognitiveHz: result.config?.cognitiveHz ?? 2,
    capabilities: result.config?.capabilities ?? [],
  };

  if (result.programType === 'bytecode') {
    let parsed: UAALBytecode;
    try {
      parsed = JSON.parse(result.program) as UAALBytecode;
    } catch (err) {
      throw new Error(
        `[spatial-agent-service] marketplace bytecode program is not valid JSON for template ${result.templateId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    return { ...base, bytecode: parsed };
  }

  return { ...base, intent: result.program };
}

// =============================================================================
// SERVICE
// =============================================================================

export interface SpatialAgentServiceConfig {
  /** Inject a custom registry. Defaults to an in-memory registry. */
  registry?: IAgentRegistry;
  /** Default cognitive Hz applied when a spawn config omits it. */
  defaultCognitiveHz?: number;
}

let _autoIdSeq = 0;

export class SpatialAgentService {
  private readonly world: ECSWorld;
  private readonly registry: IAgentRegistry;
  private readonly defaultCognitiveHz: number;
  private readonly compiler: UAALCompiler;

  constructor(world: ECSWorld, config: SpatialAgentServiceConfig = {}) {
    const { UAALCompiler } = lazyUaal();
    this.world = world;
    this.registry = config.registry ?? new InMemoryAgentRegistry();
    this.defaultCognitiveHz = config.defaultCognitiveHz ?? 2;
    this.compiler = new UAALCompiler();
  }

  /**
   * Spawn a spatial cognitive agent: compile/accept its program, create the
   * bridge instance against the shared world, optionally give it a body
   * entity, and register it. Returns the registered agent record.
   */
  spawnAgent(config: SpawnAgentConfig): RegisteredAgent {
    const { UAALVirtualMachine } = lazyUaal();

    const id = config.id ?? `spatial-agent-${Date.now()}-${_autoIdSeq++}`;
    if (this.registry.has(id)) {
      throw new Error(`[spatial-agent-service] agent id already live: ${id}`);
    }

    // Resolve the program: explicit bytecode wins, else compile the intent,
    // else leave undefined (agent falls back to the default 7-phase cycle).
    let program: UAALBytecode | undefined;
    if (config.bytecode) {
      program = config.bytecode;
    } else if (config.intent) {
      program = this.compiler.compileIntent(config.intent);
    }

    const cognitiveHz = config.cognitiveHz ?? this.defaultCognitiveHz;
    const vm: UAALVirtualMachine = new UAALVirtualMachine({
      enableLogging: config.enableLogging ?? false,
    });

    const agent = new SpatialCognitiveAgent(this.world, vm, {
      cognitiveHz,
      enableLogging: config.enableLogging ?? false,
      program,
    });

    // Optionally give the agent a body entity in the world.
    let bodyEntityId: number | undefined;
    if (config.spawnBody !== false) {
      bodyEntityId = this.world.spawn(config.name ?? id);
    }

    const entry: RegisteredAgent = {
      id,
      name: config.name ?? id,
      agent,
      cognitiveHz,
      capabilities: config.capabilities ?? [],
      bodyEntityId,
      spawnedAt: Date.now(),
    };
    this.registry.register(entry);
    return entry;
  }

  /**
   * Despawn an agent: remove its body entity from the world and unregister it.
   * Returns true if an agent was removed.
   */
  despawnAgent(id: string): boolean {
    const entry = this.registry.unregister(id);
    if (!entry) return false;
    if (entry.bodyEntityId !== undefined) {
      this.world.despawn(entry.bodyEntityId);
    }
    return true;
  }

  /**
   * Drive every live agent one frame. Each agent self-throttles to its own
   * cognitiveHz inside `tick`, so this is safe to call every 60fps frame.
   * Returns the per-agent tick results keyed by agent id.
   */
  async tickAll(nowMs: number): Promise<Map<string, CognitiveTickResult>> {
    const results = new Map<string, CognitiveTickResult>();
    // Snapshot the list so a despawn mid-loop (rare) can't corrupt iteration.
    for (const entry of this.registry.list()) {
      const result = await entry.agent.tick(nowMs);
      results.set(entry.id, result);
    }
    return results;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getRegistry(): IAgentRegistry {
    return this.registry;
  }

  getAgent(id: string): RegisteredAgent | undefined {
    return this.registry.get(id);
  }

  listAgents(): RegisteredAgent[] {
    return this.registry.list();
  }

  get agentCount(): number {
    return this.registry.size;
  }
}
