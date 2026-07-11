/**
 * uAAL ⇄ HoloMesh transport — the production adapter that makes uAAL's peer opcodes
 * (CALL_NODE / OP_OFFLOAD / OP_SYNC) real ACROSS the fleet, so an agent's uAAL program on one
 * node can call / offload to / sync with another (cloud seat ⇄ Jetson Brittney ⇄ laptop).
 * This is "fleet agents communicating with each other at the language level"
 * (`@holoscript/uaal/src/mesh-transport.ts`), which ships only the interface + an in-process
 * router — the real cross-machine binding is intentionally left to an edge/agent package (here),
 * so `@holoscript/uaal` stays dependency-free.
 *
 * TRANSPORT REALITY (mapped, not assumed): the HoloMesh has **no synchronous agent-addressed
 * RPC**. The only cross-machine primitive is the async team-message feed (`sendTeamMessage` →
 * `POST /team/:id/message`, `getTeamMessages` → `GET /team/:id/messages`), hub-relayed through
 * `mcp.holoscript.net`. That hub-relay is exactly what makes cloud↔Jetson work WITHOUT direct
 * LAN reach: both sides poll the same hub; neither has to be reachable by the other. The price:
 *   - `request()` is send + correlation-id + poll-for-reply + timeout — MULTI-SECOND latency,
 *     never millisecond RPC. Callers must treat it as such.
 *   - BOTH ends must be actively polling: the caller for its reply, the callee via {@link MeshNode}.
 *   - the feed is best-effort (in-memory, LRU on the hub) — a reply can scroll past `pollLimit`
 *     under heavy traffic; `request()` fails CLOSED (throws on timeout) rather than hanging.
 *
 * Correlation rides in the message CONTENT (a JSON {@link MeshEnvelope}), not headers/subject,
 * so it survives the `TeamMessage` shape unchanged.
 */
import type { MeshTransport, MeshRequestHandler, UAALOperand } from '@holoscript/uaal';

/** The minimal HoloMesh messaging surface the transport needs — `HolomeshClient` satisfies it. */
export interface MeshMessaging {
  sendTeamMessage(content: string, messageType?: string): Promise<void>;
  getTeamMessages(limit?: number): Promise<Array<{ content: string; createdAt?: string }>>;
}

/** The wire envelope, carried in a team message's content. */
export interface MeshEnvelope {
  v: 1;
  kind: 'mesh-call' | 'mesh-reply' | 'mesh-offload' | 'mesh-sync';
  cid: string;
  from: string;
  to: string; // node handle, or '*' for sync
  payload: UAALOperand;
}

/** messageType tag so the feed is coarse-filterable and human-scannable. */
const MESH_TAG = 'uaal-mesh';

function parseEnvelope(content: string): MeshEnvelope | null {
  try {
    const e = JSON.parse(content) as MeshEnvelope;
    return e && e.v === 1 && typeof e.kind === 'string' && typeof e.cid === 'string' && typeof e.to === 'string'
      ? e
      : null;
  } catch {
    return null;
  }
}

export interface HolomeshMeshTransportOptions {
  mesh: MeshMessaging;
  /** This node's mesh identity (e.g. the agent handle). */
  selfNode: string;
  pollIntervalMs?: number; // default 1500
  requestTimeoutMs?: number; // default 45000
  pollLimit?: number; // messages fetched per poll, default 50
  // ── deterministic seams (tests) ──
  genId?: () => string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Caller side. `request()` implements CALL_NODE over the async feed; `offload()` is OP_OFFLOAD
 * (fire-and-forget); `sync()` is OP_SYNC (broadcast). Wire it onto a VM with the uAAL
 * `registerMeshHandlers(vm, transport)`.
 */
export class HolomeshMeshTransport implements MeshTransport {
  readonly selfNode: string;
  private readonly mesh: MeshMessaging;
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly pollLimit: number;
  private readonly genId: () => string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: HolomeshMeshTransportOptions) {
    this.mesh = opts.mesh;
    this.selfNode = opts.selfNode;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1500;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 45000;
    this.pollLimit = opts.pollLimit ?? 50;
    this.genId =
      opts.genId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async request(toNode: string, payload: UAALOperand): Promise<UAALOperand> {
    const cid = this.genId();
    await this.send('mesh-call', cid, toNode, payload);
    const deadline = this.now() + this.requestTimeoutMs;
    while (this.now() < deadline) {
      await this.sleep(this.pollIntervalMs);
      const msgs = await this.mesh.getTeamMessages(this.pollLimit).catch(() => []);
      for (const m of msgs) {
        const e = parseEnvelope(m.content);
        if (e && e.kind === 'mesh-reply' && e.cid === cid && e.to === this.selfNode) {
          return e.payload;
        }
      }
    }
    throw new Error(
      `uaal-mesh: request to '${toNode}' timed out after ${this.requestTimeoutMs}ms (cid ${cid})`,
    );
  }

  async offload(toNode: string, payload: UAALOperand): Promise<void> {
    await this.send('mesh-offload', this.genId(), toNode, payload);
  }

  async sync(payload: UAALOperand): Promise<void> {
    await this.send('mesh-sync', this.genId(), '*', payload);
  }

  private async send(kind: MeshEnvelope['kind'], cid: string, to: string, payload: UAALOperand): Promise<void> {
    const env: MeshEnvelope = { v: 1, kind, cid, from: this.selfNode, to, payload };
    await this.mesh.sendTeamMessage(JSON.stringify(env), MESH_TAG);
  }
}

export interface MeshNodeOptions {
  mesh: MeshMessaging;
  /** The handle other nodes address in CALL_NODE / OP_OFFLOAD (e.g. 'brittney'). */
  selfNode: string;
  /** Answer a CALL_NODE: `(from, payload) => reply`. This is where Brittney's op-dispatch lives. */
  onRequest: MeshRequestHandler;
  /** Optional OP_OFFLOAD sink (fire-and-forget work). */
  onOffload?: (from: string, payload: unknown) => void | Promise<void>;
  pollLimit?: number;
}

/**
 * Callee side. Poll the mesh for envelopes addressed to `selfNode`, run the handler, and post
 * the reply (correlated by `cid`). Idempotent per cid so a re-poll of the same feed never
 * double-serves. Drive `poll()` from the node's own tick loop (e.g. the AgentRunner tick, or a
 * dedicated interval on the Brittney process). This is how a node ANSWERS uaal CALL_NODE.
 */
export class MeshNode {
  private readonly served = new Set<string>();
  private readonly mesh: MeshMessaging;
  private readonly selfNode: string;
  private readonly onRequest: MeshRequestHandler;
  private readonly onOffload?: (from: string, payload: unknown) => void | Promise<void>;
  private readonly pollLimit: number;

  constructor(opts: MeshNodeOptions) {
    this.mesh = opts.mesh;
    this.selfNode = opts.selfNode;
    this.onRequest = opts.onRequest;
    this.onOffload = opts.onOffload;
    this.pollLimit = opts.pollLimit ?? 50;
  }

  /** One drain: handle pending calls/offloads addressed to this node. Returns the count handled. */
  async poll(): Promise<number> {
    const msgs = await this.mesh.getTeamMessages(this.pollLimit).catch(() => []);
    let handled = 0;
    for (const m of msgs) {
      const e = parseEnvelope(m.content);
      if (!e || e.to !== this.selfNode || this.served.has(e.cid)) continue;

      if (e.kind === 'mesh-call') {
        this.served.add(e.cid);
        let reply: UAALOperand;
        try {
          reply = await this.onRequest(e.from, e.payload);
        } catch (err) {
          reply = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        const replyEnv: MeshEnvelope = {
          v: 1,
          kind: 'mesh-reply',
          cid: e.cid,
          from: this.selfNode,
          to: e.from,
          payload: reply,
        };
        await this.mesh.sendTeamMessage(JSON.stringify(replyEnv), MESH_TAG);
        handled++;
      } else if (e.kind === 'mesh-offload') {
        this.served.add(e.cid);
        if (this.onOffload) await this.onOffload(e.from, e.payload);
        handled++;
      }
    }
    // Bound the dedup memory for a long-running node (best-effort; a re-served old cid is harmless
    // for idempotent ops and the feed's own LRU makes ancient cids unreachable anyway).
    if (this.served.size > 5000) this.served.clear();
    return handled;
  }
}
