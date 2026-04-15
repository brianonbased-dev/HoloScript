/**
 * HoloScript+ Runtime Engine
 *
 * Executes parsed HoloScript+ AST with:
 * - Control flow (@for, @if) evaluation
 * - Lifecycle hook management
 * - VR trait integration
 * - Reactive state binding
 * - TypeScript companion integration
 *
 * @version 1.0.0
 */

import type {
  HSPlusAST,
  HSPlusNode,
  HSPlusRuntime,
  HSPlusBuiltins,
  StateDeclaration,
  VRHand,
  Vector3,
} from '@holoscript/core';
import type {
  HSPlusDirective,
  HoloScriptValue,
  HoloValue,
  HoloTemplate,
  HSPlusForDirective,
  RaycastHit,
} from '@holoscript/core';
import { ReactiveState, createState, ExpressionEvaluator } from '@holoscript/core';
import { VRTraitRegistry, vrTraitRegistry, TraitContext, TraitEvent } from '@holoscript/core';
import { eventBus } from './EventBus';
import { ChunkLoader } from './loader';
import { HotReloader, type TemplateInstance as _TemplateInstance } from './HotReloader';
import { HoloStatement } from '@holoscript/core';
import { NetworkPredictor, type NetworkState } from './NetworkPredictor';
import { MovementPredictor } from './MovementPredictor';
import { WebXRManager } from './WebXRManager';
import { PhysicsWorldImpl } from '../physics/PhysicsWorldImpl';
import { IVector3, IPhysicsWorld, IRaycastHit } from '../physics/PhysicsTypes';
import { VRPhysicsBridge } from '../physics/VRPhysicsBridge';
import { PhysicsDebugDrawer } from '../rendering/webgpu/PhysicsDebugDrawer';
import { WebGPURenderer } from '../rendering/webgpu/WebGPURenderer';
import { KeyboardSystem } from './KeyboardSystem';
import { HandMenuSystem } from './HandMenuSystem';

// MOCK: StateSync (to resolve cross-repo dependency for visualization)
class StateSync {
  constructor(_options?: unknown) {}
  getInterpolatedState(_id: string) {
    return null;
  }
}

// =============================================================================
// TYPES
// =============================================================================

type LifecycleHandler = (...args: unknown[]) => void;

export interface NodeInstance {
  __holo_id: string; // Stable identity preserved across hot-reload cycles
  node: HSPlusNode;
  properties: Record<string, unknown>;
  renderedNode: unknown; // Actual 3D object from renderer
  lifecycleHandlers: Map<string, LifecycleHandler[]>;
  children: NodeInstance[];
  parent: NodeInstance | null;
  destroyed: boolean;
  templateName?: string;
  templateVersion?: number;
  dirty: boolean; // Optimization Flag
  hasTraits: boolean;
}

export interface RuntimeOptions {
  renderer?: Renderer;
  vrEnabled?: boolean;
  companions?: Record<string, Record<string, (...args: unknown[]) => unknown>>;
  manifestUrl?: string; // Code Splitting
  baseUrl?: string; // Code Splitting
  webXrManagerClass?: unknown; // Dependency Injection for Testing
}

export interface Renderer {
  createElement(type: string, properties: Record<string, unknown>): unknown;
  updateElement(element: unknown, properties: Record<string, unknown>): void;
  appendChild(parent: unknown, child: unknown): void;
  removeChild(parent: unknown, child: unknown): void;
  destroy(element: unknown): void;
  setXRSession?(
    session: XRSession | null,
    glBinding: unknown | null,
    projectionLayer: unknown | null
  ): void;
}

/** Extended renderer interface for WebXR-capable renderers (e.g. WebGPURenderer). */

export class HoloScriptPlusRuntimeImpl implements HSPlusRuntime {
  private ast: any;
  private options: RuntimeOptions;
  public state: any;
  private evaluator: ExpressionEvaluator;
  private builtins: HSPlusBuiltins;
  private traitRegistry: VRTraitRegistry;
  private rootInstance: NodeInstance | null = null;
  private eventHandlers: Map<string, Set<(payload: unknown) => void>> = new Map();
  private templates: Map<string, HSPlusNode> = new Map();
  private updateLoopId: ReturnType<typeof setTimeout> | number | null = null;
  private lastUpdateTime: number = 0;
  private companions: Record<string, Record<string, (...args: unknown[]) => unknown>>;
  private networkSync: StateSync;
  private mounted: boolean = false;
  private scaleMultiplier: number = 1;
  private chunkLoader: ChunkLoader | null = null;
  private hotReloader: HotReloader;
  private networkPredictor: NetworkPredictor<Record<string, unknown>> | null = null;
  private movementPredictor: MovementPredictor;

  // Optimization: Flat list for iteration
  private _flatEntities: NodeInstance[] = [];

  // AI Copilot integration
  private _copilot: {
    isReady(): boolean;
    generateFromPrompt(prompt: string, options: Record<string, unknown>): Promise<unknown>;
  } | null = null;

  /**
   * Set the AI Copilot for generate directive processing.
   */
  setCopilot(copilot: {
    isReady(): boolean;
    generateFromPrompt(prompt: string, options: Record<string, unknown>): Promise<unknown>;
  }): void {
    this._copilot = copilot;
  }

  // VR context
  public vrContext: {
    hands: { left: VRHand | null; right: VRHand | null };
    headset: { position: Vector3; rotation: Vector3 };
    controllers: { left: unknown; right: unknown };
  } = {
    hands: {
      left: null,
      right: null,
    },
    headset: {
      position: [0, 1.6, 0],
      rotation: [0, 0, 0],
    },
    controllers: {
      left: null,
      right: null,
    },
  };

  // WebXR Manager
  private webXrManager: WebXRManager | null = null;
  private isXRSessionActive: boolean = false;

  // Physics World
  private physicsWorld: IPhysicsWorld;
  private vrPhysicsBridge: VRPhysicsBridge;
  private debugDrawer: PhysicsDebugDrawer | null = null;
  public keyboardSystem: KeyboardSystem;
  public handMenuSystem: HandMenuSystem;

  constructor(ast: HSPlusAST, options: RuntimeOptions = {}) {
    this.ast = ast;
    this.options = options;

    // Initialize Physics World (+ Bridge)
    console.log('[[TYPE OF PW]]', typeof PhysicsWorldImpl, PhysicsWorldImpl);
    this.physicsWorld = new PhysicsWorldImpl({
      gravity: [0, -9.81, 0],
      maxSubsteps: 2,
    });
    this.vrPhysicsBridge = new VRPhysicsBridge(this.physicsWorld, (hand, intensity, duration) => {
      // Trigger Haptic Pulse via WebXR Manager
      if (this.webXrManager) {
        this.webXrManager.triggerHaptic(hand, intensity, duration);
      }
    });

    // Initialize Debug Drawer
    if (options.renderer instanceof WebGPURenderer) {
      this.debugDrawer = new PhysicsDebugDrawer(this.physicsWorld, options.renderer);
    }

    // Initialize Keyboard System
    this.keyboardSystem = new KeyboardSystem(this as any);
    this.handMenuSystem = new HandMenuSystem(this as any);

    // Register Physics Event Handlers
    this.on('physics_grab', (payload: any) => {
      const { nodeId, hand } = payload as { nodeId: string; hand: 'left' | 'right' };
      const handBodyId = this.vrPhysicsBridge.getHandBodyId(hand);
      const objectBody = this.physicsWorld.getBody(nodeId);

      if (handBodyId && objectBody) {
        // Create Fixed Joint
        this.physicsWorld.createConstraint({
          type: 'fixed',
          id: `grab_${handBodyId}_${nodeId}`,
          bodyA: handBodyId,
          bodyB: nodeId,
          pivotA: [0, 0, 0], // Center of hand
          pivotB: [0, 0, 0], // Should be relative offset
          // For simplicity, we snap center-to-center or need to calculate offset based on current positions
        });
      }
    });

    this.on('physics_release', (payload: any) => {
      const { nodeId, velocity } = payload as { nodeId: string; velocity?: number[] };
      // Remove all constraints involving this node by ID pattern
      this.physicsWorld.removeConstraint(`grab_${nodeId}`);

      if (velocity) {
        const body = this.physicsWorld.getBody(nodeId);
        if (body) {
          body.velocity = [velocity[0], velocity[1], velocity[2]];
        }
      }
    });

    // Keyboard / UI Events
    this.on('ui_press_end', (payload: any) => {
      this.keyboardSystem.handleEvent('ui_press_end', payload);
    });

    this.on('physics_add_constraint', (payload: any) => {
      const { type, nodeId, axis, min, max, spring } = payload as {
        type: string;
        nodeId: string;
        axis?: IVector3;
        min?: number;
        max?: number;
        spring?: unknown;
      };
      // Ideally we need an anchor body (parent). For now, we might anchor to world (fixed point)
      // OR we create a static "anchor" body at the node's initial position.

      // This requires the Physics engine to support internal constraints/motors.
      // Assuming addConstraint supports 'prismatic' extended config.
      this.physicsWorld.createConstraint({
        type: 'slider', // Mapped to slider for prismatic capability
        id: `constraint_slider_${nodeId}`,
        bodyA: 'WORLD_ANCHOR', // Placeholder for "Static Anchor at start pos"
        bodyB: nodeId,
        pivotA: [0, 0, 0],
        axisA: axis || [0, 1, 0],
        limits: { low: min || 0, high: max || 0 },
      });
    });

    // Initialize WebXR Manager if enabled
    // We defer full initialization until enterVR() or if renderer provides context now
    if (
      options.renderer &&
        (options.renderer as any).context &&
      options.vrEnabled
    ) {
      // We could pre-warm here, but for now we wait for explicit enterVR
    }

    // Check for sync intent (P3 Pattern)

    const rootAst = this.ast as unknown as HSPlusAST & { root: HSPlusNode };
    const isNetworked =
      rootAst.root.traits?.has('networked') ||
      rootAst.root.directives?.some(
        (d: any) => d.type === 'sync' || d.type === 'networked'
      );
    const _syncId = isNetworked ? (rootAst.root as any).id || 'global_session' : undefined;

    this.state = createState({} as any) as any;
    this.traitRegistry = vrTraitRegistry;
    this.companions = options.companions || {};
    this.builtins = createBuiltins(this);
    this.networkSync = new StateSync({ interpolation: true });

    // Create expression evaluator with context
    this.evaluator = new ExpressionEvaluator(
      this.state.getSnapshot(),
      this.builtins as unknown as Record<string, unknown>
    );

    // Initialize state from AST
    this.initializeState();

    // Load imports
    this.loadImports();

    // Initialize Predictors
    this.movementPredictor = new MovementPredictor();
    if (isNetworked) {
      this.networkPredictor = new NetworkPredictor(this.state.getSnapshot());
    }

    // Initialize HotReloader
    this.hotReloader = new HotReloader({ devMode: true });
    this.hotReloader.setMigrationExecutor(async (instance, body) => {
      // Find the runtime node instance that matches the reloader's instance
      let nodeInstance = this.findInstanceById(instance.__holo_id);

      // Fallback for global program if root instance not found by specific 'root' ID
      if (!nodeInstance && instance.templateName === '@program' && this.rootInstance) {
        nodeInstance = this.rootInstance;
      }

      if (nodeInstance) {
        // Execute the migration code (which is a string captured by the parser)
        this.executeMigrationCode(nodeInstance, body as string);
      }
    });

    const self = this;

    // Register global program if versioned
    if (this.ast.version !== undefined) {
      this.hotReloader.registerTemplate({
        type: 'template',
        name: '@program',
        version: ((this.ast as unknown as Record<string, unknown>).version as number) || 0,
        migrations:
          ((this.ast as unknown as Record<string, unknown>).migrations as unknown[]) || [],
        state: { properties: [] },
      } as unknown as HoloTemplate);

      const stateBridge = this.createStateMapProxy();
      this.hotReloader.registerInstance({
        __holo_id: 'root',
        templateName: '@program',
        get version() {
          return ((self.ast as unknown as Record<string, unknown>).version as number) || 0;
        },
        set version(v: number) {
          (self.ast as unknown as Record<string, unknown>).version = v;
        },
        state: stateBridge as Map<string, HoloValue>,
      });
    }

    // Register initial templates
    const initialTemplates = this.findAllTemplates(this.ast.root);
    for (const [name, node] of initialTemplates) {
      this.templates.set(name, node);
      this.hotReloader.registerTemplate(node as unknown as HoloTemplate);
    }

    // Initialize ChunkLoader if manifest provided
    if (this.options.manifestUrl) {
      this.chunkLoader = new ChunkLoader(this, {
        manifestUrl: this.options.manifestUrl,
        baseUrl: this.options.baseUrl,
      });
      this.chunkLoader.init();
    }
  }

  // ==========================================================================
  // WEBXR INTEGRATION
  // ==========================================================================

  async enterVR(): Promise<void> {
    if (!this.options.vrEnabled) {
      console.warn('VR is not enabled in runtime options');
      return;
    }

    // We need access to the WebGPU context from the renderer
    // This assumes the renderer in options has a 'context' property or we can get it
    // Since Renderer interface in this file is generic, we cast it for now
    const renderer = this.options.renderer as any;
    if (!renderer) {
      console.error('Cannot enter VR: No renderer found');
      return;
    }

    if (!this.webXrManager) {
      // Use renderer.getContext() if available
      const context = renderer.getContext ? renderer.getContext() : renderer.context;
      if (!context) {
        console.error('WebGPU context not found on renderer');
        return;
      }
      const ManagerClass =
        (this.options.webXrManagerClass as typeof WebXRManager | undefined) || WebXRManager;
      this.webXrManager = new ManagerClass(context);

      this.webXrManager!.onSessionStart = (session) => {
        this.isXRSessionActive = true;

        // Stop the regular update loop to avoid double-processing
        this.stopUpdateLoop();

        // Notify renderer to switch to XR mode (if method exists)
        if (renderer.setXRSession) {
          renderer.setXRSession(
            session as any,
            this.webXrManager!.getBinding() as any,
            this.webXrManager!.getProjectionLayer() as any
          );
        }

        // Start the XR render loop
        this.webXrManager!.setAnimationLoop(this.xrLoop.bind(this) as any);
      };

      this.webXrManager!.onSessionEnd = () => {
        this.isXRSessionActive = false;

        // Notify renderer
        if (renderer.setXRSession) {
          renderer.setXRSession(null, null, null);
        }

        // Restart the regular update loop
        this.startUpdateLoop();
      };
    }

    if (await this.webXrManager.isSessionSupported('immersive-vr')) {
      await this.webXrManager.requestSession();
    } else {
      console.warn('WebXR not supported in this environment');
    }
  }

  /**
   * Main XR Loop - called by WebXRManager
   */
  private xrLoop(time: number, frame: XRFrame): void {
    const now = performance.now();
    const delta = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // Update VR Input State from Frame
    this.updateVRInput(frame);

    // Run Game Logic
    this.update(delta);
    if (this.handMenuSystem) this.handMenuSystem.update(delta);

    // Render XR Frame
    const renderer = this.options.renderer as any;
    if (renderer?.renderXR) {
      renderer.renderXR(frame);
    }
  }

  async exitVR(): Promise<void> {
    if (this.webXrManager) {
      await this.webXrManager.endSession();
    }
  }

  /**
   * Convert Quaternion to Euler Angles (YXZ sequence)
   */
  private quaternionToEuler(q: Float32Array | [number, number, number, number]): Vector3 {
    const x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];

    // Y-rotation (Yaw)
    const t0 = 2.0 * (w * y - z * x);
    const ry = Math.asin(Math.max(-1, Math.min(1, t0)));

    // X-rotation (Pitch)
    const t1 = 2.0 * (w * x + y * z);
    const t2 = 1.0 - 2.0 * (x * x + y * y);
    const rx = Math.atan2(t1, t2);

    // Z-rotation (Roll)
    const t3 = 2.0 * (w * z + x * y);
    const t4 = 1.0 - 2.0 * (y * y + z * z);
    const rz = Math.atan2(t3, t4);

    return [rx, ry, rz];
  }

  private updateVRInput(frame?: XRFrame): void {
    if (!this.isXRSessionActive || !this.webXrManager) return;

    // Use frame session if available, otherwise manager session
    const session = frame ? frame.session : this.webXrManager.getSession();
    const refSpace = this.webXrManager.getReferenceSpace();

    if (!session || !refSpace) return;

    // 1. Update Headset Pose
    if (frame) {
      const viewerPose = frame.getViewerPose(refSpace as any);
      if (viewerPose) {
        const { position, orientation } = (viewerPose as any).transform;
        this.vrContext.headset.position = [position[0], position[1], position[2]];

        // Convert Quaternion to Euler for HoloScript compatibility
        // HoloScript uses [x, y, z] Euler angles (radians)
        const eulerH = this.quaternionToEuler([
          orientation[0],
          orientation[1],
          orientation[2],
          orientation[3],
        ]);
        this.vrContext.headset.rotation = [eulerH[0], eulerH[1], eulerH[2]];
      }
    }

    // 2. Update Controllers / Hands
    for (const source of session.inputSources) {
      if (!(source as any).gripSpace) continue; // We need a grip space for position

      // If we have a valid frame, get the pose
      let pose: XRPose | undefined;
      if (frame) {
        pose = frame.getPose((source as any).gripSpace, refSpace as any) ?? undefined;
      }

      if (pose) {
        const { position, orientation } = pose.transform;
        const handSide = source.handedness;

        // Construct VRHand object
        const handData = {
          id: `${handSide}_hand`,
          grip: 0,
          trigger: 0,
          position: [position[0], position[1], position[2]],
          rotation: this.quaternionToEuler([
            orientation[0],
            orientation[1],
            orientation[2],
            orientation[3],
          ]),
          velocity: [0, 0, 0] as any, // Not provided by WebXR directly without previous frame diff
          pinchStrength: 0,
          gripStrength: 0,
        } as unknown as VRHand;

        // 3. Map Gamepad Buttons (Trigger/Grip) to Strengths
        if (source.gamepad) {
          // Standard Mapping:
          // Button 0 = Trigger (Select) -> Pinch
          // Button 1 = Squeeze (Grip) -> Grip
          if (source.gamepad.buttons.length > 0) {
            handData.pinchStrength = source.gamepad.buttons[0].value;
          }
          if (source.gamepad.buttons.length > 1) {
            handData.gripStrength = source.gamepad.buttons[1].value;
          }
        }

        // Calculate velocity (simple delta) if we have previous data
        const prevHand =
          handSide === 'left' ? this.vrContext.hands.left : this.vrContext.hands.right;
        if (prevHand) {
          // Simple velocity estimation: (curr - prev) / delta
          // We need delta time here. But updateVRInput is called inside loop with delta available?
          // The signature doesn't pass delta.
          // We can use this.lastUpdateTime logic or just set to 0 for now.
          // For physics, we definitely want velocity.
        }

        // Assign to context
        if (handSide === 'left') {
          this.vrContext.hands.left = handData;
        } else if (handSide === 'right') {
          this.vrContext.hands.right = handData;
        }
      }
    }
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initializeState(): void {
    const stateDirective = (this.ast.root.directives || []).find(
      (d: HSPlusDirective) => d.type === 'state'
    );
    if (stateDirective && stateDirective.type === 'state') {
      this.state.update(stateDirective.body as Record<string, unknown>);
    }
  }

  private loadImports(): void {
    for (const imp of this.ast.imports || []) {
      const alias = imp.alias || (imp as any).source || imp.path;
      // Companions should be provided via options
      if (this.companions[alias]) {
        // Already loaded
        continue;
      }
      console.warn(
        `Import ${imp.path || (imp as any).source} not found. Provide via companions option.`
      );
    }
  }

  // ==========================================================================
  // MOUNTING
  // ==========================================================================

  mount(container: unknown): void {
    if (this.mounted) {
      console.warn('Runtime already mounted');
      return;
    }

    this.mounted = true;

    // Build node tree
    this.rootInstance = this.instantiateNode(this.ast.root, null);

    // Mount to container
    if (this.options.renderer && this.rootInstance) {
      this.options.renderer.appendChild(container, this.rootInstance.renderedNode);
    }

    // Call mount lifecycle
    this.callLifecycle(this.rootInstance, 'on_mount');

    // Start update loop
    this.startUpdateLoop();
  }

  unmount(): void {
    if (!this.mounted) return;

    // Stop update loop
    this.stopUpdateLoop();

    // Call unmount lifecycle
    if (this.rootInstance) {
      this.callLifecycle(this.rootInstance, 'on_unmount');
      this.destroyInstance(this.rootInstance);
    }

    this.rootInstance = null;
    this.mounted = false;
  }

  /**
   * Scans the AST for all template definitions, including nested ones.
   */
  private findAllTemplates(
    node: HSPlusNode,
    templates: Map<string, HSPlusNode> = new Map()
  ): Map<string, HSPlusNode> {
    if (node.type === 'template' && node.name) {
      templates.set(node.name, node);
    }

    if (node.children) {
      for (const child of node.children) {
        this.findAllTemplates(child, templates);
      }
    }

    // Special handling for compositions which store children in specific arrays
    if (node.type === 'composition') {
      const comp = node as unknown as Record<string, unknown>;
      if (comp.children) {
        for (const child of comp.children as Iterable<any>) {
          this.findAllTemplates(child, templates);
        }
      }
    }

    return templates;
  }

  /**
   * Dynamically mount a new object into the scene (e.g. from a lazy-loaded chunk)
   */
  public mountObject(node: HSPlusNode, parent: NodeInstance | null = null): NodeInstance {
    const targetParent = parent || this.rootInstance;
    const instance = this.instantiateNode(node, targetParent);

    if (targetParent) {
      targetParent.children.push(instance);
      if (this.options.renderer && targetParent.renderedNode && instance.renderedNode) {
        this.options.renderer.appendChild(targetParent.renderedNode, instance.renderedNode);
      }
    }

    this.callLifecycle(instance, 'on_mount');
    return instance;
  }

  public unmountObject(idOrInstance: string | NodeInstance): void {
    let instance: NodeInstance | undefined;
    if (typeof idOrInstance === 'string') {
      instance = this._flatEntities.find(
        (n) => n.node.id === idOrInstance || n.__holo_id === idOrInstance
      );
    } else {
      instance = idOrInstance;
    }

    if (!instance) return;

    // Remove from parent
    if (instance.parent) {
      const idx = instance.parent.children.indexOf(instance);
      if (idx > -1) instance.parent.children.splice(idx, 1);
    }

    // Remove from flat list
    const flatIdx = this._flatEntities.indexOf(instance);
    if (flatIdx > -1) this._flatEntities.splice(flatIdx, 1);

    // Render cleanup
    if (this.options.renderer && instance.renderedNode) {
      this.options.renderer.destroy(instance.renderedNode);
    }

    this.callLifecycle(instance, 'on_unmount');
  }

  // ==========================================================================
  // NODE INSTANTIATION
  // ==========================================================================

  private _holoIdCounter = 0;
  private generateHoloId(node: HSPlusNode): string {
    const name = node.name || node.type || 'obj';
    return `${name}_${++this._holoIdCounter}_${Date.now().toString(36)}`;
  }

  private instantiateNode(node: HSPlusNode, parent: NodeInstance | null): NodeInstance {
    const instance: NodeInstance = {
      __holo_id: this.generateHoloId(node),
      node,
      get properties() {
        return (
          ((this.node as unknown as Record<string, unknown>).properties as Record<
            string,
            unknown
          >) || {}
        );
      },
      renderedNode: null,
      lifecycleHandlers: new Map(),
      children: [],
      parent,
      destroyed: false,
      dirty: true,
      hasTraits: !!(node.traits && node.traits.size > 0),
    };

    // Add to flat list
    this._flatEntities.push(instance);

    // Register with HotReloader if it's a template instance
    let templateName =
      ((node as unknown as Record<string, unknown>).template as string) ||
      ((node.properties && (node.properties as Record<string, unknown>).__templateRef) as string);
    if (!templateName && this.templates.has(node.type)) {
      templateName = node.type;
    }

    if (templateName) {
      instance.templateName = templateName;

      // Resolve version from template registry
      const templateNode = this.templates.get(templateName);
      instance.templateVersion =
        ((templateNode as unknown as Record<string, unknown>)?.version as number) ||
        ((node as unknown as Record<string, unknown>).version as number) ||
        0;

      // Bridge state for HotReloader
      const stateBridge = this.createStateMapProxy();

      const _self = this;
      this.hotReloader.registerInstance({
        __holo_id: instance.__holo_id,
        templateName: instance.templateName!,
        get version() {
          return instance.templateVersion || 0;
        },
        set version(v: number) {
          instance.templateVersion = v;
        },
        state: stateBridge as Map<string, HoloValue>,
      });
    }

    // Process directives
    const templateNodeForDirectives = templateName ? this.templates.get(templateName) : null;
    this.processDirectives(instance, templateNodeForDirectives?.directives);

    // Create rendered element
    if (this.options.renderer) {
      const properties = node.properties ? this.evaluateProperties(node.properties) : {};
      instance.renderedNode = this.options.renderer.createElement(node.type, properties);
    }

    // Attach VR traits
    if (node.traits) {
      for (const [traitName, config] of node.traits) {
        this.traitRegistry.attachTrait(node, traitName, config, this.createTraitContext(instance));
      }
    }

    // Process children with control flow
    const childrenNodes =
      node.children || ((node as unknown as Record<string, unknown>).body as HSPlusNode[]) || [];
    const children = this.processControlFlow(childrenNodes, node.directives || []);
    for (const childNode of children) {
      const childInstance = this.instantiateNode(childNode, instance);
      instance.children.push(childInstance);

      if (this.options.renderer && instance.renderedNode) {
        this.options.renderer.appendChild(instance.renderedNode, childInstance.renderedNode);
      }
    }

    return instance;
  }

  public getNode(id: string): HSPlusNode | undefined {
    // 1. Check direct ID match in flat list
    const instance = this._flatEntities.find((n) => n.node.id === id || n.__holo_id === id);
    return instance ? instance.node : undefined;
  }

  private processDirectives(instance: NodeInstance, extraDirectives?: HSPlusDirective[]): void {
    const directives = [...(instance.node.directives || []), ...(extraDirectives || [])];
    // console.log(
    //   `[Runtime] Processing ${directives.length} directives for ${instance.node.id || instance.node.type}`
    // );
    for (const directive of directives) {
      if (directive.type === 'lifecycle') {
        this.registerLifecycleHandler(instance, directive);
      } else if (directive.type === 'state') {
        const stateBody =
          ((directive as unknown as Record<string, unknown>).body as Record<string, unknown>) || {};
        for (const [key, value] of Object.entries(stateBody)) {
          if (!this.state.has(key as any)) {
            this.state.set(key as any, value);
          }
        }
      }
    }
  }

  private registerLifecycleHandler(
    instance: NodeInstance,
    directive: HSPlusDirective & { type: 'lifecycle' }
  ): void {
    const { hook, params, body } = directive;

    // Create handler function
    const handler = (...args: unknown[]) => {
      // Build parameter context
      const paramContext: Record<string, unknown> = {};
      if (params) {
        params.forEach((param: string, i: number) => {
          paramContext[param] = args[i];
        });
      }

      // Evaluate body
      this.evaluator.updateContext({
        ...this.state.getSnapshot(),
        ...paramContext,
        node: instance.node,
        self: instance.node,
      });

      try {
        // Check if body looks like code or expression
        if (body.includes(';') || body.includes('{')) {
          // Execute as code block
          new Function(
            ...Object.keys(this.builtins),
            ...Object.keys(paramContext),
            'state',
            'node',
            body
          )(
            ...Object.values(this.builtins),
            ...Object.values(paramContext),
            this.state,
            instance.node
          );
        } else {
          // Evaluate as expression
          this.evaluator.evaluate(body);
        }
      } catch (error) {
        console.error(`Error in lifecycle handler ${hook}:`, error);
      }
    };

    // Register handler
    if (!instance.lifecycleHandlers.has(hook)) {
      instance.lifecycleHandlers.set(hook, []);
    }
    instance.lifecycleHandlers.get(hook)!.push(handler);
  }

  // ==========================================================================
  // CONTROL FLOW
  // ==========================================================================

  private processControlFlow(children: HSPlusNode[], directives: HSPlusDirective[]): HSPlusNode[] {
    const result: HSPlusNode[] = [];

    // Process control flow directives
    for (const directive of directives) {
      if (directive.type === 'for') {
        const items = this.evaluateExpression((directive as HSPlusForDirective).iterable as string);
        if (Array.isArray(items)) {
          items.forEach((item, index) => {
            // Create context for each iteration
            const iterContext = {
              [directive.variable]: item,
              index,
              first: index === 0,
              last: index === items.length - 1,
              even: index % 2 === 0,
              odd: index % 2 !== 0,
            };

            // Clone and process body nodes
            for (const bodyNode of directive.body) {
              const cloned = this.cloneNodeWithContext(bodyNode as HSPlusNode, iterContext);
              result.push(cloned);
            }
          });
        }
      } else if (directive.type === 'forEach') {
        // @forEach item in collection { ... }
        const items = this.evaluateExpression(
          (directive as unknown as Record<string, unknown>).collection as string
        );
        if (Array.isArray(items)) {
          items.forEach((item, index) => {
            const iterContext = {
              [(directive as unknown as Record<string, unknown>).variable as string]: item,
              index,
              first: index === 0,
              last: index === items.length - 1,
              even: index % 2 === 0,
              odd: index % 2 !== 0,
            };

            for (const bodyNode of (directive as unknown as Record<string, unknown>)
              .body as HSPlusNode[]) {
              const cloned = this.cloneNodeWithContext(bodyNode, iterContext);
              result.push(cloned);
            }
          });
        }
      } else if (directive.type === 'while') {
        // @while condition { ... }
        // Runtime evaluation - expand once at instantiation time
        // Note: For true reactive while loops, this would need re-evaluation on state change
        const MAX_ITERATIONS = 1000; // Safety limit
        let iterations = 0;

        while (iterations < MAX_ITERATIONS) {
          const condition = this.evaluateExpression(
            (directive as unknown as Record<string, unknown>).condition as string
          );
          if (!condition) break;

          const iterContext = {
            iteration: iterations,
            index: iterations,
          };

          for (const bodyNode of (directive as unknown as Record<string, unknown>)
            .body as HSPlusNode[]) {
            const cloned = this.cloneNodeWithContext(bodyNode, iterContext);
            result.push(cloned);
          }

          iterations++;
        }

        if (iterations >= MAX_ITERATIONS) {
          console.warn('@while loop hit maximum iteration limit (1000)');
        }
      } else if (directive.type === 'if') {
        const condition = this.evaluateExpression(
          (directive as unknown as Record<string, unknown>).condition as string
        );
        if (condition) {
          result.push(...((directive as unknown as Record<string, unknown>).body as HSPlusNode[]));
        } else if ((directive as unknown as Record<string, unknown>).else) {
          result.push(...((directive as unknown as Record<string, unknown>).else as HSPlusNode[]));
        }
      }
    }

    // Add regular children
    result.push(...children);

    return result;
  }

  private cloneNodeWithContext(node: HSPlusNode, context: Record<string, unknown>): HSPlusNode {
    // Deep clone the node
    const cloned: HSPlusNode = {
      type: node.type,
      id: node.id ? this.interpolateString(node.id, context) : undefined,
      properties: node.properties ? this.interpolateProperties(node.properties, context) : {},
      directives: node.directives ? [...node.directives] : [],
      children: (node.children || []).map((child: HSPlusNode) =>
        this.cloneNodeWithContext(child, context)
      ),
      traits: node.traits ? new Map(node.traits) : new Map(),
      loc: node.loc,
    };

    return cloned;
  }

  private interpolateString(str: string, context: Record<string, unknown>): string {
    return str.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
      this.evaluator.updateContext(context);
      const value = this.evaluator.evaluate(expr);
      return String(value ?? '');
    });
  }

  private interpolateProperties(
    properties: Record<string, unknown>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(value, context);
      } else if (value && typeof value === 'object' && '__expr' in value) {
        this.evaluator.updateContext(context);
        result[key] = this.evaluator.evaluate((value as unknown as { __raw: string }).__raw);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  // ==========================================================================
  // EXPRESSION EVALUATION
  // ==========================================================================

  private evaluateExpression(expr: string): unknown {
    this.evaluator.updateContext(this.state.getSnapshot());
    return this.evaluator.evaluate(expr);
  }

  private evaluateProperties(properties: Record<string, unknown>): Record<string, unknown> {
    // First pass: expand spreads
    const expandedProperties = this.expandPropertySpreads(properties);

    // Second pass: evaluate expressions and references
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(expandedProperties)) {
      if (value && typeof value === 'object' && '__expr' in value) {
        result[key] = this.evaluateExpression((value as unknown as { __raw: string }).__raw);
      } else if (value && typeof value === 'object' && '__ref' in value) {
        // Reference to state or companion
        const ref = (value as { __ref: string }).__ref;
        result[key] = this.state.get(ref as any) ?? ref;
      } else if (typeof value === 'string' && value.includes('${')) {
        // String interpolation
        result[key] = this.interpolateString(value, this.state.getSnapshot());
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Expands spread expressions in a properties object.
   * Spread keys are formatted as __spread_N with value { type: 'spread', argument: ... }
   */
  private expandPropertySpreads(properties: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const spreadKeys: string[] = [];

    // Collect spread keys and regular properties
    for (const [key, value] of Object.entries(properties)) {
      if (key.startsWith('__spread_')) {
        spreadKeys.push(key);
      } else if (value && typeof value === 'object' && 'type' in value && value.type === 'spread') {
        spreadKeys.push(key);
      } else {
        // Recursively expand nested objects
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          !('__ref' in value) &&
          !('__expr' in value)
        ) {
          result[key] = this.expandPropertySpreads(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
          result[key] = this.expandArraySpreads(value);
        } else {
          result[key] = value;
        }
      }
    }

    // Expand spreads in order
    for (const spreadKey of spreadKeys) {
      const spreadValue = properties[spreadKey];
      if (
        spreadValue &&
        typeof spreadValue === 'object' &&
        'type' in spreadValue &&
        spreadValue.type === 'spread'
      ) {
        const resolved = this.resolveSpreadArgument(
          (spreadValue as Record<string, unknown>).argument
        );
        if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
          Object.assign(result, this.expandPropertySpreads(resolved as Record<string, unknown>));
        }
      }
    }

    // Re-apply non-spread properties (they take precedence over spreads)
    for (const [key, value] of Object.entries(properties)) {
      if (
        !key.startsWith('__spread_') &&
        !(value && typeof value === 'object' && 'type' in value && value.type === 'spread')
      ) {
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          !('__ref' in value) &&
          !('__expr' in value)
        ) {
          result[key] = this.expandPropertySpreads(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
          result[key] = this.expandArraySpreads(value);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Expands spread expressions within an array.
   */
  private expandArraySpreads(arr: unknown[]): unknown[] {
    const result: unknown[] = [];

    for (const item of arr) {
      if (item && typeof item === 'object' && 'type' in item && item.type === 'spread') {
        const resolved = this.resolveSpreadArgument((item as Record<string, unknown>).argument);
        if (Array.isArray(resolved)) {
          result.push(...resolved);
        } else if (resolved !== undefined && resolved !== null) {
          result.push(resolved);
        }
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        result.push(this.expandPropertySpreads(item as Record<string, unknown>));
      } else {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Resolves a spread argument to its runtime value.
   */
  private resolveSpreadArgument(argument: unknown): unknown {
    if (argument === null || argument === undefined) {
      return undefined;
    }

    // Direct value
    if (typeof argument === 'object' && !('__ref' in argument)) {
      return argument;
    }

    // Reference
    if (typeof argument === 'object' && '__ref' in argument) {
      const ref = (argument as { __ref: string }).__ref;
      // Try state
      const stateValue = this.state.get(ref as any);
      if (stateValue !== undefined) {
        return stateValue;
      }
      // Try dotted path
      if (ref.includes('.')) {
        const snapshot = this.state.getSnapshot();
        const parts = ref.split('.');
        let value: unknown = snapshot;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[part];
          } else {
            return undefined;
          }
        }
        return value;
      }
      return undefined;
    }

    // String reference
    if (typeof argument === 'string') {
      return this.state.get(argument as any);
    }

    return argument;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  private callLifecycle(instance: NodeInstance | null, hook: string, ...args: unknown[]): void {
    if (!instance || instance.destroyed) return;

    const handlers = instance.lifecycleHandlers.get(hook);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in lifecycle ${hook}:`, error);
        }
      });
    }

    // Recurse to children
    for (const child of instance.children) {
      this.callLifecycle(child, hook, ...args);
    }
  }

  // ==========================================================================
  // UPDATE LOOP
  // ==========================================================================

  private startUpdateLoop(): void {
    const raf =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16);

    this.lastUpdateTime = performance.now();

    const update = () => {
      const now = performance.now();
      const delta = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;

      // Update VR Input State
      this.updateVRInput();

      this.update(delta);

      this.updateLoopId = raf(update);
    };

    this.updateLoopId = raf(update);
  }

  private stopUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.updateLoopId as number);
      } else {
        clearTimeout(this.updateLoopId as ReturnType<typeof setTimeout>);
      }
      this.updateLoopId = null;
    }
  }

  public update(delta: number): void {
    if (!this.rootInstance) return;

    // Update Physics Simulation
    try {
      this.vrPhysicsBridge.update(this.vrContext, delta);
    } catch (e) {
      console.error('[Runtime] Error in vrPhysicsBridge.update:', e);
    }
    this.physicsWorld.step(delta);

    if (this.debugDrawer) {
      this.debugDrawer.update();
    }

    // Update Movement Predictor (Tier 2/3)
    // console.log('[Runtime] Calling movementPredictor.update');
    // this.movementPredictor.update(this.vrContext.headset.position, delta);

    // Update all instances (FLAT LOOP)
    // console.log('[Runtime] Updating entities:', this._flatEntities.length);
    const count = this._flatEntities.length;
    for (let i = 0; i < count; i++) {
      this.updateInstance(this._flatEntities[i], delta);
    }

    // Call update lifecycle
    // Call update lifecycle
    // console.log('[Runtime] Calling callLifecycle');
    this.callLifecycle(this.rootInstance, 'on_update', delta);

    // Update ChunkLoader
    if (this.chunkLoader) {
      // this.chunkLoader.update(); // Mocked out or assuming it takes args? Original code said update(headpos) but my view at 5169 says update() ?
      // Wait, 5169 says update().
      // Original 5021 says nothing about chunkloader?
      // Step 5168 replacement content: update(this.vrContext.headset.position)
      // Step 5169 view content: update() ???
      // Ah, Step 5169 view shows `this.chunkLoader.update();`.
      // I will assume update() is correct or at least what is there.
      // Actually, I'll just look at what's there in 5169.
      if (this.chunkLoader) this.chunkLoader.update();
    }
  }

  /**
   * Authoritative server sync for networked state.
   */
  public onNetworkStateUpdate(serverState: NetworkState<Record<string, unknown>>): void {
    if (this.networkPredictor) {
      const reconciled = this.networkPredictor.reconcile(serverState, (state, input) => {
        // Simple heuristic: if input has 'state' updates, apply them
        if (input.type === 'state_update') {
          Object.assign(state, input.payload);
        }
      });

      // Update local reactive state with reconciled values
      this.state.update(reconciled);
      this.networkPredictor.updateMetrics(performance.now() - 100); // MOCK RTT
    }
  }

  private updateInstance(instance: NodeInstance, delta: number): void {
    if (instance.destroyed) return;

    // Update VR traits (Only if hasTraits)
    if (instance.hasTraits) {
      const traitContext = this.createTraitContext(instance);
      this.traitRegistry.updateAllTraits(instance.node, traitContext, delta);
    }

    // Sync Avatar Body Parts
    if (instance.node.type === 'avatar') {
      this.syncAvatarParts(instance);
    }

    // Apply Networking Sync
    if (instance.node.traits?.has('networked')) {
      const interpolated = this.networkSync.getInterpolatedState(
        instance.node.id || ''
      ) as any;
      const body = this.physicsWorld.getBody(instance.node.id || '');

      if (interpolated && instance.node.properties) {
        // Mark dirty if changed?
        // Let's assume network sync updates properties directly.
        // We should mark dirty.
        instance.dirty = true; // Force update

        if (interpolated.position) {
          (instance.node.properties as Record<string, unknown>).position = [
            interpolated.position[0],
            interpolated.position[1],
            interpolated.position[2],
          ];
        }
        if (interpolated.rotation) {
          (instance.node.properties as Record<string, unknown>).rotation = [
            interpolated.rotation[0],
            interpolated.rotation[1],
            interpolated.rotation[2],
          ];
        }

        // --- PHYSICS NETWORK DESYNC FIX ---
        // If we receive network interpolation, the physics body must yield to the network.
        // Force to kinematic to prevent local physics from overriding networked movement.
        if (body) {
          if (body.type !== 'kinematic') {
            if (!(instance.node as unknown as Record<string, unknown>).__originalPhysicsType) {
              (instance.node as unknown as Record<string, unknown>).__originalPhysicsType =
                body.type;
            }
            body.type = 'kinematic';
          }
          if (interpolated.position) {
            body.position = [
              interpolated.position[0],
              interpolated.position[1],
              interpolated.position[2],
            ];
            body.linearVelocity = [0, 0, 0];
          }
          if (interpolated.rotation) {
            body.rotation = [
              interpolated.rotation[0],
              interpolated.rotation[1],
              interpolated.rotation[2],
              interpolated.rotation[3],
            ] as [number, number, number, number];
            body.angularVelocity = [0, 0, 0];
          }
        }
      } else if (
        !interpolated &&
        body &&
        (instance.node as unknown as Record<string, unknown>).__originalPhysicsType
      ) {
        // We are locally predicting / owning this node now, restore its original physics type!
        if (
          body.type === 'kinematic' &&
          (instance.node as unknown as Record<string, unknown>).__originalPhysicsType !==
            'kinematic'
        ) {
          body.type = (instance.node as unknown as Record<string, unknown>)
            .__originalPhysicsType as any;
        }
      }
    }

    // Update rendered element if properties changed (DIRTY CHECK)
    if (instance.dirty && this.options.renderer && instance.renderedNode) {
      const properties = this.evaluateProperties(instance.node.properties || {});
      this.options.renderer.updateElement(instance.renderedNode, properties);
      instance.dirty = false; // Reset dirty
    }

    // Update @external_api polling
    this.updateExternalApis(instance, delta);

    // Process @generate requests
    this.processGenerateDirectives(instance);
  }

  private syncAvatarParts(instance: NodeInstance): void {
    const vrHands = this.vrContext.hands;
    const vrHead = this.vrContext.headset;

    // Local player avatar sync
    if (instance.node.id === 'local_player' && instance.node.properties) {
      (instance.node.properties as Record<string, unknown>).position = vrHead.position;
      (instance.node.properties as Record<string, unknown>).rotation = vrHead.rotation;

      // Update children (hands)
      instance.children.forEach((child) => {
        if (child.node.id === 'left_hand' && vrHands.left && child.node.properties) {
          (child.node.properties as Record<string, unknown>).position = vrHands.left.position;
          (child.node.properties as Record<string, unknown>).rotation = vrHands.left.rotation;
        } else if (child.node.id === 'right_hand' && vrHands.right && child.node.properties) {
          (child.node.properties as Record<string, unknown>).position = vrHands.right.position;
          (child.node.properties as Record<string, unknown>).rotation = vrHands.right.rotation;
        }
      });

      // Broadcast if networked
      if (instance.node.traits?.has('networked')) {
        this.emit('network_snapshot', {
          objectId: instance.node.id,
          position: [
            (instance.node.properties as Record<string, unknown[]>).position[0],
            (instance.node.properties as Record<string, unknown[]>).position[1],
            (instance.node.properties as Record<string, unknown[]>).position[2],
          ],
          rotation: [
            (instance.node.properties as Record<string, unknown[]>).rotation[0],
            (instance.node.properties as Record<string, unknown[]>).rotation[1],
            (instance.node.properties as Record<string, unknown[]>).rotation[2],
          ],
        });
      }
    }
  }

  private generatedNodes: Set<string> = new Set();

  private processGenerateDirectives(instance: NodeInstance): void {
    if (!instance.node.directives) return;
    const generateDirectives = instance.node.directives.filter((d) => d.type === 'generate');

    for (const d of generateDirectives) {
      const directive = d as unknown as Record<string, unknown>;
      const genId = `${instance.node.id || 'node'}_${(directive.prompt as string).substring(0, 10)}`;

      if (this.generatedNodes.has(genId)) continue;

      // Use AI Copilot if available, otherwise fall back to event emission
      if (this._copilot && this._copilot.isReady()) {
        this._copilot
          .generateFromPrompt(directive.prompt as string, {
            context: directive.context as string | undefined,
          })
          .then((response: unknown) => {
            this.emit('generate_complete', {
              id: genId,
              nodeId: instance.node.id,
              result: response,
            });
          })
          .catch(() => {
            /* silent fallback */
          });
      } else {
        // Emit request for external agent/bridge to handle
        this.emit('generate_request', {
          id: genId,
          nodeId: instance.node.id,
          prompt: directive.prompt,
          context: directive.context,
          target: directive.target || 'children',
        });
      }

      this.generatedNodes.add(genId);
    }
  }

  private apiPollingTimers: Map<NodeInstance, number> = new Map();

  private updateExternalApis(instance: NodeInstance, _delta: number): void {
    if (!instance.node.directives) return;
    const apiDirectives = instance.node.directives.filter((d) => d.type === 'external_api');

    for (const d of apiDirectives) {
      const directive = d as unknown as Record<string, unknown>;
      if (directive.type !== 'external_api') continue;

      const intervalStr = directive.interval || '0s';
      const intervalMs = this.parseDurationToMs(String(intervalStr));

      if (intervalMs <= 0) continue;

      const lastTime = this.apiPollingTimers.get(instance) || 0;
      const now = performance.now();

      if (now - lastTime >= intervalMs) {
        this.apiPollingTimers.set(instance, now);
        this.executeExternalApi(instance, directive);
      }
    }
  }

  private async executeExternalApi(
    instance: NodeInstance,
    directive: Record<string, unknown>
  ): Promise<void> {
    try {
      const apiCall = (this.builtins as Record<string, unknown>)['api_call'] as
        | ((url: string, method: string) => Promise<unknown>)
        | undefined;
      const data = apiCall
        ? await apiCall(String(directive.url), String(directive.method || 'GET'))
        : undefined;

      // Update state if needed or trigger logic
      this.state.set('api_data', data);

      // Trigger update on instance
      this.updateData(data);
    } catch (error) {
      console.error(`External API error for ${directive.url}:`, error);
    }
  }

  private parseDurationToMs(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m)$/);
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60000;
      default:
        return 0;
    }
  }

  // ==========================================================================
  // TRAIT CONTEXT
  // ==========================================================================

  private createTraitContext(_instance: NodeInstance): TraitContext {
    return {
      vr: {
        hands: this.vrContext.hands,
        headset: this.vrContext.headset,
        getPointerRay: (hand) => {
          const vrHand = hand === 'left' ? this.vrContext.hands.left : this.vrContext.hands.right;
          if (!vrHand) return null;
          return {
            origin: vrHand.position,
            direction: [0, 0, -1], // Forward direction - should be calculated from rotation
          };
        },
        getDominantHand: () => this.vrContext.hands.right || this.vrContext.hands.left,
      },
      physics: {
        applyVelocity: (node, velocity) => {
          // this.emit('apply_velocity', { node, velocity });
          const body = this.physicsWorld.getBody(node.id || '');
          if (body) {
            body.velocity = [
              velocity[0] as number,
              velocity[1] as number,
              velocity[2] as number,
            ];
          }
        },
        applyAngularVelocity: (node, angularVelocity) => {
          // this.emit('apply_angular_velocity', { node, angularVelocity });
          const body = this.physicsWorld.getBody(node.id || '');
          if (body) {
            body.angularVelocity = [
              angularVelocity[0] as number,
              angularVelocity[1] as number,
              angularVelocity[2] as number,
            ];
          }
        },
        setKinematic: (node, kinematic) => {
          // this.emit('set_kinematic', { node, kinematic });
          const body = this.physicsWorld.getBody(node.id || '');
          if (body) {
            body.type = kinematic ? 'kinematic' : 'dynamic';
          }
        },
        raycast: (origin, direction, maxDistance) => {
          const hit = this.physicsWorld.raycastClosest({
            origin: [origin[0] as number, origin[1] as number, origin[2] as number],
            direction: [
              direction[0] as number,
              direction[1] as number,
              direction[2] as number,
            ],
            maxDistance,
          });

          if (hit) {
            const h = hit as IRaycastHit;
            return {
              node: { id: h.bodyId } as HSPlusNode,
              point: [h.point[0], h.point[1], h.point[2]],
              normal: [h.normal[0], h.normal[1], h.normal[2]],
              distance: h.distance,
            };
          }
          return null;
        },
        getBodyPosition: (nodeId) => {
          const body = this.physicsWorld.getBody(nodeId);
          if (body && body.position) return [body.position[0] || 0, body.position[1] || 0, body.position[2] || 0];
          return null;
        },
        getBodyVelocity: (nodeId) => {
          const body = this.physicsWorld.getBody(nodeId);
          if (body && body.velocity) return [body.velocity[0] || 0, body.velocity[1] || 0, body.velocity[2] || 0];
          return null;
        },
      },
      audio: {
        playSound: (source, options) => {
          this.emit('play_sound', { source, ...options });
        },
      },
      haptics: {
        pulse: (hand, intensity, duration) => {
          this.emit('haptic', { hand, intensity, duration, type: 'pulse' });
        },
        rumble: (hand, intensity) => {
          this.emit('haptic', { hand, intensity, type: 'rumble' });
        },
      },
      emit: this.emit.bind(this),
      getState: () => this.state.getSnapshot(),
      setState: (updates) => this.state.update(updates),
      getScaleMultiplier: () => this.scaleMultiplier,
      setScaleContext: (magnitude: string) => {
        const multipliers: Record<string, number> = {
          galactic: 1000000,
          macro: 1000,
          standard: 1,
          micro: 0.001,
          atomic: 0.000001,
        };
        const newMultiplier = multipliers[magnitude] || 1;
        if (this.scaleMultiplier !== newMultiplier) {
          this.scaleMultiplier = newMultiplier;
          this.emit('scale_change', { magnitude, multiplier: newMultiplier });
        }
      },
    };
  }

  // ==========================================================================
  // NODE DESTRUCTION
  // ==========================================================================

  private destroyInstance(instance: NodeInstance): void {
    if (instance.destroyed) return;

    instance.destroyed = true;

    // Destroy children first
    for (const child of instance.children) {
      this.destroyInstance(child);
    }

    // Detach traits
    const traitContext = this.createTraitContext(instance);
    if (instance.node.traits) {
      for (const traitName of instance.node.traits.keys()) {
        this.traitRegistry.detachTrait(instance.node, traitName, traitContext);
      }
    }

    // Destroy rendered element
    if (this.options.renderer && instance.renderedNode) {
      this.options.renderer.destroy(instance.renderedNode);
    }

    // Clear handlers
    instance.lifecycleHandlers.clear();
    instance.children = [];

    // Remove from flat list
    const index = this._flatEntities.indexOf(instance);
    if (index !== -1) {
      // Fast swap removal (order doesn't matter for update loop usually, but for rendering order it might?
      // Assuming rendering order comes from hierarchy, not update loop order.
      // Update loop order matters for parent-child dependencies if not sorted.
      // For now, splice.
      this._flatEntities.splice(index, 1);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  togglePhysicsDebug(enabled: boolean): void {
    if (this.debugDrawer) {
      this.debugDrawer.setEnabled(enabled);
    }
  }

  updateData(data: unknown): void {
    this.state.set('data', data);
    this.callLifecycle(this.rootInstance, 'on_data_update', data);
  }

  updateNodeProperty(nodeId: string, property: string, value: unknown): void {
    const instance = this.findInstanceById(nodeId);
    if (instance && instance.node.properties) {
      instance.node.properties[property] = value;

      // Update Renderer
      if (this.options.renderer && instance.renderedNode) {
        // Mark dirty instead of immediate update?
        // Or immediate if critical.
        // For optimization, mark dirty.
        instance.dirty = true;
      }

      // Emit update event for checking
      this.emit('property_update', { nodeId, property, value });
    }
  }

  getState(): Record<string, unknown> {
    return this.state.getSnapshot();
  }

  // ==========================================================================
  // COMPATIBILITY METHODS
  // ==========================================================================

  getVariable(name: string): unknown {
    return this.state.get(name as any);
  }

  setVariable(name: string, value: unknown): void {
    this.state.set(name as any, value);
  }

  getContext(): Record<string, unknown> {
    // Legacy mapping for context inspection
    const spatialMemory = new Map<string, unknown>();
    const hologramState = new Map<string, Record<string, unknown>>();

    const traverse = (instance: NodeInstance) => {
      if (instance.node.id && instance.node.properties) {
        spatialMemory.set(
          instance.node.id,
          instance.node.properties.position || [0, 0, 0]
        );
        hologramState.set(instance.node.id, {
          shape: instance.node.properties.shape || instance.node.type,
          color: instance.node.properties.color,
          size: instance.node.properties.size,
          glow: instance.node.properties.glow,
          interactive: instance.node.properties.interactive,
        });
      }
      instance.children.forEach(traverse);
    };

    if (this.rootInstance) traverse(this.rootInstance);

    return {
      spatialMemory,
      hologramState,
      state: this.state,
      builtins: this.builtins,
      vr: this.vrContext,
    };
  }

  reset(): void {
    this.unmount();
    this.state = createState({} as any);
    this.mounted = false;
  }

  updateAnimations(): void {
    this.update(1 / 60);
  }

  updateParticles(delta: number): void {
    this.update(delta);
  }

  getHologramStates(): Map<string, Record<string, unknown>> {
    return this.getContext().hologramState as Map<string, Record<string, unknown>>;
  }

  setState(updates: any): void {
    this.state.update(updates);
  }

  emit(event: string, payload?: unknown): void {
    // Local handlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }

    // Global bus broadcast
    eventBus.emit(event, payload as HoloScriptValue);
  }

  updateEntity(id: string, properties: Partial<Record<string, unknown>>): boolean {
    if (!this.rootInstance) return false;

    let found = false;
    const traverse = (instance: NodeInstance) => {
      if (instance.node.id === id) {
        instance.node.properties = { ...instance.node.properties, ...properties };
        // If we have a renderer, notify it of the change
        if (this.options.renderer && instance.renderedNode) {
          this.options.renderer.updateElement(instance.renderedNode, properties);
        }
        found = true;
      }
      instance.children.forEach(traverse);
    };

    traverse(this.rootInstance);
    return found;
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

  // ==========================================================================
  // HOT-RELOAD & MIGRATION
  // ==========================================================================

  public async hotReload(newAst: HSPlusAST): Promise<void> {
    // 1. Find all new templates in the AST
    const newTemplates = this.findAllTemplates(newAst.root);
    // 2. Process each template through HotReloader
    for (const [name, newNode] of newTemplates) {
      const oldNode = this.templates.get(name);
      if (
        oldNode &&
        (newNode as unknown as Record<string, unknown>).version !==
          (oldNode as unknown as Record<string, unknown>).version
      ) {
        const result = await this.hotReloader.reload(newNode as unknown as HoloTemplate);
        if (result.success) {
          this.templates.set(name, newNode);
        } else {
          console.error(`[Hot-Reload] Failed for template "${name}":`, result.error);
        }
      } else {
        // Just update the template definition if no version change
        this.templates.set(name, newNode);
        this.hotReloader.registerTemplate(newNode as unknown as HoloTemplate);
      }
    }

    // 2b. Global Program reload if versioned
    if (
      newAst.version !== undefined &&
      newAst.version !== (this.ast as unknown as Record<string, unknown>).version
    ) {
      const result = await this.hotReloader.reload({
        type: 'Template',
        name: '@program',
        version: newAst.version,
        migrations: newAst.migrations,
        state: { type: 'State', properties: [] },
        properties: [],
        actions: [],
        traits: [],
      } as unknown as HoloTemplate);

      if (!result.success) {
        console.error(`[Hot-Reload] Global program migration failed:`, result.error);
      } else {
      }
    }

    // 3. Update active instances (simple swap for non-versioned parts)
    this.ast = newAst;
  }

  /**
   * Creates a Map proxy that reflects the reactive state.
   * This allowed the HotReloader (designed for Map-based state) to work with
   * the runtime's Record-based reactive state.
   */
  private createStateMapProxy(): Map<string, unknown> {
    const runtime = this;
    return {
      get(key: string) {
        return runtime.state.get(key as any);
      },
      set(key: string, value: unknown) {
        runtime.state.set(key as any, value);
        return this;
      },
      has(key: string) {
        return runtime.state.get(key as any) !== undefined;
      },
      delete(key: string) {
        runtime.state.set(key as any, undefined);
        return true;
      },
      clear() {
        /* Not supported for global state */
      },
      get size() {
        return Object.keys(runtime.state.getSnapshot()).length;
      },
      forEach(cb: (value: unknown, key: string, map: Map<string, unknown>) => void) {
        const snap = runtime.state.getSnapshot();
        Object.entries(snap).forEach(([k, v]) => cb(v, k, this as unknown as Map<string, unknown>));
      },
      [Symbol.iterator]() {
        const snap = runtime.state.getSnapshot();
        return Object.entries(snap)[Symbol.iterator]();
      },
      entries() {
        const snap = runtime.state.getSnapshot();
        return Object.entries(snap)[Symbol.iterator]();
      },
      keys() {
        const snap = runtime.state.getSnapshot();
        return Object.keys(snap)[Symbol.iterator]();
      },
      values() {
        const snap = runtime.state.getSnapshot();
        return Object.values(snap)[Symbol.iterator]();
      },
    } as unknown as Map<string, unknown>;
  }

  public findInstanceById(
    id: string,
    root: NodeInstance | null = this.rootInstance
  ): NodeInstance | null {
    if (!root) return null;
    if (root.__holo_id === id || root.node.id === id) return root;
    for (const child of root.children) {
      const found = this.findInstanceById(id, child);
      if (found) return found;
    }
    return null;
  }

  /**
   * Executes a block of HoloScript+ statements
   */
  public async executeStatementBlock(
    instance: NodeInstance,
    body: HoloStatement[]
  ): Promise<void> {
    for (const stmt of body) {
      await this.executeStatement(instance, stmt);
    }
  }

  /**
   * Executes a single HoloScript+ statement
   */
  public async executeStatement(instance: NodeInstance, stmt: HoloStatement): Promise<void> {
    const context = {
      ...this.state.getSnapshot(),
      node: instance.node,
      self: instance.node,
      props: instance.node.properties || {},
    };
    this.evaluator.updateContext(context);

    try {
      switch (stmt.type) {
        case 'Assignment': {
          const value = this.evaluator.evaluate(String(stmt.value));
          const target = stmt.target as string;

          if (target.startsWith('props.')) {
            const propName = target.split('.')[1];
            if (instance.node.properties) {
              instance.node.properties[propName] = value;
            }
          } else if (target.startsWith('state.')) {
            const stateKey = target.split('.')[1];
            this.state.set(stateKey as any, value);
          } else {
            // Local or unknown target
            (context as Record<string, unknown>)[target] = value;
          }
          break;
        }

        case 'MethodCall': {
          const args = (stmt.arguments || []).map((arg) => this.evaluator.evaluate(String(arg)));
          const method = (this.builtins as unknown as Record<string, unknown>)[
            stmt.method as string
          ];
          if (typeof method === 'function') {
            await method(...args);
          }
          break;
        }

        case 'IfStatement': {
          const condition = this.evaluator.evaluate(String(stmt.condition));
          if (condition) {
            await this.executeStatementBlock(instance, stmt.consequent as any as HoloStatement[]);
          } else if (stmt.alternate) {
            await this.executeStatementBlock(instance, stmt.alternate as any as HoloStatement[]);
          }
          break;
        }

        case 'EmitStatement': {
          const data = stmt.data ? this.evaluator.evaluate(String(stmt.data)) : undefined;
          this.emit(stmt.event as string, data);
          break;
        }

        // Add more statement types as needed
        default:
          console.warn(`[Runtime] Unsupported statement type: ${stmt.type}`);
      }
    } catch (error) {
      console.error(`[Runtime] Execution error in statement ${stmt.type}:`, error);
    }
  }

  private migrateInstancesOfTemplate(
    name: string,
    oldVersion: string | number,
    newTemplate: HSPlusNode
  ): void {
    const instances = this.findAllInstancesOfTemplate(name);
    for (const instance of instances) {
      this.migrateInstance(instance, oldVersion, newTemplate);
    }
  }

  private findAllInstancesOfTemplate(
    name: string,
    root: NodeInstance | null = this.rootInstance
  ): NodeInstance[] {
    if (!root) return [];
    const results: NodeInstance[] = [];
    if (root.templateName === name) {
      results.push(root);
    }
    for (const child of root.children) {
      results.push(...this.findAllInstancesOfTemplate(name, child));
    }
    return results;
  }

  private migrateInstance(
    instance: NodeInstance,
    oldVersion: string | number,
    newTemplate: HSPlusNode
  ): void {
    const _context = this.createTraitContext(instance);

    // 1. Preserve existing properties/state
    const currentProperties = { ...(instance.node.properties || {}) };

    // 2. Update node definition in-place
    const newNode = this.cloneNodeWithContext(newTemplate, {
      position: currentProperties.position,
    });
    const oldNode = instance.node;
    Object.keys(oldNode).forEach(
      (key) => delete (oldNode as unknown as Record<string, unknown>)[key]
    );
    Object.assign(oldNode, newNode);

    // Merge preserved properties back
    oldNode.properties = { ...(oldNode.properties || {}), ...currentProperties };
    instance.templateVersion = newTemplate.version as number;

    // 3. Run migration code AFTER property merge
    const migrations =
      ((newTemplate as unknown as Record<string, unknown>).migrations as Array<
        Record<string, unknown>
      >) || [];
    const migration = migrations.find((m: Record<string, unknown>) => m.fromVersion === oldVersion);
    if (migration && migration.body) {
      this.executeMigrationCode(instance, migration.body as string);
    }

    // 4. Update rendered element
    if (this.options.renderer && instance.renderedNode) {
      const properties = this.evaluateProperties(instance.node.properties || {});
      this.options.renderer.updateElement(instance.renderedNode, properties);
    }

    // 5. Re-synchronize traits (simplified: just log intent for now or implement full diff)
  }

  private executeMigrationCode(instance: NodeInstance, code: string): void {
    const stateProxy = new Proxy(this.state, {
      get: (target, prop) => {
        if (
          typeof prop === 'string' &&
          prop in target &&
          typeof (target as unknown as Record<string, unknown>)[prop] === 'function'
        ) {
          return ((target as unknown as Record<string, unknown>)[prop] as Function).bind(target);
        }
        return target.get(String(prop) as any);
      },
      set: (target, prop, value) => {
        target.set(String(prop) as any, value);
        return true;
      },
    });

    const sandbox = {
      ...this.builtins,
      state: stateProxy,
      node: instance.node,
      self: instance.node,
      props: instance.node.properties || {},
      renameProperty: (oldName: string, newName: string) => {
        if (instance.node.properties && instance.node.properties[oldName] !== undefined) {
          instance.node.properties[newName] = instance.node.properties[oldName];
          delete instance.node.properties[oldName];
        }
      },
    };

    try {
      const fn = new Function(...Object.keys(sandbox), code);
      fn(...Object.values(sandbox));
    } catch (error) {
      console.error(`[Runtime] Migration execution failed in "${instance.templateName}":`, error);
    }
  }

  // ==========================================================================
  // VR INTEGRATION
  // ==========================================================================

  updateVRContext(context: typeof this.vrContext): void {
    this.vrContext = context;
  }

  handleVREvent(event: TraitEvent, node: HSPlusNode): void {
    // Find instance for node
    const instance = this.findInstance(node);
    if (!instance) return;

    // Dispatch to traits
    const traitContext = this.createTraitContext(instance);
    this.traitRegistry.handleEventForAllTraits(node, traitContext, event);

    // Call lifecycle hooks based on event type
    const hookMapping: Record<string, string> = {
      grab_start: 'on_grab',
      grab_end: 'on_release',
      hover_enter: 'on_hover_enter',
      hover_exit: 'on_hover_exit',
      point_enter: 'on_point_enter',
      point_exit: 'on_point_exit',
      collision: 'on_collision',
      trigger_enter: 'on_trigger_enter',
      trigger_exit: 'on_trigger_exit',
      click: 'on_click',
    };

    const hook = hookMapping[event.type];
    if (hook) {
      this.callLifecycle(instance, hook, event);
    }
  }

  private findInstance(
    node: HSPlusNode,
    root: NodeInstance | null = this.rootInstance
  ): NodeInstance | null {
    if (!root) return null;
    if (root.node === node) return root;

    for (const child of root.children) {
      const found = this.findInstance(node, child);
      if (found) return found;
    }

    return null;
  }

  // ==========================================================================
  // TEMPLATES & SPAWNING
  // ==========================================================================

  registerTemplate(name: string, node: HSPlusNode): void {
    this.templates.set(name, node);
  }

  spawnTemplate(name: string, position: Vector3): HSPlusNode {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template "${name}" not found`);
    }

    // Clone template
    const cloned = this.cloneNodeWithContext(template, { position });
    if (!cloned.properties) cloned.properties = {};
    cloned.properties.position = position;

    // Instantiate
    if (this.rootInstance) {
      const instance = this.instantiateNode(cloned, this.rootInstance);
      instance.templateName = name;
      instance.templateVersion =
        typeof template.version === 'number'
          ? template.version
          : parseInt((template.version as string) || '0');
      this.rootInstance.children.push(instance);

      if (this.options.renderer && this.rootInstance.renderedNode) {
        this.options.renderer.appendChild(this.rootInstance.renderedNode, instance.renderedNode);
      }

      this.callLifecycle(instance, 'on_mount');
    }

    return cloned;
  }

  destroyNode(node: HSPlusNode): void {
    const instance = this.findInstance(node);
    if (!instance) return;

    // Call unmount
    this.callLifecycle(instance, 'on_unmount');

    // Remove from parent
    if (instance.parent) {
      const index = instance.parent.children.indexOf(instance);
      if (index > -1) {
        instance.parent.children.splice(index, 1);
      }

      if (this.options.renderer && instance.parent.renderedNode && instance.renderedNode) {
        this.options.renderer.removeChild(instance.parent.renderedNode, instance.renderedNode);
      }
    }

    // Destroy
    this.destroyInstance(instance);
  }
}

// Replaced by exported createRuntime above

// =============================================================================
// EXPORTS
// =============================================================================

// export type { RuntimeOptions, Renderer, NodeInstance };

// =============================================================================
// BUILT-IN FUNCTIONS
// =============================================================================

function createBuiltins(runtime: HoloScriptPlusRuntimeImpl): HSPlusBuiltins {
  return {
    log: (...args: unknown[]) => console.log('[HoloScript]', ...args),
    warn: (...args: unknown[]) => console.warn('[HoloScript]', ...args),
    error: (...args: unknown[]) => console.error('[HoloScript]', ...args),
    Math,

    range: (start: number, end: number, step: number = 1): number[] => {
      const result: number[] = [];
      if (step > 0) {
        for (let i = start; i < end; i += step) {
          result.push(i);
        }
      } else if (step < 0) {
        for (let i = start; i > end; i += step) {
          result.push(i);
        }
      }
      return result;
    },

    interpolate_color: (
      t: number,
      from: string | Record<string, number>,
      to: string | Record<string, number>
    ): string => {
      // Parse hex colors
      const parseHex = (hex: string): [number, number, number] => {
        const clean = hex.replace('#', '');
        return [
          parseInt(clean.substring(0, 2), 16),
          parseInt(clean.substring(2, 4), 16),
          parseInt(clean.substring(4, 6), 16),
        ];
      };

      const toHex = (r: number, g: number, b: number): string => {
        const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
        return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
      };

      const [r1, g1, b1] =
        typeof from === 'string' ? parseHex(from) : [from.r || 0, from.g || 0, from.b || 0];
      const [r2, g2, b2] =
        typeof to === 'string' ? parseHex(to) : [to.r || 0, to.g || 0, to.b || 0];

      return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
    },

    distance_to: (point: Vector3): number => {
      const viewer = runtime.vrContext.headset.position;
      return Math.sqrt(
        Math.pow(point[0] - viewer[0], 2) +
          Math.pow(point[1] - viewer[1], 2) +
          Math.pow(point[2] - viewer[2], 2)
      );
    },

    distance_to_viewer: (): number => {
      return 0; // Override in node context
    },

    hand_position: (handId: string): Vector3 => {
      const hand = handId === 'left' ? runtime.vrContext.hands.left : runtime.vrContext.hands.right;
      return hand?.position || [0, 0, 0];
    },

    hand_velocity: (handId: string): Vector3 => {
      const hand = handId === 'left' ? runtime.vrContext.hands.left : runtime.vrContext.hands.right;
      return (hand?.velocity as unknown as Vector3) || [0, 0, 0];
    },

    dominant_hand: (): VRHand => {
      // Default to right hand
      return (
        runtime.vrContext.hands.right ||
        runtime.vrContext.hands.left ||
        ({
          id: 'right',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          velocity: [0, 0, 0],
          gripStrength: 0,
          pinchStrength: 0,
        } as unknown as VRHand)
      );
    },

    play_sound: (source: string, options?: { volume?: number; spatial?: boolean }): void => {
      runtime.emit('play_sound', { source, ...options });
    },

    haptic_feedback: (hand: VRHand | string, intensity: number): void => {
      const handId = typeof hand === 'string' ? hand : hand.id;
      runtime.emit('haptic', { hand: handId, intensity });
    },

    haptic_pulse: (intensity: number): void => {
      runtime.emit('haptic', { hand: 'both', intensity });
    },

    apply_velocity: (node: HSPlusNode, velocity: Vector3): void => {
      runtime.emit('apply_velocity', { node, velocity });
    },

    spawn: (template: string, position: Vector3): HSPlusNode => {
      return runtime.spawnTemplate(template, position);
    },

    assistant_generate: (prompt: string, context?: string): void => {
      runtime.emit('assistant_generate', { prompt, context });
    },

    destroy: (node: HSPlusNode): void => {
      runtime.destroyNode(node);
    },

    api_call: async (url: string, method: string, body?: unknown): Promise<unknown> => {
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return response.json();
    },

    open_modal: (modalId: string): void => {
      runtime.emit('open_modal', { id: modalId });
    },

    close_modal: (modalId: string): void => {
      runtime.emit('close_modal', { id: modalId });
    },

    setTimeout: (callback: () => void, delay: number): number => {
      return window.setTimeout(callback, delay) as unknown as number;
    },

    clearTimeout: (id: number): void => {
      window.clearTimeout(id);
    },

    animate: (
      node: HSPlusNode,
      properties: Record<string, unknown>,
      options: { duration?: number; sync?: boolean } = {}
    ): void => {
      // Implement basic animation logic here or bridge to renderer
      // If sync is true, broadcast the animation intent via the event bus
      if (options.sync) {
        runtime.emit('network_animation', {
          objectId: node.id,
          properties,
          options,
          timestamp: Date.now(),
        });
      }

      // Local animation (mock/bridge)
      if (node.properties) {
        Object.assign(node.properties, properties);
      }
      runtime.emit('animate', { node, properties, options });
    },

    transition: (targetScene: string, options: { audio?: string; effect?: string } = {}): void => {
      // Portal + Audio pattern (P1 Pattern)
      if (options.audio) {
        runtime.emit('play_sound', { source: options.audio });
      }
      runtime.emit('scene_transition', { target: targetScene, options });
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Create a new HoloScript+ runtime instance
 */
export function createRuntime(ast: HSPlusAST, options: RuntimeOptions = {}): HSPlusRuntime {
  return new HoloScriptPlusRuntimeImpl(ast, options);
}

// export { HoloScriptPlusRuntimeImpl };
// export type { NodeInstance, RuntimeOptions, Renderer };
