/**
 * Agent Registry
 *
 * Lifecycle bookkeeping for spatial cognitive agents. The registry is the
 * "who is live" index that {@link SpatialAgentService} maintains: register on
 * spawn, unregister on despawn, list/iterate during `tickAll`.
 *
 * Kept deliberately small and storage-agnostic (an in-memory Map by default)
 * so it can be swapped for a persistent / federated index later without
 * touching the service.
 *
 * @packageDocumentation
 */

import type { SpatialCognitiveAgent } from './bridge';

/**
 * Metadata + live handle for one registered spatial agent.
 */
export interface RegisteredAgent {
  /** Stable agent id (registry key). */
  id: string;
  /** Human-readable name / template name. */
  name: string;
  /** The live perceive→decide→mutate bridge instance. */
  agent: SpatialCognitiveAgent;
  /** Cognitive cycle frequency this agent ticks at. */
  cognitiveHz: number;
  /** Capability tags carried from the template (for discovery/delegation). */
  capabilities: string[];
  /** Root entity id this agent owns in the ECS world, if any. */
  bodyEntityId?: number;
  /** Wall-clock ms the agent was registered. */
  spawnedAt: number;
}

/**
 * Registry contract — the lifecycle index over live spatial agents.
 */
export interface IAgentRegistry {
  /** Register an agent. Throws if `id` is already registered. */
  register(entry: RegisteredAgent): void;
  /** Unregister an agent by id. Returns the removed entry, or undefined. */
  unregister(id: string): RegisteredAgent | undefined;
  /** Look up a registered agent by id. */
  get(id: string): RegisteredAgent | undefined;
  /** True if an agent with this id is registered. */
  has(id: string): boolean;
  /** Snapshot list of all registered agents. */
  list(): RegisteredAgent[];
  /** Number of registered agents. */
  readonly size: number;
}

/**
 * Default in-memory registry backed by a Map.
 */
export class InMemoryAgentRegistry implements IAgentRegistry {
  private readonly agents = new Map<string, RegisteredAgent>();

  register(entry: RegisteredAgent): void {
    if (this.agents.has(entry.id)) {
      throw new Error(`[agent-registry] agent already registered: ${entry.id}`);
    }
    this.agents.set(entry.id, entry);
  }

  unregister(id: string): RegisteredAgent | undefined {
    const entry = this.agents.get(id);
    if (entry) this.agents.delete(id);
    return entry;
  }

  get(id: string): RegisteredAgent | undefined {
    return this.agents.get(id);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  get size(): number {
    return this.agents.size;
  }
}
