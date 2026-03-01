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
