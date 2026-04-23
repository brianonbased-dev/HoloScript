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
import { readJson } from './errors/safeJsonParse';
import { WebSocketServer, WebSocket } from 'ws';
// W1-T4 slice 1: pure easing helper extracted to ./runtime/easing
import { applyEasing } from './runtime/easing';
// W1-T4 slice 2: pure physics math extracted to ./runtime/physics-math
import { calculateArc } from './runtime/physics-math';
// W1-T4 slice 3: condition evaluator extracted to ./runtime/condition-evaluator
import { evaluateCondition as evaluateConditionPure } from './runtime/condition-evaluator';
// W1-T4 slice 4: particle effects extracted to ./runtime/particle-effects
// W1-T4 slice 14: updateParticles added to same module
import {
  getDataTypeColor as getDataTypeColorPure,
  createParticleEffect as createParticleEffectPure,
  createConnectionStream as createConnectionStreamPure,
  createFlowingStream as createFlowingStreamPure,
  createExecutionEffect as createExecutionEffectPure,
  createDataVisualization as createDataVisualizationPure,
  updateParticles as updateParticlesPure,
} from './runtime/particle-effects';
// W1-T4 slice 5: transformation ops extracted to ./runtime/transformation
import { applyTransformation as applyTransformationPure } from './runtime/transformation';
// W1-T4 slice 6: animation system extracted to ./runtime/animation-system
import { updateAnimations as updateAnimationsPure } from './runtime/animation-system';
// W1-T4 slice 7: visualizer helpers extracted to ./runtime/visualizer-server
import {
  broadcast as broadcastPure,
  handleTimeControl as handleTimeControlPure,
} from './runtime/visualizer-server';
// W1-T4 slice 8: primitive command handlers extracted to ./runtime/primitives
import {
  handleShop as handleShopPure,
  handleInventory as handleInventoryPure,
  handlePurchase as handlePurchasePure,
  handlePresence as handlePresencePure,
  handleInvite as handleInvitePure,
  handleShare as handleSharePure,
  handlePhysics as handlePhysicsPure,
  handleGravity as handleGravityPure,
  handleCollide as handleCollidePure,
  handleAnimate as handleAnimatePure,
} from './runtime/primitives';
// W1-T4 slice 9: system variables extracted to ./runtime/system-variables
import { updateSystemVariables as updateSystemVariablesPure } from './runtime/system-variables';
// W1-T4 slice 10: context factory extracted to ./runtime/context-factory
import { createEmptyContext } from './runtime/context-factory';
// W1-T4 slice 11: pattern matcher extracted to ./runtime/pattern-match
import { patternMatches as patternMatchesPure } from './runtime/pattern-match';
// W1-T4 slice 13: HoloValue resolution extracted to ./runtime/holo-value
import { resolveHoloValue } from './runtime/holo-value';
// W1-T4 slice 15: narrative executors extracted to ./runtime/narrative-executors
import {
  executeNarrative as executeNarrativePure,
  executeQuest as executeQuestPure,
  executeDialogue as executeDialoguePure,
  type NarrativeContext,
} from './runtime/narrative-executors';
// W1-T4 slice 16: system executors extracted to ./runtime/system-executors
import {
  executeSystem as executeSystemPure,
  executeCoreConfig as executeCoreConfigPure,
  executeVisualMetadata as executeVisualMetadataPure,
} from './runtime/system-executors';
// W1-T4 slice 20: graph executors extracted to ./runtime/graph-executors
import {
  executeFunction as executeFunctionPure,
  executeConnection as executeConnectionPure,
  executeGate as executeGatePure,
  executeStream as executeStreamPure,
  type GraphExecutorContext,
} from './runtime/graph-executors';
// W1-T4 slice 18: UI command executors extracted to ./runtime/ui-commands
import {
  executeShowCommand as executeShowCommandPure,
  executeHideCommand as executeHideCommandPure,
  executeCreateCommand as executeCreateCommandPure,
  executeAnimateCommand as executeAnimateCommandPure,
  executePulseCommand as executePulseCommandPure,
  executeMoveCommand as executeMoveCommandPure,
  executeDeleteCommand as executeDeleteCommandPure,
  type UICommandContext,
} from './runtime/ui-commands';
// W1-T4 slice 17 + 19: simple executors extracted to ./runtime/simple-executors
import {
  executeStateMachine as executeStateMachinePure,
  executeExpressionStatement as executeExpressionStatementPure,
  executeCall as executeCallPure,
  executeEnvironment as executeEnvironmentPure,
  executeHoloTemplate as executeHoloTemplatePure,
  executeFocus as executeFocusPure,
  executeStructure as executeStructurePure,
  executeAssignment as executeAssignmentPure,
  executeReturn as executeReturnPure,
  executeScale as executeScalePure,
  executeComposition as executeCompositionPure,
  type SimpleExecutorContext,
} from './runtime/simple-executors';
// W1-T4 slice 12: control flow execution extracted to ./runtime/control-flow
import {
  executeForLoop as executeForLoopPure,
  executeForEachLoop as executeForEachLoopPure,
  executeWhileLoop as executeWhileLoopPure,
  executeIfStatement as executeIfStatementPure,
  executeMatch as executeMatchPure,
  type ControlFlowContext,
} from './runtime/control-flow';
// Engine modules (moved from core in A.011 extraction)
import { TimeManager } from '@holoscript/engine/orbital';
import { ExpressionEvaluator } from './ReactiveState';
import { getSharedEventBus } from './events/EventBus';
import { StateSynchronizer } from '@holoscript/mesh';
import { AttentionEngine } from '@holoscript/engine/orbital';
import { telemetry } from './monitoring/telemetry';
// Namespace import avoids Vitest SSR named-export hoisting (__vite_ssr_import_N__.x is not a function).
import * as engineRuntime from '@holoscript/engine/runtime';
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
 * Runtime orb data â€” the shape of an orb stored in context.variables.
 * Used to avoid `as unknown` casts when reading dynamic orb state.
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
  private agentPool: engineRuntime.ObjectPool<HoloScriptAgentRuntime>;
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
    this.context = createEmptyContext();
    this.currentScope = { variables: this.context.variables };
    this.builtinFunctions = this.initBuiltins(customFunctions);

    // Initialize Agent Pool
    this.agentPool = new engineRuntime.ObjectPool<HoloScriptAgentRuntime>(
      () => new HoloScriptAgentRuntime(), // Preallocation mode (optional args)
      (agent) => agent.destroy(),
      50
    );

    // Register Edge Intelligence Providers
    engineRuntime.registerVoiceSynthesizer();
    engineRuntime.registerEmotionDetector();
    engineRuntime.registerSpeechRecognizer();

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
      const observerPos: SpatialPosition = selfNode?.position ?? [0, 0, 0];

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

      type AttentionObserver = any;
      type AttentionEntities = any;
      return AttentionEngine.getTopKEntities(
        observerPos as unknown as AttentionObserver,
        entities as unknown as AttentionEntities,
        topK
      );
    });

    // Register Trait Handlers
    // @ts-expect-error During migration
    this.traitHandlers.set('mitosis' as VRTraitName, mitosisHandler);
    // @ts-expect-error During migration
    this.traitHandlers.set('orbital' as VRTraitName, orbitalHandler);

    // Initialize Extension Registry
    this.extensionRegistry = new ExtensionRegistry(this);

    // Wire up state machine interpreter to this runtime's expression evaluator.
    // The interpreter itself is pure: it owns machine state + transition dispatch,
    // and delegates (a) onEntry/onExit code execution and (b) transition-guard
    // evaluation to executors we install here. Both are thin adapters over
    // evaluateExpression() so hook code and guard expressions resolve against the
    // same reactive state / variable bindings the rest of the runtime sees.
    //
    // NOTE: the interpreter is a module-level singleton (see engine/runtime/
    // StateMachineInterpreter.ts). If multiple runtimes exist in the same process
    // the last to initialize wins — acceptable today (we instantiate one runtime
    // per workspace), but follow-up if we ever need per-runtime isolation.
    engineRuntime.stateMachineInterpreter.setHookExecutor((code) => this.evaluateExpression(code));
    engineRuntime.stateMachineInterpreter.setGuardEvaluator((expr) => this.evaluateExpression(expr));
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
        this.createParticleEffect(`${target}_show`, [0, 0, 0], hologram.color, 15);
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

      const position = this.context.spatialMemory.get(target) || [0, 0, 0];
      this.createParticleEffect(`${target}_pulse`, position, color, 30);

      return { pulsing: target, duration };
    });

    builtins.set('animate', (args): HoloScriptValue => {
      const target = String(args[0]);
      const options = (args[1] as Record<string, HoloScriptValue>) || {};

      const animation: Animation = {
        target,
        property: String(options.property || 'position[1]'),
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
        const position = (args[1] as SpatialPosition) || [0, 0, 0];
        this.context.spatialMemory.set(target, position);
        this.createParticleEffect(`${target}_spawn`, position, '#00ff00', 25);
        return { spawned: target, at: position };
      }

      // Mitosis support for ({ template, id, position, ... })
      const spawnConfig = config as Record<string, unknown>;
      const templateName = String(spawnConfig.template);
      const id = String(spawnConfig.id || `${templateName}_${Date.now()}`);
      const position = (spawnConfig.position as SpatialPosition) || [0, 0, 0];

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
            spawnNode.properties[prop.key] = resolveHoloValue(prop.value as HoloValue);
          }
        }
      }
      for (const prop of holoTpl.properties) {
        if (spawnNode.properties[prop.key] === undefined) {
          spawnNode.properties[prop.key] = resolveHoloValue(prop.value as HoloValue);
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
        const pos = this.context.spatialMemory.get(target) || [0, 0, 0];
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
      const position = (args[1] as SpatialPosition) || [0, 0, 0];

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
        (arr as HoloScriptValue[]).push(args[1]);
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
    // W1-T4 slice 8: primitive handlers extracted to ./runtime/primitives
    // emit is threaded in as a fire-and-forget callback (matches pre-extraction)
    const emitFn = (event: string, data?: unknown): void => {
      void this.emit(event, data);
    };
    builtins.set('shop', (args) => handleShopPure(args, emitFn));
    builtins.set('inventory', (args) => handleInventoryPure(args, emitFn));
    builtins.set('purchase', (args) => handlePurchasePure(args, emitFn));
    builtins.set('presence', (args) => handlePresencePure(args, emitFn));
    builtins.set('invite', (args) => handleInvitePure(args, emitFn));
    builtins.set('share', (args) => handleSharePure(args, emitFn));
    builtins.set('physics', (args) => handlePhysicsPure(args, emitFn));
    builtins.set('gravity', (args) => handleGravityPure(args, emitFn));
    builtins.set('collide', (args) => handleCollidePure(args, emitFn));
    builtins.set('animate', (args) => handleAnimatePure(args, emitFn));
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
    // @ts-expect-error During migration
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
        // W1-T4 slice 15: narrative executors extracted — dispatched inline
        case 'narrative':
          result = await executeNarrativePure(node as NarrativeNode, this.buildNarrativeContext());
          break;
        case 'quest':
          result = await executeQuestPure(node as QuestNode, this.buildNarrativeContext());
          break;
        case 'dialogue':
          result = await executeDialoguePure(node as DialogueNode, this.buildNarrativeContext());
          break;
        case 'visual_metadata':
          result = await executeVisualMetadataPure(node as VisualMetadataNode);
          break;
        case 'method':
        case 'function':
          result = await executeFunctionPure(node as MethodNode, this.buildGraphExecutorContext());
          break;
        case 'connection':
          result = await executeConnectionPure(node as ConnectionNode, this.buildGraphExecutorContext());
          break;
        case 'gate':
          result = await executeGatePure(node as GateNode, this.buildGraphExecutorContext());
          break;
        case 'stream':
          result = await executeStreamPure(node as StreamNode, this.buildGraphExecutorContext());
          break;
        case 'call':
          result = await executeCallPure(
            node as ASTNode & { target?: string; args?: unknown[] },
            this.buildSimpleExecutorContext(),
          );
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
          result = await executeStructurePure(node);
          break;
        case 'assignment':
          result = await executeAssignmentPure(
            node as ASTNode & { name: string; value: unknown },
            this.buildSimpleExecutorContext(),
          );
          break;
        case 'return':
          result = await executeReturnPure(
            node as ASTNode & { value: unknown },
            this.buildSimpleExecutorContext(),
          );
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
          result = await executeExpressionStatementPure(
            node as ASTNode & { expression: string },
            this.buildSimpleExecutorContext(),
          );
          break;
        case 'scale':
          result = await executeScalePure(node as ScaleNode, this.buildSimpleExecutorContext());
          break;
        case 'focus':
          result = await executeFocusPure(node as FocusNode, this.buildSimpleExecutorContext());
          break;
        case 'environment':
          result = await executeEnvironmentPure(
            node as EnvironmentNode,
            this.buildSimpleExecutorContext(),
          );
          break;
        case 'composition':
        case 'Composition':
          if (node.type === 'Composition') {
            result = await this.executeHoloComposition(node as unknown as HoloComposition);
          } else {
            result = await executeCompositionPure(
              node as CompositionNode,
              this.buildSimpleExecutorContext(),
            );
          }
          break;
        case 'template':
        case 'Template':
          if (node.type === 'Template') {
            result = await executeHoloTemplatePure(
              node as unknown as { name: string } & Record<string, unknown>,
              this.buildSimpleExecutorContext(),
            );
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
          result = await executeStateMachinePure(
            node as StateMachineNode,
            this.buildSimpleExecutorContext(),
          );
          break;
        case 'system':
          result = await executeSystemPure(node as SystemNode);
          break;
        case 'core_config':
          result = await executeCoreConfigPure(
            node as CoreConfigNode,
            this.context.environment as Record<string, HoloScriptValue>,
          );
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
        // Wait, initBuiltins wraps it as: ((...spreadArgs: unknown[]) => fn(spreadArgs))
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
      this.createExecutionEffect(name, func.position || [0, 0, 0]);

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

    // @ts-expect-error
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

    let pos: [number, number, number] = [0, 0, 0];
    if (Array.isArray(node.position)) {
      pos = [
        Number(node.position[0]) || 0,
        Number(node.position[1]) || 0,
        Number(node.position[2]) || 0,
      ];
    } else if (node.position) {
      pos = [
        Number((node.position as any)[0]) || 0,
        Number((node.position as any)[1]) || 0,
        Number((node.position as any)[2]) || 0,
      ];
    }

    const adjustedPos: [number, number, number] = [
      pos[0] * scale,
      pos[1] * scale,
      pos[2] * scale,
    ];

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
      // @ts-expect-error During migration
      orbData.properties = {
        // @ts-expect-error During migration
        ...(orbData.properties as Record<string, HoloScriptValue>),
        ...evaluatedProperties,
      };
    } else {
      // @ts-expect-error During migration
      orbData.properties = evaluatedProperties;
    }

    // @ts-expect-error During migration
    orbData.directives = node.directives || [];
    // @ts-expect-error During migration
    orbData.position = adjustedPos;
    // @ts-expect-error During migration
    orbData.hologram = hologram;
    // @ts-expect-error During migration
    orbData._templateRef = node.template ? this.context.templates.get(node.template) : undefined;

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
      // @ts-expect-error During migration
      properties: Object.keys(orbData.properties as Record<string, unknown>),
      scale,
    });

    // Broadcast update
    this.broadcast(isUpdate ? 'orb_updated' : 'orb_created', {
      orb: {
        id: node.name,
        name: node.name,
        position: adjustedPos,
        // @ts-expect-error During migration
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

  // W1-T4 slice 20: executeFunction / executeConnection / executeGate /
  // executeStream extracted to ./runtime/graph-executors.

  /**
   * Execute State Machine declaration (Phase 13)
   */
  // W1-T4 slice 17: executeStateMachine / executeExpressionStatement /
  // executeCall extracted to ./runtime/simple-executors.

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

    this.createDataVisualization(target, data, node.position || [0, 0, 0]);

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

      // W1-T4 slice 18: UI commands extracted — dispatch inline
      const uiCtx = this.buildUICommandContext();
      switch (action) {
        case 'show':
          result = await executeShowCommandPure(target, genericNode, uiCtx);
          break;
        case 'hide':
          result = await executeHideCommandPure(target, genericNode, uiCtx);
          break;
        case 'create':
        case 'summon':
          result = await executeCreateCommandPure(tokens.slice(1), genericNode, uiCtx);
          break;
        case 'animate':
          result = await executeAnimateCommandPure(target, tokens.slice(2), genericNode, uiCtx);
          break;
        case 'pulse':
          result = await executePulseCommandPure(target, tokens.slice(2), genericNode, uiCtx);
          break;
        case 'move':
          result = await executeMoveCommandPure(target, tokens.slice(2), genericNode, uiCtx);
          break;
        case 'delete':
        case 'remove':
          result = await executeDeleteCommandPure(target, genericNode, uiCtx);
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

  // W1-T4 slice 18: show/hide/create/animate/pulse/move/delete commands
  // extracted to ./runtime/ui-commands. Methods deleted — dispatch is
  // inlined above using buildUICommandContext().

  // W1-T4 slice 19: executeStructure / executeAssignment / executeReturn
  // added to ./runtime/simple-executors.

  // ============================================================================
  // Condition Evaluation
  // ============================================================================

  /**
   * Thin wrapper over the extracted pure evaluator (W1-T4 slice 3,
   * see ./runtime/condition-evaluator). Callers pass the runtime's
   * `evaluateExpression` as the expression-resolution callback.
   */
  private evaluateCondition(condition: string | unknown): boolean {
    return evaluateConditionPure(condition, (expr) => this.evaluateExpression(expr));
  }

  // ============================================================================
  // Transformation
  // ============================================================================

  /**
   * Thin wrapper over the extracted pure transformation operations
   * (W1-T4 slice 5, see ./runtime/transformation). Threads
   * setVariable / evaluateCondition / evaluateExpression through
   * a context object so the pure module stays free of `this` binding.
   */
  private async applyTransformation(
    data: unknown,
    transform: TransformationNode,
  ): Promise<HoloScriptValue> {
    return applyTransformationPure(data, transform, {
      setVariable: (name, value) => this.setVariable(name, value as HoloScriptValue),
      evaluateCondition: (expr) => this.evaluateCondition(expr),
      evaluateExpression: (expr) => this.evaluateExpression(expr),
    });
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
    await getSharedEventBus().emit(event, data as HoloScriptValue);

    // Phase 13: State Machine transitions
    if (data && typeof data === 'object' && (data as Record<string, unknown>).id) {
      engineRuntime.stateMachineInterpreter.sendEvent((data as Record<string, unknown>).id as string, event);
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
              ...(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
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
   * Update all animations (W1-T4 slice 6: per-tick lerp extracted to
   * ./runtime/animation-system). Also ticks system variables — that
   * coupling lives in HSR because `updateSystemVariables` touches
   * too much runtime state to cleanly extract yet.
   */
  updateAnimations(): void {
    updateAnimationsPure(
      this.animations,
      (name, value) => this.setVariable(name, value as HoloScriptValue),
      Date.now(),
    );
    this.updateSystemVariables();
  }

  /**
   * Update real-life and system variables ($time, $user, etc.)
   */
  /**
   * Update real-life and system variables ($time, $user, etc.)
   * (W1-T4 slice 9: impl extracted to ./runtime/system-variables).
   * Threads setVariable/getVariable callbacks plus the already-read
   * brittney_api_keys JSON string so the pure module has no
   * hidden dependency on browser `localStorage`.
   */
  private updateSystemVariables(): void {
    const brittneyApiKeysJson =
      typeof localStorage !== 'undefined' ? localStorage.getItem('brittney_api_keys') : null;
    updateSystemVariablesPure({
      setVariable: (name, value) => this.setVariable(name, value as HoloScriptValue),
      getVariable: (name) => this.getVariable(name),
      brittneyApiKeysJson,
    });
  }

  // ==========================================================================
  // COMMERCE / SOCIAL / PHYSICS / ANIMATION PRIMITIVES
  // (W1-T4 slice 8: extracted to ./runtime/primitives, registered
  //  inline in initBuiltins via emit-injection — no wrappers needed)
  //
  // handleCalculateArc (below) stays — it's structured differently
  // from the emit-pattern primitives: it does real math via
  // calculateArc (slice 2), not an event dispatch.
  // ==========================================================================

  /**
   * Handle calculate_arc(start, end, speed)
   * W1-T4 slice 2: math extracted to ./runtime/physics-math.calculateArc
   */
  private handleCalculateArc(args: HoloScriptValue[]): HoloScriptValue {
    if (args.length < 3) return [0, 0, 0];
    const start = args[0] as SpatialPosition;
    const end = args[1] as SpatialPosition;
    const speed = args[2] as number;
    return calculateArc(start, end, speed);
  }

  // ============================================================================
  // Particle Effects (W1-T4 slice 4: impls extracted to ./runtime/particle-effects)
  //
  // Methods below are thin wrappers that thread `this.particleSystems`
  // (the Map) and the security limit into the pure implementations.
  // Call sites elsewhere in HSR remain unchanged.
  // ============================================================================

  private createParticleEffect(
    name: string,
    position: SpatialPosition,
    color: string,
    count: number,
  ): void {
    createParticleEffectPure(
      this.particleSystems,
      name,
      position,
      color,
      count,
      RUNTIME_SECURITY_LIMITS.maxParticlesPerSystem,
    );
  }

  private createConnectionStream(
    from: string,
    to: string,
    fromPos: SpatialPosition,
    toPos: SpatialPosition,
    dataType: string,
  ): void {
    createConnectionStreamPure(this.particleSystems, from, to, fromPos, toPos, dataType);
  }

  private createFlowingStream(name: string, position: SpatialPosition, data: unknown): void {
    createFlowingStreamPure(
      this.particleSystems,
      name,
      position,
      data,
      RUNTIME_SECURITY_LIMITS.maxParticlesPerSystem,
    );
  }

  private createExecutionEffect(name: string, position: SpatialPosition): void {
    createExecutionEffectPure(
      this.particleSystems,
      name,
      position,
      RUNTIME_SECURITY_LIMITS.maxParticlesPerSystem,
    );
  }

  private createDataVisualization(name: string, data: unknown, position: SpatialPosition): void {
    createDataVisualizationPure(
      this.particleSystems,
      name,
      data,
      position,
      RUNTIME_SECURITY_LIMITS.maxParticlesPerSystem,
    );
  }

  private getDataTypeColor(dataType: string): string {
    return getDataTypeColorPure(dataType);
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
                ? [orbData.position[0], orbData.position[1], orbData.position[2]]
                : orbData.position,
              properties: orbData.properties || {},
              hologram:
                orbData.hologram ||
                (() => {
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
            const data = readJson(message.toString()) as Record<string, unknown>;

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
   * (W1-T4 slice 7: impl extracted to ./runtime/visualizer-server)
   */
  private handleTimeControl(command: string, value?: unknown): void {
    handleTimeControlPure(this.timeManager, command, value);
  }

  /**
   * Broadcast a typed message to all connected WebSocket clients.
   * (W1-T4 slice 7: impl extracted to ./runtime/visualizer-server)
   */
  public broadcast(type: string, payload: unknown): void {
    broadcastPure(this.wss, type, payload);
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getParticleSystems(): Map<string, ParticleSystem> {
    return new Map(this.particleSystems);
  }

  /**
   * Advance all particle systems by deltaTime.
   * (W1-T4 slice 14: impl extracted to ./runtime/particle-effects)
   */
  updateParticles(deltaTime: number): void {
    updateParticlesPure(this.particleSystems, deltaTime);
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
    this.context = createEmptyContext();
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

  // W1-T4 slice 10: createEmptyContext extracted to ./runtime/context-factory
  // (was a private method here; now called directly as module function
  //  at the 2 internal call sites — no wrapper needed).

  // W1-T4 slice 21: executeScale added to ./runtime/simple-executors.

  // W1-T4 slice 17: executeFocus / executeEnvironment extracted to ./runtime/simple-executors.

  // W1-T4 slice 21: executeComposition added to ./runtime/simple-executors.

  // W1-T4 slice 13: resolveHoloValue extracted to ./runtime/holo-value
  // (pure recursive helper; private method deleted — 4 internal call
  //  sites now use the imported function directly).

  private async executeHoloComposition(node: HoloComposition): Promise<ExecutionResult> {
    // Register templates
    for (const template of node.templates) {
      await executeHoloTemplatePure(
        template as unknown as { name: string } & Record<string, unknown>,
        this.buildSimpleExecutorContext(),
      );
    }

    // Execute environment
    if (node.environment) {
      // Convert environment properties to record
      const envSettings: Record<string, HoloScriptValue> = {};
      for (const prop of node.environment.properties) {
        envSettings[prop.key] = resolveHoloValue(prop.value as HoloValue);
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

  // W1-T4 slice 17: executeHoloTemplate extracted to ./runtime/simple-executors.

  private async executeHoloObject(node: HoloObjectDecl): Promise<ExecutionResult> {
    // Convert HoloObjectDecl to OrbNode-like structure and execute logic
    const properties: Record<string, HoloScriptValue> = {};

    // Convert properties
    for (const prop of node.properties) {
      properties[prop.key] = resolveHoloValue(prop.value);
    }

    // Handle state
    if (node.state) {
      for (const prop of node.state.properties) {
        properties[prop.key] = resolveHoloValue(prop.value);
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
      // @ts-expect-error
      directives: [
        ...(node.directives || []),
        ...(node.traits || []).map((t) => ({ type: 'trait' as const, name: t.name, ...t.config })),
        ...(node.template ? this.context.templates.get(node.template)?.directives || [] : []), // Inherit template directives/traits
      ],
      traits: new Map((node.traits || []).map((t) => [t.name as VRTraitName, t.config])),
      children: (node.children as unknown as ASTNode[]) || [],
    };

    // Handle 'using' template
    if (node.template) {
      const tpl = this.context.templates.get(node.template) as unknown as HoloTemplate | undefined;
      if (tpl) {
        // Merge template state
        if (tpl.state) {
          for (const prop of tpl.state.properties) {
            if (properties[prop.key] === undefined) {
              properties[prop.key] = resolveHoloValue(prop.value);
            }
          }
        }
        // Merge template properties
        for (const prop of tpl.properties) {
          if (properties[prop.key] === undefined) {
            properties[prop.key] = resolveHoloValue(prop.value);
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
  @engineRuntime.MethodMemoize(500)
  private getMemberPath(expr: HoloExpression): string | null {
    if (expr.type === 'Identifier') return expr.name;
    if (expr.type === 'MemberExpression') {
      const parentPath = this.getMemberPath(expr.object);
      if (parentPath) return `${parentPath}.${expr.property}`;
    }
    return null;
  }

  // W1-T4 slice 16: executeSystem / setupNetworking / setupPhysics /
  // executeCoreConfig extracted to ./runtime/system-executors. Methods
  // deleted; dispatch calls the pure functions inline.

  // =========================================================================
  // Control Flow Execution (W1-T4 slice 12: impls extracted to
  // ./runtime/control-flow — wrappers below share a ControlFlowContext
  // that threads evaluateExpression / evaluateCondition / executeNode /
  // variables through a narrow boundary).
  // =========================================================================

  /** Construct a ControlFlowContext bound to this runtime's state. */
  private buildControlFlowContext(): ControlFlowContext {
    return {
      evaluateExpression: (expr) => this.evaluateExpression(expr),
      evaluateCondition: (expr) => this.evaluateCondition(expr),
      executeNode: (n) => this.executeNode(n),
      variables: this.context.variables,
    };
  }

  /** @for item in iterable { body } */
  private async executeForLoop(node: {
    variable: string;
    iterable: string | unknown;
    body: ASTNode[];
  }): Promise<ExecutionResult> {
    return executeForLoopPure(node, this.buildControlFlowContext());
  }

  /** @forEach item in collection { body } */
  private async executeForEachLoop(node: {
    variable: string;
    collection: string | unknown;
    body: ASTNode[];
  }): Promise<ExecutionResult> {
    return executeForEachLoopPure(node, this.buildControlFlowContext());
  }

  /** @while condition { body } (10k-iteration safety cap) */
  private async executeWhileLoop(node: {
    condition: string | unknown;
    body: ASTNode[];
  }): Promise<ExecutionResult> {
    return executeWhileLoopPure(node, this.buildControlFlowContext());
  }

  /** @if condition { body } @else { elseBody } */
  private async executeIfStatement(node: {
    condition: string | unknown;
    body: ASTNode[];
    elseBody?: ASTNode[];
  }): Promise<ExecutionResult> {
    return executeIfStatementPure(node, this.buildControlFlowContext());
  }

  /** @match subject { pattern => result, ... } */
  private async executeMatch(node: {
    subject: string | unknown;
    cases: Array<{
      pattern: string | unknown;
      guard?: string | unknown;
      body: ASTNode[] | unknown;
    }>;
  }): Promise<ExecutionResult> {
    return executeMatchPure(node, this.buildControlFlowContext());
  }

  // W1-T4 slice 11: patternMatches extracted to ./runtime/pattern-match
  // (pure helper; deleted method — only caller is executeMatch above,
  //  now using patternMatchesPure directly).

  // W1-T4 slice 15: executeNarrative / executeQuest / executeDialogue
  // extracted to ./runtime/narrative-executors. Methods deleted —
  // dispatch calls the pure functions directly with a shared context.

  /** Construct a GraphExecutorContext bound to this runtime. (Slice 20) */
  private buildGraphExecutorContext(): GraphExecutorContext {
    return {
      functions: this.context.functions as Map<string, MethodNode>,
      connections: this.context.connections as ConnectionNode[],
      hologramState: this.context.hologramState,
      spatialMemory: this.context.spatialMemory,
      on: (event, handler) => this.on(event, handler),
      emit: (event, data) => {
        void this.emit(event, data);
      },
      getVariable: (name) => this.getVariable(name),
      setVariable: (name, value) => this.setVariable(name, value as HoloScriptValue),
      createConnectionStream: (from, to, fromPos, toPos, dataType) =>
        this.createConnectionStream(from, to, fromPos, toPos, dataType),
      createFlowingStream: (name, position, data) =>
        this.createFlowingStream(name, position, data),
      getDataTypeColor: (dataType) => this.getDataTypeColor(dataType),
      evaluateCondition: (expr) => this.evaluateCondition(expr),
      executeProgram: (nodes, depth) => this.executeProgram(nodes, depth),
      callStackDepth: () => this.callStack.length,
      applyTransformation: (data, transform) => this.applyTransformation(data, transform),
    };
  }

  /** Construct a UICommandContext bound to this runtime. (Slice 18) */
  private buildUICommandContext(): UICommandContext {
    return {
      spatialMemory: this.context.spatialMemory,
      animations: this.animations,
      createParticleEffect: (name, position, color, count) =>
        this.createParticleEffect(name, position, color, count),
      createConnectionStream: (from, to, fromPos, toPos, dataType) =>
        this.createConnectionStream(from, to, fromPos, toPos, dataType),
    };
  }

  /** Construct a SimpleExecutorContext bound to this runtime. (Slice 17) */
  private buildSimpleExecutorContext(): SimpleExecutorContext {
    return {
      stateMachines: this.context.stateMachines as Map<string, StateMachineNode>,
      templates: this.context.templates as unknown as Map<string, unknown>,
      getEnvironment: () => this.context.environment as Record<string, unknown>,
      setEnvironment: (env) => {
        this.context.environment = env as Record<string, HoloScriptValue>;
      },
      focusHistory: this.context.focusHistory,
      executionStackDepth: () => this.context.executionStack.length,
      evaluateExpression: (expr) => this.evaluateExpression(expr),
      callFunction: (name, args) => this.callFunction(name, args),
      executeProgram: (nodes, depth) => this.executeProgram(nodes, depth),
      setVariable: (name, value) => this.setVariable(name, value),
      setScale: (multiplier, magnitude) => {
        this.context.currentScale = multiplier;
        this.context.scaleMagnitude = magnitude;
      },
      getScale: () => ({
        multiplier: this.context.currentScale,
        magnitude: this.context.scaleMagnitude,
      }),
      emit: (event, data) => {
        void this.emit(event, data);
      },
    };
  }

  /** Construct a NarrativeContext bound to this runtime's quest/dialogue state. */
  private buildNarrativeContext(): NarrativeContext {
    return {
      quests: this.context.quests as Map<string, QuestNode>,
      setActiveQuestId: (id) => {
        this.context.activeQuestId = id;
      },
      setDialogueState: (state) => {
        this.context.dialogueState = state;
      },
    };
  }

  // W1-T4 slice 16: executeVisualMetadata / setupNetworking / setupPhysics
  // extracted to ./runtime/system-executors.

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
        logger.error(`Migration parse errors for ${orb.name}:`, {
          errors: result.errors as unknown,
        });
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

    const result = await executeFunctionPure(target, this.buildGraphExecutorContext());
    this.createExecutionEffect(node.target, target.position || [0, 0, 0]);

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
    // Mesh resolves ProceduralSkill from package entry; cast avoids src/dist duplicate identity.
    StateSynchronizer.getInstance().broadcastSkill(skill as never);
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
      StateSynchronizer.getInstance().broadcastSkill(skill as never);

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
          // Only set state defaults â€” never overwrite runtime-modified values
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
  setOrbPosition(orbName: string, position: [number, number, number]): void {
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
                          const p = posPayload.position as
                            [number, number, number] | [number, number, number];
                          const tuple: [number, number, number] = Array.isArray(p)
                            ? p
                            : [p[0], p[1], p[2]];
                          this.setOrbPosition(name, tuple);
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
