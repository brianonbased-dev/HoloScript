import * as THREE from 'three';

/** Authoritative world-state shape read from the world-state source. */
export interface WorldStateSource {
  transform?: {
    position?: { x?: number; y?: number; z?: number };
    /** Facing yaw in radians (rotation about Y). Optional — body keeps its yaw if absent. */
    rotation?: { y?: number };
  };
  /** Agent activity / animation intent, e.g. 'idle' | 'walk' | 'speak'. Drives subtle body feedback. */
  state?: string;
  /** Display label (agent name) — surfaced for HUDs; the tracker itself only stores it. */
  label?: string;
  /** Explicit body colour override; else a deterministic colour is derived from entityId. */
  color?: number;
}

/**
 * Deterministic vivid colour from an entity id, so distinct agents read as
 * distinct bodies in a shared scene without any per-agent config (D.094: the
 * body is entity-generic, parameterised by id). Same id → same colour, always.
 */
export function colourForEntity(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) h = (h * 31 + entityId.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.72, 0.56).getHex();
}

/** Shortest-arc angular lerp (radians) so facing turns the short way. */
function lerpAngle(from: number, to: number, t: number): number {
  const tau = Math.PI * 2;
  let d = (((to - from) % tau) + tau) % tau;
  if (d > Math.PI) d -= tau;
  return from + d * t;
}

export interface AgentAvatarOptions {
  /** Entity id this body tracks (drives `/api/world-state/<entityId>` by default). */
  entityId: string;
  /** Body colour + glow (default cyan 0x22d3ee). Ignored if bodyFactory is given. */
  color?: number;
  /** Poll interval in ms for authoritative state (default 1000 — gentle). */
  pollMs?: number;
  /** Per-frame lerp factor toward the latest target (default 0.15). */
  lerpAlpha?: number;
  /** Override the state source. Default: fetch /api/world-state/<entityId>. */
  fetchState?: (entityId: string) => Promise<WorldStateSource | null>;
  /** Provide a custom body (e.g. an animated/VRM mesh) instead of the sphere. */
  bodyFactory?: (scene: THREE.Scene) => THREE.Object3D;
}

async function defaultFetchState(entityId: string): Promise<WorldStateSource | null> {
  try {
    const res = await fetch(`/api/world-state/${encodeURIComponent(entityId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as WorldStateSource;
  } catch {
    return null;
  }
}

/**
 * AgentAvatarTracker — NPC embodiment for raw three.js.
 *
 * Adds a body to the scene and tracks an entity's authoritative world position:
 * an agent drives the entity (e.g. via push_portal_intent / a world-drive
 * route), this polls that state and lerps the body toward it every frame, so the
 * agent's decision becomes a moving body in the headset. Smooth at any poll rate
 * because the lerp runs in the (XR-aware) render loop. Extracted from studio
 * ImmersiveViewer; the default body is the glowing cyan sphere.
 */
export class AgentAvatarTracker {
  private readonly scene: THREE.Scene;
  private readonly body: THREE.Object3D;
  private readonly target = new THREE.Vector3(0, 0.25, -2);
  private targetYaw = 0;
  private activity = '';
  private label: string;
  private readonly lerpAlpha: number;
  private interval: ReturnType<typeof setInterval> | null = null;
  private cancelled = false;
  private readonly ownsBody: boolean;
  private geom?: THREE.BufferGeometry;
  private mat?: THREE.Material;

  constructor(opts: AgentAvatarOptions & { scene: THREE.Scene }) {
    this.scene = opts.scene;
    this.lerpAlpha = opts.lerpAlpha ?? 0.15;
    this.label = opts.entityId;
    const pollMs = opts.pollMs ?? 1000;
    const fetchState = opts.fetchState ?? defaultFetchState;

    if (opts.bodyFactory) {
      this.body = opts.bodyFactory(opts.scene);
      this.ownsBody = false;
    } else {
      // No explicit colour → derive a distinct colour from the id so multiple
      // agents in one scene are visually separable (D.094).
      const colour = opts.color ?? colourForEntity(opts.entityId);
      this.geom = new THREE.SphereGeometry(0.45, 32, 32);
      this.mat = new THREE.MeshStandardMaterial({
        color: colour,
        emissive: colour,
        emissiveIntensity: 1.6,
        roughness: 0.25,
      });
      const mesh = new THREE.Mesh(this.geom, this.mat);
      mesh.name = `agent:${opts.entityId}`;
      mesh.position.set(0, 0.25, -2);
      this.body = mesh;
      this.ownsBody = true;
      opts.scene.add(mesh);
    }

    const poll = async (): Promise<void> => {
      const state = await fetchState(opts.entityId);
      if (this.cancelled || !state) return;
      const p = state.transform?.position;
      if (p && typeof p.x === 'number') {
        this.target.set(
          p.x,
          typeof p.y === 'number' ? p.y : 0.25,
          typeof p.z === 'number' ? p.z : -2
        );
      }
      const ry = state.transform?.rotation?.y;
      if (typeof ry === 'number') this.targetYaw = ry;
      if (typeof state.state === 'string') this.activity = state.state;
      if (typeof state.label === 'string') this.label = state.label;
    };
    void poll();
    this.interval = setInterval(() => {
      if (!this.cancelled) void poll();
    }, pollMs);
  }

  /**
   * Lerp the body toward the latest authoritative target — position + facing,
   * plus a subtle emissive pulse while the agent's state is 'speak'. Call once
   * per frame. Custom (bodyFactory) bodies get position + yaw; the speak pulse
   * only touches the tracker's own sphere material.
   */
  update(alpha?: number): void {
    const a = alpha ?? this.lerpAlpha;
    this.body.position.lerp(this.target, a);
    this.body.rotation.y = lerpAngle(this.body.rotation.y, this.targetYaw, a);
    if (this.ownsBody && this.mat) {
      const m = this.mat as THREE.MeshStandardMaterial;
      const targetIntensity = this.activity === 'speak' ? 2.8 : 1.6;
      m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, targetIntensity, 0.12);
    }
  }

  getBody(): THREE.Object3D {
    return this.body;
  }

  /** Latest display label (agent name), defaulting to the entity id. */
  getLabel(): string {
    return this.label;
  }

  /** Latest activity/animation intent string ('idle' | 'walk' | 'speak' | …). */
  getActivity(): string {
    return this.activity;
  }

  dispose(): void {
    this.cancelled = true;
    if (this.interval) clearInterval(this.interval);
    this.scene.remove(this.body);
    if (this.ownsBody) {
      this.geom?.dispose();
      this.mat?.dispose();
    }
  }
}
