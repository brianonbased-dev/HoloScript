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
// W1-T4 slice 30: HoloStatement executor extracted to ./runtime/holo-statement-executor
import {
  executeHoloProgram as executeHoloProgramPure,
  executeHoloStatement as executeHoloStatementPure,
  type HoloStatementContext,
} from './runtime/holo-statement-executor';
// W1-T4 slice 31: debug executor extracted to ./runtime/debug-executor
import {
  executeDebug as executeDebugPure,
  type DebugExecutorContext,
} from './runtime/debug-executor';
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
// W1-T4 slice 24: HoloComposition executor extracted to ./runtime/holo-composition-executor
import {
  executeHoloComposition as executeHoloCompositionPure,
  type HoloCompositionContext,
} from './runtime/holo-composition-executor';
// W1-T4 slice 25: HoloObject executor extracted to ./runtime/holo-object-executor
import {
  executeHoloObject as executeHoloObjectPure,
  type HoloObjectContext,
} from './runtime/holo-object-executor';
// W1-T4 slice 26: Orb executor extracted to ./runtime/orb-executor
import {
  executeOrb as executeOrbPure,
  type OrbExecutorContext,
} from './runtime/orb-executor';
// W1-T4 slice 27: skills + directives extracted to ./runtime/skills-directives
import {
  loadSkill as loadSkillPure,
  isAgent as isAgentPure,
  applyDirectives as applyDirectivesPure,
  updateTraits as updateTraitsPure,
} from './runtime/skills-directives';
// W1-T4 slice 28: builtins registry extracted to ./runtime/builtins-registry
import {
  createBuiltinsMap,
  type BuiltinsContext,
  type BuiltinFn,
} from './runtime/builtins-registry';
// W1-T4 slice 29: event system extracted to ./runtime/event-system
import {
  onEvent as onEventPure,
  offEvent as offEventPure,
  emit as emitPure,
  triggerUIEvent as triggerUIEventPure,
  type EventSystemContext,
} from './runtime/event-system';
// W1-T4 slice 22: info executors extracted to ./runtime/info-executors
import {
  executeVisualize as executeVisualizePure,
  executeUIElement as executeUIElementPure,
  type InfoExecutorContext,
} from './runtime/info-executors';
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
// W1-T4 slice: HoloExpression AST evaluator + getMemberPath extracted to
// ./runtime/holo-expression. Memoization of getMemberPath (max 500,
// FIFO) is preserved by a module-level cache inside the pure module.
import {
  evaluateHoloExpression as evaluateHoloExpressionPure,
  type HoloExpressionContext,
} from './runtime/holo-expression';
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
  /** Construct a BuiltinsContext bound to this runtime. (Slice 28) */
  private buildBuiltinsContext(): BuiltinsContext {
    return {
      uiElements: this.uiElements,
      hologramState: this.context.hologramState,
      spatialMemory: this.context.spatialMemory,
      animations: this.animations,
      variables: this.context.variables,
      templates: this.context.templates as unknown as Map<string, TemplateNode>,
      executionStack: this.context.executionStack,
      agentRuntimes: this.agentRuntimes,
      createParticleEffect: (name, position, color, count) =>
        this.createParticleEffect(name, position, color, count),
      createConnectionStream: (from, to, fromPos, toPos, dataType) =>
        this.createConnectionStream(from, to, fromPos, toPos, dataType),
      emit: (event, data) => this.emit(event, data),
      setVariable: (name, value) => this.setVariable(name, value),
      getVariable: (name) => this.getVariable(name),
      executeOrb: (orbNode) => executeOrbPure(orbNode, this.buildOrbExecutorContext()),
      calculateArc: (args) => this.handleCalculateArc(args),
    };
  }

  /**
   * Initialize built-in functions (W1-T4 slice 28: impl extracted to
   * ./runtime/builtins-registry). Thin wrapper that constructs the
   * context bag + delegates to createBuiltinsMap.
   */
  private initBuiltins(
    customFunctions?: Record<string, BuiltinFn>,
  ): Map<string, BuiltinFn> {
    return createBuiltinsMap(this.buildBuiltinsContext(), customFunctions);
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
          result = await executeOrbPure(node as OrbNode, this.buildOrbExecutorContext());
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
          result = await executeVisualizePure(node, this.buildInfoExecutorContext());
          break;
        case '2d-element':
          result = await executeUIElementPure(node as unknown as UI2DNode, this.buildInfoExecutorContext());
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
            result = await executeHoloCompositionPure(
              node as unknown as HoloComposition,
              this.buildHoloCompositionContext(),
            );
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

  // W1-T4 slice 26: executeOrb extracted to ./runtime/orb-executor.
  // Closes board task task_1776940471985_57z8.

  // W1-T4 slice 20: executeFunction / executeConnection / executeGate /
  // executeStream extracted to ./runtime/graph-executors.

  /**
   * Execute State Machine declaration (Phase 13)
   */
  // W1-T4 slice 17: executeStateMachine / executeExpressionStatement /
  // executeCall extracted to ./runtime/simple-executors.

  // W1-T4 slice 31: executeDebug extracted to ./runtime/debug-executor.
  // Thin wrapper binds runtime state-map references + logger into a
  // DebugExecutorContext and forwards to the pure executor.
  private async executeDebug(node: ASTNode & { target?: string }): Promise<ExecutionResult> {
    return executeDebugPure(node, this.buildDebugExecutorContext());
  }

  private buildDebugExecutorContext(): DebugExecutorContext {
    return {
      scopeVariables: this.currentScope.variables,
      contextVariables: this.context.variables,
      functions: this.context.functions,
      connections: this.context.connections,
      callStack: this.callStack,
      uiElements: this.uiElements,
      animations: this.animations,
      executionHistory: this.executionHistory,
      setHologramState: (key, hologram) => {
        this.context.hologramState.set(key, hologram);
      },
      logInfo: (message, payload) => {
        logger.info(message, payload);
      },
    };
  }

  // W1-T4 slice 22: executeVisualize / executeUIElement extracted to ./runtime/info-executors.

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

  /** Construct an EventSystemContext bound to this runtime. (Slice 29) */
  private buildEventSystemContext(): EventSystemContext {
    return {
      eventHandlers: this.eventHandlers,
      agentRuntimes: this.agentRuntimes,
      variables: this.context.variables,
      traitHandlers: this.traitHandlers,
      uiElements: this.uiElements,
      getCurrentScale: () => this.context.currentScale,
      globalBusEmit: (event, data) => getSharedEventBus().emit(event, data),
      sendStateMachineEvent: (id, event) =>
        engineRuntime.stateMachineInterpreter.sendEvent(id, event),
    };
  }

  /**
   * Register event handler.
   * (W1-T4 slice 29: impl extracted to ./runtime/event-system.)
   */
  on(event: string, handler: EventHandler): void {
    onEventPure(event, handler, this.buildEventSystemContext());
  }

  /**
   * Register host function. Stays in HSR — direct builtinFunctions
   * write, not part of the event-system concern.
   */
  registerFunction(name: string, handler: (args: HoloScriptValue[]) => HoloScriptValue): void {
    this.builtinFunctions.set(name, handler);
    logger.info(`Host function registered: ${name}`);
  }

  /**
   * Remove event handler.
   * (W1-T4 slice 29: impl extracted to ./runtime/event-system.)
   */
  off(event: string, handler?: EventHandler): void {
    offEventPure(event, handler, this.buildEventSystemContext());
  }

  /**
   * Emit event through the full 5-stage dispatch.
   * (W1-T4 slice 29: impl extracted to ./runtime/event-system.)
   */
  async emit(event: string, data?: unknown): Promise<void> {
    return emitPure(event, data, this.buildEventSystemContext());
  }

  /**
   * Trigger UI event — update element.value + fire dotted event.
   * (W1-T4 slice 29: impl extracted to ./runtime/event-system.)
   */
  async triggerUIEvent(elementName: string, eventType: string, data?: unknown): Promise<void> {
    return triggerUIEventPure(elementName, eventType, data, this.buildEventSystemContext());
  }

  // W1-T4 slice 29: forwardToTraits extracted to ./runtime/event-system
  // (private in HSR, now a module function; no wrapper needed — the only
  //  former caller is emit, which now calls the extracted forwardToTraits directly).

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

  // W1-T4 slice 24: executeHoloComposition extracted to ./runtime/holo-composition-executor.

  // W1-T4 slice 17: executeHoloTemplate extracted to ./runtime/simple-executors.

  // W1-T4 slice 25: executeHoloObject extracted to ./runtime/holo-object-executor.
  // Closes board task task_1776940617322_ee53.

  /**
   * Execute a block of HoloStatements (HoloNode AST)
   */
  // W1-T4 slice 30: executeHoloProgram + executeHoloStatement extracted
  // to ./runtime/holo-statement-executor. Thin wrappers bind this
  // runtime's getVariable/setVariable/emit/evaluateHoloExpression +
  // telemetry into a HoloStatementContext and forward to the pure
  // recursive executor.
  async executeHoloProgram(
    statements: HoloStatement[],
    scopeOverride?: Scope
  ): Promise<ExecutionResult[]> {
    return executeHoloProgramPure(statements, scopeOverride, this.buildHoloStatementContext());
  }

  private async executeHoloStatement(
    stmt: HoloStatement,
    scopeOverride?: Scope
  ): Promise<ExecutionResult> {
    return executeHoloStatementPure(stmt, scopeOverride, this.buildHoloStatementContext());
  }

  private buildHoloStatementContext(): HoloStatementContext {
    return {
      currentScope: this.currentScope,
      getVariable: (name, scope) => this.getVariable(name, scope),
      setVariable: (name, value, scope) => {
        this.setVariable(name, value, scope);
      },
      emit: (event, data) => {
        void this.emit(event, data);
      },
      evaluateHoloExpression: (expr, scopeOverride) =>
        this.evaluateHoloExpression(expr as HoloExpression, scopeOverride),
      telemetry: {
        setGauge: (name, value) => {
          telemetry.setGauge(name, value);
        },
        incrementCounter: (name, value, labels) => {
          telemetry.incrementCounter(name, value, labels);
        },
        measureLatency: (name, fn) => telemetry.measureLatency(name, fn),
        executionDepth: () => this.context.executionStack.length,
      },
    };
  }

  // W1-T4 slice: evaluateHoloExpression + getMemberPath extracted to
  // ./runtime/holo-expression. Thin wrapper binds this runtime's
  // getVariable/setVariable/callFunction into a HoloExpressionContext
  // and forwards to the pure recursive evaluator. Memoization (max 500,
  // FIFO) is preserved via a module-level cache in the pure module.
  private evaluateHoloExpression(
    expr: HoloExpression,
    scopeOverride?: Scope
  ): Promise<HoloScriptValue> {
    return evaluateHoloExpressionPure(expr, scopeOverride, this.buildHoloExpressionContext());
  }

  private buildHoloExpressionContext(): HoloExpressionContext {
    return {
      getVariable: (name, scope) => this.getVariable(name, scope),
      setVariable: (name, value, scope) => this.setVariable(name, value, scope),
      callFunction: (name, args) => this.callFunction(name, args),
    };
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

  /** Construct an OrbExecutorContext bound to this runtime. (Slice 26) */
  private buildOrbExecutorContext(): OrbExecutorContext {
    return {
      getCurrentScale: () => this.context.currentScale,
      getVariable: (name) => this.getVariable(name),
      setVariable: (name, value) => this.setVariable(name, value),
      setSpatialPosition: (name, pos) => {
        this.context.spatialMemory.set(name, pos);
      },
      evaluateExpression: (expr) => this.evaluateExpression(expr),
      getTemplate: (name) => this.context.templates.get(name) as unknown as TemplateNode | undefined,
      setHologramState: (name, hologram) => {
        this.context.hologramState.set(name, hologram);
      },
      executeMigrationBlock: (existingOrb, migration) =>
        this.executeMigrationBlock(existingOrb, migration),
      getBuiltinFunction: (name) => this.builtinFunctions.get(name),
      applyDirectives: (node) => this.applyDirectives(node),
      isAgent: (node) => this.isAgent(node),
      getAgentRuntime: (name) => this.agentRuntimes.get(name),
      setAgentRuntime: (name, runtime) => {
        this.agentRuntimes.set(name, runtime);
      },
      acquireAgentRuntime: () => this.agentPool.acquire(),
      parentRuntime: this,
      createParticleEffect: (name, position, color, count) =>
        this.createParticleEffect(name, position, color, count),
      broadcast: (event, payload) => this.broadcast(event, payload),
    };
  }

  /** Construct a HoloObjectContext bound to this runtime. (Slice 25) */
  private buildHoloObjectContext(): HoloObjectContext {
    return {
      getTemplate: (name) => this.context.templates.get(name) as unknown as HoloTemplate | undefined,
      executeOrb: (orbNode) => executeOrbPure(orbNode, this.buildOrbExecutorContext()),
    };
  }

  /** Construct a HoloCompositionContext bound to this runtime. (Slice 24) */
  private buildHoloCompositionContext(): HoloCompositionContext {
    return {
      simpleExecutorContext: this.buildSimpleExecutorContext(),
      executeHoloObject: (node) => executeHoloObjectPure(node, this.buildHoloObjectContext()),
      getEnvironment: () => this.context.environment as Record<string, HoloScriptValue>,
      setEnvironment: (env) => {
        this.context.environment = env;
      },
    };
  }

  /** Construct an InfoExecutorContext bound to this runtime. (Slice 22) */
  private buildInfoExecutorContext(): InfoExecutorContext {
    return {
      getVariable: (name) => this.getVariable(name),
      createDataVisualization: (name, data, position) =>
        this.createDataVisualization(name, data, position),
      uiElements: this.uiElements,
      on: (event, handler) => this.on(event, handler),
      callFunction: (name) => this.callFunction(name),
    };
  }

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

  /**
   * Load a procedural skill (W1-T4 slice 27: impl extracted to
   * ./runtime/skills-directives). Kept as public wrapper so external
   * callers still hit HSR's API surface.
   */
  public loadSkill(skill: ProceduralSkill): void {
    loadSkillPure(skill, {
      proceduralSkills: this.proceduralSkills,
      broadcastSkill: (s) => StateSynchronizer.getInstance().broadcastSkill(s as never),
    });
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

  /**
   * Walk orb directives applying trait / state / lifecycle handlers.
   * (W1-T4 slice 27: impl extracted to ./runtime/skills-directives.)
   */
  private applyDirectives(node: ASTNode): void {
    applyDirectivesPure(node, {
      traitHandlers: this.traitHandlers,
      emit: (event, payload) => {
        void this.emit(event, payload);
      },
      getCurrentScale: () => this.context.currentScale,
      state: this.context.state,
      evaluateExpression: (expr) => this.evaluateExpression(expr),
    });
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

  /**
   * Predicate: is this orb an agent? (W1-T4 slice 27: extracted.)
   */
  private isAgent(node: OrbNode): boolean {
    return isAgentPure(node);
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
   * Per-frame trait update — dispatches onUpdate on all active
   * orbs (W1-T4 slice 27: impl extracted to ./runtime/skills-directives).
   */
  private updateTraits(julianDate: number): void {
    updateTraitsPure(julianDate, {
      variables: this.context.variables,
      traitHandlers: this.traitHandlers,
      emit: (event, payload) => this.emit(event, payload),
      getCurrentScale: () => this.context.currentScale,
      setOrbPosition: (name, position) => this.setOrbPosition(name, position),
      getState: () => this.getState(),
      setState: (updates) => this.context.state.update(updates),
    });
  }
}
