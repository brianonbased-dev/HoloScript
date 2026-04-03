/**
 * HoloScript Runtime Engine
 *
 * Executes HoloScript AST in VR environment with spatial computation.
 * Supports:
 * - Orb creation and manipulation
 * - Function definition and invocation with arguments
 * - Connections and reactive data flow
 * - Gates (conditionals)
 * - Streams (data pipelines)
 * - 2D UI elements
 * - Built-in commands (show, hide, animate, pulse)
 * - Expression evaluation
 * - Event system
 */

import { logger } from './logger';
import { WebSocketServer, WebSocket } from 'ws';
import { TimeManager } from './orbital/TimeManager';
import { ExpressionEvaluator, createState } from './ReactiveState';
import { eventBus } from './runtime/EventBus';
import { StateSynchronizer } from './network/StateSynchronizer';
import { AttentionEngine } from './orbital/AttentionEngine';
import { telemetry } from './monitoring/telemetry';
import { stateMachineInterpreter } from './runtime/StateMachineInterpreter';
import { HoloScriptAgentRuntime } from './HoloScriptAgentRuntime';
import { mitosisHandler } from './traits/MitosisTrait';
import { orbitalHandler } from './traits/OrbitalTrait';
import { TraitHandler } from './traits/TraitTypes';
import type { TraitEvent } from './traits/TraitTypes';
import type { HSPlusNode } from './types/HoloScriptPlus';
import type { HSPlusDirective, HSPlusTraitDirective } from './types/AdvancedTypeSystem';
import { ExtensionRegistry } from './extensions/ExtensionRegistry';
// ExtensionInterface consumed by ExtensionRegistry
import type {
  HoloComposition,
  HoloTemplate,
  HoloObjectDecl,
  HoloValue,
  HoloStatement,
  HoloExpression,
} from './parser/HoloCompositionTypes';
import { BaseVoiceSynthesizer } from './runtime/BaseVoiceSynthesizer';
import { registerVoiceSynthesizer } from './runtime/VoiceSynthesizer';
import { LocalEmotionDetector } from './runtime/LocalEmotionDetector';
import { registerEmotionDetector } from './runtime/EmotionDetector';
import { MockSpeechRecognizer } from './runtime/MockSpeechRecognizer';
import { registerSpeechRecognizer } from './runtime/SpeechRecognizer';
import { MethodMemoize, ObjectPool } from './runtime/RuntimeOptimization';
import type {
  ASTNode,
  OrbNode,
  MethodNode,
  ConnectionNode,
  GateNode,
  StreamNode,
  SpatialPosition,
  HologramProperties,
  HologramShape,
  RuntimeContext,
  ExecutionResult,
  ParticleSystem,
  TransformationNode,
  Animation,
  UI2DNode,
  ScaleNode,
  FocusNode,
  EnvironmentNode,
  CompositionNode,
  TemplateNode,
  HoloScriptValue,
  FetchNode,
  ExecuteNode,
  StateMachineNode,
  ServerNode,
  DatabaseNode,
  SystemNode,
  CoreConfigNode,
  QuestNode,
  DialogueNode,
  VisualMetadataNode,
  VRTraitName,
  ProceduralSkill,
  NarrativeNode,
  MigrationNode,
} from './types';
import type { ImportLoader } from './types';
import type { TraitContext } from './traits/TraitTypes';
import { HoloScriptCodeParser } from './HoloScriptCodeParser';

const RUNTIME_SECURITY_LIMITS = {
  maxExecutionDepth: 50,
  maxTotalNodes: 1000,
  maxExecutionTimeMs: 5000,
  maxParticlesPerSystem: 1000,
  maxStringLength: 10000,
  maxCallStackDepth: 100,
};

/**
 * Event handler type
 */
type EventHandler = (data?: HoloScriptValue) => void | Promise<void>;

/**
 * Runtime orb data — the shape of an orb stored in context.variables.
 * Used to avoid `as any` casts when reading dynamic orb state.
 */
interface OrbData {
  __type: 'orb';
  id: string;
  name: string;
  created: number;
  position?: SpatialPosition;
  velocity?: SpatialPosition;
  saliency?: number;
  hologram?: HologramProperties;
  properties?: Record<string, HoloScriptValue>;
  directives?: Array<Record<string, unknown>>;
  _templateRef?: TemplateNode;
  show: () => HoloScriptValue | Promise<HoloScriptValue>;
  hide: () => HoloScriptValue | Promise<HoloScriptValue>;
  pulse: (opts?: Record<string, unknown>) => HoloScriptValue | Promise<HoloScriptValue>;
  version?: number | string;
  traits?: unknown[];
  [key: string]: unknown;
}

/** Type guard: checks if a HoloScriptValue is an OrbData record */
function isOrbData(v: unknown): v is OrbData {
  return v !== null && typeof v === 'object' && (v as Record<string, unknown>).__type === 'orb';
}

/**
 * Scope for variable resolution
 */
export interface Scope {
  variables: Map<string, HoloScriptValue>;
  parent?: Scope;
}

/**
 * UI Element state
 */
interface UIElementState {
  type: string;
  name: string;
  properties: Record<string, HoloScriptValue>;
  value?: HoloScriptValue;
  visible: boolean;
  enabled: boolean;
}

export class HoloScriptRuntime {
  private context: RuntimeContext;
  private wss: WebSocketServer | undefined;
  private timeManager: TimeManager | undefined;
  private particleSystems: Map<string, ParticleSystem> = new Map();
  private executionHistory: ExecutionResult[] = [];
  private agentRuntimes: Map<string, HoloScriptAgentRuntime> = new Map();
  private agentPool: ObjectPool<HoloScriptAgentRuntime>;
  private startTime: number = 0;
  private nodeCount: number = 0;

  // Enhanced runtime state
  private currentScope: Scope;
  private callStack: string[] = [];
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private animations: Map<string, Animation> = new Map();
  private uiElements: Map<string, UIElementState> = new Map();
  private proceduralSkills: Map<string, ProceduralSkill> = new Map();
  private builtinFunctions: Map<
    string,
    (args: HoloScriptValue[]) => HoloScriptValue | Promise<HoloScriptValue>
  >;
  private traitHandlers: Map<VRTraitName, TraitHandler<unknown>> = new Map();
  private extensionRegistry: ExtensionRegistry;

  constructor(
    _importLoader?: ImportLoader,
    customFunctions?: Record<
      string,
      (args: HoloScriptValue[]) => HoloScriptValue | Promise<HoloScriptValue>
    >
  ) {
    this.context = this.createEmptyContext();
    this.currentScope = { variables: this.context.variables };
    this.builtinFunctions = this.initBuiltins(customFunctions);

    // Initialize Agent Pool
    this.agentPool = new ObjectPool<HoloScriptAgentRuntime>(
      () => new HoloScriptAgentRuntime(), // Preallocation mode (optional args)
      (agent) => agent.destroy(),
      50
    );

    // Register Edge Intelligence Providers
    registerVoiceSynthesizer('default', new BaseVoiceSynthesizer());
    registerEmotionDetector('default', new LocalEmotionDetector());
    registerSpeechRecognizer('default', new MockSpeechRecognizer());

    for (const [name, fn] of this.builtinFunctions) {
      // Wrap builtins so they work when called via spread args from evaluateHoloExpression.
      // Builtins expect (args: HoloScriptValue[]) but the expression evaluator calls callee(...args).
      this.context.functions.set(name, ((...spreadArgs: HoloScriptValue[]) =>
        fn(spreadArgs)) as unknown as MethodNode);
    }

    // Attention Graph Query
    // Allows scripts to cull massive global state arrays into top-k attended components efficiently.
    this.registerFunction('get_attended_entities', (args: HoloScriptValue[]) => {
      const topK = typeof args[0] === 'number' ? args[0] : 10;

      const selfRaw = this.context.variables.get('self');
      const selfNode = isOrbData(selfRaw) ? selfRaw : undefined;
      const observerPos: SpatialPosition = selfNode?.position ?? { x: 0, y: 0, z: 0 };

      const entities: Array<{
        id: string;
        position: SpatialPosition;
        velocity?: SpatialPosition;
        saliencyBase?: number;
      }> = [];
      this.context.spatialMemory.forEach((pos, id) => {
        if (id !== selfNode?.name) {
          const entityRaw = this.context.variables.get(id);
          const entityOrb = isOrbData(entityRaw) ? entityRaw : undefined;
          entities.push({
            id,
            position: pos,
            velocity: entityOrb?.velocity,
            saliencyBase: typeof entityOrb?.saliency === 'number' ? entityOrb.saliency : undefined,
          });
        }
      });

      return AttentionEngine.getTopKEntities(observerPos, entities, topK);
    });

    // Register Trait Handlers
    this.traitHandlers.set('mitosis' as VRTraitName, mitosisHandler);
    this.traitHandlers.set('orbital' as VRTraitName, orbitalHandler);

    // Initialize Extension Registry
    this.extensionRegistry = new ExtensionRegistry(this);

    // Wire up state machine hook executor to this runtime's expression evaluator
    stateMachineInterpreter.setHookExecutor(
      (code: string, context: Record<string, HoloScriptValue>) => {
        // Merge hook context into variables temporarily
        for (const [key, value] of Object.entries(context)) {
          this.context.variables.set(key, value);
        }
        // Evaluate the hook code
        return this.evaluateExpression(code);
      }
    );
  }

  /**
   * Initialize built-in functions
   */
  private initBuiltins(
    customFunctions?: Record<
      string,
      (args: HoloScriptValue[]) => HoloScriptValue | Promise<HoloScriptValue>
    >
  ): Map<string, (args: HoloScriptValue[]) => HoloScriptValue | Promise<HoloScriptValue>> {
    const builtins = new Map<
      string,
      (args: HoloScriptValue[]) => HoloScriptValue | Promise<HoloScriptValue>
    >();

    // Inject Custom Functions
    if (customFunctions) {
      for (const [name, func] of Object.entries(customFunctions)) {
        builtins.set(name, func);
      }
    }

    // Display commands
    builtins.set('show', (args) => {
      const target = String(args[0]);
      const element = this.uiElements.get(target);
      if (element) element.visible = true;
      const hologram = this.context.hologramState.get(target);
      if (hologram) {
        this.createParticleEffect(`${target}_show`, { x: 0, y: 0, z: 0 }, hologram.color, 15);
      }
      logger.info('show', { target });
      return { shown: target };
    });

    builtins.set('hide', (args) => {
      const target = String(args[0]);
      const element = this.uiElements.get(target);
      if (element) element.visible = false;
      logger.info('hide', { target });
      return { hidden: target };
    });

    // Animation commands
    builtins.set('pulsate', (args): HoloScriptValue => {
      const target = String(args[0]);
      const options = (args[1] as Record<string, HoloScriptValue>) || {};
      const duration = Number(options.duration) || 1000;
      const color = String(options.color || '#ffffff');

      const position = this.context.spatialMemory.get(target) || { x: 0, y: 0, z: 0 };
      this.createParticleEffect(`${target}_pulse`, position, color, 30);

      return { pulsing: target, duration };
    });

    builtins.set('animate', (args): HoloScriptValue => {
      const target = String(args[0]);
      const options = (args[1] as Record<string, HoloScriptValue>) || {};

      const animation: Animation = {
        target,
        property: String(options.property || 'position.y'),
        from: Number(options.from || 0),
        to: Number(options.to || 1),
        duration: Number(options.duration || 1000),
        startTime: Date.now(),
        easing: String(options.easing || 'linear'),
        loop: Boolean(options.loop),
        yoyo: Boolean(options.yoyo),
      };

      this.animations.set(`${target}_${animation.property}`, animation);
      return { animating: target, animation };
    });

    // Spatial commands
    builtins.set('spawn', async (args): Promise<HoloScriptValue> => {
      const config = args[0] as HoloScriptValue;
      // Legacy support for (name, position)
      if (typeof config === 'string') {
        const target = config;
        const position = (args[1] as SpatialPosition) || { x: 0, y: 0, z: 0 };
        this.context.spatialMemory.set(target, position);
        this.createParticleEffect(`${target}_spawn`, position, '#00ff00', 25);
        return { spawned: target, at: position };
      }

      // Mitosis support for ({ template, id, position, ... })
      const spawnConfig = config as Record<string, unknown>;
      const templateName = String(spawnConfig.template);
      const id = String(spawnConfig.id || `${templateName}_${Date.now()}`);
      const position = (spawnConfig.position as SpatialPosition) || { x: 0, y: 0, z: 0 };

      const template = this.context.templates.get(templateName);
      if (!template) {
        logger.error(`[Mitosis] Template ${templateName} not found`);
        return { error: `Template ${templateName} not found` };
      }

      // Create an OrbNode from the template
      const spawnNode: OrbNode = {
        type: 'orb',
        name: id,
        position: position,
        properties: { ...((spawnConfig.config as Record<string, HoloScriptValue>) || {}) }, // Initial state from config
        children: template.children,
        traits: template.traits,
        directives: template.directives,
      };

      // Merge template state and default properties if not overridden in config
      const holoTpl = template as unknown as HoloTemplate;
      if (holoTpl.state) {
        for (const prop of holoTpl.state.properties) {
          if (spawnNode.properties[prop.key] === undefined) {
            spawnNode.properties[prop.key] = this.resolveHoloValue(prop.value as HoloValue);
          }
        }
      }
      for (const prop of holoTpl.properties) {
        if (spawnNode.properties[prop.key] === undefined) {
          spawnNode.properties[prop.key] = this.resolveHoloValue(prop.value as HoloValue);
        }
      }

      // Execute the newly created orb
      await this.executeOrb(spawnNode);

      // If there's a parent, notify them of the mitosis event
      if (spawnConfig.parentId || spawnConfig.parent_id) {
        const parentId = String(spawnConfig.parentId || spawnConfig.parent_id);
        await this.emit(`mitosis_spawned`, { parentId, childId: id });

        // Also emit on the specific orb event bus if needed
        await this.emit(`${parentId}.mitosis_spawned`, { childId: id });
      }

      return { spawned: id, template: templateName };
    });

    builtins.set('notifyParent', async (args): Promise<HoloScriptValue> => {
      const parentId = String(args[0]);
      const data = args[1];

      await this.emit(`mitosis_child_complete`, {
        parentId,
        childId: (args[2] as string) || 'unknown',
        result: data,
      });

      await this.emit(`${parentId}.mitosis_child_complete`, {
        childId: (args[2] as string) || 'unknown',
        result: data,
      });

      return { notified: parentId };
    });

    builtins.set('despawn', (args): HoloScriptValue => {
      const target = String(args[0]);
      if (this.context.hologramState.has(target)) {
        const pos = this.context.spatialMemory.get(target) || { x: 0, y: 0, z: 0 };
        this.createParticleEffect(`${target}_despawn`, pos, '#ff0000', 30);
        this.context.hologramState.delete(target);
        this.context.variables.delete(target);
        this.context.spatialMemory.delete(target);
        logger.info('despawn', { target });
        return { despawned: target };
      }
      return { msg: 'Target not found', target };
    });

    builtins.set('move', (args): HoloScriptValue => {
      const target = String(args[0]);
      const position = (args[1] as SpatialPosition) || { x: 0, y: 0, z: 0 };

      const current = this.context.spatialMemory.get(target);
      if (current) {
        this.context.spatialMemory.set(target, position);
        this.createConnectionStream(target, `${target}_dest`, current, position, 'move');
      }

      return { moved: target, to: position };
    });

    // Data commands
    builtins.set('set', (args): HoloScriptValue => {
      const target = String(args[0]);
      const value = args[1];
      this.setVariable(target, value);
      return { set: target, value };
    });

    builtins.set('get', (args): HoloScriptValue => {
      const target = String(args[0]);
      return this.getVariable(target);
    });

    // Math functions
    builtins.set('add', (args): HoloScriptValue => Number(args[0]) + Number(args[1]));
    builtins.set('subtract', (args): HoloScriptValue => Number(args[0]) - Number(args[1]));
    builtins.set('multiply', (args): HoloScriptValue => Number(args[0]) * Number(args[1]));
    builtins.set(
      'divide',
      (args): HoloScriptValue => (Number(args[1]) !== 0 ? Number(args[0]) / Number(args[1]) : 0)
    );
    builtins.set('mod', (args): HoloScriptValue => Number(args[0]) % Number(args[1]));
    builtins.set('abs', (args): HoloScriptValue => Math.abs(Number(args[0])));
    builtins.set('floor', (args): HoloScriptValue => Math.floor(Number(args[0])));
    builtins.set('ceil', (args): HoloScriptValue => Math.ceil(Number(args[0])));
    builtins.set('round', (args): HoloScriptValue => Math.round(Number(args[0])));
    builtins.set('min', (args): HoloScriptValue => Math.min(...args.map(Number)));
    builtins.set('max', (args): HoloScriptValue => Math.max(...args.map(Number)));
    builtins.set('random', (): HoloScriptValue => Math.random());

    // String functions
    builtins.set('concat', (args): HoloScriptValue => args.map(String).join(''));
    builtins.set('length', (args): HoloScriptValue => {
      const val = args[0];
      if (typeof val === 'string') return val.length;
      if (Array.isArray(val)) return val.length;
      return 0;
    });
    builtins.set(
      'substring',
      (args): HoloScriptValue => String(args[0]).substring(Number(args[1]), Number(args[2]))
    );

    builtins.set('wait', async (args): Promise<HoloScriptValue> => {
      const ms = Number(args[0]) || 0;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { waited: ms };
    });

    builtins.set('print', (args): HoloScriptValue => {
      console.log(`[HoloScript]`, ...args);
      return { printed: args.join(' ') };
    });
    builtins.set('uppercase', (args): HoloScriptValue => String(args[0]).toUpperCase());
    builtins.set('lowercase', (args): HoloScriptValue => String(args[0]).toLowerCase());

    // Array functions
    builtins.set('push', (args): HoloScriptValue => {
      const arr = args[0];
      if (Array.isArray(arr)) {
        arr.push(args[1]);
        return arr;
      }
      return [args[0], args[1]];
    });
    builtins.set('pop', (args): HoloScriptValue => {
      const arr = args[0];
      if (Array.isArray(arr)) return arr.pop();
      return undefined;
    });
    builtins.set('at', (args): HoloScriptValue => {
      const arr = args[0];
      const index = Number(args[1]);
      if (Array.isArray(arr)) return arr[index];
      return undefined;
    });

    builtins.set('showSettings', (): HoloScriptValue => {
      this.emit('show-settings');
      return true as HoloScriptValue;
    });

    builtins.set('openChat', (args): HoloScriptValue => {
      const config = args[0] || {};
      this.emit('show-chat', config);
      return true as HoloScriptValue;
    });

    // Console/Debug
    builtins.set('log', (args): HoloScriptValue => {
      logger.info('HoloScript log', { args });
      return args[0];
    });
    builtins.set('print', (args): HoloScriptValue => {
      const message = args.map(String).join(' ');
      logger.info('print', { message });
      return message;
    });

    // Type checking
    builtins.set('typeof', (args): HoloScriptValue => typeof args[0]);
    builtins.set('isArray', (args): HoloScriptValue => Array.isArray(args[0]));
    builtins.set(
      'isNumber',
      (args): HoloScriptValue => typeof args[0] === 'number' && !isNaN(args[0])
    );
    builtins.set('isString', (args): HoloScriptValue => typeof args[0] === 'string');

    // New Primitives
    builtins.set('shop', (args) => this.handleShop(args));
    builtins.set('inventory', (args) => this.handleInventory(args));
    builtins.set('purchase', (args) => this.handlePurchase(args));
    builtins.set('presence', (args) => this.handlePresence(args));
    builtins.set('invite', (args) => this.handleInvite(args));
    builtins.set('share', (args) => this.handleShare(args));
    builtins.set('physics', (args) => this.handlePhysics(args));
    builtins.set('gravity', (args) => this.handleGravity(args));
    builtins.set('collide', (args) => this.handleCollide(args));
    builtins.set('animate', (args) => this.handleAnimate(args));
    builtins.set('calculate_arc', (args) => this.handleCalculateArc(args));
    builtins.set(
      'sleep',
      (args) => new Promise((resolve) => setTimeout(resolve, Number(args[0]) || 0))
    );
    builtins.set('think', async (args) => {
      const activeNode = this.context.executionStack[this.context.executionStack.length - 1];
      if (!activeNode) return 'No context';
      const agentId = (activeNode as unknown as Record<string, unknown>).name as string;
      const agentRuntime = this.agentRuntimes.get(agentId);
      if (agentRuntime) {
        return await agentRuntime.think(String(args[0] || ''));
      }
      return 'Thinking only available for agents.';
    });

    return builtins;
  }

  /**
   * Register a global function from an extension
   */
  public registerGlobalFunction(name: string, fn: Function): void {
    // Wrap function to accept spread arguments from evaluator
    this.context.functions.set(name, ((...spreadArgs: HoloScriptValue[]) =>
      fn(spreadArgs)) as unknown as MethodNode);
  }

  /**
   * Register a custom trait from an extension
   */
  public registerTrait(name: string, handler: TraitHandler<Record<string, unknown>>): void {
    const vrName = name as VRTraitName; // Cast for now, dynamic traits expand the type implicitly
    this.traitHandlers.set(vrName, handler);
    logger.info(`Registered trait: ${name}`);
  }

  /**
   * Get the extension registry
   */
  public getExtensionRegistry(): ExtensionRegistry {
    return this.extensionRegistry;
  }

  /**
   * Execute a single AST node
   */
  async executeNode(node: ASTNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      this.context.executionStack.push(node);

      let result: ExecutionResult;

      const nodeType = (node as unknown as Record<string, unknown>).type as string;
      switch (nodeType) {
        case 'orb':
        case 'object':
          result = await this.executeOrb(node as OrbNode);
          break;
        case 'narrative':
          result = await this.executeNarrative(node as NarrativeNode);
          break;
        case 'quest':
          result = await this.executeQuest(node as QuestNode);
          break;
        case 'dialogue':
          result = await this.executeDialogue(node as DialogueNode);
          break;
        case 'visual_metadata':
          result = await this.executeVisualMetadata(node as VisualMetadataNode);
          break;
        case 'method':
        case 'function':
          result = await this.executeFunction(node as MethodNode);
          break;
        case 'connection':
          result = await this.executeConnection(node as ConnectionNode);
          break;
        case 'gate':
          result = await this.executeGate(node as GateNode);
          break;
        case 'stream':
          result = await this.executeStream(node as StreamNode);
          break;
        case 'call':
          result = await this.executeCall(node as ASTNode & { target?: string; args?: unknown[] });
          break;
        case 'debug':
          result = await this.executeDebug(node);
          break;
        case 'visualize':
          result = await this.executeVisualize(node);
          break;
        case '2d-element':
          result = await this.executeUIElement(node as unknown as UI2DNode);
          break;
        case 'nexus':
        case 'building':
          result = await this.executeStructure(node);
          break;
        case 'assignment':
          result = await this.executeAssignment(node as ASTNode & { name: string; value: unknown });
          break;
        case 'return':
          result = await this.executeReturn(node as ASTNode & { value: unknown });
          break;
        case 'memory':
          result = await this.executeMemory(node as import('./types').MemoryNode);
          break;
        case 'semantic-memory':
        case 'episodic-memory':
        case 'procedural-memory':
          result = await this.executeMemoryDefinition(
            node as
              | import('./types').SemanticMemoryNode
              | import('./types').EpisodicMemoryNode
              | import('./types').ProceduralMemoryNode
          );
          break;
        case 'generic':
          result = await this.executeGeneric(node);
          break;
        case 'expression-statement':
          result = await this.executeExpressionStatement(node as ASTNode & { expression: string });
          break;
        case 'scale':
          result = await this.executeScale(node as ScaleNode);
          break;
        case 'focus':
          result = await this.executeFocus(node as FocusNode);
          break;
        case 'environment':
          result = await this.executeEnvironment(node as EnvironmentNode);
          break;
        case 'composition':
        case 'Composition':
          if (node.type === 'Composition') {
            result = await this.executeHoloComposition(node as unknown as HoloComposition);
          } else {
            result = await this.executeComposition(node as CompositionNode);
          }
          break;
        case 'template':
        case 'Template':
          if (node.type === 'Template') {
            result = await this.executeHoloTemplate(node as unknown as HoloTemplate);
          } else {
            result = await this.executeTemplate(node as TemplateNode);
          }
          break;
        case 'migration':
          // Migration nodes are usually inside templates, but if executed directly, skip or log
          result = { success: true, output: 'Migration block registered' };
          break;
        case 'server':
          result = await this.executeServerNode(node as ServerNode);
          break;
        case 'database':
          result = await this.executeDatabaseNode(node as DatabaseNode);
          break;
        case 'fetch':
          result = await this.executeFetchNode(node as FetchNode);
          break;
        case 'execute':
          result = await this.executeTarget(node as ExecuteNode);
          break;
        case 'state-declaration':
          result = await this.executeStateDeclaration(
            node as ASTNode & {
              directives?: import('./types/AdvancedTypeSystem').HSPlusDirective[];
            }
          );
          break;
        case 'state-machine':
          result = await this.executeStateMachine(node as StateMachineNode);
          break;
        case 'system':
          result = await this.executeSystem(node as SystemNode);
          break;
        case 'core_config':
          result = await this.executeCoreConfig(node as CoreConfigNode);
          break;
        case 'for':
          result = await this.executeForLoop(
            node as ASTNode & { variable: string; iterable: string | unknown; body: ASTNode[] }
          );
          break;
        case 'forEach':
          result = await this.executeForEachLoop(
            node as ASTNode & { variable: string; collection: string | unknown; body: ASTNode[] }
          );
          break;
        case 'while':
          result = await this.executeWhileLoop(
            node as ASTNode & { condition: string | unknown; body: ASTNode[] }
          );
          break;
        case 'if':
          result = await this.executeIfStatement(
            node as ASTNode & { condition: string | unknown; body: ASTNode[]; elseBody?: ASTNode[] }
          );
          break;
        case 'match':
          result = await this.executeMatch(
            node as ASTNode & {
              subject: string | unknown;
              cases: Array<{
                pattern: string | unknown;
                guard?: string | unknown;
                body: ASTNode[] | unknown;
              }>;
            }
          );
          break;
        default:
          result = {
            success: false,
            error: `Unknown node type: ${node.type}`,
            executionTime: Date.now() - startTime,
          };
      }

      result.executionTime = Date.now() - startTime;
      this.executionHistory.push(result);
      this.context.executionStack.pop();

      return result;
    } catch (error) {
      const execTime = Date.now() - startTime;
      const errorResult: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: execTime,
      };

      this.executionHistory.push(errorResult);
      this.context.executionStack.pop();

      return errorResult;
    }
  }

  /**
   * Execute multiple nodes or a single node (unified entry point)
   */
  async execute(nodes: ASTNode | ASTNode[]): Promise<ExecutionResult> {
    this.startTime = Date.now();
    this.nodeCount = 0;

    if (Array.isArray(nodes)) {
      const results = await this.executeProgram(nodes);
      const success = results.every((r) => r.success);

      // Bubble up return result if present
      const lastResult = results[results.length - 1];
      let output: HoloScriptValue = success
        ? `Program executed (${results.length} nodes)`
        : 'Program failed';

      if (lastResult && lastResult.success && lastResult.output !== undefined) {
        // If evaluateExpression was used, it likely came from a return node or expression statement
        output = lastResult.output;
      }

      return {
        success,
        output,
        error: results.find((r) => !r.success)?.error,
      };
    } else {
      return this.executeNode(nodes);
    }
  }

  /**
   * Execute multiple nodes in sequence
   */
  async executeProgram(nodes: ASTNode[], depth: number = 0): Promise<ExecutionResult[]> {
    if (depth === 0) {
      this.startTime = Date.now();
      this.nodeCount = 0;
    }

    if (depth > RUNTIME_SECURITY_LIMITS.maxExecutionDepth) {
      logger.error('Max execution depth exceeded', { depth });
      return [
        {
          success: false,
          error: `Max execution depth exceeded (${RUNTIME_SECURITY_LIMITS.maxExecutionDepth})`,
          executionTime: 0,
        },
      ];
    }

    const results: ExecutionResult[] = [];

    for (const node of nodes) {
      this.nodeCount++;
      if (this.nodeCount > RUNTIME_SECURITY_LIMITS.maxTotalNodes) {
        logger.error('Max total nodes exceeded', { count: this.nodeCount });
        results.push({
          success: false,
          error: 'Max total nodes exceeded',
          executionTime: Date.now() - this.startTime,
        });
        break;
      }

      if (Date.now() - this.startTime > RUNTIME_SECURITY_LIMITS.maxExecutionTimeMs) {
        logger.error('Execution timeout', { duration: Date.now() - this.startTime });
        results.push({
          success: false,
          error: 'Execution timeout',
          executionTime: Date.now() - this.startTime,
        });
        break;
      }

      const result = await this.executeNode(node);
      results.push(result);

      // Stop on error (except visualize) or return statement
      if (!result.success && node.type !== 'visualize') {
        break;
      }
      if (node.type === 'return') {
        break;
      }
    }

    return results;
  }

  /**
   * Call a function with arguments
   */
  async callFunction(name: string, args: HoloScriptValue[] = []): Promise<ExecutionResult> {
    // Check built-in functions first
    const builtin = this.builtinFunctions.get(name);
    if (builtin) {
      try {
        const result = await builtin(args);
        return {
          success: true,
          output: result,
        };
      } catch (error) {
        return {
          success: false,
          error: `Built-in function ${name} failed: ${error}`,
        };
      }
    }

    // Check user-defined functions or registered extensions
    const func = this.context.functions.get(name);
    if (!func) {
      return {
        success: false,
        error: `Function '${name}' not found`,
      };
    }

    // Handle registered extension functions (JS Functions)
    if (typeof func === 'function') {
      try {
        // The function is already wrapped to accept spread args, but callFunction passes array
        // We need to unwrap or call it correctly.
        // Wait, initBuiltins wraps it as: ((...spreadArgs: any[]) => fn(spreadArgs))
        // So we should call it as func(...args)
        const result = await (func as Function)(...args);
        return {
          success: true,
          output: result,
        };
      } catch (error) {
        return {
          success: false,
          error: `Extension function ${name} failed: ${error}`,
        };
      }
    }

    // Check call stack depth
    if (this.callStack.length >= RUNTIME_SECURITY_LIMITS.maxCallStackDepth) {
      return {
        success: false,
        error: `Max call stack depth exceeded (${RUNTIME_SECURITY_LIMITS.maxCallStackDepth})`,
      };
    }

    // Create new scope
    const parentScope = this.currentScope;
    this.currentScope = {
      variables: new Map(),
      parent: parentScope,
    };

    // Bind parameters
    func.parameters.forEach((param, index) => {
      const value = index < args.length ? args[index] : param.defaultValue;
      this.currentScope.variables.set(param.name, value);
    });

    // Push to call stack
    this.callStack.push(name);

    // Execute function body
    let returnValue: unknown = undefined;
    try {
      const results = await this.executeProgram(func.body, this.callStack.length);
      const lastResult = results[results.length - 1];

      if (lastResult?.output !== undefined) {
        returnValue = lastResult.output;
      }

      // Visual effect
      this.createExecutionEffect(name, func.position || { x: 0, y: 0, z: 0 });

      return {
        success: results.every((r) => r.success),
        output: returnValue as HoloScriptValue,
        hologram: func.hologram,
        spatialPosition: func.position,
      };
    } finally {
      // Restore scope
      this.currentScope = parentScope;
      this.callStack.pop();
    }
  }

  /**
   * Set a variable in current scope
   */
  setVariable(name: string, value: HoloScriptValue, scopeOverride?: Scope): void {
    // Handle property access (e.g., "obj.prop")
    if (name.includes('.')) {
      const parts = name.split('.');
      const objName = parts[0];
      const propPath = parts.slice(1);

      let obj = this.getVariable(objName, scopeOverride);
      if (obj === undefined || typeof obj !== 'object' || obj === null) {
        obj = {};
        const scope = scopeOverride || this.currentScope;
        scope.variables.set(objName, obj as HoloScriptValue);
      }

      let current = obj as Record<string, HoloScriptValue>;
      for (let i = 0; i < propPath.length - 1; i++) {
        if (current[propPath[i]] === undefined || typeof current[propPath[i]] !== 'object') {
          current[propPath[i]] = {};
        }
        current = current[propPath[i]] as Record<string, HoloScriptValue>;
      }
      current[propPath[propPath.length - 1]] = value;
    } else {
      const scope = scopeOverride || this.currentScope;
      scope.variables.set(name, value);
    }

    // Visualizer Hook: specific variable updates
    if (
      this.wss &&
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).__type === 'orb'
    ) {
      this.broadcast('orb_update', { orb: value });
    } else if (this.wss && name.includes('.')) {
      // If updating a property of an orb, broadcast the orb
      const root = name.split('.')[0];
      const rootVar = this.getVariable(root, scopeOverride);
      if (
        rootVar &&
        typeof rootVar === 'object' &&
        (rootVar as Record<string, unknown>).__type === 'orb'
      ) {
        this.broadcast('orb_update', { orb: rootVar });
      }
    }
  }

  /**
   * Get a variable from scope chain
   */
  getVariable(name: string, scopeOverride?: Scope): HoloScriptValue {
    // Handle property access (e.g., "obj.prop")
    if (name.includes('.')) {
      const parts = name.split('.');
      let value = this.getVariable(parts[0], scopeOverride);

      for (let i = 1; i < parts.length && value !== undefined; i++) {
        if (typeof value === 'object' && value !== null) {
          value = (value as Record<string, HoloScriptValue>)[parts[i]];
        } else {
          return undefined;
        }
      }
      return value;
    }

    // Walk scope chain
    let scope: Scope | undefined = scopeOverride || this.currentScope;
    while (scope) {
      if (scope.variables.has(name)) {
        return scope.variables.get(name);
      }
      scope = scope.parent;
    }

    // Check context variables
    if (this.context.variables.has(name)) {
      return this.context.variables.get(name);
    }

    // Fallback to functions map (for imported functions)
    if (this.context.functions.has(name)) {
      return this.context.functions.get(name);
    }

    return undefined;
  }

  /**
   * Evaluate an expression in current context
   */
  public evaluateExpression(expr: string): HoloScriptValue {
    if (!expr || typeof expr !== 'string') return expr;

    const evaluator = new ExpressionEvaluator(this.context.state.getSnapshot());
    // Also include currently set variables in context
    const varContext: Record<string, HoloScriptValue> = {};
    this.context.variables.forEach((v, k) => (varContext[k] = v));

    evaluator.updateContext(varContext);

    return evaluator.evaluate(expr);
  }

  // ============================================================================
  // Node Executors
  // ============================================================================

  private async executeOrb(node: OrbNode): Promise<ExecutionResult> {
    const scale = this.context.currentScale || 1;

    // 1. STATE RECONCILIATION: Check for existing orb instance
    const existingRaw = this.context.variables.get(node.name);
    const existingOrb = isOrbData(existingRaw) ? existingRaw : undefined;
    const isUpdate = !!existingOrb;

    let pos = { x: 0, y: 0, z: 0 };
    if (Array.isArray(node.position)) {
      pos = {
        x: Number(node.position[0]) || 0,
        y: Number(node.position[1]) || 0,
        z: Number(node.position[2]) || 0,
      };
    } else if (node.position) {
      pos = {
        x: Number(node.position.x) || 0,
        y: Number(node.position.y) || 0,
        z: Number(node.position.z) || 0,
      };
    }

    const adjustedPos = {
      x: pos.x * scale,
      y: pos.y * scale,
      z: pos.z * scale,
    };

    if (node.position) {
      this.context.spatialMemory.set(node.name, adjustedPos);
    }

    // 2. PROPERTY EVALUATION
    const evaluatedProperties: Record<string, HoloScriptValue> = {};

    // Handle both Record (HS+ Type) and Array (HS Composition ObjectProperty)
    if (Array.isArray(node.properties)) {
      for (const prop of node.properties as Array<{ key: string; value: HoloScriptValue }>) {
        const key = prop.key;
        const val = prop.value;
        if (typeof val === 'string') {
          evaluatedProperties[key] = this.evaluateExpression(val);
        } else {
          evaluatedProperties[key] = val;
        }
      }
    } else if (node.properties) {
      for (const [key, val] of Object.entries(node.properties)) {
        if (typeof val === 'string') {
          evaluatedProperties[key] = this.evaluateExpression(val);
        } else {
          evaluatedProperties[key] = val;
        }
      }
    }

    // 3. TEMPLATE MERGING (Inherit properties from template)
    const orbNodeExt = node as OrbNode & { template?: string };
    if (orbNodeExt.template) {
      const tpl = this.context.templates.get(orbNodeExt.template) as unknown as
        | TemplateNode
        | undefined;
      if (tpl) {
        // Merge template properties if not overridden by orb
        if (tpl.properties) {
          for (const [key, val] of Object.entries(tpl.properties)) {
            if (evaluatedProperties[key] === undefined) {
              if (typeof val === 'string') {
                evaluatedProperties[key] = this.evaluateExpression(val);
              } else {
                evaluatedProperties[key] = val;
              }
            }
          }
        }

        // Note: Template children/traits are handled via directives
        if (tpl.directives) {
          // Prepend template directives so orb directives can override if needed (though usually directives accumulate)
          // Actually for things like @state, we might want unique processing.
          // For now, simpler concatenation.
          // Careful: node.directives might be undefined.
          const existingDirectives = node.directives || [];
          // We want template directives to be processed, but maybe orb directives take precedence?
          // Directives are usually "actions" or "metadata". Accumulating them is standard.
          node.directives = [...tpl.directives, ...existingDirectives];
        }
      }
    }

    const hologram = node.hologram
      ? {
          ...node.hologram,
          size:
            (node.hologram.size ||
              Number(evaluatedProperties.size) ||
              Number(evaluatedProperties.scale) ||
              1) * scale,
        }
      : {
          color: (evaluatedProperties.color as string) || '#ffffff',
          size:
            (Number(evaluatedProperties.size) || Number(evaluatedProperties.scale) || 1) * scale,
          shape: (evaluatedProperties.geometry || 'sphere') as HologramShape,
          glow: !!evaluatedProperties.glow,
          interactive: !!evaluatedProperties.interactive,
        };

    // 4. MIGRATION LOGIC
    if (isUpdate && node.template) {
      const tpl = this.context.templates.get(node.template);
      const oldTpl = existingOrb?._templateRef;

      if (tpl && oldTpl && tpl.version !== undefined && oldTpl.version !== undefined) {
        if (Number(tpl.version) > Number(oldTpl.version)) {
          logger.info(
            `Template version increase detected for ${node.name}: ${oldTpl.version} -> ${tpl.version}`
          );

          // Find applicable migrations
          const migrations = tpl.migrations || [];
          const migration = migrations.find((m) => m.fromVersion === Number(oldTpl.version));

          if (migration) {
            logger.info(`Executing migration from version ${oldTpl.version} for ${node.name}`);
            await this.executeMigrationBlock(existingOrb, migration);
          }
        }
      }
    }

    const orbData = isUpdate
      ? existingOrb
      : {
          __type: 'orb',
          id: node.name,
          name: node.name,
          created: Date.now(),
          // Methods bound to this orb
          show: () => this.builtinFunctions.get('show')!([node.name]),
          hide: () => this.builtinFunctions.get('hide')!([node.name]),
          pulse: (opts?: Record<string, unknown>) =>
            this.builtinFunctions.get('pulse')!([node.name, opts as HoloScriptValue]),
        };

    // Update dynamic properties but preserve existing ones that aren't in the new definition (State Preservation)
    if (isUpdate) {
      // Merge new properties into existing ones, but we might want to be selective
      // For now, new script properties take precedence, but old ones not in script are kept
      orbData.properties = {
        ...(orbData.properties as Record<string, HoloScriptValue>),
        ...evaluatedProperties,
      };
    } else {
      orbData.properties = evaluatedProperties;
    }

    orbData.directives = node.directives || [];
    orbData.position = adjustedPos;
    orbData.hologram = hologram;
    orbData._templateRef = node.template
      ? this.context.templates.get(node.template)
      : undefined;

    if (!isUpdate) {
      this.context.variables.set(node.name, orbData as HoloScriptValue);
    }

    if (hologram) {
      this.context.hologramState.set(node.name, hologram);
    }

    // Apply directives
    if (node.directives) {
      this.applyDirectives(orbData as unknown as ASTNode);

      // State handling: if @state is present, it might override some properties
      // Historically applyDirectives updates global state, we might need a local merge
    }

    if (!isUpdate) {
      this.createParticleEffect(`${node.name}_creation`, adjustedPos, '#00ffff', 20);
    }

    // If it's an LLM agent, initialize its specialized runtime
    if (this.isAgent(node)) {
      if (!isUpdate || !this.agentRuntimes.has(node.name)) {
        const agentRuntime = this.agentPool.acquire();
        agentRuntime.reset(node, this);
        this.agentRuntimes.set(node.name, agentRuntime);
        (orbData as Record<string, unknown>).state = agentRuntime.getState();

        // Bind all methods
        (node.directives as Array<{ type: string; name: string }>)
          ?.filter((d) => d.type === 'method')
          .forEach((m) => {
            (orbData as Record<string, unknown>)[m.name] = (...args: HoloScriptValue[]) =>
              agentRuntime.executeAction(m.name, args);
          });
      }
    }

    logger.info(isUpdate ? 'Orb updated' : 'Orb created', {
      name: node.name,
      properties: Object.keys(orbData.properties as Record<string, unknown>),
      scale,
    });

    // Broadcast update
    this.broadcast(isUpdate ? 'orb_updated' : 'orb_created', {
      orb: {
        id: node.name,
        name: node.name,
        position: adjustedPos,
        properties: orbData.properties,
        hologram: hologram,
        traits:
          node.directives
            ?.filter((d) => d.type === 'trait')
            .map((d) => (d as unknown as { name: string }).name) || [],
      },
    });

    return {
      success: true,
      output: orbData,
      hologram: hologram,
      spatialPosition: adjustedPos,
    };
  }

  private async executeFunction(node: MethodNode): Promise<ExecutionResult> {
    this.context.functions.set(node.name, node);

    const hologram: HologramProperties = {
      shape: 'cube',
      color: '#ff6b35',
      size: 1.5,
      glow: true,
      interactive: true,
      ...node.hologram,
    };

    this.context.hologramState.set(node.name, hologram);

    logger.info('Function defined', {
      name: node.name,
      params: node.parameters.map((p) => p.name),
    });

    return {
      success: true,
      output: `Function '${node.name}' defined with ${node.parameters.length} parameter(s)`,
      hologram,
      spatialPosition: node.position,
    };
  }

  private async executeConnection(node: ConnectionNode): Promise<ExecutionResult> {
    this.context.connections.push(node);

    const fromPos = this.context.spatialMemory.get(node.from);
    const toPos = this.context.spatialMemory.get(node.to);

    if (fromPos && toPos) {
      this.createConnectionStream(node.from, node.to, fromPos, toPos, node.dataType);
    }

    // Set up reactive binding if bidirectional
    if (node.bidirectional) {
      // When 'from' changes, update 'to'
      this.on(`${node.from}.changed`, async (data) => {
        this.setVariable(node.to, data);
        this.emit(`${node.to}.changed`, data);
      });
      // When 'to' changes, update 'from'
      this.on(`${node.to}.changed`, async (data) => {
        this.setVariable(node.from, data);
        this.emit(`${node.from}.changed`, data);
      });
    }

    logger.info('Connection created', { from: node.from, to: node.to, dataType: node.dataType });

    return {
      success: true,
      output: `Connected '${node.from}' to '${node.to}' (${node.dataType})`,
      hologram: {
        shape: 'cylinder',
        color: this.getDataTypeColor(node.dataType),
        size: 0.1,
        glow: true,
        interactive: false,
      },
    };
  }

  private async executeGate(node: GateNode): Promise<ExecutionResult> {
    try {
      const condition = this.evaluateCondition(node.condition);
      const path = condition ? node.truePath : node.falsePath;

      logger.info('Gate evaluation', { condition: node.condition, result: condition });

      if (path.length > 0) {
        const subResults = await this.executeProgram(path, this.callStack.length + 1);

        // If the sub-program hit a return, bubble that up
        const lastResult = subResults[subResults.length - 1];
        if (lastResult && lastResult.success && lastResult.output !== undefined) {
          // Check if the last executed node was a return
          // This is a bit hacky but works given executeProgram's logic
          return lastResult;
        }
      }

      return {
        success: true,
        output: `Gate: took ${condition ? 'true' : 'false'} path`,
        hologram: {
          shape: 'pyramid',
          color: condition ? '#00ff00' : '#ff0000',
          size: 1,
          glow: true,
          interactive: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Gate execution failed: ${error}`,
      };
    }
  }

  private async executeStream(node: StreamNode): Promise<ExecutionResult> {
    let data = this.getVariable(node.source);

    logger.info('Stream processing', {
      name: node.name,
      source: node.source,
      transforms: node.transformations.length,
    });

    for (const transform of node.transformations) {
      data = await this.applyTransformation(data, transform);
    }

    this.setVariable(`${node.name}_result`, data);
    this.createFlowingStream(node.name, node.position || { x: 0, y: 0, z: 0 }, data);

    return {
      success: true,
      output: `Stream '${node.name}' processed ${Array.isArray(data) ? data.length : 1} item(s)`,
      hologram: node.hologram,
      spatialPosition: node.position,
    };
  }

  /**
   * Execute State Machine declaration (Phase 13)
   */
  private async executeStateMachine(node: StateMachineNode): Promise<ExecutionResult> {
    this.context.stateMachines.set(node.name, node);
    logger.info(`State machine registered: ${node.name}`);
    return {
      success: true,
      output: { registered: node.name },
    };
  }

  private async executeExpressionStatement(node: { expression: string }): Promise<ExecutionResult> {
    const value = this.evaluateExpression(node.expression);
    return {
      success: true,
      output: value,
    };
  }

  private async executeCall(
    node: ASTNode & { target?: string; args?: unknown[] }
  ): Promise<ExecutionResult> {
    const funcName = node.target || '';
    const args = node.args || [];

    return this.callFunction(funcName, args as HoloScriptValue[]);
  }

  private async executeDebug(node: ASTNode & { target?: string }): Promise<ExecutionResult> {
    const debugInfo = {
      variables: Object.fromEntries(this.currentScope.variables),
      contextVariables: Object.fromEntries(this.context.variables),
      functions: Array.from(this.context.functions.keys()),
      connections: this.context.connections.length,
      callStack: [...this.callStack],
      uiElements: Array.from(this.uiElements.keys()),
      animations: Array.from(this.animations.keys()),
      executionHistory: this.executionHistory.slice(-10),
    };

    const debugOrb: HologramProperties = {
      shape: 'pyramid',
      color: '#ff1493',
      size: 0.8,
      glow: true,
      interactive: true,
    };

    this.context.hologramState.set(`debug_${node.target || 'program'}`, debugOrb);

    logger.info('Debug info', debugInfo);

    return {
      success: true,
      output: debugInfo as unknown as HoloScriptValue,
      hologram: debugOrb,
    };
  }

  private async executeVisualize(node: ASTNode & { target?: string }): Promise<ExecutionResult> {
    const target = node.target || '';
    const data = this.getVariable(target);

    if (data === undefined) {
      return {
        success: false,
        error: `No data found for '${target}'`,
      };
    }

    const visHologram: HologramProperties = {
      shape: 'cylinder',
      color: '#32cd32',
      size: 1.5,
      glow: true,
      interactive: true,
    };

    this.createDataVisualization(target, data, node.position || { x: 0, y: 0, z: 0 });

    return {
      success: true,
      output: { visualizing: target, data },
      hologram: visHologram,
    };
  }

  private async executeUIElement(node: UI2DNode): Promise<ExecutionResult> {
    const element: UIElementState = {
      type: node.elementType,
      name: node.name,
      properties: { ...node.properties },
      visible: true,
      enabled: true,
    };

    // Set initial value based on element type
    if (node.elementType === 'textinput') {
      element.value = node.properties.value || '';
    } else if (node.elementType === 'slider') {
      element.value = node.properties.value || node.properties.min || 0;
    } else if (node.elementType === 'toggle') {
      element.value = node.properties.checked || false;
    }

    this.uiElements.set(node.name, element);

    // Register event handlers
    if (node.events) {
      for (const [eventName, handlerName] of Object.entries(node.events)) {
        this.on(`${node.name}.${eventName}`, async () => {
          await this.callFunction(handlerName);
        });
      }
    }

    logger.info('UI element created', { type: node.elementType, name: node.name });

    return {
      success: true,
      output: element,
    };
  }

  /**
   * Execute generic voice commands
   * Handles commands like: show, hide, animate, pulse, create
   */
  private async executeGeneric(_node: ASTNode): Promise<ExecutionResult> {
    const genericNode = _node as ASTNode & {
      command?: string;
      position?: SpatialPosition;
      hologram?: HologramProperties;
    };
    const command = String(genericNode.command || '')
      .trim()
      .toLowerCase();
    const tokens = command.split(/\s+/);
    const action = tokens[0];
    const target = tokens[1];

    logger.info('Executing generic command', { command, action, target });

    try {
      let result: Record<string, unknown>;

      switch (action) {
        case 'show':
          result = await this.executeShowCommand(target, genericNode);
          break;
        case 'hide':
          result = await this.executeHideCommand(target, genericNode);
          break;
        case 'create':
        case 'summon':
          result = await this.executeCreateCommand(tokens.slice(1), genericNode);
          break;
        case 'animate':
          result = await this.executeAnimateCommand(target, tokens.slice(2), genericNode);
          break;
        case 'pulse':
          result = await this.executePulseCommand(target, tokens.slice(2), genericNode);
          break;
        case 'move':
          result = await this.executeMoveCommand(target, tokens.slice(2), genericNode);
          break;
        case 'delete':
        case 'remove':
          result = await this.executeDeleteCommand(target, genericNode);
          break;
        default:
          // Default: create visual representation of the generic command
          logger.warn('Unknown voice command action', { action, command });
          result = {
            executed: false,
            message: `Unknown command: ${action}`,
          };
      }

      return {
        success: true,
        output: result as HoloScriptValue,
      };
    } catch (error) {
      return {
        success: false,
        error: `Generic command execution failed: ${String(error)}`,
      };
    }
  }

  /**
   * Execute 'show' command
   */
  private async executeShowCommand(
    target: string,
    _node: ASTNode & { position?: SpatialPosition; hologram?: HologramProperties }
  ): Promise<Record<string, unknown>> {
    // Create or show orb for this target
    const hologram = _node.hologram || {
      shape: 'orb',
      color: '#00ffff',
      size: 0.8,
      glow: true,
      interactive: true,
    };

    const position = _node.position || { x: 0, y: 0, z: 0 };
    this.context.spatialMemory.set(target, position);
    this.createParticleEffect(`${target}_show`, position, hologram.color, 15);

    logger.info('Show command executed', { target, position });

    return {
      showed: target,
      hologram,
      position,
    };
  }

  /**
   * Execute 'hide' command
   */
  private async executeHideCommand(
    target: string,
    _node: ASTNode
  ): Promise<Record<string, unknown>> {
    const position = this.context.spatialMemory.get(target) || { x: 0, y: 0, z: 0 };
    this.createParticleEffect(`${target}_hide`, position, '#ff0000', 10);

    logger.info('Hide command executed', { target });

    return {
      hidden: target,
    };
  }

  /**
   * Execute 'create' command
   */
  private async executeCreateCommand(
    tokens: string[],
    _node: ASTNode & { position?: SpatialPosition; hologram?: HologramProperties }
  ): Promise<Record<string, unknown>> {
    if (tokens.length < 2) {
      return { error: 'Create command requires shape and name' };
    }

    const shape = tokens[0];
    const name = tokens[1];
    const position = _node.position || { x: 0, y: 0, z: 0 };

    const hologram: HologramProperties = {
      shape: shape as HologramShape,
      color: _node.hologram?.color || '#00ffff',
      size: _node.hologram?.size || 1,
      glow: _node.hologram?.glow !== false,
      interactive: _node.hologram?.interactive !== false,
    };

    this.context.spatialMemory.set(name, position);
    this.createParticleEffect(`${name}_create`, position, hologram.color, 20);

    logger.info('Create command executed', { shape, name, position });

    return {
      created: name,
      shape,
      hologram,
      position,
    };
  }

  /**
   * Execute 'animate' command
   */
  private async executeAnimateCommand(
    target: string,
    tokens: string[],
    _node: ASTNode
  ): Promise<Record<string, unknown>> {
    const property = tokens[0] || 'position.y';
    const duration = parseInt(tokens[1] || '1000', 10);

    const animation: Animation = {
      target,
      property,
      from: 0,
      to: 1,
      duration,
      startTime: Date.now(),
      easing: 'ease-in-out',
    };

    this.animations.set(`${target}_${property}`, animation);

    logger.info('Animate command executed', { target, property, duration });

    return {
      animating: target,
      animation,
    };
  }

  /**
   * Execute 'pulse' command
   */
  private async executePulseCommand(
    target: string,
    tokens: string[],
    _node: ASTNode
  ): Promise<Record<string, unknown>> {
    const duration = parseInt(tokens[0] || '500', 10);
    const position = this.context.spatialMemory.get(target) || { x: 0, y: 0, z: 0 };

    // Create pulsing particle effect
    this.createParticleEffect(`${target}_pulse`, position, '#ffff00', 30);

    // Create animation for scale
    const animation: Animation = {
      target,
      property: 'scale',
      from: 1,
      to: 1.5,
      duration,
      startTime: Date.now(),
      easing: 'sine',
      yoyo: true,
      loop: true,
    };

    this.animations.set(`${target}_pulse`, animation);

    logger.info('Pulse command executed', { target, duration });

    return {
      pulsing: target,
      duration,
    };
  }

  /**
   * Execute 'move' command
   */
  private async executeMoveCommand(
    target: string,
    tokens: string[],
    _node: ASTNode
  ): Promise<Record<string, unknown>> {
    const x = parseFloat(tokens[0] || '0');
    const y = parseFloat(tokens[1] || '0');
    const z = parseFloat(tokens[2] || '0');
    const position: SpatialPosition = { x, y, z };

    const current = this.context.spatialMemory.get(target);
    if (current) {
      this.context.spatialMemory.set(target, position);
      this.createConnectionStream(target, `${target}_move`, current, position, 'movement');
    } else {
      this.context.spatialMemory.set(target, position);
    }

    logger.info('Move command executed', { target, position });

    return {
      moved: target,
      to: position,
    };
  }

  /**
   * Execute 'delete' command
   */
  private async executeDeleteCommand(
    target: string,
    _node: ASTNode
  ): Promise<Record<string, unknown>> {
    const position = this.context.spatialMemory.get(target);
    if (position) {
      this.createParticleEffect(`${target}_delete`, position, '#ff0000', 15);
      this.context.spatialMemory.delete(target);
    }

    logger.info('Delete command executed', { target });

    return {
      deleted: target,
    };
  }

  private async executeStructure(node: ASTNode): Promise<ExecutionResult> {
    // Handle nexus, building, and other structural elements
    const hologram: HologramProperties = node.hologram || {
      shape: node.type === 'nexus' ? 'sphere' : 'cube',
      color: node.type === 'nexus' ? '#9b59b6' : '#e74c3c',
      size: node.type === 'nexus' ? 3 : 4,
      glow: true,
      interactive: true,
    };

    return {
      success: true,
      output: { type: node.type, created: true },
      hologram,
      spatialPosition: node.position,
    };
  }

  private async executeAssignment(
    node: ASTNode & { name: string; value: unknown }
  ): Promise<ExecutionResult> {
    const value = this.evaluateExpression(String(node.value));
    this.setVariable(node.name, value);

    return {
      success: true,
      output: { assigned: node.name, value },
    };
  }

  private async executeReturn(
    node: ASTNode & { value?: unknown; expression?: string }
  ): Promise<ExecutionResult> {
    const expr = String(node.value || node.expression || '');
    const value = this.evaluateExpression(expr);

    return {
      success: true,
      output: value,
    };
  }

  // ============================================================================
  // Condition Evaluation
  // ============================================================================

  private evaluateCondition(condition: string | unknown): boolean {
    if (!condition) return false;
    const condStr = String(condition);

    const suspiciousKeywords = ['eval', 'process', 'require', '__proto__', 'constructor'];
    if (suspiciousKeywords.some((kw) => condStr.toLowerCase().includes(kw))) {
      logger.warn('Suspicious condition blocked', { condition });
      return false;
    }

    try {
      // Boolean literals
      if (condStr.trim().toLowerCase() === 'true') return true;
      if (condStr.trim().toLowerCase() === 'false') return false;

      // Comparison operators
      const comparisonPatterns: Array<{ regex: RegExp; logical?: string }> = [
        { regex: /^(.+?)\s*(===|!==)\s*(.+)$/ },
        { regex: /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/ },
        { regex: /^(.+?)\s*(&&)\s*(.+)$/, logical: 'and' },
        { regex: /^(.+?)\s*(\|\|)\s*(.+)$/, logical: 'or' },
      ];

      for (const { regex, logical } of comparisonPatterns) {
        const match = condStr.match(regex);
        if (match) {
          const [, leftExpr, operator, rightExpr] = match;
          const left = this.evaluateExpression(leftExpr.trim());
          const right = this.evaluateExpression(rightExpr.trim());

          if (logical === 'and') return Boolean(left) && Boolean(right);
          if (logical === 'or') return Boolean(left) || Boolean(right);

          switch (operator) {
            case '===':
              return left === right;
            case '!==':
              return left !== right;
            case '==':
              return left == right;
            case '!=':
              return left != right;
            case '>=':
              return Number(left) >= Number(right);
            case '<=':
              return Number(left) <= Number(right);
            case '>':
              return Number(left) > Number(right);
            case '<':
              return Number(left) < Number(right);
          }
        }
      }

      // Negation
      if (condStr.startsWith('!')) {
        return !this.evaluateCondition(condStr.slice(1).trim());
      }

      // Variable truthiness
      const value = this.evaluateExpression(condStr.trim());
      return Boolean(value);
    } catch (error) {
      logger.error('Condition evaluation error', { condition, error });
      return false;
    }
  }

  // ============================================================================
  // Transformation
  // ============================================================================

  private async applyTransformation(
    data: unknown,
    transform: TransformationNode
  ): Promise<HoloScriptValue> {
    const params = transform.parameters || {};

    switch (transform.operation) {
      case 'filter': {
        if (!Array.isArray(data)) return data as HoloScriptValue;
        const predicate = params.predicate as string;
        if (predicate) {
          return data.filter((item) => {
            this.setVariable('_item', item);
            return this.evaluateCondition(predicate);
          });
        }
        return data.filter((item) => item !== null && item !== undefined);
      }

      case 'map': {
        if (!Array.isArray(data)) return data as HoloScriptValue;
        const mapper = params.mapper as string;
        if (mapper) {
          return data.map((item) => {
            this.setVariable('_item', item);
            return this.evaluateExpression(mapper);
          });
        }
        return data.map((item) => ({ value: item, processed: true }));
      }

      case 'reduce': {
        if (!Array.isArray(data)) return data as HoloScriptValue;
        const initial = params.initial ?? 0;
        const reducer = params.reducer as string;
        if (reducer) {
          return data.reduce((acc, item) => {
            this.setVariable('_acc', acc);
            this.setVariable('_item', item);
            return this.evaluateExpression(reducer);
          }, initial);
        }
        return data.reduce((acc, item) => acc + (typeof item === 'number' ? item : 0), 0);
      }

      case 'sort': {
        if (!Array.isArray(data)) return data as HoloScriptValue;
        const key = params.key as string;
        const desc = params.descending as boolean;
        const sorted = [...data].sort((a, b) => {
          const aVal = key ? (a as Record<string, unknown>)[key] : a;
          const bVal = key ? (b as Record<string, unknown>)[key] : b;
          if (aVal < bVal) return desc ? 1 : -1;
          if (aVal > bVal) return desc ? -1 : 1;
          return 0;
        });
        return sorted;
      }

      case 'sum':
        return (
          Array.isArray(data)
            ? data.reduce((sum, item) => sum + (typeof item === 'number' ? item : 0), 0)
            : data
        ) as HoloScriptValue;

      case 'count':
        return (Array.isArray(data) ? data.length : 1) as HoloScriptValue;

      case 'unique':
        return (Array.isArray(data) ? Array.from(new Set(data)) : data) as HoloScriptValue;

      case 'flatten':
        return (Array.isArray(data) ? data.flat() : data) as HoloScriptValue;

      case 'reverse':
        return (Array.isArray(data) ? [...data].reverse() : data) as HoloScriptValue;

      case 'take': {
        if (!Array.isArray(data)) return data as HoloScriptValue;
        const count = Number(params.count) || 10;
        return data.slice(0, count);
      }

      case 'skip': {
        if (!Array.isArray(data)) return data as HoloScriptValue;
        const count = Number(params.count) || 0;
        return data.slice(count);
      }

      default:
        logger.warn('Unknown transformation', { operation: transform.operation });
        return data as HoloScriptValue;
    }
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Register event handler
   */
  on(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Register host function
   */
  registerFunction(name: string, handler: (args: HoloScriptValue[]) => HoloScriptValue): void {
    this.builtinFunctions.set(name, handler);
    logger.info(`Host function registered: ${name}`);
  }

  /**
   * Remove event handler
   */
  off(event: string, handler?: EventHandler): void {
    if (!handler) {
      this.eventHandlers.delete(event);
    } else {
      const handlers = this.eventHandlers.get(event) || [];
      this.eventHandlers.set(
        event,
        handlers.filter((h) => h !== handler)
      );
    }
  }

  /**
   * Emit event
   */
  async emit(event: string, data?: unknown): Promise<void> {
    logger.info(`[Runtime] Emitting event: ${event}`, data as Record<string, unknown>);
    // 1. Dotted event handling: e.g. "AlphaCommander.mitosis_spawned"
    if (event.includes('.')) {
      const [target, eventName] = event.split('.');
      const agent = this.agentRuntimes.get(target);
      if (agent) {
        await agent.onEvent(eventName, data);
      }

      const orb = this.context.variables.get(target);
      if (orb && typeof orb === 'object' && (orb as Record<string, unknown>).__type === 'orb') {
        this.forwardToTraits(orb as Record<string, unknown>, eventName, data);
      }
    }

    // 2. Broadcast to all agents and traits
    const orbs = Array.from(this.context.variables.values()).filter(
      (v) => v && typeof v === 'object' && (v as Record<string, unknown>).__type === 'orb'
    );
    for (const agent of this.agentRuntimes.values()) {
      await agent.onEvent(event, data);
    }

    for (const variable of orbs) {
      await this.forwardToTraits(variable as Record<string, unknown>, event, data);
    }

    // Local handlers
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      try {
        await handler(data as HoloScriptValue);
      } catch (error) {
        logger.error('Event handler error', { event, error });
      }
    }

    // Global bus broadcast
    await eventBus.emit(event, data as HoloScriptValue);

    // Phase 13: State Machine transitions
    if (data && typeof data === 'object' && (data as Record<string, unknown>).id) {
      stateMachineInterpreter.sendEvent((data as Record<string, unknown>).id as string, event);
    }
  }

  private async forwardToTraits(orb: Record<string, unknown>, event: string, data: unknown) {
    if (orb.directives) {
      for (const d of orb.directives as Array<Record<string, unknown>>) {
        if (d.type === 'trait') {
          const handler = this.traitHandlers.get(d.name as string);
          if (handler && handler.onEvent) {
            // Ensure onEvent is handled properly (it might return a promise even if typed void)
            const traitNode = orb as unknown as HSPlusNode;
            const eventPayload: TraitEvent = {
              type: event,
              ...(data && typeof data === 'object' ? data as Record<string, unknown> : {}),
            };
            await handler.onEvent(
              traitNode,
              d.config || {},
              {
                emit: async (e: string, p: HoloScriptValue) => await this.emit(e, p),
                getScaleMultiplier: () => this.context.currentScale || 1,
              } as unknown as TraitContext,
              eventPayload
            );
          }
        }
      }
    }
  }

  /**
   * Trigger UI event
   */
  async triggerUIEvent(elementName: string, eventType: string, data?: unknown): Promise<void> {
    const element = this.uiElements.get(elementName);
    if (!element) {
      logger.warn('UI element not found', { elementName });
      return;
    }

    // Update element state based on event
    if (eventType === 'change' && data !== undefined) {
      element.value = data as HoloScriptValue;
    }

    await this.emit(`${elementName}.${eventType}`, data);
  }

  // ============================================================================
  // Animation System
  // ============================================================================

  /**
   * Update all animations
   */
  updateAnimations(): void {
    const now = Date.now();

    for (const [key, anim] of this.animations) {
      const elapsed = now - anim.startTime;
      let progress = Math.min(elapsed / anim.duration, 1);

      // Apply easing
      progress = this.applyEasing(progress, anim.easing);

      // Calculate current value
      const currentValue = anim.from + (anim.to - anim.from) * progress;

      // Handle yoyo
      if (anim.yoyo && progress >= 1) {
        anim.startTime = now;
        [anim.from, anim.to] = [anim.to, anim.from];
      }

      // Update the property
      this.setVariable(`${anim.target}.${anim.property}`, currentValue);

      // Remove completed non-looping animations
      if (progress >= 1 && !anim.loop && !anim.yoyo) {
        this.animations.delete(key);
      } else if (progress >= 1 && anim.loop) {
        anim.startTime = now;
      }
    }

    // Update real-life / system variables
    this.updateSystemVariables();
  }

  /**
   * Update real-life and system variables ($time, $user, etc.)
   */
  private updateSystemVariables(): void {
    const now = new Date();

    // Time variables
    this.setVariable('$time', now.toLocaleTimeString());
    this.setVariable('$date', now.toLocaleDateString());
    this.setVariable('$timestamp', now.getTime());
    this.setVariable('$hour', now.getHours());
    this.setVariable('$minute', now.getMinutes());
    this.setVariable('$second', now.getSeconds());

    // Mock Real-Life Data (Can be overridden by host)
    if (this.getVariable('$user') === undefined) {
      this.setVariable('$user', {
        id: 'user_123',
        name: 'Alpha Explorer',
        level: 42,
        rank: 'Legendary',
        achievements: ['First World', 'Spirit Guide'],
        preferences: { theme: 'holographic', language: 'en' },
      });
    }

    if (this.getVariable('$location') === undefined) {
      this.setVariable('$location', {
        city: 'Neo Tokyo',
        region: 'Holo-Sector 7',
        coordinates: { lat: 35.6895, lng: 139.6917 },
        altitude: 450,
      });
    }

    if (this.getVariable('$weather') === undefined) {
      this.setVariable('$weather', {
        condition: 'Neon Mist',
        temperature: 24,
        humidity: 65,
        windSpeed: 12,
        unit: 'C',
      });
    }

    if (this.getVariable('$wallet') === undefined) {
      this.setVariable('$wallet', {
        address: '0xHolo...42ff',
        balance: 1337.5,
        currency: 'HOLO',
        network: 'MainNet',
      });
    }

    if (this.getVariable('$ai_config') === undefined) {
      const savedKeys =
        typeof localStorage !== 'undefined' ? localStorage.getItem('brittney_api_keys') : null;
      let configuredCount = 0;
      if (savedKeys) {
        try {
          const keys = JSON.parse(savedKeys);
          configuredCount = Object.values(keys).filter((k) => !!k).length;
        } catch (_e) {
          // Intentionally swallowed: malformed localStorage JSON should not block runtime init
        }
      }

      this.setVariable('$ai_config', {
        status: configuredCount > 0 ? 'configured' : 'pending',
        providerCount: configuredCount,
        lastUpdated: Date.now(),
      });
    }

    if (this.getVariable('$chat_status') === undefined) {
      this.setVariable('$chat_status', {
        active: true,
        typing: false,
        version: '1.0.0-brittney',
      });
    }
  }

  // ==========================================================================
  // COMMERCE PRIMITIVES
  // ==========================================================================

  private handleShop(args: HoloScriptValue[]): HoloScriptValue {
    const config = args[0] || {};
    this.emit('shop', config);
    return { success: true, type: 'shop', config };
  }

  private handleInventory(args: HoloScriptValue[]): HoloScriptValue {
    const item = args[0];
    const action = args[1] || 'add';
    this.emit('inventory', { item, action });
    return { success: true, item, action };
  }

  private handlePurchase(args: HoloScriptValue[]): HoloScriptValue {
    const productId = args[0];
    this.emit('purchase', { productId });
    return { success: true, productId, status: 'pending' };
  }

  // ==========================================================================
  // SOCIAL PRIMITIVES
  // ==========================================================================

  private handlePresence(args: HoloScriptValue[]): HoloScriptValue {
    const config = args[0] || {};
    this.emit('presence', config);
    return { success: true, active: true };
  }

  private handleInvite(args: HoloScriptValue[]): HoloScriptValue {
    const userId = args[0];
    this.emit('invite', { userId });
    return { success: true, userId };
  }

  private handleShare(args: HoloScriptValue[]): HoloScriptValue {
    const scriptId = args[0];
    const targetUserId = args[1];
    this.emit('share', { scriptId, targetUserId });
    return { success: true, scriptId };
  }

  // ==========================================================================
  // PHYSICS PRIMITIVES
  // ==========================================================================

  private handlePhysics(args: HoloScriptValue[]): HoloScriptValue {
    const config = args[0] || {};
    this.emit('physics', config);
    return { success: true, enabled: (config as Record<string, unknown>).enabled !== false };
  }

  private handleGravity(args: HoloScriptValue[]): HoloScriptValue {
    const value = args[0] ?? 9.81;
    this.emit('gravity', { value });
    return { success: true, value };
  }

  private handleCollide(args: HoloScriptValue[]): HoloScriptValue {
    const target = args[0];
    const handler = args[1];
    this.emit('collide', { target, handler });
    return { success: true, target };
  }

  /**
   * Handle calculate_arc(start, end, speed)
   */
  private handleCalculateArc(args: HoloScriptValue[]): HoloScriptValue {
    if (args.length < 3) return { x: 0, y: 0, z: 0 };

    const start = args[0] as SpatialPosition;
    const end = args[1] as SpatialPosition;
    const speed = args[2] as number;

    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) return { x: 0, y: speed, z: 0 };

    // Basic projectile velocity with upward arc
    // v_x = dx/t, v_z = dz/t, v_y = dy/t + 0.5 * g * t
    // simplified for now:
    const t = dist / speed;
    const vx = dx / t;
    const vz = dz / t;
    const vy = dy / t + 0.5 * 9.81 * t; // Compensate for gravity

    return { x: vx, y: vy, z: vz };
  }

  private handleAnimate(args: HoloScriptValue[]): HoloScriptValue {
    const options = args[0] || {};
    this.emit('animate', options);
    return { success: true, options };
  }

  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'easeIn':
        return t * t;
      case 'easeOut':
        return t * (2 - t);
      case 'easeInOut':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'easeInQuad':
        return t * t;
      case 'easeOutQuad':
        return t * (2 - t);
      case 'easeInOutQuad':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'linear':
      default:
        return t;
    }
  }

  // ============================================================================
  // Particle Effects
  // ============================================================================

  private createParticleEffect(
    name: string,
    position: SpatialPosition,
    color: string,
    count: number
  ): void {
    const limitedCount = Math.min(count, RUNTIME_SECURITY_LIMITS.maxParticlesPerSystem);
    const particles: SpatialPosition[] = [];

    for (let i = 0; i < limitedCount; i++) {
      particles.push({
        x: position.x + (Math.random() - 0.5) * 2,
        y: position.y + (Math.random() - 0.5) * 2,
        z: position.z + (Math.random() - 0.5) * 2,
      });
    }

    this.particleSystems.set(name, {
      particles,
      color,
      lifetime: 3000,
      speed: 0.01,
    });
  }

  private createConnectionStream(
    from: string,
    to: string,
    fromPos: SpatialPosition,
    toPos: SpatialPosition,
    dataType: string
  ): void {
    const streamName = `connection_${from}_${to}`;
    const particles: SpatialPosition[] = [];
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      particles.push({
        x: fromPos.x + (toPos.x - fromPos.x) * t,
        y: fromPos.y + (toPos.y - fromPos.y) * t,
        z: fromPos.z + (toPos.z - fromPos.z) * t,
      });
    }

    this.particleSystems.set(streamName, {
      particles,
      color: this.getDataTypeColor(dataType),
      lifetime: 5000,
      speed: 0.02,
    });
  }

  private createFlowingStream(name: string, position: SpatialPosition, data: unknown): void {
    const count = Array.isArray(data) ? Math.min(data.length, 50) : 10;
    this.createParticleEffect(`${name}_flow`, position, '#45b7d1', count);
  }

  private createExecutionEffect(name: string, position: SpatialPosition): void {
    this.createParticleEffect(`${name}_execution`, position, '#ff4500', 30);
  }

  private createDataVisualization(name: string, data: unknown, position: SpatialPosition): void {
    let count = 10;
    if (Array.isArray(data)) {
      count = Math.min(data.length, 100);
    } else if (typeof data === 'object' && data !== null) {
      count = Math.min(Object.keys(data).length * 5, 50);
    }
    this.createParticleEffect(`${name}_visualization`, position, '#32cd32', count);
  }

  private getDataTypeColor(dataType: string): string {
    const colors: Record<string, string> = {
      string: '#ff6b35',
      number: '#4ecdc4',
      boolean: '#45b7d1',
      object: '#96ceb4',
      array: '#ffeaa7',
      any: '#dda0dd',
      move: '#ff69b4',
    };
    return colors[dataType] || '#ffffff';
  }

  // ============================================================================
  // Visualizer Server
  // ============================================================================

  public startVisualizationServer(port: number = 8080): void {
    try {
      this.wss = new WebSocketServer({ port });
      logger.info(`[Visualizer] WebSocket server started on port ${port}`);

      // Initialize time manager
      this.timeManager = new TimeManager(new Date());

      // Broadcast time updates to all connected clients
      this.timeManager.onUpdate((julianDate, date) => {
        // Update all orbs that have traits (like @orbital)
        this.updateTraits(julianDate);

        // Broadcast time update to clients
        this.broadcast('time_update', {
          julianDate,
          date: date.toISOString(),
          timeScale: this.timeManager!.getTimeScale(),
          isPaused: this.timeManager!.getIsPaused(),
        });
      });

      // Start time simulation
      this.timeManager.start();

      // Calculate initial states immediately
      this.updateTraits(this.timeManager.getJulianDate());

      this.wss.on('connection', (ws) => {
        logger.info('[Visualizer] Client connected');

        // Send initial state (all orbs)
        const orbs = Array.from(this.context.variables.entries())
          .filter(
            ([_, v]) =>
              v && typeof v === 'object' && (v as Record<string, unknown>).__type === 'orb'
          )
          .map(([id, v]) => {
            const orbData = v as Record<string, unknown>;
            return {
              id,
              name: orbData.name || id,
              position: Array.isArray(orbData.position)
                ? { x: orbData.position[0], y: orbData.position[1], z: orbData.position[2] }
                : orbData.position,
              properties: orbData.properties || {},
              hologram: orbData.hologram || (() => {
                const props = orbData.properties as Record<string, unknown> | undefined;
                return {
                  color: (props?.color as string) || '#ffffff',
                  size: (props?.size as number) || (props?.scale as number) || 1,
                  shape: ((props?.geometry as string) || 'sphere') as 'sphere' | 'cube',
                  glow: (props?.glow as boolean) || false,
                };
              })(),
              traits: orbData.traits || [],
            };
          });

        // Send initial state with time info
        ws.send(
          JSON.stringify({
            type: 'init',
            orbs,
            time: this.timeManager ? this.timeManager.getState() : null,
          })
        );

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());

            // Handle time control commands
            if (data.type === 'time_control') {
              this.handleTimeControl(data.command, data.value);
            }
          } catch (e) {
            logger.error('[Visualizer] Failed to parse message', { error: String(e) });
          }
        });
      });
    } catch (error) {
      logger.error('[Visualizer] Failed to start server', { error: String(error) });
    }
  }

  /**
   * Handle time control commands from visualizer
   */
  private handleTimeControl(command: string, value?: unknown): void {
    if (!this.timeManager) return;

    switch (command) {
      case 'play':
        this.timeManager.play();
        break;
      case 'pause':
        this.timeManager.pause();
        break;
      case 'toggle':
        this.timeManager.togglePause();
        break;
      case 'setSpeed':
        if (typeof value === 'number') {
          this.timeManager.setTimeScale(value);
        }
        break;
      case 'setDate':
        if (value) {
          this.timeManager.setDate(new Date(value as string | number));
        }
        break;
      case 'syncRealTime':
        this.timeManager.setDate(new Date());
        this.timeManager.setTimeScale(1);
        this.timeManager.play();
        break;
    }
  }

  public broadcast(type: string, payload: unknown): void {
    if (!this.wss) return;
    const message = JSON.stringify({ type, payload });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getParticleSystems(): Map<string, ParticleSystem> {
    return new Map(this.particleSystems);
  }

  updateParticles(deltaTime: number): void {
    for (const [name, system] of this.particleSystems) {
      system.lifetime -= deltaTime;
      system.particles.forEach((particle) => {
        particle.x += (Math.random() - 0.5) * system.speed;
        particle.y += (Math.random() - 0.5) * system.speed;
        particle.z += (Math.random() - 0.5) * system.speed;
      });
      if (system.lifetime <= 0) {
        this.particleSystems.delete(name);
      }
    }
  }

  getContext(): RuntimeContext {
    return { ...this.context };
  }

  getUIElements(): Map<string, UIElementState> {
    return new Map(this.uiElements);
  }

  getUIElement(name: string): UIElementState | undefined {
    return this.uiElements.get(name);
  }

  getAnimations(): Map<string, Animation> {
    return new Map(this.animations);
  }

  reset(): void {
    this.context = this.createEmptyContext();
    this.currentScope = { variables: this.context.variables };
    this.callStack = [];
    this.particleSystems.clear();
    this.executionHistory = [];
    this.eventHandlers.clear();
    this.animations.clear();
    this.uiElements.clear();
    // Note: System variables are NOT re-added on reset.
    // They will be initialized when the runtime is next used.
  }

  private createEmptyContext(): RuntimeContext {
    return {
      variables: new Map(),
      functions: new Map(),
      exports: new Map(),
      connections: [],
      spatialMemory: new Map(),
      hologramState: new Map(),
      executionStack: [],
      currentScale: 1,
      scaleMagnitude: 'standard',
      focusHistory: [],
      environment: {},
      templates: new Map(),
      // HS+ State
      state: createState({}),
      // Phase 13: State Machines
      stateMachines: new Map(),
      // Narrative & Story State
      quests: new Map(),
      completedQuests: new Set(),
    };
  }

  private async executeScale(node: ScaleNode): Promise<ExecutionResult> {
    const parentScale = this.context.currentScale;
    this.context.currentScale *= node.multiplier;
    this.context.scaleMagnitude = node.magnitude;

    logger.info('Scale context entering', {
      magnitude: node.magnitude,
      multiplier: this.context.currentScale,
    });

    // Emit event for renderer sync
    this.emit('scale:change', { multiplier: this.context.currentScale, magnitude: node.magnitude });

    const results = await this.executeProgram(node.body, this.context.executionStack.length);

    // Restore parent scale after block
    this.context.currentScale = parentScale;

    // Restore renderer scale
    this.emit('scale:change', { multiplier: this.context.currentScale });

    return {
      success: results.every((r) => r.success),
      output: `Executed scale block: ${node.magnitude}`,
    };
  }

  private async executeFocus(node: FocusNode): Promise<ExecutionResult> {
    this.context.focusHistory.push(node.target);
    const results = await this.executeProgram(node.body, this.context.executionStack.length);

    return {
      success: results.every((r) => r.success),
      output: `Focused on ${node.target}`,
    };
  }

  private async executeEnvironment(node: EnvironmentNode): Promise<ExecutionResult> {
    this.context.environment = { ...this.context.environment, ...node.settings };
    return { success: true, output: 'Environment updated' };
  }

  private async executeComposition(node: CompositionNode): Promise<ExecutionResult> {
    if (node.body) {
      // Execute systems first
      const systemResults = await this.executeProgram(
        node.body.systems,
        this.context.executionStack.length
      );
      // Execute configs
      const configResults = await this.executeProgram(
        node.body.configs,
        this.context.executionStack.length
      );
      // Execute children
      const childrenResults = await this.executeProgram(
        node.body.children,
        this.context.executionStack.length
      );

      const allResults = [...systemResults, ...configResults, ...childrenResults];
      return {
        success: allResults.every((r) => r.success),
        output: `Composition ${node.name} executed with specialized blocks`,
      };
    }

    return {
      success: (await this.executeProgram(node.children, this.context.executionStack.length)).every(
        (r) => r.success
      ),
      output: `Composition ${node.name} executed`,
    };
  }

  private resolveHoloValue(value: HoloValue): HoloScriptValue {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((e) => this.resolveHoloValue(e));
    }
    // Handle Bind (pass through or resolve?)
    if ((value as Record<string, unknown>).__bind) {
      return value as HoloScriptValue;
    }
    // Handle Object
    const obj: Record<string, HoloScriptValue> = {};
    for (const k in value as Record<string, unknown>) {
      obj[k] = this.resolveHoloValue((value as Record<string, unknown>)[k] as HoloValue);
    }
    return obj;
  }

  private async executeHoloComposition(node: HoloComposition): Promise<ExecutionResult> {
    // Register templates
    for (const template of node.templates) {
      await this.executeHoloTemplate(template);
    }

    // Execute environment
    if (node.environment) {
      // Convert environment properties to record
      const envSettings: Record<string, HoloScriptValue> = {};
      for (const prop of node.environment.properties) {
        envSettings[prop.key] = this.resolveHoloValue(prop.value as HoloValue);
      }
      this.context.environment = { ...this.context.environment, ...envSettings };
    }

    // Execute objects
    const results: ExecutionResult[] = [];
    for (const object of node.objects) {
      results.push(await this.executeHoloObject(object));
    }

    return {
      success: results.every((r) => r.success),
      output: `HoloComposition ${node.name} executed`,
    };
  }

  private async executeHoloTemplate(node: HoloTemplate): Promise<ExecutionResult> {
    // Store template in context
    this.context.templates.set(node.name, node as unknown as TemplateNode);
    return { success: true, output: `Template ${node.name} registered` };
  }

  private async executeHoloObject(node: HoloObjectDecl): Promise<ExecutionResult> {
    // Convert HoloObjectDecl to OrbNode-like structure and execute logic
    const properties: Record<string, HoloScriptValue> = {};

    // Convert properties
    for (const prop of node.properties) {
      properties[prop.key] = this.resolveHoloValue(prop.value);
    }

    // Handle state
    if (node.state) {
      for (const prop of node.state.properties) {
        properties[prop.key] = this.resolveHoloValue(prop.value);
      }
    }

    // Extract position if present
    const position = properties.position as SpatialPosition | undefined;

    // Extract hologram properties
    const hologram = {
      shape: (properties.geometry as string) || 'sphere',
      color: (properties.color as string) || '#ffffff',
      size: (properties.scale as number) || (properties.size as number) || 1,
      glow: (properties.glow as boolean) || false,
      interactive: properties.interactive !== false,
    } as HologramProperties;

    // Construct OrbNode
    const orbNode: OrbNode = {
      type: 'orb',
      name: node.name,
      position: position, // Direct property for executeOrb
      hologram: hologram, // Direct property for executeOrb
      properties: properties,
      directives: [
        ...(node.directives || []),
        ...(node.traits || []).map((t) => ({ type: 'trait' as const, name: t.name, ...t.config })),
        ...(node.template
          ? this.context.templates.get(node.template)?.directives || []
          : []), // Inherit template directives/traits
      ],
      traits: new Map((node.traits || []).map((t) => [t.name as VRTraitName, t.config])),
      children: (node.children as unknown as ASTNode[]) || [],
    };

    // Handle 'using' template
    if (node.template) {
      const tpl = this.context.templates.get(node.template) as unknown as
        | HoloTemplate
        | undefined;
      if (tpl) {
        // Merge template state
        if (tpl.state) {
          for (const prop of tpl.state.properties) {
            if (properties[prop.key] === undefined) {
              properties[prop.key] = this.resolveHoloValue(prop.value);
            }
          }
        }
        // Merge template properties
        for (const prop of tpl.properties) {
          if (properties[prop.key] === undefined) {
            properties[prop.key] = this.resolveHoloValue(prop.value);
          }
        }
      }
    }

    return this.executeOrb(orbNode);
  }

  /**
   * Execute a block of HoloStatements (HoloNode AST)
   */
  async executeHoloProgram(
    statements: HoloStatement[],
    scopeOverride?: Scope
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    telemetry.setGauge('execution_depth', this.context.executionStack.length);
    for (const stmt of statements) {
      telemetry.incrementCounter('statements_executed', 1, { type: stmt.type });

      const res = await telemetry.measureLatency(`execute_stmt_${stmt.type}`, () =>
        this.executeHoloStatement(stmt, scopeOverride)
      );

      results.push(res);
      // If a result has an output that indicates a return, stop execution
      const last = results[results.length - 1];
      if (last.success && last.output !== undefined && stmt.type === 'ReturnStatement') {
        break;
      }
    }
    return results;
  }

  private async executeHoloStatement(
    stmt: HoloStatement,
    scopeOverride?: Scope
  ): Promise<ExecutionResult> {
    // console.log(`[EXEC] Statement: ${stmt.type}`, JSON.stringify(stmt).substring(0, 100));
    const _startTime = Date.now();
    try {
      switch (stmt.type) {
        case 'Assignment': {
          const value = await this.evaluateHoloExpression(stmt.value, scopeOverride);
          let finalValue = value;
          if (stmt.operator !== '=') {
            const current = this.getVariable(stmt.target, scopeOverride);
            if (stmt.operator === '+=')
              finalValue = (Number(current) + Number(value)) as HoloScriptValue;
            else if (stmt.operator === '-=')
              finalValue = (Number(current) - Number(value)) as HoloScriptValue;
            else if (stmt.operator === '*=')
              finalValue = (Number(current) * Number(value)) as HoloScriptValue;
            else if (stmt.operator === '/=')
              finalValue = (Number(current) / Number(value)) as HoloScriptValue;
          }
          this.setVariable(stmt.target, finalValue, scopeOverride);
          return { success: true };
        }
        case 'IfStatement': {
          const condition = await this.evaluateHoloExpression(stmt.condition, scopeOverride);
          if (condition) {
            await this.executeHoloProgram(stmt.consequent, scopeOverride);
          } else if (stmt.alternate) {
            await this.executeHoloProgram(stmt.alternate, scopeOverride);
          }
          return { success: true };
        }
        case 'WhileStatement': {
          const MAX_ITERATIONS = 1000;
          let iter = 0;
          while (await this.evaluateHoloExpression(stmt.condition, scopeOverride)) {
            if (iter++ > MAX_ITERATIONS) return { success: false, error: 'Infinite loop' };
            await this.executeHoloProgram(stmt.body, scopeOverride);
          }
          return { success: true };
        }
        case 'ClassicForStatement': {
          if (stmt.init) await this.executeHoloStatement(stmt.init, scopeOverride);
          const MAX_ITERATIONS = 1000;
          let iter = 0;
          while (!stmt.test || (await this.evaluateHoloExpression(stmt.test, scopeOverride))) {
            if (iter++ > MAX_ITERATIONS) return { success: false, error: 'Infinite loop' };
            await this.executeHoloProgram(stmt.body, scopeOverride);
            if (stmt.update) await this.executeHoloStatement(stmt.update, scopeOverride);
          }
          return { success: true };
        }
        case 'VariableDeclaration': {
          const value = stmt.value
            ? await this.evaluateHoloExpression(stmt.value, scopeOverride)
            : undefined;
          const scope = scopeOverride || this.currentScope;
          scope.variables.set(stmt.name, value as HoloScriptValue);
          return { success: true };
        }
        case 'EmitStatement': {
          const data = stmt.data
            ? await this.evaluateHoloExpression(stmt.data, scopeOverride)
            : undefined;
          this.emit(stmt.event, data);
          return { success: true };
        }
        case 'AwaitStatement': {
          const value = await this.evaluateHoloExpression(stmt.expression, scopeOverride);
          if (value instanceof Promise) await value;
          return { success: true };
        }
        case 'ReturnStatement': {
          const value = stmt.value
            ? await this.evaluateHoloExpression(stmt.value, scopeOverride)
            : null;
          return { success: true, output: value };
        }
        case 'ExpressionStatement': {
          const val = await this.evaluateHoloExpression(stmt.expression, scopeOverride);
          return { success: true, output: val };
        }
        default:
          return {
            success: false,
            error: `Unknown stmt type: ${(stmt as { type?: string }).type}`,
          };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[EXEC_ERROR] Statement ${stmt.type} failed:`, errMsg);
      return { success: false, error: errMsg };
    }
  }

  private async evaluateHoloExpression(
    expr: HoloExpression,
    scopeOverride?: Scope
  ): Promise<HoloScriptValue> {
    switch (expr.type) {
      case 'Literal':
        return expr.value;
      case 'Identifier':
        return this.getVariable(expr.name, scopeOverride);
      case 'MemberExpression': {
        const obj = await this.evaluateHoloExpression(expr.object, scopeOverride);
        if (obj && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[expr.property] as HoloScriptValue;
        }
        return undefined;
      }
      case 'CallExpression': {
        if (!Array.isArray(expr.arguments)) {
          console.error('[CRITICAL] arguments is not an array for', JSON.stringify(expr));
          return undefined;
        }
        const callee = await this.evaluateHoloExpression(expr.callee, scopeOverride);
        const args = await Promise.all(
          expr.arguments.map((a: HoloExpression) => this.evaluateHoloExpression(a, scopeOverride))
        );

        if (typeof callee === 'function') {
          return (callee as Function)(...args); // Spread args
        }
        if (expr.callee.type === 'Identifier') {
          const result = await this.callFunction(expr.callee.name, args);
          return result.output;
        }
        return undefined;
      }
      case 'BinaryExpression': {
        const left = await this.evaluateHoloExpression(expr.left, scopeOverride);
        const right = await this.evaluateHoloExpression(expr.right, scopeOverride);
        switch (expr.operator) {
          case '+':
            return (Number(left) + Number(right)) as HoloScriptValue;
          case '-':
            return (Number(left) - Number(right)) as HoloScriptValue;
          case '*':
            return (Number(left) * Number(right)) as HoloScriptValue;
          case '/':
            return (Number(left) / Number(right)) as HoloScriptValue;
          case '==':
            return left == right;
          case '===':
            return left === right;
          case '!=':
            return left != right;
          case '!==':
            return left !== right;
          case '<':
            return Number(left) < Number(right);
          case '>':
            return Number(left) > Number(right);
          case '<=':
            return Number(left) <= Number(right);
          case '>=':
            return Number(left) >= Number(right);
          case '&&':
            return left && right;
          case '||':
            return left || right;
          default:
            return undefined;
        }
      }
      case 'ConditionalExpression': {
        const test = await this.evaluateHoloExpression(expr.test, scopeOverride);
        return test
          ? await this.evaluateHoloExpression(expr.consequent, scopeOverride)
          : await this.evaluateHoloExpression(expr.alternate, scopeOverride);
      }
      case 'UpdateExpression': {
        const val = await this.evaluateHoloExpression(expr.argument, scopeOverride);
        const newVal = expr.operator === '++' ? (val as number) + 1 : (val as number) - 1;
        const path = this.getMemberPath(expr.argument);
        if (path) {
          this.setVariable(path, newVal as HoloScriptValue, scopeOverride);
        }
        return expr.prefix ? newVal : val;
      }
      case 'ArrayExpression': {
        return await Promise.all(
          expr.elements.map((e) => this.evaluateHoloExpression(e, scopeOverride))
        );
      }
      case 'ObjectExpression': {
        const obj: Record<string, HoloScriptValue> = {};
        for (const prop of expr.properties) {
          obj[prop.key] = await this.evaluateHoloExpression(prop.value, scopeOverride);
        }
        return obj;
      }
      default:
        return undefined;
    }
  }

  /**
   * Get member path from expression
   */
  @MethodMemoize(500)
  private getMemberPath(expr: HoloExpression): string | null {
    if (expr.type === 'Identifier') return expr.name;
    if (expr.type === 'MemberExpression') {
      const parentPath = this.getMemberPath(expr.object);
      if (parentPath) return `${parentPath}.${expr.property}`;
    }
    return null;
  }

  private async executeSystem(node: SystemNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    const systemId = node.id;
    const properties = node.properties;

    logger.info(`[Zero-Config] Provisioning system: ${systemId}`, properties);

    switch (systemId) {
      case 'Networking':
        return this.setupNetworking(node);
      case 'Physics':
        return this.setupPhysics(node);
      default:
        logger.warn(`[Zero-Config] Unknown system: ${systemId}`);
        return {
          success: true,
          output: `System ${systemId} not recognized, skipping provisioning`,
          executionTime: Date.now() - startTime,
        };
    }
  }

  private async executeCoreConfig(node: CoreConfigNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info('[Zero-Config] Applying core configuration', node.properties);

    // Merge into environment context
    for (const [key, value] of Object.entries(node.properties)) {
      this.context.environment[key] = value;
    }

    return {
      success: true,
      output: 'Core configuration applied',
      executionTime: Date.now() - startTime,
    };
  }

  // =========================================================================
  // Control Flow Execution
  // =========================================================================

  /**
   * Execute a for loop: @for item in collection { ... }
   */
  private async executeForLoop(node: {
    variable: string;
    iterable: string | unknown;
    body: ASTNode[];
  }): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { variable, iterable, body } = node;

    try {
      // Evaluate the iterable expression
      const collection = this.evaluateExpression(String(iterable));

      if (!Array.isArray(collection) && typeof collection !== 'object') {
        return {
          success: false,
          error: `Cannot iterate over non-iterable: ${typeof collection}`,
          executionTime: Date.now() - startTime,
        };
      }

      const items = Array.isArray(collection)
        ? collection
        : collection && typeof collection === 'object'
          ? Object.entries(collection)
          : [];
      let lastResult: ExecutionResult = { success: true, output: null };

      for (const item of items) {
        // Set loop variable in context
        this.context.variables.set(variable, item);

        // Execute body
        for (const bodyNode of body) {
          lastResult = await this.executeNode(bodyNode);
          if (!lastResult.success) break;
        }

        if (!lastResult.success) break;
      }

      // Clean up loop variable
      this.context.variables.delete(variable);

      return {
        success: true,
        output: lastResult.output,
        executionTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `For loop error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a forEach loop: @forEach item in collection { ... }
   */
  private async executeForEachLoop(node: {
    variable: string;
    collection: string | unknown;
    body: ASTNode[];
  }): Promise<ExecutionResult> {
    // forEach is functionally identical to for in this context
    return this.executeForLoop({
      variable: node.variable,
      iterable: node.collection,
      body: node.body,
    });
  }

  /**
   * Execute a while loop: @while condition { ... }
   */
  private async executeWhileLoop(node: {
    condition: string | unknown;
    body: ASTNode[];
  }): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { condition, body } = node;
    const MAX_ITERATIONS = 10000; // Safety limit

    try {
      let iterations = 0;
      let lastResult: ExecutionResult = { success: true, output: null };

      while (this.evaluateCondition(String(condition))) {
        iterations++;
        if (iterations > MAX_ITERATIONS) {
          return {
            success: false,
            error: `While loop exceeded maximum iterations (${MAX_ITERATIONS})`,
            executionTime: Date.now() - startTime,
          };
        }

        for (const bodyNode of body) {
          lastResult = await this.executeNode(bodyNode);
          if (!lastResult.success) break;
        }

        if (!lastResult.success) break;
      }

      return {
        success: true,
        output: lastResult.output,
        executionTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `While loop error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute an if statement: @if condition { ... } @else { ... }
   */
  private async executeIfStatement(node: {
    condition: string | unknown;
    body: ASTNode[];
    elseBody?: ASTNode[];
  }): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { condition, body, elseBody } = node;

    try {
      const conditionResult = this.evaluateCondition(String(condition));
      const branchToExecute = conditionResult ? body : elseBody || [];

      let lastResult: ExecutionResult = { success: true, output: null };

      for (const bodyNode of branchToExecute) {
        lastResult = await this.executeNode(bodyNode);
        if (!lastResult.success) break;
      }

      return {
        success: true,
        output: lastResult.output,
        executionTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `If statement error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a match expression: @match subject { pattern => result, ... }
   */
  private async executeMatch(node: {
    subject: string | unknown;
    cases: Array<{
      pattern: string | unknown;
      guard?: string | unknown;
      body: ASTNode[] | unknown;
    }>;
  }): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { subject, cases } = node;

    try {
      const subjectValue = this.evaluateExpression(String(subject));

      for (const matchCase of cases || []) {
        const patternValue = this.evaluateExpression(String(matchCase.pattern));

        // Check pattern match
        if (this.patternMatches(patternValue, subjectValue)) {
          // Check guard if present
          if (matchCase.guard && !this.evaluateCondition(String(matchCase.guard))) {
            continue;
          }

          // Execute body
          if (Array.isArray(matchCase.body)) {
            let lastResult: ExecutionResult = { success: true, output: null };
            for (const bodyNode of matchCase.body) {
              lastResult = await this.executeNode(bodyNode);
              if (!lastResult.success) break;
            }
            return lastResult;
          } else {
            const result = this.evaluateExpression(String(matchCase.body));
            return { success: true, output: result, executionTime: Date.now() - startTime };
          }
        }
      }

      return {
        success: false,
        error: 'No pattern matched',
        executionTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Match expression error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if a pattern matches a value
   */
  private patternMatches(pattern: HoloScriptValue, value: HoloScriptValue): boolean {
    // Wildcard pattern
    if (pattern === '_' || pattern === 'else' || pattern === 'default') {
      return true;
    }

    // Direct equality
    if (pattern === value) {
      return true;
    }

    // Type pattern: "string" matches any string
    if (pattern === 'string' && typeof value === 'string') return true;
    if (pattern === 'number' && typeof value === 'number') return true;
    if (pattern === 'boolean' && typeof value === 'boolean') return true;
    if (pattern === 'array' && Array.isArray(value)) return true;
    if (pattern === 'object' && typeof value === 'object' && value !== null) return true;

    // Range pattern: [1, 10] matches values 1-10
    if (Array.isArray(pattern) && pattern.length === 2) {
      const [min, max] = pattern;
      if (
        typeof value === 'number' &&
        typeof min === 'number' &&
        typeof max === 'number' &&
        value >= min &&
        value <= max
      ) {
        return true;
      }
    }

    return false;
  }

  private async executeNarrative(node: NarrativeNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Narrative] Initializing narrative: ${node.id}`);

    // Register all quests in the narrative
    for (const quest of node.quests) {
      this.context.quests.set(quest.id, quest);
    }

    // Auto-start the narrative if startNode is provided
    if (node.startNode) {
      logger.info(`[Narrative] Auto-starting at node: ${node.startNode}`);
    }

    return {
      success: true,
      output: `Narrative ${node.id} initialized with ${node.quests.length} quests`,
      executionTime: Date.now() - startTime,
    };
  }

  private async executeQuest(node: QuestNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Narrative] Starting quest: ${node.title}`, { questId: node.id });

    this.context.activeQuestId = node.id;
    this.context.quests.set(node.id, node);

    return {
      success: true,
      output: `Quest ${node.id} started`,
      executionTime: Date.now() - startTime,
    };
  }

  private async executeDialogue(node: DialogueNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Narrative] Dialogue: ${node.speaker} says "${node.text}"`);

    // Update dialogue state
    this.context.dialogueState = {
      currentNodeId: node.id,
      speaker: node.speaker,
    };

    return {
      success: true,
      output: `Dialogue node ${node.id} executed`,
      executionTime: Date.now() - startTime,
    };
  }

  private async executeVisualMetadata(node: VisualMetadataNode): Promise<ExecutionResult> {
    logger.info(`[Metadata] Visual metadata processed`, node.properties);
    return { success: true, output: 'Visual metadata applied' };
  }

  private async setupNetworking(node: SystemNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    // Logic for initializing NetworkingService would go here
    logger.info('[Networking] Initializing multiplayer fabric...', node.properties);
    return {
      success: true,
      output: 'Networking system provisioned',
      executionTime: Date.now() - startTime,
    };
  }

  private async setupPhysics(node: SystemNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    // Logic for initializing PhysicsEngine would go here
    logger.info('[Physics] Initializing spatial simulation engine...', node.properties);
    return {
      success: true,
      output: 'Physics system provisioned',
      executionTime: Date.now() - startTime,
    };
  }

  private async executeTemplate(node: TemplateNode): Promise<ExecutionResult> {
    const existing = this.context.templates.get(node.name);
    if (existing) {
      (node as unknown as Record<string, unknown>)._previousVersion = existing.version;
    }
    this.context.templates.set(node.name, node);
    return {
      success: true,
      output: `Template ${node.name} registered (v${node.version || 'unknown'})`,
    };
  }

  /**
   * Execute a migration script for an object
   */
  private async executeMigrationBlock(
    orb: Record<string, unknown>,
    migration: MigrationNode
  ): Promise<void> {
    logger.info(`Running migration for ${orb.name}...`);

    const previousScope = this.currentScope;
    this.currentScope = {
      variables: new Map<string, HoloScriptValue>([
        ['this', orb as HoloScriptValue],
        ['self', orb as HoloScriptValue],
      ]),
      parent: previousScope,
    };

    try {
      const parser = new HoloScriptCodeParser();
      const result = parser.parse(migration.body);

      if (result.errors.length > 0) {
        logger.error(`Migration parse errors for ${orb.name}:`, { errors: result.errors as unknown });
        return;
      }

      await this.executeProgram(result.ast, 0);
    } finally {
      this.currentScope = previousScope;
    }

    logger.info(`Migration complete for ${orb.name}`);
  }

  private async executeServerNode(node: ServerNode): Promise<ExecutionResult> {
    if (this.context.mode === 'public') {
      return {
        success: false,
        error: 'SecurityViolation: Server creation blocked in public mode.',
        executionTime: 0,
      };
    }

    logger.info(`Starting server on port ${node.port}`);

    return {
      success: true,
      output: `Server listening on port ${node.port}`,
      hologram: node.hologram,
      executionTime: 0,
    };
  }

  private async executeDatabaseNode(node: DatabaseNode): Promise<ExecutionResult> {
    if (this.context.mode === 'public') {
      return {
        success: false,
        error: 'SecurityViolation: DB access blocked in public mode.',
        executionTime: 0,
      };
    }

    logger.info(`Executing Query: ${node.query}`);

    return {
      success: true,
      output: `Query executed: ${node.query}`,
      hologram: node.hologram,
      executionTime: 0,
    };
  }

  private async executeFetchNode(node: FetchNode): Promise<ExecutionResult> {
    if (this.context.mode === 'public') {
      return {
        success: false,
        error: 'SecurityViolation: External fetch blocked in public mode.',
        executionTime: 0,
      };
    }

    logger.info(`Fetching: ${node.url}`);

    return {
      success: true,
      output: `Fetched data from ${node.url}`,
      hologram: node.hologram,
      executionTime: 0,
    };
  }

  private async executeTarget(node: ExecuteNode): Promise<ExecutionResult> {
    const target = this.context.functions.get(node.target);

    if (!target) {
      return {
        success: false,
        error: `Function ${node.target} not found`,
        executionTime: 0,
      };
    }

    const result = await this.executeFunction(target);
    this.createExecutionEffect(node.target, target.position || { x: 0, y: 0, z: 0 });

    return {
      success: true,
      output: `Executed ${node.target}`,
      hologram: {
        shape: 'sphere',
        color: '#ff4500',
        size: 1.2,
        glow: true,
        interactive: false,
      },
      executionTime: result.executionTime,
    };
  }

  private async executeStateDeclaration(
    node: ASTNode & { directives?: import('./types/AdvancedTypeSystem').HSPlusDirective[] }
  ): Promise<ExecutionResult> {
    const stateDirective = node.directives?.find((d) => d.type === 'state');
    if (stateDirective) {
      this.context.state.update(stateDirective.body as Record<string, HoloScriptValue>);
    }
    return { success: true, output: 'State updated' };
  }

  // ============================================================================
  // Memory Syntactic Execution (Phase 7 / EVOLVE)
  // ============================================================================

  private async executeMemory(node: import('./types').MemoryNode): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info(`[Memory] Initializing memory block: ${node.name}`);

    const memoryState: Record<string, unknown> = {
      id: node.name,
      type: 'agent-memory',
    };

    if (node.semantic) {
      const semResult = await this.executeNode(node.semantic);
      if (semResult.success) memoryState.semantic = semResult.output;
    }

    if (node.episodic) {
      const epResult = await this.executeNode(node.episodic);
      if (epResult.success) memoryState.episodic = epResult.output;
    }

    if (node.procedural) {
      const procResult = await this.executeNode(node.procedural);
      if (procResult.success) memoryState.procedural = procResult.output;
    }

    // Mount memory to runtime state variables so agents can access it
    this.context.variables.set(node.name, memoryState as HoloScriptValue);

    // Optionally emit event for visualizers
    this.emit('memory_initialized', { memoryId: node.name, config: memoryState });

    return {
      success: true,
      output: memoryState as HoloScriptValue,
      executionTime: Date.now() - startTime,
    };
  }

  public loadSkill(skill: ProceduralSkill): void {
    logger.info(`[Procedural] Loading skill: ${skill.name} (${skill.id})`);

    // Skill Merging implementation:
    // If we receive a network version of a skill we already know, merge the success rate
    const existing = this.proceduralSkills.get(skill.id);
    if (existing) {
      skill.successRate = (existing.successRate + (skill.successRate || 0)) / 2;
    } else {
      skill.successRate = skill.successRate || 0;
    }

    this.proceduralSkills.set(skill.id, skill);

    // Broadcast newly acquired skill over Mesh
    StateSynchronizer.getInstance().broadcastSkill(skill);
  }

  public async executeSkill(
    skillId: string,
    contextVariables: Record<string, HoloScriptValue> = {}
  ): Promise<ExecutionResult> {
    const skill = this.proceduralSkills.get(skillId);
    if (!skill) {
      throw new Error(`[Procedural] Skill '${skillId}' not found.`);
    }

    logger.info(`[Procedural] Executing skill: ${skill.name}`);
    const startTime = Date.now();

    const previousScope = this.currentScope;
    this.currentScope = { variables: new Map(previousScope.variables), parent: previousScope };

    for (const [key, val] of Object.entries(contextVariables)) {
      this.currentScope.variables.set(key, val);
    }

    try {
      const result = await this.executeNode(skill.action);

      // Update success tracking statistics
      if (result.success) {
        skill.successRate = Math.min(100, skill.successRate + 1);
      } else {
        skill.successRate = Math.max(0, skill.successRate - 1);
      }

      // Sync the updated success rate telemetry
      StateSynchronizer.getInstance().broadcastSkill(skill);

      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } finally {
      this.currentScope = previousScope;
    }
  }

  private async executeMemoryDefinition(
    node:
      | import('./types').SemanticMemoryNode
      | import('./types').EpisodicMemoryNode
      | import('./types').ProceduralMemoryNode
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Evaluate properties to concrete config values
    const config: Record<string, HoloScriptValue> = {};
    for (const [key, val] of Object.entries(node.properties || {})) {
      if (typeof val === 'string') {
        config[key] = this.evaluateExpression(val);
      } else {
        config[key] = val;
      }
    }

    return {
      success: true,
      output: {
        type: node.type,
        config,
      },
      executionTime: Date.now() - startTime,
    };
  }

  private applyDirectives(node: ASTNode): void {
    if (!node.directives) return;

    for (const d of node.directives) {
      if (d.type === 'trait') {
        logger.info(`Applying trait ${d.name} to ${node.type}`);

        const handler = this.traitHandlers.get(d.name as VRTraitName);
        if (handler) {
          handler.onAttach?.(node as unknown as HSPlusNode, d.config || {}, {
            emit: (event: string, payload: unknown) => this.emit(event, payload),
            getScaleMultiplier: () => this.context.currentScale || 1,
          } as unknown as TraitContext);
        }

        // Optional: Trigger custom initialization for specific traits
        if (d.name === 'chat') {
          this.emit('show-chat', d.config);
        }
      } else if (d.type === 'state') {
        // Ensure local state is merged into orb properties
        if (node && (node as unknown as Record<string, unknown>).__type === 'orb') {
          const stateBody = d.body as Record<string, HoloScriptValue>;
          const existingProps =
            ((node as unknown as Record<string, unknown>).properties as Record<
              string,
              HoloScriptValue
            >) || {};
          // Only set state defaults — never overwrite runtime-modified values
          for (const [key, val] of Object.entries(stateBody)) {
            if (existingProps[key] === undefined) {
              existingProps[key] = val;
            }
          }
          (node as unknown as Record<string, unknown>).properties = existingProps;
        }
        this.context.state.update(d.body as Record<string, HoloScriptValue>);
      } else if (d.type === 'lifecycle') {
        if (d.hook === 'on_mount' || d.hook === 'mount') {
          this.evaluateExpression(d.body);
        }
      }
    }
  }

  getExecutionHistory(): ExecutionResult[] {
    return [...this.executionHistory];
  }

  getHologramStates(): Map<string, HologramProperties> {
    return new Map(this.context.hologramState);
  }

  getCallStack(): string[] {
    return [...this.callStack];
  }

  getState(): Record<string, HoloScriptValue> {
    return this.context.state.getSnapshot();
  }

  getRootScope(): Scope {
    return this.currentScope;
  }

  private isAgent(node: OrbNode): boolean {
    return !!node.directives?.some(
      (d) =>
        d.type === 'trait' &&
        ((d as HSPlusTraitDirective).name === 'llm_agent' ||
          (d as HSPlusTraitDirective).name === 'agent' ||
          (d as HSPlusTraitDirective).name === 'companion')
    );
  }

  /**
   * Get current simulation time (Julian date) for orbital calculations
   */
  getSimulationTime(): number {
    return this.timeManager?.getJulianDate() || 0;
  }

  /**
   * Set orb position and broadcast update
   */
  setOrbPosition(orbName: string, position: { x: number; y: number; z: number }): void {
    const orb = this.context.variables.get(orbName);
    if (orb && typeof orb === 'object' && (orb as Record<string, unknown>).__type === 'orb') {
      (orb as Record<string, unknown>).position = position;

      // Broadcast position update to visualizer
      this.broadcast('orb_update', {
        orb: {
          id: orbName,
          name: orbName,
          position,
        },
      });
    }
  }

  /**
   * Update all orbs that have traits with an onUpdate method
   */
  private updateTraits(julianDate: number): void {
    const delta = 1 / 60; // Delta time for simulation step
    const isLogFrame = Math.floor(julianDate * 1440) % 60 === 0;

    for (const [name, value] of this.context.variables.entries()) {
      if (
        value &&
        typeof value === 'object' &&
        (value as Record<string, unknown>).__type === 'orb'
      ) {
        const orb = value as Record<string, unknown>;
        if (orb.directives) {
          for (const d of (orb.directives as Array<Record<string, unknown>>) || []) {
            if (d.type === 'trait') {
              const handler = this.traitHandlers.get(d.name as string);
              if (handler && handler.onUpdate) {
                // Execute trait update
                const traitNode = orb as unknown as HSPlusNode;
                handler.onUpdate(
                  traitNode,
                  d.config || {},
                  {
                    emit: (event: string, payload: unknown) => {
                      if (event === 'position_update') {
                        // Special handling for position updates to sync with visualizer
                        // Using 'name' (variable key) as the authoritative ID for the visualizer
                        const posPayload = payload as Record<string, unknown> | undefined;
                        if (posPayload?.position) {
                          this.setOrbPosition(name, posPayload.position as { x: number; y: number; z: number });
                        }

                      }
                      return this.emit(event, payload);
                    },
                    getScaleMultiplier: () => this.context.currentScale || 1,
                    julianDate,
                    getNode: (nodeName: string) => this.context.variables.get(nodeName),
                    getState: () => this.getState(),
                    setState: (updates: Record<string, HoloScriptValue>) =>
                      this.context.state.update(updates),
                  } as unknown as TraitContext,
                  delta
                );
              }
            }
          }
        }
      }
    }
  }
}
