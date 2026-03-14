/**
 * SmartProxyVRPreview.ts
 *
 * Lightweight proxy that mirrors VR scene state to a 2D preview window
 * for development. Uses WebSocket-based state synchronization, simplified
 * rendering, and camera controls so developers can observe and debug
 * VR experiences from a standard browser tab.
 *
 * Staging area file for Hololand integration (TODO-030).
 *
 * @version 1.0.0
 * @package hololand/preview
 */

// =============================================================================
// TYPES
// =============================================================================

/** Serializable 3D transform */
export interface Transform3D {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion xyzw
  scale: [number, number, number];
}

/** Serializable scene object state */
export interface SceneObjectState {
  id: string;
  name: string;
  transform: Transform3D;
  visible: boolean;
  meshType: string; // 'box', 'sphere', 'cylinder', 'mesh', etc.
  materialColor: [number, number, number, number]; // RGBA 0-1
  opacity: number;
  traits: string[];
  children: string[]; // child IDs
  /** Custom properties from HoloScript @state */
  userData: Record<string, unknown>;
}

/** Camera state for the VR headset */
export interface VRCameraState {
  headPosition: [number, number, number];
  headRotation: [number, number, number, number];
  leftEyeProjection: number[]; // 4x4 matrix flat
  rightEyeProjection: number[]; // 4x4 matrix flat
  fov: number;
  near: number;
  far: number;
}

/** Controller state */
export interface VRControllerState {
  hand: 'left' | 'right';
  position: [number, number, number];
  rotation: [number, number, number, number];
  buttons: Record<string, boolean>;
  axes: Record<string, number>;
  hapticIntensity: number;
}

/** Full VR scene snapshot sent over WebSocket */
export interface VRSceneSnapshot {
  timestamp: number;
  frameNumber: number;
  objects: SceneObjectState[];
  camera: VRCameraState;
  controllers: VRControllerState[];
  performance: PerformanceSnapshot;
  /** Scene-level state variables from HoloScript @state */
  sceneState: Record<string, unknown>;
}

export interface PerformanceSnapshot {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangleCount: number;
  textureMemoryMB: number;
  gpuTimeMs: number;
}

/** WebSocket message types */
export type WSMessageType =
  | 'snapshot'
  | 'delta'
  | 'command'
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: number;
  seq: number;
}

/** Delta update — only changed fields */
export interface SceneDelta {
  frameNumber: number;
  timestamp: number;
  updated: Partial<SceneObjectState & { id: string }>[];
  added: SceneObjectState[];
  removed: string[]; // IDs
  cameraChanged?: Partial<VRCameraState>;
  controllersChanged?: VRControllerState[];
  performanceChanged?: Partial<PerformanceSnapshot>;
  sceneStateChanged?: Record<string, unknown>;
}

/** Preview camera mode */
export type PreviewCameraMode =
  | 'orbit'
  | 'free'
  | 'follow_head'
  | 'top_down'
  | 'side'
  | 'front';

/** Preview configuration */
export interface SmartProxyConfig {
  /** WebSocket URL (default ws://localhost:9090) */
  wsUrl: string;
  /** Reconnect interval on disconnect (ms) */
  reconnectIntervalMs: number;
  /** Max reconnect attempts (0 = unlimited) */
  maxReconnectAttempts: number;
  /** Send full snapshot every N frames (for delta recovery) */
  fullSnapshotInterval: number;
  /** Throttle rendering to this fps (saves CPU on preview) */
  previewFps: number;
  /** Initial camera mode */
  cameraMode: PreviewCameraMode;
  /** Show wireframe overlay */
  showWireframe: boolean;
  /** Show bounding boxes */
  showBoundingBoxes: boolean;
  /** Show performance overlay */
  showPerformanceOverlay: boolean;
  /** Show controller gizmos */
  showControllerGizmos: boolean;
  /** Grid size (meters) */
  gridSize: number;
  /** Enable grid */
  showGrid: boolean;
}

const DEFAULT_CONFIG: SmartProxyConfig = {
  wsUrl: 'ws://localhost:9090',
  reconnectIntervalMs: 3000,
  maxReconnectAttempts: 0,
  fullSnapshotInterval: 60,
  previewFps: 30,
  cameraMode: 'orbit',
  showWireframe: false,
  showBoundingBoxes: false,
  showPerformanceOverlay: true,
  showControllerGizmos: true,
  gridSize: 10,
  showGrid: true,
};

// =============================================================================
// VR Scene State Server (runs in the VR runtime / Hololand)
// =============================================================================

/**
 * Server-side component that captures VR scene state and sends it to
 * connected preview clients via WebSocket.
 *
 * In Hololand, this would be instantiated alongside the VR runtime and
 * fed scene graph data on each frame.
 */
export class VRSceneStateServer {
  private config: SmartProxyConfig;
  private ws: WebSocket | null = null;
  private clients: Set<WebSocket> = new Set();
  private frameNumber: number = 0;
  private lastFullSnapshot: VRSceneSnapshot | null = null;
  private previousObjectStates: Map<string, SceneObjectState> = new Map();
  private seq: number = 0;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private pendingSnapshot: VRSceneSnapshot | null = null;

  /** Event callback for when a client sends a command */
  public onCommand: ((command: string, args: Record<string, unknown>) => void) | null = null;

  constructor(config?: Partial<SmartProxyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the WebSocket server (Node.js / Deno environment).
   * In a browser-based VR runtime, use `connectToRelay(url)` instead.
   *
   * NOTE: This method assumes a WebSocket server library is available.
   * The actual server creation is environment-dependent.
   */
  startServer(wss: { on: (event: string, cb: (...args: any[]) => void) => void }): void {
    wss.on('connection', (client: WebSocket) => {
      this.clients.add(client);

      // Send full snapshot on connect
      if (this.lastFullSnapshot) {
        this.sendToClient(client, {
          type: 'snapshot',
          payload: this.lastFullSnapshot,
          timestamp: Date.now(),
          seq: this.seq++,
        });
      }

      (client as any).on?.('message', (data: string) => {
        try {
          const msg = JSON.parse(data) as WSMessage;
          this.handleClientMessage(client, msg);
        } catch {
          // ignore malformed messages
        }
      });

      (client as any).on?.('close', () => {
        this.clients.delete(client);
      });
    });
  }

  /**
   * Push a full scene snapshot. Should be called from the VR render loop.
   */
  pushSnapshot(snapshot: VRSceneSnapshot): void {
    snapshot.frameNumber = this.frameNumber++;
    this.pendingSnapshot = snapshot;

    const shouldSendFull = this.frameNumber % this.config.fullSnapshotInterval === 0;

    if (shouldSendFull || !this.lastFullSnapshot) {
      this.lastFullSnapshot = snapshot;
      this.broadcast({
        type: 'snapshot',
        payload: snapshot,
        timestamp: Date.now(),
        seq: this.seq++,
      });
    } else {
      // Compute and send delta
      const delta = this.computeDelta(this.lastFullSnapshot, snapshot);
      if (delta) {
        this.broadcast({
          type: 'delta',
          payload: delta,
          timestamp: Date.now(),
          seq: this.seq++,
        });
      }
    }

    // Update previous states for next delta computation
    this.previousObjectStates.clear();
    for (const obj of snapshot.objects) {
      this.previousObjectStates.set(obj.id, { ...obj });
    }
    this.lastFullSnapshot = snapshot;
  }

  /**
   * Stop broadcasting and clean up.
   */
  stop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    for (const client of this.clients) {
      try { (client as any).close?.(); } catch { /* ignore */ }
    }
    this.clients.clear();
  }

  // ---- Private ----

  private computeDelta(prev: VRSceneSnapshot, curr: VRSceneSnapshot): SceneDelta | null {
    const prevMap = new Map(prev.objects.map((o) => [o.id, o]));
    const currMap = new Map(curr.objects.map((o) => [o.id, o]));

    const added: SceneObjectState[] = [];
    const removed: string[] = [];
    const updated: Partial<SceneObjectState & { id: string }>[] = [];

    // Find added and updated
    for (const [id, obj] of currMap) {
      const prevObj = prevMap.get(id);
      if (!prevObj) {
        added.push(obj);
      } else if (!this.objectsEqual(prevObj, obj)) {
        const diff = this.diffObject(prevObj, obj);
        if (diff) updated.push({ id, ...diff });
      }
    }

    // Find removed
    for (const id of prevMap.keys()) {
      if (!currMap.has(id)) {
        removed.push(id);
      }
    }

    // Camera changes
    const cameraChanged = this.diffCamera(prev.camera, curr.camera);

    // If nothing changed, skip
    if (
      added.length === 0 &&
      removed.length === 0 &&
      updated.length === 0 &&
      !cameraChanged
    ) {
      return null;
    }

    return {
      frameNumber: curr.frameNumber,
      timestamp: curr.timestamp,
      added,
      removed,
      updated,
      cameraChanged: cameraChanged ?? undefined,
      performanceChanged: curr.performance,
    };
  }

  private objectsEqual(a: SceneObjectState, b: SceneObjectState): boolean {
    return (
      a.visible === b.visible &&
      a.opacity === b.opacity &&
      this.arraysEqual(a.transform.position, b.transform.position) &&
      this.arraysEqual(a.transform.rotation, b.transform.rotation) &&
      this.arraysEqual(a.transform.scale, b.transform.scale)
    );
  }

  private diffObject(prev: SceneObjectState, curr: SceneObjectState): Partial<SceneObjectState> | null {
    const diff: Partial<SceneObjectState> = {};
    let hasChanges = false;

    if (!this.arraysEqual(prev.transform.position, curr.transform.position) ||
        !this.arraysEqual(prev.transform.rotation, curr.transform.rotation) ||
        !this.arraysEqual(prev.transform.scale, curr.transform.scale)) {
      diff.transform = curr.transform;
      hasChanges = true;
    }

    if (prev.visible !== curr.visible) {
      diff.visible = curr.visible;
      hasChanges = true;
    }

    if (prev.opacity !== curr.opacity) {
      diff.opacity = curr.opacity;
      hasChanges = true;
    }

    if (!this.arraysEqual(prev.materialColor, curr.materialColor)) {
      diff.materialColor = curr.materialColor;
      hasChanges = true;
    }

    return hasChanges ? diff : null;
  }

  private diffCamera(prev: VRCameraState, curr: VRCameraState): Partial<VRCameraState> | null {
    if (
      this.arraysEqual(prev.headPosition, curr.headPosition) &&
      this.arraysEqual(prev.headRotation, curr.headRotation)
    ) {
      return null;
    }
    return {
      headPosition: curr.headPosition,
      headRotation: curr.headRotation,
    };
  }

  private arraysEqual(a: readonly number[], b: readonly number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-6) return false;
    }
    return true;
  }

  private handleClientMessage(client: WebSocket, msg: WSMessage): void {
    switch (msg.type) {
      case 'ping':
        this.sendToClient(client, {
          type: 'pong',
          payload: null,
          timestamp: Date.now(),
          seq: this.seq++,
        });
        break;
      case 'command':
        if (this.onCommand) {
          const { command, args } = msg.payload as { command: string; args: Record<string, unknown> };
          this.onCommand(command, args);
        }
        break;
      case 'subscribe':
        // Full snapshot request
        if (this.lastFullSnapshot) {
          this.sendToClient(client, {
            type: 'snapshot',
            payload: this.lastFullSnapshot,
            timestamp: Date.now(),
            seq: this.seq++,
          });
        }
        break;
    }
  }

  private broadcast(msg: WSMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      try {
        (client as any).send?.(data);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private sendToClient(client: WebSocket, msg: WSMessage): void {
    try {
      (client as any).send?.(JSON.stringify(msg));
    } catch {
      this.clients.delete(client);
    }
  }
}

// =============================================================================
// Preview Client (runs in a 2D browser window)
// =============================================================================

/**
 * Client-side component that receives VR scene state over WebSocket
 * and presents a simplified 2D preview with camera controls.
 */
export class SmartProxyPreviewClient {
  private config: SmartProxyConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected: boolean = false;

  /** Current scene state (reconstructed from snapshots + deltas) */
  private sceneState: Map<string, SceneObjectState> = new Map();
  private cameraState: VRCameraState | null = null;
  private controllerStates: VRControllerState[] = [];
  private performance: PerformanceSnapshot | null = null;
  private frameNumber: number = 0;

  /** Preview camera state (independent from VR camera) */
  private previewCamera: PreviewCamera;

  /** Event callbacks */
  private listeners: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onSnapshot?: (snapshot: VRSceneSnapshot) => void;
    onDelta?: (delta: SceneDelta) => void;
    onSceneUpdate?: (objects: SceneObjectState[]) => void;
  } = {};

  constructor(config?: Partial<SmartProxyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.previewCamera = new PreviewCamera(this.config.cameraMode);
  }

  /** Register event listeners */
  on(event: keyof typeof this.listeners, callback: (...args: any[]) => void): void {
    (this.listeners as any)[event] = callback;
  }

  /** Get current connection status */
  get connected(): boolean {
    return this.isConnected;
  }

  /** Get reconstructed scene objects */
  getSceneObjects(): SceneObjectState[] {
    return Array.from(this.sceneState.values());
  }

  /** Get latest VR camera state */
  getVRCamera(): VRCameraState | null {
    return this.cameraState;
  }

  /** Get the preview camera for 2D viewport control */
  getPreviewCamera(): PreviewCamera {
    return this.previewCamera;
  }

  /** Get latest performance data */
  getPerformance(): PerformanceSnapshot | null {
    return this.performance;
  }

  /**
   * Connect to the VR scene state server.
   */
  connect(): void {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available in this environment');
    }

    this.ws = new WebSocket(this.config.wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Request full snapshot
      this.send({
        type: 'subscribe',
        payload: null,
        timestamp: Date.now(),
        seq: 0,
      });

      this.listeners.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSMessage;
        this.handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.listeners.onDisconnect?.();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Send a command to the VR runtime (e.g., teleport, toggle visibility).
   */
  sendCommand(command: string, args: Record<string, unknown> = {}): void {
    this.send({
      type: 'command',
      payload: { command, args },
      timestamp: Date.now(),
      seq: 0,
    });
  }

  /**
   * Set the preview camera mode.
   */
  setCameraMode(mode: PreviewCameraMode): void {
    this.previewCamera.setMode(mode);
    this.config.cameraMode = mode;
  }

  /**
   * Update visualization options.
   */
  setOption<K extends keyof SmartProxyConfig>(key: K, value: SmartProxyConfig[K]): void {
    this.config[key] = value;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.disconnect();
    this.sceneState.clear();
    this.cameraState = null;
    this.controllerStates = [];
    this.performance = null;
  }

  // ---- Private ----

  private handleMessage(msg: WSMessage): void {
    switch (msg.type) {
      case 'snapshot':
        this.applySnapshot(msg.payload as VRSceneSnapshot);
        break;
      case 'delta':
        this.applyDelta(msg.payload as SceneDelta);
        break;
      case 'pong':
        // latency measurement could be added here
        break;
    }
  }

  private applySnapshot(snapshot: VRSceneSnapshot): void {
    this.sceneState.clear();
    for (const obj of snapshot.objects) {
      this.sceneState.set(obj.id, obj);
    }
    this.cameraState = snapshot.camera;
    this.controllerStates = snapshot.controllers;
    this.performance = snapshot.performance;
    this.frameNumber = snapshot.frameNumber;

    this.listeners.onSnapshot?.(snapshot);
    this.listeners.onSceneUpdate?.(this.getSceneObjects());
  }

  private applyDelta(delta: SceneDelta): void {
    // Remove deleted objects
    for (const id of delta.removed) {
      this.sceneState.delete(id);
    }

    // Add new objects
    for (const obj of delta.added) {
      this.sceneState.set(obj.id, obj);
    }

    // Update changed objects
    for (const update of delta.updated) {
      const existing = this.sceneState.get(update.id!);
      if (existing) {
        Object.assign(existing, update);
      }
    }

    // Camera
    if (delta.cameraChanged && this.cameraState) {
      Object.assign(this.cameraState, delta.cameraChanged);
    }

    // Controllers
    if (delta.controllersChanged) {
      this.controllerStates = delta.controllersChanged;
    }

    // Performance
    if (delta.performanceChanged) {
      this.performance = {
        ...(this.performance ?? { fps: 0, frameTimeMs: 0, drawCalls: 0, triangleCount: 0, textureMemoryMB: 0, gpuTimeMs: 0 }),
        ...delta.performanceChanged,
      };
    }

    this.frameNumber = delta.frameNumber;

    this.listeners.onDelta?.(delta);
    this.listeners.onSceneUpdate?.(this.getSceneObjects());
  }

  private send(msg: WSMessage): void {
    if (this.ws && this.isConnected) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // ignore send errors
      }
    }
  }

  private scheduleReconnect(): void {
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      return;
    }
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.config.reconnectIntervalMs);
  }
}

// =============================================================================
// Preview Camera Controller
// =============================================================================

/**
 * Simple camera controller for the 2D preview window.
 * Supports orbit, free-fly, follow-head, and orthographic projection modes.
 */
export class PreviewCamera {
  private mode: PreviewCameraMode;
  private position: [number, number, number] = [0, 5, 10];
  private target: [number, number, number] = [0, 0, 0];
  private up: [number, number, number] = [0, 1, 0];
  private fov: number = 60;
  private near: number = 0.1;
  private far: number = 1000;
  private orbitRadius: number = 10;
  private orbitTheta: number = Math.PI / 4; // polar angle
  private orbitPhi: number = Math.PI / 4; // azimuthal angle
  private panSpeed: number = 0.01;
  private rotateSpeed: number = 0.005;
  private zoomSpeed: number = 0.1;

  constructor(mode: PreviewCameraMode = 'orbit') {
    this.mode = mode;
    this.updatePositionFromOrbit();
  }

  /** Get the current camera mode */
  getMode(): PreviewCameraMode {
    return this.mode;
  }

  /** Set the camera mode */
  setMode(mode: PreviewCameraMode): void {
    this.mode = mode;
    switch (mode) {
      case 'top_down':
        this.position = [0, 20, 0];
        this.target = [0, 0, 0];
        this.up = [0, 0, -1];
        break;
      case 'side':
        this.position = [20, 2, 0];
        this.target = [0, 2, 0];
        this.up = [0, 1, 0];
        break;
      case 'front':
        this.position = [0, 2, 20];
        this.target = [0, 2, 0];
        this.up = [0, 1, 0];
        break;
      case 'orbit':
        this.orbitRadius = 10;
        this.orbitTheta = Math.PI / 4;
        this.orbitPhi = Math.PI / 4;
        this.updatePositionFromOrbit();
        break;
    }
  }

  /** Get the view matrix components */
  getView(): {
    position: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    fov: number;
    near: number;
    far: number;
  } {
    return {
      position: [...this.position] as [number, number, number],
      target: [...this.target] as [number, number, number],
      up: [...this.up] as [number, number, number],
      fov: this.fov,
      near: this.near,
      far: this.far,
    };
  }

  /**
   * Handle orbit rotation (mouse drag).
   */
  rotate(deltaX: number, deltaY: number): void {
    if (this.mode !== 'orbit') return;
    this.orbitPhi -= deltaX * this.rotateSpeed;
    this.orbitTheta = Math.max(
      0.01,
      Math.min(Math.PI - 0.01, this.orbitTheta - deltaY * this.rotateSpeed)
    );
    this.updatePositionFromOrbit();
  }

  /**
   * Handle zoom (mouse wheel).
   */
  zoom(delta: number): void {
    if (this.mode === 'orbit') {
      this.orbitRadius = Math.max(0.5, this.orbitRadius + delta * this.zoomSpeed);
      this.updatePositionFromOrbit();
    } else if (this.mode === 'free') {
      const dir = this.normalizeVec3(this.subtractVec3(this.target, this.position));
      this.position[0] += dir[0] * delta * this.zoomSpeed;
      this.position[1] += dir[1] * delta * this.zoomSpeed;
      this.position[2] += dir[2] * delta * this.zoomSpeed;
    }
  }

  /**
   * Handle panning (middle mouse drag or shift+drag).
   */
  pan(deltaX: number, deltaY: number): void {
    const right = this.getCameraRight();
    const upDir = this.up;
    const scale = this.panSpeed * this.orbitRadius;

    this.target[0] += (-deltaX * right[0] + deltaY * upDir[0]) * scale;
    this.target[1] += (-deltaX * right[1] + deltaY * upDir[1]) * scale;
    this.target[2] += (-deltaX * right[2] + deltaY * upDir[2]) * scale;

    if (this.mode === 'orbit') {
      this.updatePositionFromOrbit();
    }
  }

  /**
   * Follow the VR headset camera.
   */
  followHead(headPosition: [number, number, number], headRotation: [number, number, number, number]): void {
    if (this.mode !== 'follow_head') return;
    // Position the preview camera behind and above the headset
    this.target = [...headPosition] as [number, number, number];
    this.position = [
      headPosition[0] - 3,
      headPosition[1] + 2,
      headPosition[2] - 3,
    ];
  }

  /** Reset camera to default position */
  reset(): void {
    this.setMode(this.mode);
  }

  // ---- Private ----

  private updatePositionFromOrbit(): void {
    this.position[0] = this.target[0] + this.orbitRadius * Math.sin(this.orbitTheta) * Math.cos(this.orbitPhi);
    this.position[1] = this.target[1] + this.orbitRadius * Math.cos(this.orbitTheta);
    this.position[2] = this.target[2] + this.orbitRadius * Math.sin(this.orbitTheta) * Math.sin(this.orbitPhi);
  }

  private getCameraRight(): [number, number, number] {
    const forward = this.normalizeVec3(this.subtractVec3(this.target, this.position));
    return this.normalizeVec3(this.crossVec3(forward, this.up));
  }

  private subtractVec3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  private crossVec3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  private normalizeVec3(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 1e-10) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }
}

// =============================================================================
// Factory / convenience
// =============================================================================

/**
 * Create a SmartProxyVRPreview server instance for the VR runtime.
 */
export function createVRPreviewServer(config?: Partial<SmartProxyConfig>): VRSceneStateServer {
  return new VRSceneStateServer(config);
}

/**
 * Create a SmartProxyVRPreview client instance for the 2D preview window.
 */
export function createVRPreviewClient(config?: Partial<SmartProxyConfig>): SmartProxyPreviewClient {
  return new SmartProxyPreviewClient(config);
}
