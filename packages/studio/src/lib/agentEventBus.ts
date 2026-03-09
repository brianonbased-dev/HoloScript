/**
 * agentEventBus.ts
 *
 * In-memory typed event bus for multi-agent HoloScript scenes.
 * Pure TypeScript, no DOM — usable in Node.js vitest and in-browser.
 *
 * Consumed by the ai-orchestration-builder.scenario.ts living-spec tests.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentEvent<T = unknown> {
  id: string; // uuid-style unique per event
  topic: string; // routing key
  payload: T; // arbitrary data
  senderId: string; // which agent sent it
  timestamp: number; // performance.now() or Date.now() in Node
  receivedBy: string[]; // filled in as subscribers handle it
}

export type EventHandler<T = unknown> = (event: AgentEvent<T>) => void;

// ── AgentEventBus ─────────────────────────────────────────────────────────────

export class AgentEventBus {
  private subscribers = new Map<string, Set<EventHandler>>();
  private history: AgentEvent[] = [];
  private deadLetters: AgentEvent[] = [];
  private _idCounter = 0;

  /** Publish an event. Returns the event object (with auto-generated id + timestamp). */
  publish<T>(topic: string, payload: T, senderId = 'anonymous'): AgentEvent<T> {
    const event: AgentEvent<T> = {
      id: `evt_${++this._idCounter}_${Date.now()}`,
      topic,
      payload,
      senderId,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      receivedBy: [],
    };

    this.history.push(event as AgentEvent);

    const handlers = this.subscribers.get(topic);
    if (!handlers || handlers.size === 0) {
      this.deadLetters.push(event as AgentEvent);
    } else {
      for (const handler of handlers) {
        handler(event as AgentEvent);
      }
    }

    return event;
  }

  /**
   * Subscribe to a topic.
   * Returns an unsubscribe function.
   */
  subscribe<T>(topic: string, handler: EventHandler<T>): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(handler as EventHandler);

    return () => {
      this.subscribers.get(topic)?.delete(handler as EventHandler);
    };
  }

  /** Returns all events for a topic, ordered by timestamp (ascending). */
  getEvents(topic: string): AgentEvent[] {
    return this.history.filter((e) => e.topic === topic).sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Returns all events regardless of topic, ordered by timestamp. */
  getAllEvents(): AgentEvent[] {
    return [...this.history].sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Returns events that found no subscribers (dead letters). */
  getDeadLetters(): AgentEvent[] {
    return [...this.deadLetters];
  }

  /** Replays all historical events for a topic, re-firing them to current subscribers. */
  replay(topic: string): void {
    const events = this.getEvents(topic);
    const handlers = this.subscribers.get(topic);
    if (!handlers) return;
    for (const event of events) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  /** Clears all history and subscriptions. */
  reset(): void {
    this.subscribers.clear();
    this.history = [];
    this.deadLetters = [];
    this._idCounter = 0;
  }

  /** Returns the number of active subscriptions across all topics. */
  get subscriberCount(): number {
    let count = 0;
    for (const set of this.subscribers.values()) count += set.size;
    return count;
  }
}

// ── Agent Registry ────────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  model: string; // e.g. 'llama3', 'gpt-4o', 'rule-based'
  goal: string; // plain-English objective
  memoryKb: number; // allowed context size in KB
  decisionStrategy: 'bfs' | 'llm' | 'rule' | 'reactive';
  perceptionRange: number; // meters (simulated)
}

export class AgentRegistry {
  private agents = new Map<string, AgentConfig>();

  /** Spawn a new agent. Returns the agent ID. */
  spawn(config: Omit<AgentConfig, 'id'> & { id?: string }): string {
    const id = config.id ?? `agent_${this.agents.size + 1}_${Date.now()}`;
    this.agents.set(id, { ...config, id });
    return id;
  }

  get(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  getAll(): AgentConfig[] {
    return [...this.agents.values()];
  }

  count(): number {
    return this.agents.size;
  }

  /** Returns true if all agent IDs are unique (invariant check). */
  hasUniqueIds(): boolean {
    return this.agents.size === new Set(this.agents.keys()).size;
  }

  reset(): void {
    this.agents.clear();
  }
}

// ── Flocking Math (Boids) ─────────────────────────────────────────────────────

export interface Boid {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
}

export function applyFlockingRules(
  boid: Boid,
  neighbors: Boid[],
  params = { separation: 25, alignment: 8, cohesion: 1 }
): [number, number, number] {
  const sep: [number, number, number] = [0, 0, 0];
  const align: [number, number, number] = [0, 0, 0];
  const coh: [number, number, number] = [0, 0, 0];

  for (const n of neighbors) {
    const dx = boid.position[0] - n.position[0];
    const dy = boid.position[1] - n.position[1];
    const dz = boid.position[2] - n.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    // separation
    sep[0] += dx / dist;
    sep[1] += dy / dist;
    sep[2] += dz / dist;

    // alignment
    align[0] += n.velocity[0];
    align[1] += n.velocity[1];
    align[2] += n.velocity[2];

    // cohesion
    coh[0] += n.position[0];
    coh[1] += n.position[1];
    coh[2] += n.position[2];
  }

  const n = neighbors.length || 1;

  // Average cohesion, then steer toward center
  const cohSteer: [number, number, number] = [
    (coh[0] / n - boid.position[0]) * 0.001,
    (coh[1] / n - boid.position[1]) * 0.001,
    (coh[2] / n - boid.position[2]) * 0.001,
  ];

  return [
    boid.velocity[0] +
      sep[0] * params.separation * 0.001 +
      (align[0] / n) * params.alignment * 0.001 +
      cohSteer[0] * params.cohesion,
    boid.velocity[1] +
      sep[1] * params.separation * 0.001 +
      (align[1] / n) * params.alignment * 0.001 +
      cohSteer[1] * params.cohesion,
    boid.velocity[2] +
      sep[2] * params.separation * 0.001 +
      (align[2] / n) * params.alignment * 0.001 +
      cohSteer[2] * params.cohesion,
  ];
}
