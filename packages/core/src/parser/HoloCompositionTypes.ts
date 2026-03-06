/**
 * .holo Composition AST Types
 *
 * Type definitions for the declarative .holo format.
 * This is a scene-centric language designed for AI agents and visual tools.
 *
 * @version 1.0.0
 */

// =============================================================================
// SOURCE LOCATION
// =============================================================================

export interface SourceLocation {
  line: number;
  column: number;
  offset?: number;
}

export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

// =============================================================================
// PLATFORM CONSTRAINT (conditional compilation decorator)
// =============================================================================

/**
 * Platform constraint parsed from `@platform(...)` decorators.
 *
 * Syntax forms:
 * ```holoscript
 * @platform(quest3)                 → include: ['quest3'], exclude: []
 * @platform(phone, desktop)         → include: ['phone', 'desktop'], exclude: []
 * @platform(not: car, wearable)     → include: [], exclude: ['car', 'wearable']
 * ```
 */
export interface PlatformConstraint {
  /** Target platforms this block applies to (empty = all) */
  include: string[];
  /** Platforms to exclude */
  exclude: string[];
}

// =============================================================================
// BASE NODE
// =============================================================================

export interface HoloNode {
  type: string;
  loc?: SourceRange;
}

// =============================================================================
// VALUE TYPES
// =============================================================================

export type HoloValue = string | number | boolean | null | HoloValue[] | HoloObject | HoloBindValue;

export interface HoloBindValue {
  __bind: true;
  source: string; // e.g., "state.score"
  transform?: string; // optional transform function name
}

export interface HoloObject {
  [key: string]: HoloValue;
}

export interface HoloPosition {
  x: number;
  y: number;
  z: number;
}

// =============================================================================
// COMPOSITION (ROOT NODE)
// =============================================================================

export interface HoloComposition extends HoloNode {
  type: 'Composition';
  name: string;
  environment?: HoloEnvironment;
  state?: HoloState;
  templates: HoloTemplate[];
  objects: HoloObjectDecl[];
  spatialGroups: HoloSpatialGroup[];
  lights: HoloLight[];
  effects?: HoloEffects;
  camera?: HoloCamera;
  logic?: HoloLogic;
  imports: HoloImport[];
  timelines: HoloTimeline[];
  audio: HoloAudio[];
  zones: HoloZone[];
  ui?: HoloUI;
  transitions: HoloTransition[];
  conditionals: HoloConditionalBlock[];
  iterators: HoloForEachBlock[];
  // Brittney AI Features
  npcs: HoloNPC[];
  quests: HoloQuest[];
  abilities: HoloAbility[];
  dialogues: HoloDialogue[];
  stateMachines: HoloStateMachine[];
  achievements: HoloAchievement[];
  talentTrees: HoloTalentTree[];
  shapes: HoloShape[];
  /** User-defined trait definitions (trait Name [extends Base] { ... }) */
  traitDefinitions?: HoloTraitDefinition[];
  // Spatial primitives (v4 — March 2026)
  spawnGroups?: HoloSpawnGroup[];
  waypointSets?: HoloWaypoints[];
  constraints?: HoloConstraintBlock[];
  terrains?: HoloTerrainBlock[];
  // Domain-specific blocks (v4.1 — March 2026)
  domainBlocks?: HoloDomainBlock[];
  // Norm lifecycle blocks (v4.5 — March 2026, CRSEC model)
  norms?: HoloNormBlock[];
  metanorms?: HoloMetanorm[];
}

// =============================================================================
// ENVIRONMENT
// =============================================================================

export interface HoloEnvironment extends HoloNode {
  type: 'Environment';
  properties: HoloEnvironmentProperty[];
}

export interface HoloEnvironmentProperty extends HoloNode {
  type: 'EnvironmentProperty';
  key: string;
  value: HoloValue | HoloParticleSystem | HoloLighting;
}

export interface HoloParticleSystem extends HoloNode {
  type: 'ParticleSystem';
  name: string;
  properties: Record<string, HoloValue>;
}

export interface HoloLighting extends HoloNode {
  type: 'Lighting';
  properties: Record<string, HoloValue>;
}

// =============================================================================
// LIGHT (first-class light block)
// =============================================================================

export interface HoloLight extends HoloNode {
  type: 'Light';
  name: string;
  lightType: 'directional' | 'point' | 'spot' | 'hemisphere' | 'ambient' | 'area';
  properties: HoloLightProperty[];
  /** @platform() conditional compilation constraint */
  platformConstraint?: PlatformConstraint;
}

export interface HoloLightProperty extends HoloNode {
  type: 'LightProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// EFFECTS (post-processing block)
// =============================================================================

export interface HoloEffects extends HoloNode {
  type: 'Effects';
  effects: HoloEffect[];
}

export interface HoloEffect extends HoloNode {
  type: 'Effect';
  effectType: string; // bloom, ssao, vignette, dof, etc.
  properties: Record<string, HoloValue>;
}

// =============================================================================
// CAMERA
// =============================================================================

export interface HoloCamera extends HoloNode {
  type: 'Camera';
  cameraType: 'perspective' | 'orthographic' | 'cinematic';
  properties: HoloCameraProperty[];
}

export interface HoloCameraProperty extends HoloNode {
  type: 'CameraProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// TIMELINE (sequenced animation choreography)
// =============================================================================

export interface HoloTimeline extends HoloNode {
  type: 'Timeline';
  name: string;
  autoplay?: boolean;
  loop?: boolean;
  entries: HoloTimelineEntry[];
}

export interface HoloTimelineEntry extends HoloNode {
  type: 'TimelineEntry';
  time: number;
  action: HoloTimelineAction;
}

export type HoloTimelineAction =
  | { kind: 'animate'; target: string; properties: Record<string, HoloValue> }
  | { kind: 'emit'; event: string; data?: HoloValue }
  | { kind: 'call'; method: string; args?: HoloValue[] };

// =============================================================================
// AUDIO (first-class spatial/global audio)
// =============================================================================

export interface HoloAudio extends HoloNode {
  type: 'Audio';
  name: string;
  properties: HoloAudioProperty[];
}

export interface HoloAudioProperty extends HoloNode {
  type: 'AudioProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// ZONE (interaction/trigger volumes)
// =============================================================================

export interface HoloZone extends HoloNode {
  type: 'Zone';
  name: string;
  properties: HoloZoneProperty[];
  handlers: HoloEventHandler[];
}

export interface HoloZoneProperty extends HoloNode {
  type: 'ZoneProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// UI (HUD/overlay layer)
// =============================================================================

export interface HoloUI extends HoloNode {
  type: 'UI';
  elements: HoloUIElement[];
}

export interface HoloUIElement extends HoloNode {
  type: 'UIElement';
  name: string;
  properties: HoloUIProperty[];
}

export interface HoloUIProperty extends HoloNode {
  type: 'UIProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// TRANSITION (scene-to-scene navigation effects)
// =============================================================================

export interface HoloTransition extends HoloNode {
  type: 'Transition';
  name: string;
  properties: HoloTransitionProperty[];
}

export interface HoloTransitionProperty extends HoloNode {
  type: 'TransitionProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// CONDITIONAL BLOCK (scene-level if/else wrapping objects)
// =============================================================================

export interface HoloConditionalBlock extends HoloNode {
  type: 'ConditionalBlock';
  condition: string;
  objects: HoloObjectDecl[];
  spatialGroups?: HoloSpatialGroup[];
  elseObjects?: HoloObjectDecl[];
  elseSpatialGroups?: HoloSpatialGroup[];
}

// =============================================================================
// FOR-EACH BLOCK (scene-level iteration)
// =============================================================================

export interface HoloForEachBlock extends HoloNode {
  type: 'ForEachBlock';
  variable: string;
  iterable: string;
  objects: HoloObjectDecl[];
  spatialGroups?: HoloSpatialGroup[];
}

// =============================================================================
// STATE
// =============================================================================

export interface HoloState extends HoloNode {
  type: 'State';
  properties: HoloStateProperty[];
}

export interface HoloStateProperty extends HoloNode {
  type: 'StateProperty';
  key: string;
  value: HoloValue;
  reactive?: boolean;
}

// =============================================================================
// TEMPLATE
// =============================================================================

export interface HoloTemplate extends HoloNode {
  type: 'Template';
  name: string;
  version?: number;
  migrations?: HoloMigration[];
  properties: HoloTemplateProperty[];
  state?: HoloState;
  actions: HoloAction[];
  traits: HoloObjectTrait[];
  directives?: any[]; // For lifecycle hooks, etc.
  /** @platform() conditional compilation constraint */
  platformConstraint?: PlatformConstraint;
}

export interface HoloMigration extends HoloNode {
  type: 'Migration';
  fromVersion: number;
  body: any; // Statement list or raw code string
}

export interface HoloTemplateProperty extends HoloNode {
  type: 'TemplateProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// OBJECT
// =============================================================================

export interface HoloObjectDecl extends HoloNode {
  type: 'Object';
  name: string;
  __holo_id?: string; // Stable identity for hot-reload reference preservation
  template?: string; // "using" clause
  properties: HoloObjectProperty[];
  state?: HoloState;
  traits: HoloObjectTrait[];
  directives?: any[]; // for compatibility with newer runtime
  children?: HoloObjectDecl[];
  subOrbs?: HoloSubOrb[];
  /** @platform() conditional compilation constraint */
  platformConstraint?: PlatformConstraint;
}

export interface HoloSubOrb extends HoloNode {
  type: 'SubOrb';
  name: string;
  source: string;
  properties: HoloObjectProperty[];
}

export interface HoloObjectTrait extends HoloNode {
  type: 'ObjectTrait';
  name: string;
  config: Record<string, HoloValue>;
}

// =============================================================================
// TRAIT DEFINITION (first-class trait block with optional inheritance)
// =============================================================================

/**
 * A user-defined trait declaration in HoloScript.
 *
 * Grammar (tree-sitter-holoscript grammar.js line 214-222):
 * ```
 * trait Clickable extends Interactable {
 *   cursor: "pointer"
 *   highlight: true
 * }
 * ```
 *
 * When `extends` is present, the trait inherits all properties, event handlers,
 * and actions from the parent trait. Child properties override parent properties
 * with the same key.
 */
export interface HoloTraitDefinition extends HoloNode {
  type: 'TraitDefinition';
  /** Name of the trait being defined */
  name: string;
  /** Parent trait name (from `extends` clause), or undefined if no inheritance */
  base?: string;
  /** Properties declared directly in this trait (not including inherited) */
  properties: HoloTraitProperty[];
  /** Event handlers declared in this trait */
  eventHandlers?: HoloEventHandler[];
  /** Actions declared in this trait */
  actions?: HoloAction[];
}

export interface HoloTraitProperty extends HoloNode {
  type: 'TraitProperty';
  key: string;
  value: HoloValue;
}

export interface HoloObjectProperty extends HoloNode {
  type: 'ObjectProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// SHAPE (custom geometry/mesh block)
// =============================================================================

export interface HoloShape extends HoloNode {
  type: 'Shape';
  name: string;
  shapeType: string; // box, sphere, cylinder, mesh, model, splat, nerf
  properties: HoloShapeProperty[];
}

export interface HoloShapeProperty extends HoloNode {
  type: 'ShapeProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// SPATIAL GROUP
// =============================================================================

export interface HoloSpatialGroup extends HoloNode {
  type: 'SpatialGroup';
  name: string;
  properties: HoloGroupProperty[];
  objects: HoloObjectDecl[];
  groups?: HoloSpatialGroup[]; // nested groups
  body?: HoloStatement[]; // logic statements inside the group
  /** @platform() conditional compilation constraint */
  platformConstraint?: PlatformConstraint;
}

export interface HoloGroupProperty extends HoloNode {
  type: 'GroupProperty';
  key: string;
  value: HoloValue;
}

// =============================================================================
// LOGIC
// =============================================================================

export interface HoloLogic extends HoloNode {
  type: 'Logic';
  handlers: HoloEventHandler[];
  actions: HoloAction[];
}

export interface HoloEventHandler extends HoloNode {
  type: 'EventHandler';
  event: string; // e.g., "on_enter", "on_player_attack"
  parameters: HoloParameter[];
  body: HoloStatement[];
}

export interface HoloAction extends HoloNode {
  type: 'Action';
  name: string;
  parameters: HoloParameter[];
  body: HoloStatement[];
  async?: boolean;
}

export interface HoloParameter extends HoloNode {
  type: 'Parameter';
  name: string;
  paramType?: string; // optional type annotation
  defaultValue?: HoloValue;
}

// =============================================================================
// STATEMENTS
// =============================================================================

export type HoloStatement =
  | HoloAssignment
  | HoloMethodCall
  | HoloIfStatement
  | HoloForStatement
  | HoloWhileStatement
  | HoloClassicForStatement
  | HoloVariableDeclaration
  | HoloAwaitStatement
  | HoloReturnStatement
  | HoloEmitStatement
  | HoloAnimateStatement
  | HoloOnErrorStatement
  | HoloExpressionStatement;

export interface HoloWhileStatement extends HoloNode {
  type: 'WhileStatement';
  condition: HoloExpression;
  body: HoloStatement[];
}

export interface HoloOnErrorStatement extends HoloNode {
  type: 'OnErrorStatement';
  body: HoloStatement[];
}

export interface HoloAssignment extends HoloNode {
  type: 'Assignment';
  target: string; // e.g., "state.visitors", "enemy.health"
  operator: '=' | '+=' | '-=' | '*=' | '/=';
  value: HoloExpression;
}

export interface HoloMethodCall extends HoloNode {
  type: 'MethodCall';
  object?: string; // optional for global calls
  method: string;
  arguments: HoloExpression[];
}

export interface HoloIfStatement extends HoloNode {
  type: 'IfStatement';
  condition: HoloExpression;
  consequent: HoloStatement[];
  alternate?: HoloStatement[];
}

export interface HoloClassicForStatement extends HoloNode {
  type: 'ClassicForStatement';
  init?: HoloStatement;
  test?: HoloExpression;
  update?: HoloStatement;
  body: HoloStatement[];
}

export interface HoloVariableDeclaration extends HoloNode {
  type: 'VariableDeclaration';
  kind: 'let' | 'var' | 'const';
  name: string;
  value?: HoloExpression;
}

export interface HoloForStatement extends HoloNode {
  type: 'ForStatement';
  variable: string;
  iterable: HoloExpression;
  body: HoloStatement[];
}

export interface HoloAwaitStatement extends HoloNode {
  type: 'AwaitStatement';
  expression: HoloExpression;
}

export interface HoloReturnStatement extends HoloNode {
  type: 'ReturnStatement';
  value?: HoloExpression;
}

export interface HoloEmitStatement extends HoloNode {
  type: 'EmitStatement';
  event: string;
  data?: HoloExpression;
}

export interface HoloAnimateStatement extends HoloNode {
  type: 'AnimateStatement';
  target: string;
  properties: Record<string, HoloValue>;
}

export interface HoloExpressionStatement extends HoloNode {
  type: 'ExpressionStatement';
  expression: HoloExpression;
}

// =============================================================================
// EXPRESSIONS
// =============================================================================

export type HoloExpression =
  | HoloLiteral
  | HoloIdentifier
  | HoloBinaryExpression
  | HoloUnaryExpression
  | HoloMemberExpression
  | HoloCallExpression
  | HoloArrayExpression
  | HoloObjectExpression
  | HoloConditionalExpression
  | HoloUpdateExpression
  | HoloBindExpression;

export interface HoloLiteral extends HoloNode {
  type: 'Literal';
  value: string | number | boolean | null;
}

export interface HoloIdentifier extends HoloNode {
  type: 'Identifier';
  name: string;
}

export interface HoloBinaryExpression extends HoloNode {
  type: 'BinaryExpression';
  operator: string; // +, -, *, /, ==, !=, <, >, <=, >=, &&, ||
  left: HoloExpression;
  right: HoloExpression;
}

export interface HoloUnaryExpression extends HoloNode {
  type: 'UnaryExpression';
  operator: '!' | '-';
  argument: HoloExpression;
}

export interface HoloMemberExpression extends HoloNode {
  type: 'MemberExpression';
  object: HoloExpression;
  property: string;
  computed: boolean; // true for a[b], false for a.b
}

export interface HoloCallExpression extends HoloNode {
  type: 'CallExpression';
  callee: HoloExpression;
  arguments: HoloExpression[];
}

export interface HoloArrayExpression extends HoloNode {
  type: 'ArrayExpression';
  elements: HoloExpression[];
}

export interface HoloObjectExpression extends HoloNode {
  type: 'ObjectExpression';
  properties: { key: string; value: HoloExpression }[];
}

export interface HoloConditionalExpression extends HoloNode {
  type: 'ConditionalExpression';
  test: HoloExpression;
  consequent: HoloExpression;
  alternate: HoloExpression;
}

export interface HoloUpdateExpression extends HoloNode {
  type: 'UpdateExpression';
  operator: '++' | '--';
  argument: HoloExpression;
  prefix: boolean;
}

export interface HoloBindExpression extends HoloNode {
  type: 'BindExpression';
  source: string; // e.g., "state.score"
  transform?: string; // optional transform function name
}

// =============================================================================
// IMPORTS & EXPORTS (HoloComposition-level)
// =============================================================================

/** Legacy import node type used by HoloCompositionParser */
export interface HoloImport extends HoloNode {
  type: 'Import';
  specifiers: HoloImportSpecifier[];
  source: string; // e.g., "./player.hsplus"
}

export interface HoloImportSpecifier extends HoloNode {
  type: 'ImportSpecifier';
  imported: string;
  local?: string; // alias
}

// =============================================================================
// IMPORT / EXPORT DIRECTIVE AST NODES (HoloScript+ parser)
// =============================================================================

/**
 * AST node for @import directives produced by HoloScriptPlusParser.
 *
 * Supported syntax forms:
 *   @import "./path.hs"
 *   @import "./path.hs" as Alias
 *   @import { A, B } from "./path.hs"
 *   @import * as NS from "./path.hs"
 */
export interface ImportDirective extends HoloNode {
  type: 'import';
  /** Raw import path string as written in source */
  path: string;
  /** Derived or explicit alias (filename stem if not specified) */
  alias: string;
  /** Named exports to import. Undefined means "all under alias namespace". */
  namedImports?: string[];
  /** True for `@import * as NS from "./f.hs"` form */
  isWildcard?: boolean;
}

/**
 * AST node for @export directives produced by HoloScriptPlusParser.
 *
 * Supported syntax forms:
 *   @export template "MyTemplate"
 *   @export object "MyObject"
 *   @export "NamedThing"
 *   @export  (anonymous — exports the next node)
 */
export interface ExportDirective extends HoloNode {
  type: 'export';
  /** The kind of thing being exported: 'template' | 'object' | 'composition' | 'trait' | 'any' */
  exportKind: 'template' | 'object' | 'composition' | 'trait' | 'group' | 'scene' | 'any';
  /** The exported name, if specified explicitly */
  exportName?: string;
}


// =============================================================================
// PARSER RESULT
// =============================================================================

export interface HoloParseResult {
  success: boolean;
  ast?: HoloComposition;
  errors: HoloParseError[];
  warnings: HoloParseWarning[];
}

export interface HoloParseError {
  message: string;
  loc?: SourceLocation;
  code?: string;
  suggestion?: string; // Helpful suggestion for fixing the error
  severity?: 'error' | 'warning';
}

export interface HoloParseWarning {
  message: string;
  loc?: SourceLocation;
  code?: string;
}

// =============================================================================
// NPC BEHAVIOR TREES (Brittney AI Feature)
// =============================================================================

export interface HoloNPC extends HoloNode {
  type: 'NPC';
  name: string;
  npcType?: string;
  model?: string;
  properties: HoloNPCProperty[];
  behaviors: HoloBehavior[];
  state?: HoloState;
  dialogueTree?: string; // Reference to dialogue ID
}

export interface HoloNPCProperty extends HoloNode {
  type: 'NPCProperty';
  key: string;
  value: HoloValue;
}

export interface HoloBehavior extends HoloNode {
  type: 'Behavior';
  name: string;
  trigger: string;
  condition?: HoloExpression;
  actions: HoloBehaviorAction[];
  timeout?: number;
  priority?: number;
}

export interface HoloBehaviorAction extends HoloNode {
  type: 'BehaviorAction';
  actionType: 'move' | 'animate' | 'face' | 'damage' | 'heal' | 'spawn' | 'emit' | 'wait' | 'call';
  config: Record<string, HoloValue>;
}

// =============================================================================
// QUEST DEFINITION SYSTEM (Brittney AI Feature)
// =============================================================================

export interface HoloQuest extends HoloNode {
  type: 'Quest';
  name: string;
  giver?: string;
  level?: number;
  questType?: 'fetch' | 'defeat' | 'discover' | 'escort' | 'deliver' | 'custom';
  objectives: HoloQuestObjective[];
  rewards: HoloQuestRewards;
  branches?: HoloQuestBranch[];
  prerequisites?: string[];
}

export interface HoloQuestObjective extends HoloNode {
  type: 'QuestObjective';
  id: string;
  description: string;
  objectiveType: 'discover' | 'defeat' | 'collect' | 'deliver' | 'interact' | 'survive';
  target: string | HoloExpression;
  count?: number;
  optional?: boolean;
}

export interface HoloQuestRewards extends HoloNode {
  type: 'QuestRewards';
  experience?: number;
  gold?: number;
  items?: HoloQuestRewardItem[];
  reputation?: Record<string, number>;
  unlocks?: string[];
}

export interface HoloQuestRewardItem extends HoloNode {
  type: 'QuestRewardItem';
  id: string;
  count?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export interface HoloQuestBranch extends HoloNode {
  type: 'QuestBranch';
  condition: HoloExpression;
  text?: string;
  rewardMultiplier?: number;
  nextQuest?: string;
}

// =============================================================================
// ABILITY/SPELL DEFINITION (Brittney AI Feature)
// =============================================================================

export interface HoloAbility extends HoloNode {
  type: 'Ability';
  name: string;
  abilityType: 'spell' | 'skill' | 'passive' | 'ultimate';
  class?: string;
  level?: number;
  stats: HoloAbilityStats;
  scaling?: HoloAbilityScaling;
  effects: HoloAbilityEffects;
  projectile?: HoloAbilityProjectile;
}

export interface HoloAbilityStats extends HoloNode {
  type: 'AbilityStats';
  manaCost?: number;
  staminaCost?: number;
  cooldown?: number;
  castTime?: number;
  range?: number;
  radius?: number;
  duration?: number;
}

export interface HoloAbilityScaling extends HoloNode {
  type: 'AbilityScaling';
  baseDamage?: number;
  spellPower?: number;
  attackPower?: number;
  levelScale?: number;
}

export interface HoloAbilityEffects extends HoloNode {
  type: 'AbilityEffects';
  impact?: HoloAbilityImpact;
  damage?: HoloAbilityDamage;
  buff?: HoloAbilityBuff;
  debuff?: HoloAbilityDebuff;
}

export interface HoloAbilityImpact extends HoloNode {
  type: 'AbilityImpact';
  animation?: string;
  particle?: string;
  sound?: string;
  shake?: { intensity: number; duration: number };
}

export interface HoloAbilityDamage extends HoloNode {
  type: 'AbilityDamage';
  damageType: 'physical' | 'fire' | 'ice' | 'lightning' | 'arcane' | 'holy' | 'shadow';
  canCrit?: boolean;
  critMultiplier?: number;
}

export interface HoloAbilityBuff extends HoloNode {
  type: 'AbilityBuff';
  stat: string;
  amount: number;
  duration: number;
  stacks?: number;
}

export interface HoloAbilityDebuff extends HoloNode {
  type: 'AbilityDebuff';
  effect: 'slow' | 'stun' | 'silence' | 'root' | 'burn' | 'freeze' | 'poison';
  duration: number;
  magnitude?: number;
}

export interface HoloAbilityProjectile extends HoloNode {
  type: 'AbilityProjectile';
  model?: string;
  speed?: number;
  lifetime?: number;
  trail?: string;
  homing?: boolean;
}

// =============================================================================
// ENHANCED DIALOGUE TREES (Brittney AI Feature)
// =============================================================================

export interface HoloDialogue extends HoloNode {
  type: 'Dialogue';
  id: string;
  character?: string;
  emotion?: 'friendly' | 'angry' | 'sad' | 'neutral' | 'excited' | 'mysterious';
  content: string | HoloLocalizedText;
  options: HoloDialogueOption[];
  condition?: HoloExpression;
  nextDialogue?: string;
}

export interface HoloDialogueOption extends HoloNode {
  type: 'DialogueOption';
  text: string | HoloLocalizedText;
  action?: HoloStatement[];
  unlocked?: HoloExpression;
  emotion?: string;
  next?: string; // Next dialogue ID
}

export interface HoloLocalizedText extends HoloNode {
  type: 'LocalizedText';
  id: string;
  translations: Record<string, string>; // { "en": "Hello", "es": "Hola" }
  fallback?: string;
}

// =============================================================================
// STATE MACHINES (Brittney AI Feature)
// =============================================================================

export interface HoloStateMachine extends HoloNode {
  type: 'StateMachine';
  name: string;
  initialState: string;
  states: Record<string, HoloState_Machine>;
}

export interface HoloState_Machine extends HoloNode {
  type: 'State_Machine';
  name: string;
  entry?: HoloStatement[];
  exit?: HoloStatement[];
  actions: HoloBehaviorAction[];
  transitions: HoloStateTransition[];
  onDamage?: HoloStatement[];
  timeout?: number;
  onTimeout?: HoloStatement[];
}

export interface HoloStateTransition extends HoloNode {
  type: 'StateTransition';
  target: string;
  condition?: HoloExpression;
  event?: string;
}

// =============================================================================
// ACHIEVEMENTS (Brittney AI Feature)
// =============================================================================

export interface HoloAchievement extends HoloNode {
  type: 'Achievement';
  name: string;
  description: string;
  points?: number;
  condition: HoloExpression;
  reward?: HoloAchievementReward;
  progress?: HoloExpression;
  hidden?: boolean;
}

export interface HoloAchievementReward extends HoloNode {
  type: 'AchievementReward';
  title?: string;
  badge?: string;
  bonus?: Record<string, number>;
  unlocks?: string[];
}

// =============================================================================
// TALENT TREES (Brittney AI Feature)
// =============================================================================

export interface HoloTalentTree extends HoloNode {
  type: 'TalentTree';
  name: string;
  class?: string;
  rows: HoloTalentRow[];
}

export interface HoloTalentRow extends HoloNode {
  type: 'TalentRow';
  tier: number;
  nodes: HoloTalentNode[];
}

export interface HoloTalentNode extends HoloNode {
  type: 'TalentNode';
  id: string;
  name: string;
  description?: string;
  points: number;
  maxPoints?: number;
  requires?: string[];
  effect: HoloTalentEffect;
  icon?: string;
}

export interface HoloTalentEffect extends HoloNode {
  type: 'TalentEffect';
  effectType: 'spell' | 'upgrade' | 'passive' | 'unlock';
  target?: string;
  bonus?: Record<string, number>;
}

// =============================================================================
// PARSER OPTIONS
// =============================================================================

export interface HoloParserOptions {
  /** Include source locations in AST nodes */
  locations?: boolean;
  /** Collect errors instead of throwing */
  tolerant?: boolean;
  /** Enable strict mode (stricter validation) */
  strict?: boolean;
  /** Source filename for error messages */
  filename?: string;
}

// =============================================================================
// ASSET PIPELINE — @import / @export DIRECTIVE TYPES
// =============================================================================

/**
 * Parsed @import directive AST node.
 *
 * Covers all three import forms:
 * ```holoscript
 * @import "./foo.hs"                     → path, alias (stem), no namedImports
 * @import "./foo.hs" as F                → path, alias = 'F'
 * @import { Button } from "./foo.hs"     → path, namedImports = ['Button']
 * @import * as NS from "./foo.hs"        → path, alias = 'NS', isWildcard = true
 * ```
 */
export interface ImportDirective {
  readonly type: 'import';
  /** Raw import path as written in source, e.g. `"./shared/ui.hs"` */
  path: string;
  /**
   * Resolved namespace alias.
   * - Defaults to the file stem (last path segment without extension)
   * - Overridden by the `as Alias` clause
   * - Used as the prefix for wildcard/namespace imports: `alias.ExportName`
   */
  alias: string;
  /**
   * List of explicitly imported names (`{ A, B }`).
   * `undefined` for namespace / wildcard imports.
   */
  namedImports?: string[];
  /**
   * `true` for wildcard imports (`* as NS from "..."`)
   * All exports are injected under `alias.ExportName`.
   */
  isWildcard?: boolean;
  /** Source location (line/col of the `@import` token) */
  loc?: { start: { line: number; column: number } };
}

/**
 * Parsed @export directive AST node.
 *
 * Marks the immediately following node as publicly importable:
 * ```holoscript
 * @export template "GlowingOrb"    → exportKind = 'template'
 * @export object   "Panel"         → exportKind = 'object'
 * @export          "Thing"         → exportKind = 'any'
 * ```
 */
export interface ExportDirective {
  readonly type: 'export';
  /**
   * Category of the exported item.
   * Inferred from the keyword following `@export`.
   * Falls back to `'any'` when no kind keyword is present.
   */
  exportKind: 'template' | 'object' | 'composition' | 'logic' | 'any';
  /**
   * Name of the exported item.
   * The consumer (e.g., `@import { Button }`) uses this name to look it up.
   */
  exportName?: string;
  /** Source location (line/col of the `@export` token) */
  loc?: { start: { line: number; column: number } };
}

/**
 * Compact import record stored in `ASTProgram.imports`.
 * Mirrors `ImportDirective` but is serialization-lightweight (no loc).
 */
export interface HSPlusImport {
  path: string;
  alias: string;
  namedImports?: string[];
  isWildcard?: boolean;
}

/**
 * Async file-reader function injected by the host environment.
 *
 * - **Node.js**: `(p) => fs.promises.readFile(p, 'utf-8')`
 * - **Browser / XR**: `(p) => fetch(p).then(r => r.text())`
 * - **Tests**: in-memory `Map<string, string>` lookup
 *
 * The function receives the **canonical** (resolved absolute) path.
 */
export type ReadFileFn = (absolutePath: string) => Promise<string>;

// =============================================================================
// SPATIAL PRIMITIVES (v4 — March 2026)
// =============================================================================

export interface HoloSpawnGroup extends HoloNode {
  type: 'SpawnGroup';
  name: string;
  properties: Record<string, HoloValue>;
}

export interface HoloWaypoints extends HoloNode {
  type: 'Waypoints';
  name: string;
  points: HoloValue; // array of position arrays
}

export interface HoloConstraintBlock extends HoloNode {
  type: 'Constraint';
  name: string;
  properties: Record<string, HoloValue>;
}

export interface HoloTerrainBlock extends HoloNode {
  type: 'Terrain';
  name: string;
  properties: Record<string, HoloValue>;
}

// =============================================================================
// DOMAIN-SPECIFIC BLOCKS (v4.1 — March 2026)
// Unified type for IoT, Robotics, DataViz, Education, Healthcare,
// Music, Architecture, Web3, and extensible custom blocks
// =============================================================================

export type HoloDomainType =
  | 'iot'      // sensor, device, binding, telemetry_stream, digital_twin
  | 'robotics' // joint, actuator, controller, end_effector
  | 'dataviz'  // dashboard, chart, data_source, widget, metric
  | 'education'// lesson, quiz, curriculum
  | 'healthcare' // procedure, patient_model, vital_monitor
  | 'music'    // instrument, track, sequence, effect_chain
  | 'architecture' // floor_plan, room, building, hvac_system
  | 'web3'     // contract, token, wallet, marketplace, governance
  // Perception & simulation layer (v4.2)
  | 'material'    // material, pbr_material, unlit_material, shader
  | 'physics'     // collider (box/sphere/capsule/mesh/convex), rigidbody, force_field (gravity_zone/wind_zone/buoyancy_zone), articulation with joint sub-blocks
  | 'vfx'         // particles, emitter, vfx
  | 'postfx'      // post_processing, post_fx
  | 'audio'       // audio_source, reverb_zone, ambience
  | 'weather'     // weather, atmosphere, sky, climate
  | 'procedural'  // procedural, generate, scatter, distribute
  | 'rendering'   // lod, render
  | 'navigation'  // navmesh, nav_agent, behavior_tree
  | 'input'       // input, interaction, gesture_profile
  | 'codebase'  // codebase absorption: codebase, module_map, dependency_graph, call_graph
  // Norm lifecycle / cultural engineering (v4.5)
  | 'norms'     // norm, metanorm, norm_proposal, norm_voting, norm_adoption, norm_violation, norm_sanction
  | 'custom';  // any user-defined block keyword

export interface HoloDomainBlock extends HoloNode {
  type: 'DomainBlock';
  /** Domain category */
  domain: HoloDomainType;
  /** The specific keyword used (e.g. 'sensor', 'joint', 'recipe') */
  keyword: string;
  /** Block name (the string after the keyword) */
  name: string;
  /** Trait decorators on the block (e.g. @networked @safety_rated) */
  traits: string[];
  /** Properties declared inside the block */
  properties: Record<string, HoloValue>;
  /** Nested objects inside the block */
  children?: HoloObjectDecl[];
  /** Event handlers inside the block */
  eventHandlers?: HoloEventHandler[];
}

// =============================================================================
// NORM LIFECYCLE BLOCKS (v4.5 — March 2026)
// CRSEC Model: Creation, Representation, Spreading, Evaluation, Compliance
//
// Declarative cultural engineering primitives for multi-agent norm governance.
// Supports the full norm lifecycle including proposals, voting rules, adoption
// thresholds, violation consequences, sanction enforcement, and metanorm
// governance (norms about norms).
// =============================================================================

/**
 * Norm lifecycle phase identifiers (CRSEC model).
 *
 * - creation:   How the norm is proposed and authored
 * - representation: Formal encoding of the norm's rules and constraints
 * - spreading:  How the norm propagates through agent communication/observation
 * - evaluation: Sanity checks and acceptance criteria for norm adoption
 * - compliance: Enforcement, violation detection, and sanction application
 */
export type NormLifecyclePhase =
  | 'creation'
  | 'representation'
  | 'spreading'
  | 'evaluation'
  | 'compliance';

/**
 * Status of a norm within its lifecycle
 */
export type NormStatus =
  | 'draft'         // Proposed but not yet active
  | 'proposed'      // Formally proposed, awaiting votes
  | 'voting'        // Under active voting
  | 'adopted'       // Accepted and enforceable
  | 'suspended'     // Temporarily not enforced
  | 'deprecated'    // Being phased out
  | 'revoked'       // Permanently removed
  | 'contested';    // Under challenge / re-evaluation

/**
 * Voting mechanism for norm proposals
 */
export type NormVotingMechanism =
  | 'majority'        // Simple majority (>50%)
  | 'supermajority'   // 2/3 majority required
  | 'consensus'       // Unanimous agreement
  | 'weighted'        // Weight by trust/reputation
  | 'liquid_democracy' // Delegated voting
  | 'quadratic'       // Quadratic voting (cost increases with conviction)
  | 'ranked_choice'   // Instant-runoff ranked voting
  | 'lazy_consensus'; // Accepted unless objected within deadline

/**
 * Norm violation severity level
 */
export type NormViolationSeverity =
  | 'info'       // Informational, no action
  | 'warning'    // Warning issued
  | 'minor'      // Minor infraction
  | 'moderate'   // Moderate infraction
  | 'major'      // Major violation
  | 'critical';  // Critical violation, immediate action

/**
 * Sanction type applied for norm violations
 */
export type NormSanctionType =
  | 'warn'          // Issue warning
  | 'restrict'      // Restrict capabilities
  | 'penalize'      // Apply penalty (reputation, resources)
  | 'suspend'       // Temporary suspension
  | 'ban'           // Permanent ban
  | 'quarantine'    // Isolate from community
  | 'escalate'      // Escalate to metanorm authority
  | 'custom';       // User-defined sanction

/**
 * How a norm spreads through the agent population
 */
export type NormSpreadingMechanism =
  | 'broadcast'     // Announced to all agents
  | 'observation'   // Learned through observing behavior
  | 'communication' // Shared through direct communication
  | 'imitation'     // Adopted by imitating successful agents
  | 'enforcement'   // Learned via sanction application
  | 'passive';      // Available but not actively promoted

// ---------------------------------------------------------------------------
// NORM BLOCK — First-class norm declaration
// ---------------------------------------------------------------------------

/**
 * A first-class norm declaration in a HoloScript composition.
 *
 * Grammar:
 * ```holoscript
 * norm "NoSpamming" {
 *   description: "Agents must not send unsolicited messages"
 *   category: "communication"
 *   priority: 8
 *
 *   creation {
 *     author: "system"
 *     rationale: "Prevent message flooding in shared spaces"
 *     initial_status: "proposed"
 *   }
 *
 *   representation {
 *     condition: "message_count_per_minute < 10"
 *     scope: "all_agents"
 *     exceptions: ["system_announcements", "emergency_alerts"]
 *   }
 *
 *   spreading {
 *     mechanism: "broadcast"
 *     visibility: "public"
 *     adoption_incentive: 5
 *   }
 *
 *   evaluation {
 *     voting: "majority"
 *     quorum: 0.6
 *     approval_threshold: 0.5
 *     review_period: 86400
 *     auto_adopt: false
 *   }
 *
 *   compliance {
 *     monitoring: "continuous"
 *     violation_threshold: 3
 *     severity: "moderate"
 *     sanctions: ["warn", "restrict", "suspend"]
 *     appeal_allowed: true
 *     grace_period: 3600
 *   }
 * }
 * ```
 */
export interface HoloNormBlock extends HoloNode {
  type: 'NormBlock';
  /** Name of the norm */
  name: string;
  /** Trait decorators on the norm (e.g. @enforceable @community_driven) */
  traits: string[];
  /** Top-level norm properties (description, category, priority, etc.) */
  properties: Record<string, HoloValue>;
  /** Creation phase: how the norm is proposed and authored */
  creation?: HoloNormCreation;
  /** Representation phase: formal rule encoding */
  representation?: HoloNormRepresentation;
  /** Spreading phase: propagation through the agent population */
  spreading?: HoloNormSpreading;
  /** Evaluation phase: acceptance criteria and voting rules */
  evaluation?: HoloNormEvaluation;
  /** Compliance phase: enforcement, violation, and sanctions */
  compliance?: HoloNormCompliance;
  /** Event handlers for norm lifecycle events */
  eventHandlers?: HoloEventHandler[];
  /** @platform() conditional compilation constraint */
  platformConstraint?: PlatformConstraint;
}

/**
 * Creation phase — how the norm originates.
 */
export interface HoloNormCreation extends HoloNode {
  type: 'NormCreation';
  properties: Record<string, HoloValue>;
}

/**
 * Representation phase — formal encoding of the norm's constraints.
 */
export interface HoloNormRepresentation extends HoloNode {
  type: 'NormRepresentation';
  properties: Record<string, HoloValue>;
}

/**
 * Spreading phase — how the norm propagates through the population.
 */
export interface HoloNormSpreading extends HoloNode {
  type: 'NormSpreading';
  properties: Record<string, HoloValue>;
}

/**
 * Evaluation phase — sanity checks, voting, and acceptance criteria.
 */
export interface HoloNormEvaluation extends HoloNode {
  type: 'NormEvaluation';
  properties: Record<string, HoloValue>;
}

/**
 * Compliance phase — enforcement, violation detection, and sanctions.
 */
export interface HoloNormCompliance extends HoloNode {
  type: 'NormCompliance';
  properties: Record<string, HoloValue>;
}

// ---------------------------------------------------------------------------
// METANORM — Norms about norms (governance of the norm system itself)
// ---------------------------------------------------------------------------

/**
 * A metanorm declaration: governance rules about the norm system itself.
 *
 * Grammar:
 * ```holoscript
 * metanorm "NormAmendmentProcess" {
 *   description: "Rules for proposing changes to existing norms"
 *   applies_to: "all_norms"
 *
 *   rules {
 *     amendment_quorum: 0.75
 *     amendment_voting: "supermajority"
 *     cooldown_period: 604800
 *     max_amendments_per_cycle: 3
 *     retroactive_allowed: false
 *   }
 *
 *   escalation {
 *     authority: "governance_council"
 *     override_threshold: 0.9
 *     appeal_levels: 2
 *   }
 *
 *   on norm_conflict(normA, normB) {
 *     emit("norm_conflict_detected", { a: normA, b: normB })
 *   }
 * }
 * ```
 */
export interface HoloMetanorm extends HoloNode {
  type: 'Metanorm';
  /** Name of the metanorm */
  name: string;
  /** Trait decorators */
  traits: string[];
  /** Top-level metanorm properties */
  properties: Record<string, HoloValue>;
  /** Governance rules sub-block */
  rules?: HoloMetanormRules;
  /** Escalation sub-block */
  escalation?: HoloMetanormEscalation;
  /** Event handlers for metanorm events */
  eventHandlers?: HoloEventHandler[];
}

/**
 * Metanorm governance rules sub-block.
 */
export interface HoloMetanormRules extends HoloNode {
  type: 'MetanormRules';
  properties: Record<string, HoloValue>;
}

/**
 * Metanorm escalation sub-block.
 */
export interface HoloMetanormEscalation extends HoloNode {
  type: 'MetanormEscalation';
  properties: Record<string, HoloValue>;
}
