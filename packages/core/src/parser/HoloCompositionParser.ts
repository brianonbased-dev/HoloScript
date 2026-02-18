/**
 * .holo Composition Parser
 *
 * Parses .holo files into a HoloComposition AST.
 * This parser handles the declarative, scene-centric syntax.
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloEnvironment,
  HoloEnvironmentProperty,
  HoloParticleSystem,
  HoloState,
  HoloStateProperty,
  HoloTemplate,
  HoloObjectDecl,
  HoloObjectProperty,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloGroupProperty,
  HoloLogic,
  HoloEventHandler,
  HoloAction,
  HoloParameter,
  HoloStatement,
  HoloExpression,
  HoloImport,
  HoloImportSpecifier,
  HoloParseResult,
  HoloParseError,
  HoloParseWarning,
  HoloParserOptions,
  HoloValue,
  HoloBindValue,
  HoloLight,
  HoloLightProperty,
  HoloEffects,
  HoloEffect,
  HoloCamera,
  HoloCameraProperty,
  HoloTimeline,
  HoloTimelineEntry,
  HoloTimelineAction,
  HoloAudio,
  HoloAudioProperty,
  HoloZone,
  HoloZoneProperty,
  HoloUI,
  HoloUIElement,
  HoloUIProperty,
  HoloTransition,
  HoloTransitionProperty,
  HoloConditionalBlock,
  HoloForEachBlock,
  SourceLocation,
  // Brittney AI Features
  HoloNPC,
  HoloBehavior,
  HoloBehaviorAction,
  HoloQuest,
  HoloQuestObjective,
  HoloQuestRewards,
  HoloQuestBranch,
  HoloAbility,
  HoloAbilityStats,
  HoloAbilityScaling,
  HoloAbilityEffects,
  HoloAbilityProjectile,
  HoloDialogue,
  HoloDialogueOption,
  HoloStateMachine,
  HoloState_Machine,
  HoloStateTransition,
  HoloAchievement,
  HoloTalentTree,
  HoloTalentRow,
  HoloTalentNode,
  HoloShape,
  HoloShapeProperty,
  HoloOnErrorStatement,
  HoloSubOrb,
  HoloWhileStatement,
  HoloVariableDeclaration,
} from './HoloCompositionTypes';
import { TypoDetector } from './TypoDetector';

// =============================================================================
// TOKEN TYPES
// =============================================================================

type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'LBRACE'
  | 'RBRACE'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LPAREN'
  | 'RPAREN'
  | 'COLON'
  | 'COMMA'
  | 'DOT'
  | 'EQUALS'
  | 'PLUS_EQUALS'
  | 'MINUS_EQUALS'
  | 'STAR_EQUALS'
  | 'SLASH_EQUALS'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'LESS'
  | 'GREATER'
  | 'LESS_EQUALS'
  | 'GREATER_EQUALS'
  | 'EQUALS_EQUALS'
  | 'BANG_EQUALS'
  | 'BANG'
  | 'AND'
  | 'OR'
  | 'ARROW'
  | 'AT'
  | 'HASH'
  | 'SEMICOLON'
  | 'QUESTION'
  | 'NEWLINE'
  | 'EOF'
  // Keywords
  | 'COMPOSITION'
  | 'ENVIRONMENT'
  | 'STATE'
  | 'TEMPLATE'
  | 'OBJECT'
  | 'SPATIAL_GROUP'
  | 'LOGIC'
  | 'ACTION'
  | 'ASYNC'
  | 'AWAIT'
  | 'IF'
  | 'ELSE'
  | 'FOR'
  | 'IN'
  | 'RETURN'
  | 'EMIT'
  | 'ANIMATE'
  | 'USING'
  | 'IMPORT'
  | 'ON_ERROR'
  | 'FROM'
  | 'WHILE'
  | 'LET'
  | 'VAR'
  | 'CONST'
  | 'INC'
  | 'DEC'
  | 'PARTICLE_SYSTEM'
  | 'LIGHT'
  | 'EFFECTS'
  | 'CAMERA'
  | 'BIND'
  | 'TIMELINE'
  | 'AUDIO'
  | 'ZONE'
  | 'UI'
  | 'TRANSITION'
  | 'ELEMENT'
  | 'SPATIAL_AGENT'
  | 'SPATIAL_CONTAINER'
  | 'UI_PANEL'
  | 'UI_TEXT'
  | 'UI_BUTTON'
  | 'UI_SLIDER'
  | 'UI_INPUT'
  | 'UI_IMAGE'
  | 'UI_CHART'
  | 'UI_GAUGE'
  | 'UI_VALUE'
  | 'UI_STATUS_INDICATOR'
  | 'TOOL_SLOT'
  | 'BEHAVIOR'
  // Brittney AI Features
  | 'NPC'
  | 'QUEST'
  | 'ABILITY'
  | 'DIALOGUE'
  | 'STATE_MACHINE'
  | 'ACHIEVEMENT'
  | 'TALENT_TREE'
  | 'SHAPE'
  | 'SUB_ORB'
  | 'MIGRATE'
  // Comment tokens (skipped by lexer but used in parser guards)
  | 'COMMENT'
  | 'LINE_COMMENT';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// =============================================================================
// KEYWORDS
// =============================================================================

const KEYWORDS: Record<string, TokenType> = {
  composition: 'COMPOSITION',
  environment: 'ENVIRONMENT',
  state: 'STATE',
  template: 'TEMPLATE',
  object: 'OBJECT',
  spatial_group: 'SPATIAL_GROUP',
  logic: 'LOGIC',
  action: 'ACTION',
  async: 'ASYNC',
  await: 'AWAIT',
  if: 'IF',
  else: 'ELSE',
  for: 'FOR',
  in: 'IN',
  return: 'RETURN',
  emit: 'EMIT',
  animate: 'ANIMATE',
  on_error: 'ON_ERROR',
  while: 'WHILE',
  let: 'LET',
  var: 'VAR',
  const: 'CONST',
  node: 'SPATIAL_GROUP',
  orb: 'OBJECT',
  using: 'USING',
  import: 'IMPORT',
  from: 'FROM',
  particle_system: 'PARTICLE_SYSTEM',
  light: 'LIGHT',
  effects: 'EFFECTS',
  camera: 'CAMERA',
  bind: 'BIND',
  timeline: 'TIMELINE',
  audio: 'AUDIO',
  zone: 'ZONE',
  ui: 'UI',
  transition: 'TRANSITION',
  element: 'ELEMENT',
  spatial_agent: 'SPATIAL_AGENT',
  spatial_container: 'SPATIAL_CONTAINER',
  ui_panel: 'UI_PANEL',
  ui_text: 'UI_TEXT',
  ui_button: 'UI_BUTTON',
  ui_slider: 'UI_SLIDER',
  ui_input: 'UI_INPUT',
  ui_image: 'UI_IMAGE',
  ui_chart: 'UI_CHART',
  ui_gauge: 'UI_GAUGE',
  ui_value: 'UI_VALUE',
  ui_status_indicator: 'UI_STATUS_INDICATOR',
  tool_slot: 'TOOL_SLOT',
  behavior: 'BEHAVIOR',
  // Brittney AI Features
  npc: 'NPC',
  quest: 'QUEST',
  ability: 'ABILITY',
  dialogue: 'DIALOGUE',
  state_machine: 'STATE_MACHINE',
  achievement: 'ACHIEVEMENT',
  talent_tree: 'TALENT_TREE',
  shape: 'SHAPE',
  sub_orb: 'SUB_ORB',
  migrate: 'MIGRATE',
  true: 'BOOLEAN',
  false: 'BOOLEAN',
  null: 'NULL',
};

// Primitive shape types that can use #id syntax
const PRIMITIVE_SHAPES = new Set([
  'cube',
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'capsule',
  'ring',
  'dodecahedron',
  'icosahedron',
  'octahedron',
  'tetrahedron',
  'circle',
  'lathe',
  'extrude',
  'text',
  'sprite',
  'mesh',
  'model',
  'splat',
  'nerf',
]);

// =============================================================================
// LEXER
// =============================================================================

class HoloLexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      const char = this.current();

      // Skip whitespace (except newlines)
      if (char === ' ' || char === '\t') {
        this.advance();
        continue;
      }

      // Comments
      if (char === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }
      if (char === '/' && this.peek(1) === '*') {
        this.skipBlockComment();
        continue;
      }

      // Newlines
      if (char === '\n') {
        this.addToken('NEWLINE', '\n');
        this.advance();
        this.line++;
        this.column = 1;
        continue;
      }
      if (char === '\r') {
        this.advance();
        if (this.current() === '\n') {
          this.advance();
        }
        this.addToken('NEWLINE', '\n');
        this.line++;
        this.column = 1;
        continue;
      }

      // Symbols
      if (this.trySymbol()) continue;

      // Strings
      if (char === '"' || char === "'") {
        this.readString(char);
        continue;
      }

      // Numbers
      if (this.isDigit(char) || (char === '-' && this.isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }

      // Identifiers and keywords
      if (this.isIdentifierStart(char)) {
        this.readIdentifier();
        continue;
      }

      // Unknown character - skip
      this.advance();
    }

    this.addToken('EOF', '');
    return this.tokens;
  }

  private trySymbol(): boolean {
    const char = this.current();
    const next = this.peek(1);

    // Triple-character operators
    if (char === '=' && next === '=' && this.peek(2) === '=') {
      this.tokens.push({
        type: 'EQUALS_EQUALS',
        value: '===',
        line: this.line,
        column: this.column,
      });
      this.advance();
      this.advance();
      this.advance();
      return true;
    }
    if (char === '!' && next === '=' && this.peek(2) === '=') {
      this.tokens.push({
        type: 'BANG_EQUALS',
        value: '!==',
        line: this.line,
        column: this.column,
      });
      this.advance();
      this.advance();
      this.advance();
      return true;
    }

    // Two-character operators
    if (char === '=' && next === '=') {
      this.addToken('EQUALS_EQUALS', '==');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '!' && next === '=') {
      this.addToken('BANG_EQUALS', '!=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '<' && next === '=') {
      this.addToken('LESS_EQUALS', '<=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '>' && next === '=') {
      this.addToken('GREATER_EQUALS', '>=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '+' && next === '=') {
      this.addToken('PLUS_EQUALS', '+=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '-' && next === '=') {
      this.addToken('MINUS_EQUALS', '-=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '*' && next === '=') {
      this.addToken('STAR_EQUALS', '*=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '/' && next === '=') {
      this.addToken('SLASH_EQUALS', '/=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '=' && next === '>') {
      this.addToken('ARROW', '=>');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '+' && next === '+') {
      this.addToken('INC', '++');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '-' && next === '-') {
      this.addToken('DEC', '--');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '&' && next === '&') {
      this.addToken('AND', '&&');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '|' && next === '|') {
      this.addToken('OR', '||');
      this.advance();
      this.advance();
      return true;
    }

    // Single-character operators
    const singleChar: Record<string, TokenType> = {
      '{': 'LBRACE',
      '}': 'RBRACE',
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      '(': 'LPAREN',
      ')': 'RPAREN',
      ':': 'COLON',
      ',': 'COMMA',
      '.': 'DOT',
      '=': 'EQUALS',
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '<': 'LESS',
      '>': 'GREATER',
      '!': 'BANG',
      '@': 'AT',
      '#': 'HASH',
      ';': 'SEMICOLON',
      '?': 'QUESTION',
    };

    if (singleChar[char]) {
      this.addToken(singleChar[char], char);
      this.advance();
      return true;
    }

    return false;
  }

  private current(): string {
    return this.pos < this.source.length ? this.source[this.pos] : '';
  }

  private peek(offset: number): string {
    const pos = this.pos + offset;
    return pos < this.source.length ? this.source[pos] : '';
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column - value.length,
    });
  }

  private skipLineComment(): void {
    while (this.current() !== '\n' && this.pos < this.source.length) {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    this.advance(); // /
    this.advance(); // *
    while (this.pos < this.source.length) {
      if (this.current() === '*' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        return;
      }
      if (this.current() === '\n') {
        this.line++;
        this.column = 0;
      }
      this.advance();
    }
  }

  private readString(quote: string): void {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // opening quote
    let value = '';
    while (this.current() !== quote && this.pos < this.source.length) {
      if (this.current() === '\\') {
        this.advance();
        const escaped = this.current();
        switch (escaped) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case 'r':
            value += '\r';
            break;
          case '\\':
            value += '\\';
            break;
          case '"':
            value += '"';
            break;
          case "'":
            value += "'";
            break;
          default:
            value += escaped;
        }
        this.advance();
      } else {
        value += this.advance();
      }
    }
    this.advance(); // closing quote
    this.tokens.push({
      type: 'STRING',
      value,
      line: startLine,
      column: startCol,
    });
  }

  private readNumber(): void {
    const startCol = this.column;
    let value = '';
    if (this.current() === '-') {
      value += this.advance();
    }
    while (this.isDigit(this.current())) {
      value += this.advance();
    }
    if (this.current() === '.' && this.isDigit(this.peek(1))) {
      value += this.advance(); // .
      while (this.isDigit(this.current())) {
        value += this.advance();
      }
    }
    this.tokens.push({
      type: 'NUMBER',
      value,
      line: this.line,
      column: startCol,
    });
  }

  private readIdentifier(): void {
    const startCol = this.column;
    let value = '';
    while (this.isIdentifierPart(this.current())) {
      value += this.advance();
    }
    const type = KEYWORDS[value.toLowerCase()] || 'IDENTIFIER';
    this.tokens.push({
      type,
      value: type === 'BOOLEAN' ? value.toLowerCase() : value,
      line: this.line,
      column: startCol,
    });
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  private isIdentifierPart(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char);
  }
}

// =============================================================================
// PARSER
// =============================================================================

export class HoloCompositionParser {
  private tokens: Token[] = [];
  private pos: number = 0;
  private errors: HoloParseError[] = [];
  private warnings: HoloParseWarning[] = [];
  private options: HoloParserOptions;
  private parseContext: string[] = []; // Track parsing context for better errors

  constructor(options: HoloParserOptions = {}) {
    this.options = {
      locations: true,
      tolerant: true,
      strict: false,
      ...options,
    };
  }

  parse(source: string): HoloParseResult {
    this.errors = [];
    this.warnings = [];
    const lexer = new HoloLexer(source);
    this.tokens = lexer.tokenize();
    this.pos = 0;
    this.skipNewlines();

    try {
      // Support files that don't start with 'composition' keyword
      // These use root-level @world, orb, object, or primitives
      let ast: HoloComposition;
      if (this.check('COMPOSITION')) {
        ast = this.parseComposition();
      } else {
        // Parse as implicit composition (no wrapper)
        ast = this.parseImplicitComposition();
      }

      return {
        success: this.errors.length === 0,
        ast,
        errors: this.errors,
        warnings: this.warnings,
      };
    } catch (error) {
      this.errors.push({
        message: error instanceof Error ? error.message : String(error),
        loc: this.currentLocation(),
      });
      return {
        success: false,
        errors: this.errors,
        warnings: this.warnings,
      };
    }
  }

  /**
   * Parse a file that doesn't start with 'composition' keyword
   * Supports @world, orb, object, and primitive shapes at root level
   */
  private parseImplicitComposition(): HoloComposition {
    this.pushContext('implicit-composition');

    const composition: HoloComposition = {
      type: 'Composition',
      name: 'implicit',
      templates: [],
      objects: [],
      spatialGroups: [],
      lights: [],
      imports: [],
      timelines: [],
      audio: [],
      zones: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
    };

    while (!this.isAtEnd()) {
      try {
        this.skipNewlines();
        if (this.isAtEnd()) break;

        // Handle @world, @environment, etc. (root-level decorators)
        if (this.check('AT')) {
          this.advance(); // consume @
          const decoratorName = this.current().value.toLowerCase();
          this.advance(); // consume decorator name

          if (decoratorName === 'world' || decoratorName === 'environment') {
            composition.environment = this.parseEnvironmentBody();
          } else {
            // Skip unknown root-level decorators
            if (this.check('LBRACE')) {
              this.skipBlock();
            }
          }
        } else if (this.check('SPATIAL_GROUP')) {
          composition.spatialGroups.push(this.parseSpatialGroup());
        } else if (this.check('LOGIC')) {
          composition.logic = this.parseLogic();
        } else if (this.check('IMPORT')) {
          composition.imports.push(this.parseImport());
        } else if (this.check('USING')) {
          const u = this.parseUsingStatement();
          if (u) composition.imports.push(u);
        } else if (this.check('SHAPE')) {
          composition.shapes.push(this.parseShapeDeclaration());
        } else if (this.check('NPC')) {
          composition.npcs.push(this.parseNPC());
        } else if (this.check('QUEST')) {
          composition.quests.push(this.parseQuest());
        } else if (this.check('ABILITY')) {
          composition.abilities.push(this.parseAbility());
        } else if (this.check('DIALOGUE')) {
          composition.dialogues.push(this.parseDialogue());
        } else if (this.check('STATE_MACHINE')) {
          composition.stateMachines.push(this.parseStateMachine());
        } else if (this.check('ACHIEVEMENT')) {
          composition.achievements.push(this.parseAchievement());
        } else if (this.check('TALENT_TREE')) {
          composition.talentTrees.push(this.parseTalentTree());
        } else if (this.check('COMMENT') || this.check('LINE_COMMENT')) {
          this.advance(); // skip comments
        } else {
          // Skip unknown tokens at root level
          this.advance();
        }
        this.skipNewlines();
      } catch (_err) {
        // Error recovery: skip to next statement
        this.advance();
      }
    }

    this.popContext();
    return composition;
  }

  /**
   * Parse environment body (after @world or @environment decorator)
   */
  private parseEnvironmentBody(): HoloEnvironment {
    const properties: HoloEnvironmentProperty[] = [];

    if (this.check('LBRACE')) {
      this.expect('LBRACE');
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        properties.push({ type: 'EnvironmentProperty', key, value });
        this.skipNewlines();
      }

      this.expect('RBRACE');
    }

    return { type: 'Environment', properties };
  }

  /**
   * Parse orb declaration: orb "name" @trait1 @trait2 { ... }
   */
  private parseOrbDeclaration(): HoloObjectDecl {
    this.advance(); // consume 'orb'
    const name = this.expectString();

    const traits: HoloObjectTrait[] = [];
    const properties: HoloObjectProperty[] = [];

    // Parse traits after name: @grabbable @glowing etc.
    while (this.check('AT')) {
      this.advance(); // consume @
      const traitName = this.expectIdentifier();
      let config: Record<string, HoloValue> = {};
      if (this.check('LPAREN')) {
        config = this.parseTraitConfig();
      }
      traits.push({ type: 'ObjectTrait', name: traitName, config } as any);
    }

    // Parse body
    if (this.check('LBRACE')) {
      this.expect('LBRACE');
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        if (this.check('AT')) {
          this.advance();
          const traitName = this.expectIdentifier();
          let config: Record<string, HoloValue> = {};
          if (this.check('LPAREN')) {
            config = this.parseTraitConfig();
          }
          traits.push({ type: 'ObjectTrait', name: traitName, config } as any);
        } else if (this.check('IDENTIFIER')) {
          const key = this.expectIdentifier();
          if (this.check('COLON')) {
            this.advance();
            properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
          }
        } else {
          this.advance();
        }
        this.skipNewlines();
      }

      this.expect('RBRACE');
    }

    return {
      type: 'Object',
      name,
      properties,
      traits,
    };
  }

  /**
   * Skip a block { ... } including nested blocks
   */
  private skipBlock(): void {
    if (!this.check('LBRACE')) return;
    this.advance(); // {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.check('LBRACE')) depth++;
      if (this.check('RBRACE')) depth--;
      this.advance();
    }
  }

  /**
   * Skip parenthesised argument list ( ... ) including nested parens
   */
  private skipParens(): void {
    if (!this.check('LPAREN')) return;
    this.advance(); // (
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.check('LPAREN')) depth++;
      if (this.check('RPAREN')) depth--;
      this.advance();
    }
  }

  // ===========================================================================
  // COMPOSITION
  // ===========================================================================

  private parseComposition(): HoloComposition {
    this.pushContext('composition');

    this.expect('COMPOSITION');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const composition: HoloComposition = {
      type: 'Composition',
      name,
      templates: [],
      objects: [],
      spatialGroups: [],
      lights: [],
      imports: [],
      timelines: [],
      audio: [],
      zones: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      // Brittney AI Features
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      try {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        if (this.check('IMPORT')) {
          composition.imports.push(this.parseImport());
        } else if (this.check('ENVIRONMENT')) {
          composition.environment = this.parseEnvironment();
        } else if (this.check('STATE')) {
          composition.state = this.parseState();
        } else if (this.check('TEMPLATE')) {
          composition.templates.push(this.parseTemplate());
        } else if (this.check('OBJECT')) {
          composition.objects.push(this.parseObject());
        } else if (this.check('SPATIAL_GROUP')) {
          composition.spatialGroups.push(this.parseSpatialGroup());
        } else if (this.check('LIGHT')) {
          composition.lights.push(this.parseLight());
        } else if (this.check('EFFECTS')) {
          composition.effects = this.parseEffects();
        } else if (this.check('CAMERA')) {
          composition.camera = this.parseCamera();
        } else if (this.check('LOGIC')) {
          composition.logic = this.parseLogic();
        } else if (this.check('TIMELINE')) {
          composition.timelines.push(this.parseTimeline());
        } else if (this.check('AUDIO')) {
          composition.audio.push(this.parseAudio());
        } else if (this.check('ZONE')) {
          composition.zones.push(this.parseZone());
        } else if (this.check('UI')) {
          composition.ui = this.parseUI();
        } else if (this.check('TRANSITION')) {
          composition.transitions.push(this.parseTransition());
        } else if (this.check('IF')) {
          composition.conditionals.push(this.parseConditionalBlock());
        } else if (this.check('FOR')) {
          composition.iterators.push(this.parseForEachBlock());
        } else if (this.check('SPATIAL_AGENT')) {
          composition.objects.push(this.parseSpatialObject('spatial_agent'));
        } else if (this.check('SPATIAL_CONTAINER')) {
          composition.spatialGroups.push(this.parseSpatialGroup());
        } else if (this.current().type.startsWith('UI_')) {
          composition.objects.push(this.parseSpatialObject(this.current().value.toLowerCase()));
        } else if (this.check('IDENTIFIER') && this.isPrimitiveShape(this.current().value)) {
          // Handle primitive#id or primitive #id { } syntax
          composition.objects.push(this.parsePrimitiveObject());
        } else if (this.check('NPC')) {
          composition.npcs.push(this.parseNPC());
        } else if (this.check('SHAPE')) {
          composition.shapes.push(this.parseShapeDeclaration());
        } else if (this.check('QUEST')) {
          composition.quests.push(this.parseQuest());
        } else if (this.check('ABILITY')) {
          composition.abilities.push(this.parseAbility());
        } else if (this.check('DIALOGUE')) {
          composition.dialogues.push(this.parseDialogue());
        } else if (this.check('STATE_MACHINE')) {
          composition.stateMachines.push(this.parseStateMachine());
        } else if (this.check('ACHIEVEMENT')) {
          composition.achievements.push(this.parseAchievement());
        } else if (this.check('TALENT_TREE')) {
          composition.talentTrees.push(this.parseTalentTree());
        } else if (this.check('AT')) {
          // Handle @state, @world, and other decorators at composition level
          this.advance(); // consume @
          const decoratorName = this.current().value.toLowerCase();
          this.advance(); // consume decorator name

          if (decoratorName === 'state') {
            composition.state = this.parseStateBody();
          } else if (decoratorName === 'world' || decoratorName === 'environment') {
            composition.environment = this.parseEnvironmentBody();
          } else {
            // Skip unknown decorator arguments and optional block body
            if (this.check('LPAREN')) {
              this.skipParens();
            }
            if (this.check('LBRACE')) {
              this.skipBlock();
            }
          }
        } else if (this.check('ACTION') || this.check('ASYNC')) {
          // action / async action at composition level — skip entirely
          if (this.check('ASYNC')) this.advance();
          this.advance(); // consume ACTION
          if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // optional name
          if (this.check('LPAREN')) this.skipParens();
          if (this.check('LBRACE')) this.skipBlock();
        } else if (this.check('USING')) {
          // using "path/to/module" [as Name] at composition level
          this.advance(); // consume USING
          if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // path or name
          if (this.check('IDENTIFIER') && this.current().value === 'as') {
            this.advance(); // as
            if (this.check('IDENTIFIER')) this.advance(); // alias
          }
        } else if (this.check('COLON')) {
          // Stray colon at composition level (e.g. from @anchored_to: "value")
          this.advance(); // skip colon
          if (!this.check('RBRACE') && !this.isAtEnd()) this.parseValue();
        } else if (this.check('IDENTIFIER')) {
          // Generic IDENTIFIER handler for DSL-level blocks:
          // config { }, anchor "name" { }, activity "name" { }, module "name" { },
          // permissions: [...], panel "HUD" { }, networked { }, gesture "pinch" { }, etc.
          this.advance(); // consume IDENTIFIER
          if (this.check('COLON')) {
            // identifier: value — property at composition level
            this.advance(); // consume :
            if (!this.check('RBRACE') && !this.isAtEnd()) this.parseValue();
          } else {
            // identifier [optional-name] [(params)] [{ block }]
            if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // optional quoted/bare name
            if (this.check('LPAREN')) this.skipParens();
            if (this.check('LBRACE')) this.skipBlock();
          }
        } else {
          let suggestion: string | undefined;

          // Check if this unexpected identifier is a typo of a keyword
          if (this.current().type === 'IDENTIFIER' && this.current().value) {
            const allKeywords = Object.keys(KEYWORDS);
            const match = TypoDetector.findClosestMatch(this.current().value, allKeywords);
            if (match) {
              suggestion = `Did you mean the keyword \`${match}\`?`;
            }
          }

          this.error(`Unexpected token: ${this.current().type}`, suggestion);
          this.advance();
        }
        this.skipNewlines();
      } catch (err) {
        if (!this.options.tolerant) throw err;
        this.recoverToNextStatement();
      }
    }

    this.expect('RBRACE');
    this.popContext();
    return composition;
  }

  // ===========================================================================
  // IMPORT
  // ===========================================================================

  private parseImport(): HoloImport {
    this.expect('IMPORT');
    this.expect('LBRACE');
    this.skipNewlines();

    const specifiers: HoloImportSpecifier[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      const imported = this.expectIdentifier();
      let local: string | undefined;
      if (this.match('IDENTIFIER') && this.previous().value === 'as') {
        local = this.expectIdentifier();
      }
      specifiers.push({ type: 'ImportSpecifier', imported, local });
      if (!this.match('COMMA')) break;
      this.skipNewlines();
    }
    this.skipNewlines();
    this.expect('RBRACE');
    this.expect('FROM');
    const source = this.expectString();

    return { type: 'Import', specifiers, source };
  }

  // ===========================================================================
  // USING (alias for import)
  // ===========================================================================

  private parseUsingStatement(): HoloImport | null {
    this.expect('USING');

    // using "path/to/module" syntax
    if (this.check('STRING')) {
      const source = this.expectString();
      return { type: 'Import', specifiers: [], source };
    }

    // using { Name } from "path" syntax (similar to import)
    if (this.check('LBRACE')) {
      this.expect('LBRACE');
      this.skipNewlines();

      const specifiers: HoloImportSpecifier[] = [];
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        const imported = this.expectIdentifier();
        let local: string | undefined;
        if (this.match('IDENTIFIER') && this.previous().value === 'as') {
          local = this.expectIdentifier();
        }
        specifiers.push({ type: 'ImportSpecifier', imported, local });
        if (!this.match('COMMA')) break;
        this.skipNewlines();
      }
      this.skipNewlines();
      this.expect('RBRACE');
      this.expect('FROM');
      const source = this.expectString();

      return { type: 'Import', specifiers, source };
    }

    // Fallback: just skip unknown using syntax
    this.skipBlock();
    return null;
  }

  // ===========================================================================
  // ENVIRONMENT
  // ===========================================================================

  private parseEnvironment(): HoloEnvironment {
    this.expect('ENVIRONMENT');
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloEnvironmentProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('PARTICLE_SYSTEM')) {
        const ps = this.parseParticleSystem();
        properties.push({
          type: 'EnvironmentProperty',
          key: ps.name,
          value: ps as any,
        });
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        properties.push({ type: 'EnvironmentProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Environment', properties };
  }

  private parseParticleSystem(): HoloParticleSystem {
    this.expect('PARTICLE_SYSTEM');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      properties[key] = this.parseValue();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'ParticleSystem', name, properties };
  }

  // ===========================================================================
  // LIGHT (first-class block)
  // ===========================================================================

  private parseLight(): HoloLight {
    this.expect('LIGHT');
    const name = this.expectString();

    // Determine light type — either from explicit type property or the name
    let lightType: HoloLight['lightType'] = 'directional';
    const lightTypeNames: Record<string, HoloLight['lightType']> = {
      directional: 'directional',
      point: 'point',
      spot: 'spot',
      hemisphere: 'hemisphere',
      ambient: 'ambient',
      area: 'area',
    };

    // Check for inline type: light "sun" directional { ... }
    if (this.check('IDENTIFIER')) {
      const typeName = this.current().value.toLowerCase();
      if (lightTypeNames[typeName]) {
        lightType = lightTypeNames[typeName]!;
        this.advance();
      }
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloLightProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();

      // Override light type if declared as property
      if (key === 'type' && typeof value === 'string' && lightTypeNames[value]) {
        lightType = lightTypeNames[value]!;
      } else {
        properties.push({ type: 'LightProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Light', name, lightType, properties };
  }

  // ===========================================================================
  // EFFECTS (post-processing block)
  // ===========================================================================

  private parseEffects(): HoloEffects {
    this.expect('EFFECTS');
    this.expect('LBRACE');
    this.skipNewlines();

    const effects: HoloEffect[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const effectType = this.expectIdentifier();
      this.expect('LBRACE');
      this.skipNewlines();

      const properties: Record<string, HoloValue> = {};
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;
        const key = this.expectIdentifier();
        this.expect('COLON');
        properties[key] = this.parseValue();
        this.skipNewlines();
      }
      this.expect('RBRACE');

      effects.push({ type: 'Effect', effectType, properties });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Effects', effects };
  }

  // ===========================================================================
  // CAMERA
  // ===========================================================================

  private parseCamera(): HoloCamera {
    this.expect('CAMERA');

    let cameraType: HoloCamera['cameraType'] = 'perspective';
    const cameraTypes: Record<string, HoloCamera['cameraType']> = {
      perspective: 'perspective',
      orthographic: 'orthographic',
      cinematic: 'cinematic',
    };

    // Inline type: camera perspective { ... }
    if (this.check('IDENTIFIER')) {
      const typeName = this.current().value.toLowerCase();
      if (cameraTypes[typeName]) {
        cameraType = cameraTypes[typeName]!;
        this.advance();
      }
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloCameraProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();

      if (key === 'type' && typeof value === 'string' && cameraTypes[value]) {
        cameraType = cameraTypes[value]!;
      } else {
        properties.push({ type: 'CameraProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Camera', cameraType, properties };
  }

  // ===========================================================================
  // TIMELINE
  // ===========================================================================

  private parseTimeline(): HoloTimeline {
    this.expect('TIMELINE');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const entries: HoloTimelineEntry[] = [];
    let autoplay: boolean | undefined;
    let loop: boolean | undefined;

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      // Check for timeline properties (autoplay, loop) vs entries (number: ...)
      if (
        this.check('IDENTIFIER') &&
        (this.current().value === 'autoplay' || this.current().value === 'loop')
      ) {
        const key = this.advance().value;
        this.expect('COLON');
        const val = this.parseValue();
        if (key === 'autoplay') autoplay = val as boolean;
        if (key === 'loop') loop = val as boolean;
      } else if (this.check('NUMBER')) {
        const time = parseFloat(this.advance().value);
        this.expect('COLON');

        // Parse action: animate "target" { ... }, emit "event", or call method(...)
        const action = this.parseTimelineAction();
        entries.push({ type: 'TimelineEntry', time, action });
      } else {
        this.error(`Unexpected token in timeline: ${this.current().type}`);
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Timeline', name, autoplay, loop, entries };
  }

  private parseTimelineAction(): HoloTimelineAction {
    if (this.check('ANIMATE')) {
      this.advance();
      const target = this.expectString();
      this.expect('LBRACE');
      this.skipNewlines();
      const properties: Record<string, HoloValue> = {};
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;
        const key = this.expectIdentifier();
        this.expect('COLON');
        properties[key] = this.parseValue();
        this.skipNewlines();
      }
      this.expect('RBRACE');
      return { kind: 'animate', target, properties };
    }

    if (this.check('EMIT')) {
      this.advance();
      const event = this.expectString();
      let data: HoloValue | undefined;
      if (this.check('LBRACE') || this.check('STRING') || this.check('NUMBER')) {
        data = this.parseValue();
      }
      return { kind: 'emit', event, data };
    }

    // Default: treat as a method call — identifier(args)
    const method = this.expectIdentifier();
    let args: HoloValue[] | undefined;
    if (this.check('LPAREN')) {
      this.advance();
      args = [];
      while (!this.check('RPAREN') && !this.isAtEnd()) {
        this.skipNewlines();
        args.push(this.parseValue());
        if (!this.match('COMMA')) break;
        this.skipNewlines();
      }
      this.expect('RPAREN');
    }
    return { kind: 'call', method, args };
  }

  // ===========================================================================
  // AUDIO
  // ===========================================================================

  private parseAudio(): HoloAudio {
    this.expect('AUDIO');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloAudioProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('AT')) {
        // @trait annotations inside audio block (e.g., @spatial_audio)
        this.advance(); // consume @
        if (!this.isAtEnd()) this.advance(); // trait name
        if (this.check('LPAREN')) this.skipParens();
        else if (this.check('LBRACE')) this.skipBlock();
        this.skipNewlines();
        continue;
      }

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'AudioProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Audio', name, properties };
  }

  // ===========================================================================
  // ZONE (trigger/interaction volume)
  // ===========================================================================

  private parseZone(): HoloZone {
    this.expect('ZONE');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloZoneProperty[] = [];
    const handlers: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      // Check for event handlers (on_enter, on_exit, on_stay)
      if (this.check('IDENTIFIER') && this.current().value.startsWith('on_')) {
        const event = this.advance().value;
        let parameters: HoloParameter[] = [];
        if (this.check('LPAREN')) {
          parameters = this.parseParameterList();
        }
        this.expect('LBRACE');
        this.skipNewlines();
        const body = this.parseStatementBlock();
        this.expect('RBRACE');
        handlers.push({ type: 'EventHandler', event, parameters, body } as HoloEventHandler);
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        properties.push({ type: 'ZoneProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Zone', name, properties, handlers };
  }

  // ===========================================================================
  // UI (HUD overlay)
  // ===========================================================================

  private parseUI(): HoloUI {
    this.expect('UI');
    this.expect('LBRACE');
    this.skipNewlines();

    const elements: HoloUIElement[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('ELEMENT')) {
        elements.push(this.parseUIElement());
      } else {
        this.error(`Expected 'element' in ui block, got ${this.current().type}`);
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'UI', elements };
  }

  private parseUIElement(): HoloUIElement {
    this.expect('ELEMENT');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloUIProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'UIProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'UIElement', name, properties };
  }

  // ===========================================================================
  // TRANSITION
  // ===========================================================================

  private parseTransition(): HoloTransition {
    this.expect('TRANSITION');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloTransitionProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'TransitionProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Transition', name, properties };
  }

  // ===========================================================================
  // CONDITIONAL BLOCK (scene-level if/else)
  // ===========================================================================

  private parseConditionalBlock(): HoloConditionalBlock {
    this.expect('IF');

    // Parse condition as an expression, then convert to string
    const condExpr = this.parseExpression();
    const condition = this.expressionToString(condExpr);

    this.expect('LBRACE');
    this.skipNewlines();

    const objects: HoloObjectDecl[] = [];
    const spatialGroups: HoloSpatialGroup[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('OBJECT')) {
        objects.push(this.parseObject());
      } else if (this.check('SPATIAL_GROUP')) {
        spatialGroups.push(this.parseSpatialGroup());
      } else {
        this.error(
          `Expected object or spatial_group in conditional block, got ${this.current().type}`
        );
        this.advance();
      }
      this.skipNewlines();
    }
    this.expect('RBRACE');

    let elseObjects: HoloObjectDecl[] | undefined;
    let elseSpatialGroups: HoloSpatialGroup[] | undefined;

    this.skipNewlines();
    if (this.match('ELSE')) {
      this.expect('LBRACE');
      this.skipNewlines();
      elseObjects = [];
      elseSpatialGroups = [];

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        if (this.check('OBJECT')) {
          elseObjects.push(this.parseObject());
        } else if (this.check('SPATIAL_GROUP')) {
          elseSpatialGroups.push(this.parseSpatialGroup());
        } else {
          this.error(`Expected object or spatial_group in else block, got ${this.current().type}`);
          this.advance();
        }
        this.skipNewlines();
      }
      this.expect('RBRACE');
    }

    return {
      type: 'ConditionalBlock',
      condition,
      objects,
      spatialGroups: spatialGroups.length > 0 ? spatialGroups : undefined,
      elseObjects,
      elseSpatialGroups:
        elseSpatialGroups && elseSpatialGroups.length > 0 ? elseSpatialGroups : undefined,
    };
  }

  // ===========================================================================
  // FOR-EACH BLOCK (scene-level iteration)
  // ===========================================================================

  private parseForEachBlock(): HoloForEachBlock {
    this.expect('FOR');
    const variable = this.expectIdentifier();
    this.expect('IN');

    // Parse iterable as expression, convert to string
    const iterExpr = this.parseExpression();
    const iterable = this.expressionToString(iterExpr);

    this.expect('LBRACE');
    this.skipNewlines();

    const objects: HoloObjectDecl[] = [];
    const spatialGroups: HoloSpatialGroup[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('OBJECT')) {
        objects.push(this.parseObject());
      } else if (this.check('SPATIAL_GROUP')) {
        spatialGroups.push(this.parseSpatialGroup());
      } else {
        this.error(
          `Expected object or spatial_group in for-each block, got ${this.current().type}`
        );
        this.advance();
      }
      this.skipNewlines();
    }
    this.expect('RBRACE');

    return {
      type: 'ForEachBlock',
      variable,
      iterable,
      objects,
      spatialGroups: spatialGroups.length > 0 ? spatialGroups : undefined,
    };
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  private parseState(): HoloState {
    this.expect('STATE');
    // Support optional name: state TrainingState { } or state "MyState" { }
    if (this.check('IDENTIFIER') || this.check('STRING')) this.advance();
    return this.parseStateBody();
  }

  /**
   * Parse state body (after @state decorator or 'state' keyword)
   */
  private parseStateBody(): HoloState {
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloStateProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'StateProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'State', properties };
  }

  // ===========================================================================
  // TEMPLATE
  // ===========================================================================

  private parseTemplate(): HoloTemplate {
    this.expect('TEMPLATE');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const template: HoloTemplate = {
      type: 'Template',
      name,
      properties: [],
      actions: [],
      traits: [],
      directives: [], // Initialize directives
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('STATE')) {
        template.state = this.parseState();
      } else if (this.check('ACTION') || this.check('ASYNC')) {
        const action = this.parseAction();
        template.actions.push(action);
        (template as any).directives.push({
          type: 'method',
          name: action.name,
          parameters: action.parameters || [],
          body: action.body,
          async: action.async,
        });
      } else if (this.check('AT')) {
        // @trait support in templates
        this.advance(); // consume @
        const traitName = this.isAtEnd() ? '' : this.advance().value; // accept any token as trait name (e.g., @ui_panel)

        if (traitName === 'version') {
          // @version(N) — set template schema version for hot-reload
          this.expect('LPAREN');
          const versionToken = this.advance();
          if (versionToken.type !== 'NUMBER') {
            this.error(`Expected version number, got ${versionToken.type}`);
          }
          template.version = Number(versionToken.value);
          this.expect('RPAREN');
        } else {
          let config: Record<string, HoloValue> = {};
          if (this.check('LPAREN')) {
            config = this.parseTraitConfig();
          } else if (this.check('LBRACE')) {
            this.skipBlock(); // @trait { key: value } block-style config — skip it
          }
          template.traits.push({ type: 'ObjectTrait', name: traitName, config } as HoloObjectTrait);
          // Also add traits as directives for compatibility
          (template as any).directives!.push({ type: 'trait', name: traitName, config });
        }
      } else if (this.check('MIGRATE')) {
        // migrate from(N) { ... } — schema migration block for hot-reload
        this.advance(); // consume 'migrate'
        this.expect('FROM');
        this.expect('LPAREN');
        const fromToken = this.advance();
        if (fromToken.type !== 'NUMBER') {
          this.error(`Expected version number in migrate from(), got ${fromToken.type}`);
        }
        const fromVersion = Number(fromToken.value);
        this.expect('RPAREN');
        this.expect('LBRACE');
        const migrationBody = this.parseStatementBlock();
        this.expect('RBRACE');

        if (!template.migrations) template.migrations = [];
        template.migrations.push({
          type: 'Migration',
          fromVersion,
          body: migrationBody,
        });
      } else if (
        this.check('IDENTIFIER') &&
        this.current().value === 'on' &&
        this.peek(1).type === 'IDENTIFIER'
      ) {
        const eventName = this.peek(1).value;

        // Handle on event(...) { } syntax, including dot-notation: on msg.type(params) { }
        this.advance(); // consume 'on'
        this.advance(); // consume event name

        // Handle dot-notation event names: on consensus.commit(op) { } or on msg.type.sub(p) { }
        while (this.check('DOT')) {
          this.advance(); // consume '.'
          if (this.check('IDENTIFIER')) this.advance(); // consume sub-name
        }

        let parameters: any[] = [];
        if (this.check('LPAREN')) {
          parameters = this.parseParameterList();
        }

        // Use skipBlock() to safely skip handler body — may contain arrows, dot-chains, etc.
        this.skipBlock();

        // Add as lifecycle directive
        (template as any).directives!.push({
          type: 'lifecycle',
          hook: eventName,
          parameters,
          body: [],
        });
      } else if (
        this.isPropertyName() &&
        this.peek(1).type === 'LPAREN'
      ) {
        // method_name() { ... } — event handler / lifecycle method in template body
        const methodName = this.expectIdentifier();
        this.skipParens(); // skip parameter list
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip body — too diverse (arrow fns, GDScript, etc.)
          (template as any).directives!.push({
            type: 'method',
            name: methodName,
            parameters: [],
            body: [],
          });
        }
      } else if (
        this.isPropertyName() &&
        (this.peek(1).type === 'IDENTIFIER' || this.peek(1).type === 'STRING')
      ) {
        // animation idle_float { } or animation "spin" { } — labeled block
        const blockType = this.expectIdentifier(); // e.g., "animation"
        const blockName = this.check('STRING') ? this.advance().value : this.expectIdentifier();
        if (this.check('LPAREN')) {
          this.skipParens();
        }
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip HoloScript property block (not code statements)
          (template as any).directives!.push({ type: blockType, name: blockName, parameters: [], body: [] });
        }
      } else if (
        this.isPropertyName() &&
        this.peek(1).type === 'LBRACE'
      ) {
        // audio { } or unknown_block { } — bare block with no name
        const blockType = this.expectIdentifier();
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip HoloScript property block (not code statements)
          (template as any).directives!.push({ type: blockType, name: '', parameters: [], body: [] });
        }
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        template.properties.push({ type: 'TemplateProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return template;
  }

  // ===========================================================================
  // OBJECT
  // ===========================================================================

  private parseObject(typeOverride?: string): HoloObjectDecl {
    if (!typeOverride) {
      this.expect('OBJECT');
    } else {
      this.advance(); // consume the type keyword (spatial_agent, etc.)
    }
    let name = '';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.check('IDENTIFIER')) {
      name = this.expectIdentifier();
    } else if (typeOverride === 'behavior' && this.check('LBRACE')) {
      name = 'behavior'; // anonymous block name
    } else {
      this.error(`Expected string or identifier for object name, got ${this.current().type}`);
      name = 'unknown';
    }
    let template: string | undefined;

    if (this.check('USING')) {
      this.advance();
      template = this.expectString();
    }

    // Parse traits BEFORE the brace: object "name" @trait1 @trait2 { ... }
    const traits: HoloObjectTrait[] = [];
    while (this.check('AT')) {
      this.advance(); // consume @
      const traitName = this.isAtEnd() ? '' : this.advance().value; // accept any token as trait name
      let config: Record<string, HoloValue> = {};
      if (this.check('LPAREN')) {
        config = this.parseTraitConfig();
      }
      traits.push({ type: 'ObjectTrait', name: traitName, config } as any);
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloObjectProperty[] = [];
    const children: HoloObjectDecl[] = [];
    const subOrbs: HoloSubOrb[] = [];
    const directives: any[] = [];
    let state: HoloState | undefined;

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (
        this.check('OBJECT') ||
        this.check('SPATIAL_AGENT') ||
        this.check('TOOL_SLOT') ||
        this.check('BEHAVIOR') ||
        this.current().type.startsWith('UI_')
      ) {
        const nestedType = this.check('OBJECT') ? undefined : this.current().value.toLowerCase();
        children.push(this.parseObject(nestedType));
      } else if (this.check('SUB_ORB')) {
        subOrbs.push(this.parseSubOrb());
      } else if (this.check('ACTION') || this.check('ASYNC')) {
        const action = this.parseAction();
        directives.push({
          type: 'method',
          name: action.name,
          parameters: action.parameters || [],
          body: action.body,
          async: action.async,
        });
      } else if (
        this.check('IDENTIFIER') &&
        this.current().value === 'on' &&
        this.peek(1).type === 'IDENTIFIER'
      ) {
        const eventName = this.peek(1).value;
        this.advance(); // consume 'on'
        this.advance(); // consume event name

        // Handle dot-notation event names: on msg.type(params) { }
        while (this.check('DOT')) {
          this.advance(); // consume '.'
          if (this.check('IDENTIFIER')) this.advance(); // consume sub-name
        }

        let parameters: any[] = [];
        if (this.check('LPAREN')) {
          parameters = this.parseParameterList();
        }

        // Use skipBlock() to safely skip handler body — may contain arrows, dot-chains, etc.
        this.skipBlock();

        directives.push({
          type: 'lifecycle',
          hook: eventName,
          parameters,
          body: [],
        });
      } else if (this.check('AT')) {
        this.advance(); // consume @
        const traitName = this.isAtEnd() ? '' : this.advance().value; // accept any token as trait name
        let config: Record<string, HoloValue> = {};
        if (this.check('LPAREN')) {
          config = this.parseTraitConfig();
        } else if (this.check('LBRACE')) {
          this.skipBlock(); // @trait { key: value } block-style config — skip it
        }
        const trait = { type: 'ObjectTrait', name: traitName, config } as any;
        traits.push(trait);
        directives.push({ type: 'trait', name: traitName, config });
      } else if (this.check('STATE')) {
        // Handle state block in object
        state = this.parseState();
      } else if (this.isPropertyName()) {
        // Handle identifier or keyword as property name
        const key = this.advance().value;
        if (this.check('COLON')) {
          this.advance();
          if (this.check('LBRACE')) {
            // Check if it's a statement block or object value
            // For now, if it starts with 'on_', treat as statement block
            if (key.startsWith('on_')) {
              this.advance();
              const body = this.parseStatementBlock();
              this.expect('RBRACE');
              properties.push({ type: 'ObjectProperty', key, value: body as any });
            } else {
              properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
            }
          } else {
            properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
          }
        } else if (this.check('LPAREN')) {
          // Event handler style: on_event(params) { ... }
          const parameters = this.parseParameterList();
          this.expect('LBRACE');
          const body = this.parseStatementBlock();
          this.expect('RBRACE');
          properties.push({
            type: 'ObjectProperty',
            key,
            value: { type: 'EventHandler', parameters, body } as any,
          });
        } else if (this.check('EQUALS')) {
          // Common mistake: using = instead of : for property assignment
          this.error(
            `Use ':' instead of '=' for property definitions`,
            `Use ':' instead of '=' for property definitions. Change '${key} = value' to '${key}: value'`
          );
          this.advance(); // skip the =
          properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
        } else if (this.check('STRING')) {
          // Named sub-block: gesture "pinch" { }, text "ModuleTitle" { }, animation "walk" { }
          const blockName = this.advance().value; // consume quoted name
          if (this.check('LPAREN')) this.skipParens();
          if (this.check('LBRACE')) this.skipBlock();
          directives.push({ type: key, name: blockName, parameters: [], body: '' } as any);
        } else {
          // Bare identifier (like a trait without @)
          properties.push({ type: 'ObjectProperty', key, value: true });
        }
      } else if (this.isPropertyName() && this.peek(1).type === 'STRING') {
        // animation "name" { } — labeled block with quoted string name in object body
        const blockType = this.advance().value; // e.g., "animation"
        const blockName = this.advance().value; // e.g., "spin"
        if (this.check('LPAREN')) {
          this.skipParens();
        }
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip HoloScript property block (not code statements)
        }
        directives.push({ type: blockType, name: blockName, parameters: [], body: '' });
      } else if (this.check('COLON')) {
        // Stray colon (e.g., from @anchored_to: "value" where the : isn't consumed)
        this.advance(); // skip colon
        if (!this.check('RBRACE') && !this.check('EOF')) {
          this.parseValue(); // consume the value
        }
      } else {
        // Skip unknown tokens silently to prevent infinite loop
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    const obj: HoloObjectDecl = {
      type: 'Object',
      name,
      template,
      properties,
      state,
      traits, // Added traits property
      directives, // Added directives
      children: children.length > 0 ? children : undefined,
      subOrbs: subOrbs.length > 0 ? subOrbs : undefined,
    };

    if (typeOverride) {
      obj.properties.unshift({ type: 'ObjectProperty', key: 'type', value: typeOverride });
    }

    return obj;
  }

  private parseSpatialObject(type: string): HoloObjectDecl {
    return this.parseObject(type);
  }

  // ===========================================================================
  // SPATIAL GROUP
  // ===========================================================================

  private parseSpatialGroup(): HoloSpatialGroup {
    this.expect('SPATIAL_GROUP');
    let name = '';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.check('IDENTIFIER')) {
      name = this.expectIdentifier();
    } else {
      this.error(
        `Expected string or identifier for spatial_group name, got ${this.current().type}`
      );
      name = 'unknown';
    }

    const properties: HoloGroupProperty[] = [];

    // Optional "at [x, y, z]" shorthand for position
    if (this.check('IDENTIFIER') && this.current().value === 'at') {
      this.advance(); // consume 'at'
      const position = this.parseValue();
      properties.push({ type: 'GroupProperty', key: 'position', value: position });
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const objects: HoloObjectDecl[] = [];
    const groups: HoloSpatialGroup[] = [];
    const body: HoloStatement[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('OBJECT')) {
        objects.push(this.parseObject());
      } else if (this.check('SPATIAL_GROUP')) {
        groups.push(this.parseSpatialGroup());
      } else if (this.check('TEMPLATE')) {
        // Template defined inside spatial_group — parse and discard
        this.advance(); // consume TEMPLATE
        if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // name
        if (this.check('LBRACE')) this.skipBlock(); // body
      } else if (this.check('ACTION') || this.check('ASYNC')) {
        if (this.check('ASYNC')) this.advance();
        this.advance(); // consume ACTION
        if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // name
        if (this.check('LPAREN')) this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
      } else if (this.check('AT')) {
        this.advance(); // consume @
        if (!this.isAtEnd()) this.advance(); // trait name
        if (this.check('LPAREN')) this.skipParens();
        else if (this.check('LBRACE')) this.skipBlock();
      } else if (this.isStatementKeyword()) {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } else if (this.check('IDENTIFIER') || this.isKeywordAsIdentifierType(this.current().type)) {
        // Peek ahead to see if it's a property assignment or a statement
        const next = this.tokens[this.pos + 1];
        if (next && next.type === 'COLON') {
          // It's a property
          let key: string;
          if (this.check('IDENTIFIER')) {
            key = this.expectIdentifier();
          } else {
            this.isKeywordAsIdentifier(); // Consume the keyword
            key = this.previous().value;
          }
          this.expect('COLON');
          const value = this.parseValue();
          properties.push({ type: 'GroupProperty', key, value });
        } else {
          const stmt = this.parseStatement();
          if (stmt) body.push(stmt);
        }
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        properties.push({ type: 'GroupProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      type: 'SpatialGroup',
      name,
      properties,
      objects,
      groups: groups.length > 0 ? groups : undefined,
      body: body.length > 0 ? body : undefined,
    };
  }

  // ===========================================================================
  // LOGIC
  // ===========================================================================

  private parseLogic(): HoloLogic {
    this.expect('LOGIC');
    this.expect('LBRACE');
    this.skipNewlines();

    const handlers: HoloEventHandler[] = [];
    const actions: HoloAction[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('ACTION') || this.check('ASYNC')) {
        actions.push(this.parseAction());
      } else if (this.check('IDENTIFIER')) {
        const name = this.advance().value;
        // Handle `function name(params) { }` pattern — skip function name if next is IDENTIFIER
        if (this.check('IDENTIFIER')) {
          this.advance(); // consume function name (e.g., `forward_kinematics`)
        }
        if (this.check('LPAREN')) {
          // Normal event handler: on_player_touch(orb) { ... } or function name(params) { }
          this.skipParens();
          if (this.check('LBRACE')) {
            this.skipBlock();
          }
          handlers.push({ type: 'EventHandler', event: name, parameters: [], body: [] } as any);
        } else if (this.check('LBRACE')) {
          // No-parens style: on_enter { ... }
          this.skipBlock();
          handlers.push({ type: 'EventHandler', event: name, parameters: [], body: [] } as any);
        } else {
          this.error(`Unexpected token in logic: ${name}. Next token: ${this.current().type}`);
        }
      } else {
        this.error(`Unexpected token in logic block: ${this.current().type}`);
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'Logic', handlers, actions };
  }

  private parseAction(): HoloAction {
    const isAsync = this.match('ASYNC');
    this.expect('ACTION');
    const name = this.expectIdentifier();
    const parameters = this.parseParameterList();
    if (this.check('LBRACE')) {
      this.skipBlock(); // skip action body — too diverse to parse statement-by-statement
    }
    return { type: 'Action', name, parameters, body: [], async: isAsync };
  }

  private parseParameterList(): HoloParameter[] {
    if (!this.check('LPAREN')) return [];
    this.expect('LPAREN');
    this.skipNewlines();

    const params: HoloParameter[] = [];
    while (!this.check('RPAREN') && !this.isAtEnd()) {
      const name = this.expectIdentifier();
      let paramType: string | undefined;
      if (this.match('COLON')) {
        paramType = this.expectIdentifier();
      }
      params.push({ type: 'Parameter', name, paramType });
      if (!this.match('COMMA')) break;
      this.skipNewlines();
    }

    this.expect('RPAREN');
    return params;
  }

  // ===========================================================================
  // STATEMENTS
  // ===========================================================================

  private parseStatementBlock(): HoloStatement[] {
    const statements: HoloStatement[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      this.skipNewlines();
    }
    return statements;
  }

  private parseStatement(): HoloStatement | null {
    if (this.check('IF')) return this.parseIfStatement();
    if (this.check('FOR')) return this.parseForStatement();
    if (this.check('WHILE')) return this.parseWhileStatement();
    if (this.check('AWAIT')) return this.parseAwaitStatement();
    if (this.check('RETURN')) return this.parseReturnStatement();
    if (this.check('EMIT')) return this.parseEmitStatement();
    if (this.check('ANIMATE')) return this.parseAnimateStatement();
    if (this.check('ON_ERROR')) return this.parseOnErrorStatement();
    if (this.check(['LET', 'VAR', 'CONST'])) return this.parseVariableDeclaration();

    // Assignment or expression
    return this.parseAssignmentOrExpression();
  }

  private parseIfStatement(): HoloStatement {
    this.expect('IF');
    const condition = this.parseExpression();
    this.expect('LBRACE');
    this.skipNewlines();
    const consequent = this.parseStatementBlock();
    this.expect('RBRACE');

    let alternate: HoloStatement[] | undefined;
    this.skipNewlines();
    if (this.match('ELSE')) {
      if (this.check('IF')) {
        alternate = [this.parseIfStatement()];
      } else {
        this.expect('LBRACE');
        this.skipNewlines();
        alternate = this.parseStatementBlock();
        this.expect('RBRACE');
      }
    }

    return { type: 'IfStatement', condition, consequent, alternate };
  }

  private parseWhileStatement(): HoloWhileStatement {
    this.expect('WHILE');
    const condition = this.parseExpression();
    this.expect('LBRACE');
    this.skipNewlines();
    const body = this.parseStatementBlock();
    this.expect('RBRACE');
    return { type: 'WhileStatement', condition, body };
  }

  private parseForStatement(): HoloStatement {
    this.expect('FOR');

    // Check for classic for (init; test; update)
    if (this.match('LPAREN')) {
      return this.parseClassicForStatement();
    }

    const variable = this.expectIdentifier();
    this.expect('IN');
    const iterable = this.parseExpression();
    this.expect('LBRACE');
    this.skipNewlines();
    const body = this.parseStatementBlock();
    this.expect('RBRACE');

    return { type: 'ForStatement', variable, iterable, body };
  }

  private parseClassicForStatement(): HoloStatement {
    // Already consumed 'FOR' and '('
    let init: HoloStatement | undefined;
    if (this.check(['LET', 'VAR', 'CONST'])) {
      init = this.parseVariableDeclaration();
    } else if (!this.check('SEMICOLON')) {
      init = this.parseAssignmentOrExpression();
    }
    this.expect('SEMICOLON');

    let test: HoloExpression | undefined;
    if (!this.check('SEMICOLON')) {
      test = this.parseExpression();
    }
    this.expect('SEMICOLON');

    let update: HoloStatement | undefined;
    if (!this.check('RPAREN')) {
      update = this.parseAssignmentOrExpression();
    }
    this.expect('RPAREN');

    this.expect('LBRACE');
    this.skipNewlines();
    const body = this.parseStatementBlock();
    this.expect('RBRACE');

    return { type: 'ClassicForStatement', init, test, update, body };
  }

  private parseVariableDeclaration(): HoloVariableDeclaration {
    const kind = this.advance().value as 'let' | 'var' | 'const';
    const name = this.expectIdentifier();
    let value: HoloExpression | undefined;
    if (this.match('EQUALS')) {
      value = this.parseExpression();
    }
    return { type: 'VariableDeclaration', kind, name, value };
  }

  private parseAwaitStatement(): HoloStatement {
    this.expect('AWAIT');
    const expression = this.parseExpression();
    return { type: 'AwaitStatement', expression };
  }

  private parseReturnStatement(): HoloStatement {
    this.expect('RETURN');
    let value: HoloExpression | undefined;
    if (!this.check('NEWLINE') && !this.check('RBRACE')) {
      value = this.parseExpression();
    }
    return { type: 'ReturnStatement', value };
  }

  private parseEmitStatement(): HoloStatement {
    this.expect('EMIT');
    const event = this.expectString();
    let data: HoloExpression | undefined;
    if (this.check('LBRACE') || this.check('IDENTIFIER')) {
      data = this.parseExpression();
    }
    return { type: 'EmitStatement', event, data };
  }

  private parseAnimateStatement(): HoloStatement {
    this.expect('ANIMATE');
    const target = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      properties[key] = this.parseValue();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'AnimateStatement', target, properties };
  }

  private parseOnErrorStatement(): HoloOnErrorStatement {
    this.expect('ON_ERROR');
    this.expect('LBRACE');
    this.skipNewlines();
    const body = this.parseStatementBlock();
    this.expect('RBRACE');
    return { type: 'OnErrorStatement', body };
  }

  private parseAssignmentOrExpression(): HoloStatement {
    const expr = this.parseExpression();

    // Check for assignment operators
    if (
      this.check('EQUALS') ||
      this.check('PLUS_EQUALS') ||
      this.check('MINUS_EQUALS') ||
      this.check('STAR_EQUALS') ||
      this.check('SLASH_EQUALS')
    ) {
      const op = this.advance().value as '=' | '+=' | '-=' | '*=' | '/=';
      const value = this.parseExpression();
      const target = this.expressionToString(expr);
      return { type: 'Assignment', target, operator: op, value };
    }

    return { type: 'ExpressionStatement', expression: expr };
  }

  private expressionToString(expr: HoloExpression): string {
    if (expr.type === 'Identifier') return expr.name;
    if (expr.type === 'MemberExpression') {
      return `${this.expressionToString(expr.object)}.${expr.property}`;
    }
    return '';
  }

  /**
   * Parse a sub-orb block: sub_orb "name" { source: "holohub://..." }
   */
  private parseSubOrb(): HoloSubOrb {
    this.expect('SUB_ORB');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    let source = '';
    const properties: HoloObjectProperty[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();

      if (key === 'source' && typeof value === 'string') {
        source = value;
      } else {
        properties.push({ type: 'ObjectProperty', key, value: value as any });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return { type: 'SubOrb', name, source, properties };
  }

  // ===========================================================================
  // EXPRESSIONS
  // ===========================================================================

  private parseExpression(): HoloExpression {
    return this.parseConditional();
  }

  private parseConditional(): HoloExpression {
    const expr = this.parseOr();

    if (this.match('QUESTION')) {
      const consequent = this.parseExpression();
      this.expect('COLON');
      const alternate = this.parseConditional();
      return { type: 'ConditionalExpression', test: expr, consequent, alternate };
    }

    return expr;
  }

  private parseOr(): HoloExpression {
    let left = this.parseAnd();
    while (this.match('OR')) {
      const right = this.parseAnd();
      left = { type: 'BinaryExpression', operator: '||', left, right };
    }
    return left;
  }

  private parseAnd(): HoloExpression {
    let left = this.parseEquality();
    while (this.match('AND')) {
      const right = this.parseEquality();
      left = { type: 'BinaryExpression', operator: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): HoloExpression {
    let left = this.parseComparison();
    while (this.check('EQUALS_EQUALS') || this.check('BANG_EQUALS')) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }
    return left;
  }

  private parseComparison(): HoloExpression {
    let left = this.parseAdditive();
    while (
      this.check('LESS') ||
      this.check('GREATER') ||
      this.check('LESS_EQUALS') ||
      this.check('GREATER_EQUALS')
    ) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }
    return left;
  }

  private parseAdditive(): HoloExpression {
    let left = this.parseMultiplicative();
    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): HoloExpression {
    let left = this.parseUnary();
    while (this.check('STAR') || this.check('SLASH')) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }
    return left;
  }

  private parseUnary(): HoloExpression {
    if (this.check('BANG') || this.check('MINUS')) {
      const op = this.advance().value as '!' | '-';
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator: op, argument };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): HoloExpression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match('DOT')) {
        const property = this.expectIdentifier();
        expr = { type: 'MemberExpression', object: expr, property, computed: false };
      } else if (this.match('LBRACKET')) {
        const index = this.parseExpression();
        this.expect('RBRACKET');
        const property = this.expressionToString(index);
        expr = { type: 'MemberExpression', object: expr, property, computed: true };
      } else if (this.match('LPAREN')) {
        const args = this.parseArgumentList();
        expr = { type: 'CallExpression', callee: expr, arguments: args };
      } else if (this.match('INC')) {
        expr = { type: 'UpdateExpression', operator: '++', argument: expr, prefix: false } as any;
      } else if (this.match('DEC')) {
        expr = { type: 'UpdateExpression', operator: '--', argument: expr, prefix: false } as any;
      } else {
        break;
      }
    }

    return expr;
  }

  private parseArgumentList(): HoloExpression[] {
    this.skipNewlines();
    const args: HoloExpression[] = [];
    if (this.check('RPAREN')) {
      this.expect('RPAREN');
      return args;
    }

    args.push(this.parseExpression());
    while (this.match('COMMA')) {
      this.skipNewlines();
      args.push(this.parseExpression());
    }
    this.skipNewlines();
    this.expect('RPAREN');
    return args;
  }

  private parsePrimary(): HoloExpression {
    if (this.match('NUMBER')) {
      return { type: 'Literal', value: parseFloat(this.previous().value) };
    }
    if (this.match('STRING')) {
      return { type: 'Literal', value: this.previous().value };
    }
    if (this.match('BOOLEAN')) {
      return { type: 'Literal', value: this.previous().value === 'true' };
    }
    if (this.match('NULL')) {
      return { type: 'Literal', value: null };
    }

    // Explicitly handle Identifier
    if (this.match('IDENTIFIER')) {
      return { type: 'Identifier', name: this.previous().value };
    }

    // Handle Keywords as Identifiers
    if (this.isKeywordAsIdentifier()) {
      return { type: 'Identifier', name: this.previous().value };
    }

    if (this.match('LBRACKET')) {
      return this.parseArrayExpression();
    }
    if (this.match('LBRACE')) {
      return this.parseObjectExpression();
    }
    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }

    this.error(`Unexpected token: ${this.current().type}`);
    this.advance();
    return { type: 'Literal', value: null };
  }

  private isKeywordAsIdentifierType(type: TokenType): boolean {
    const keywordsAsIdentifiers: TokenType[] = [
      'STATE',
      'OBJECT',
      'TEMPLATE',
      'ENVIRONMENT',
      'LOGIC',
      'ACTION',
      'EMIT',
      'ANIMATE',
      'RETURN',
      'LIGHT',
      'EFFECTS',
      'CAMERA',
      'BIND',
      'TIMELINE',
      'AUDIO',
      'ZONE',
      'UI',
      'TRANSITION',
      'ELEMENT',
      'ON_ERROR',
    ];
    return keywordsAsIdentifiers.includes(type);
  }

  private isKeywordAsIdentifier(): boolean {
    if (this.isKeywordAsIdentifierType(this.current().type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private parseArrayExpression(): HoloExpression {
    this.skipNewlines();
    const elements: HoloExpression[] = [];
    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      elements.push(this.parseExpression());
      this.skipNewlines();
      if (!this.match('COMMA')) break;
      this.skipNewlines();
    }
    this.skipNewlines();
    this.expect('RBRACKET');
    return { type: 'ArrayExpression', elements };
  }

  private parseObjectExpression(): HoloExpression {
    this.skipNewlines();
    const properties: { key: string; value: HoloExpression }[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseExpression();
      properties.push({ key, value });
      this.skipNewlines();
      if (!this.match('COMMA')) break;
      this.skipNewlines();
    }
    this.skipNewlines();
    this.expect('RBRACE');
    return { type: 'ObjectExpression', properties };
  }

  // ===========================================================================
  // VALUES
  // ===========================================================================

  private parseValue(): HoloValue {
    // Handle negative numbers
    if (this.match('MINUS')) {
      if (this.match('NUMBER')) {
        return -parseFloat(this.previous().value);
      }
      this.error('Expected number after minus sign');
      return 0;
    }
    if (this.match('NUMBER')) {
      return parseFloat(this.previous().value);
    }
    if (this.match('STRING')) {
      return this.previous().value;
    }
    if (this.match('BOOLEAN')) {
      return this.previous().value === 'true';
    }
    if (this.match('NULL')) {
      return null;
    }
    // bind() reactive expression: bind(state.score) or bind(state.score, "formatPercent")
    if (this.check('BIND')) {
      return this.parseBindValue();
    }
    if (this.match('IDENTIFIER')) {
      return this.previous().value;
    }
    if (this.match('LBRACKET')) {
      return this.parseArrayValue();
    }
    if (this.match('LBRACE')) {
      return this.parseObjectValue();
    }

    this.error(`Expected value, got ${this.current().type}`);
    this.advance(); // CRITICAL: Advance to prevent infinite loop
    return null;
  }

  private parseBindValue(): HoloBindValue {
    this.expect('BIND');
    this.expect('LPAREN');

    // Parse the source path: e.g., state.score or state.health
    let source = '';
    if (this.check('IDENTIFIER') || this.check('STATE')) {
      source = this.advance().value;
      while (this.match('DOT')) {
        source += '.' + this.expectIdentifier();
      }
    } else {
      source = this.expectString();
    }

    // Optional transform function name
    let transform: string | undefined;
    if (this.match('COMMA')) {
      this.skipNewlines();
      transform = this.expectString();
    }

    this.expect('RPAREN');
    return { __bind: true, source, transform };
  }

  private parseArrayValue(): HoloValue[] {
    this.skipNewlines();
    const elements: HoloValue[] = [];
    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      elements.push(this.parseValue());
      this.skipNewlines();
      if (!this.match('COMMA')) break;
      this.skipNewlines();
    }
    this.skipNewlines();
    this.expect('RBRACKET');
    return elements;
  }

  private parseObjectValue(): Record<string, HoloValue> {
    this.skipNewlines();
    const obj: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      this.match('COMMA'); // consume optional comma separator

      // Only parse key: value if it looks like a property (identifier followed by colon)
      if (this.isPropertyName() && this.peek(1).type === 'COLON') {
        const key = this.expectIdentifier();
        this.expect('COLON');
        obj[key] = this.parseValue();
      } else if (this.check('RBRACE')) {
        break;
      } else {
        // Code block content or unknown token — skip with depth tracking
        let depth = 1;
        while (depth > 0 && !this.isAtEnd()) {
          if (this.check('LBRACE')) depth++;
          if (this.check('RBRACE')) {
            depth--;
            if (depth === 0) break;
          }
          this.advance();
        }
        break;
      }
      this.skipNewlines();
    }
    this.skipNewlines();
    this.expect('RBRACE');
    return obj;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', line: 0, column: 0 };
  }

  private peek(offset: number): Token {
    return this.tokens[this.pos + offset] || { type: 'EOF', value: '', line: 0, column: 0 };
  }

  private previous(): Token {
    return this.tokens[this.pos - 1] || this.current();
  }

  private isAtEnd(): boolean {
    return this.current().type === 'EOF';
  }

  private check(type: TokenType | TokenType[]): boolean {
    const cur = this.current().type;
    const res = Array.isArray(type) ? type.includes(cur) : cur === type;
    return res;
  }

  private match(type: TokenType | TokenType[]): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private isStatementKeyword(): boolean {
    const type = this.current().type;
    return (
      type === 'IF' ||
      type === 'FOR' ||
      type === 'WHILE' ||
      type === 'AWAIT' ||
      type === 'RETURN' ||
      type === 'EMIT' ||
      type === 'ANIMATE' ||
      type === 'ON_ERROR' ||
      type === 'LET' ||
      type === 'VAR' ||
      type === 'CONST'
    );
  }

  private isPrimitiveShape(value: string): boolean {
    return PRIMITIVE_SHAPES.has(value.toLowerCase());
  }

  /**
   * Check if current token can be used as a property name
   * Allows identifiers and keywords that can be property names (animate, material, etc.)
   */
  private isPropertyName(): boolean {
    const type = this.current().type;
    if (type === 'IDENTIFIER') return true;

    // Keywords that can also be property names in object bodies
    const validPropertyKeywords: TokenType[] = [
      'ANIMATE',
      'AUDIO',
      'CAMERA',
      'EFFECTS',
      'ENVIRONMENT',
      'LIGHT',
      'LOGIC',
      'TIMELINE',
      'ZONE',
      'UI',
      'TRANSITION',
      'NPC',
      'QUEST',
      'ABILITY',
      'DIALOGUE',
      'SHAPE',
      'IMPORT',
      'USING',
      'TEMPLATE',
      'STATE',
      'OBJECT',
      'ON_ERROR',
    ];
    return validPropertyKeywords.includes(type);
  }

  /**
   * Parse primitive#id or primitive #id { } syntax
   * Examples:
   *   cube#myCube { position: [0, 1, 0] }
   *   sphere #ball { color: "red" }
   */
  private parsePrimitiveObject(): HoloObjectDecl {
    const primitiveType = this.current().value.toLowerCase();
    this.advance(); // consume primitive name

    let id = `${primitiveType}_${Date.now()}`; // default auto-generated id

    // Check for #id syntax (either attached like cube#id or separate like cube #id)
    if (this.check('HASH') || (this.check('IDENTIFIER') && this.previous().value.includes('#'))) {
      if (this.check('HASH')) {
        this.advance(); // consume #
        id = this.expectIdentifier();
      } else {
        // Handle cube#id where it was tokenized together
        const prevValue = this.previous().value;
        if (prevValue.includes('#')) {
          const parts = prevValue.split('#');
          if (parts.length === 2 && parts[1]) {
            id = parts[1];
          }
        }
      }
    } else if (this.check('STRING')) {
      id = this.parseValue() as string;
    } else if (this.check('IDENTIFIER') && !this.check('LBRACE')) {
      // cube myId { ... }
      id = this.expectIdentifier();
    }

    this.pushContext(`${primitiveType} "${id}"`);

    const properties: HoloObjectProperty[] = [];
    const traits: HoloObjectTrait[] = [];
    const children: HoloObjectDecl[] = [];

    // Add geometry property
    properties.push({ type: 'ObjectProperty', key: 'geometry', value: primitiveType });

    // Parse body if present
    if (this.check('LBRACE')) {
      this.expect('LBRACE');
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        // Parse object body members (similar to parseObject)
        if (this.check('AT')) {
          this.advance(); // consume @
          const name = this.expectIdentifier();
          let config: Record<string, HoloValue> = {};
          if (this.check('LPAREN')) {
            config = this.parseTraitConfig();
          }
          traits.push({ type: 'ObjectTrait', name, config } as any);
        } else if (this.check('IDENTIFIER')) {
          const key = this.expectIdentifier();
          if (this.check('COLON')) {
            this.advance();
            properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
          } else {
            properties.push({ type: 'ObjectProperty', key, value: true });
          }
        } else {
          this.error(`Unexpected token in primitive object: ${this.current().type}`);
          this.advance();
        }
        this.skipNewlines();
      }

      this.expect('RBRACE');
    }

    this.popContext();

    const obj: HoloObjectDecl = {
      type: 'Object',
      name: id,
      properties,
      traits,
      children: children.length > 0 ? children : undefined,
    };

    return obj;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private expect(type: TokenType): Token {
    if (this.check(type)) {
      return this.advance();
    }

    const current = this.current();
    let suggestion: string | undefined;

    // Check for keyword typos when we have an identifier but expect a keyword
    if (current.type === 'IDENTIFIER' && current.value) {
      // Create a map of token types to their keyword text
      const tokenToKeyword: Record<string, string> = {};
      for (const [keyword, tokenType] of Object.entries(KEYWORDS)) {
        tokenToKeyword[tokenType] = keyword;
      }

      // If we're expecting a keyword token type, check for typos
      if (tokenToKeyword[type]) {
        const expectedKeyword = tokenToKeyword[type];
        const allKeywords = Object.keys(KEYWORDS);
        const match = TypoDetector.findClosestMatch(current.value, allKeywords);

        if (match && match.toLowerCase() === expectedKeyword) {
          suggestion = `Did you mean the keyword \`${match}\`?`;
        }
      }
    }

    // Provide contextual suggestions
    if (!suggestion) {
      if (type === 'RBRACE' && current.type === 'IDENTIFIER') {
        suggestion = 'Did you forget to close a previous block with `}`?';
      } else if (type === 'COLON' && current.type === 'EQUALS') {
        suggestion = 'Use `:` instead of `=` for property definitions';
      } else if (type === 'LBRACE' && current.type === 'COLON') {
        suggestion = 'Expected `{` to start block';
      } else if (type === 'RBRACKET' && current.type !== 'EOF') {
        suggestion = 'Missing closing bracket `]`';
      } else if (type === 'RPAREN' && current.type !== 'EOF') {
        suggestion = 'Missing closing parenthesis `)`';
      }
    }

    this.error(`Expected ${type}, got ${current.type}`, suggestion);

    // Try to recover
    this.recoverToNextStatement();

    // Advance to prevent infinite loops
    if (!this.isAtEnd()) {
      return this.advance();
    }

    return current;
  }

  private expectString(): string {
    if (this.check('STRING')) {
      return this.advance().value;
    }

    const current = this.current();
    let suggestion: string | undefined;

    if (current.type === 'IDENTIFIER') {
      suggestion = `Wrap the identifier \`${current.value}\` in quotes: "${current.value}"`;
    } else {
      suggestion = 'Strings must be enclosed in double or single quotes';
    }

    this.error(`Expected string, got ${current.type}`, suggestion);
    return '';
  }

  private expectIdentifier(): string {
    // Accept both IDENTIFIER tokens and keywords when used as property names
    // This allows `audio: { ... }` inside environment blocks
    if (this.check('IDENTIFIER')) {
      return this.advance().value;
    }

    // Keywords can also be used as property names (e.g., audio, object, state)
    const current = this.current();
    const keywordTypes = [
      'AUDIO',
      'OBJECT',
      'STATE',
      'TEMPLATE',
      'ENVIRONMENT',
      'LIGHT',
      'CAMERA',
      'EFFECTS',
      'LOGIC',
      'TIMELINE',
      'ZONE',
      'UI',
      'TRANSITION',
      'NPC',
      'QUEST',
      'ABILITY',
      'DIALOGUE',
      'SHAPE',
      'IMPORT',
      'USING',
    ];
    if (keywordTypes.includes(current.type)) {
      return this.advance().value;
    }

    let suggestion: string | undefined;

    // Check if user typed a keyword that looks like an identifier typo
    if (current.type === 'STRING') {
      suggestion = 'Remove quotes - identifiers should not be quoted';
    } else if (current.type !== 'EOF' && current.value) {
      // Try to find typos in keywords
      const keywords = Object.keys(KEYWORDS);
      const match = TypoDetector.findClosestMatch(current.value, keywords);
      if (match) {
        suggestion = `Did you mean the keyword \`${match}\`?`;
      }
    }

    this.error(`Expected identifier, got ${current.type}`, suggestion);
    return '';
  }

  private skipNewlines(): void {
    while (this.match('NEWLINE')) {
      // Skip all newlines
    }
  }

  private currentLocation(): SourceLocation {
    const token = this.current();
    return { line: token.line, column: token.column };
  }

  private pushContext(context: string): void {
    this.parseContext.push(context);
  }

  private popContext(): void {
    this.parseContext.pop();
  }

  private error(message: string, suggestion?: string): void {
    const context = this.parseContext.length > 0 ? ` (in ${this.parseContext.join(' > ')})` : '';

    const fullMessage = `${message}${context}`;

    this.errors.push({
      message: fullMessage,
      loc: this.currentLocation(),
      suggestion,
      severity: 'error',
    });

    if (!this.options.tolerant) {
      const errorMsg = suggestion ? `${fullMessage}\n  Suggestion: ${suggestion}` : fullMessage;
      throw new Error(`Parse error at line ${this.currentLocation().line}: ${errorMsg}`);
    }
  }

  private recoverToNextStatement(): void {
    // Skip tokens until we find a likely statement boundary
    while (
      !this.isAtEnd() &&
      !this.check('NEWLINE') &&
      !this.check('RBRACE') &&
      !this.check('OBJECT') &&
      !this.check('TEMPLATE') &&
      !this.check('ENVIRONMENT') &&
      !this.check('STATE')
    ) {
      this.advance();
    }
  }

  private recoverToBlockEnd(): void {
    let depth = 1;
    while (!this.isAtEnd() && depth > 0) {
      if (this.check('LBRACE')) depth++;
      else if (this.check('RBRACE')) depth--;
      this.advance();
    }
  }

  private parseTraitConfig(): Record<string, HoloValue> {
    this.expect('LPAREN');
    const config: Record<string, HoloValue> = {};

    while (!this.check('RPAREN') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RPAREN')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      config[key] = this.parseValue();

      if (this.check('COMMA')) {
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RPAREN');
    return config;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - NPC BEHAVIOR TREES
  // ===========================================================================

  private parseNPC(): HoloNPC {
    this.expect('NPC');
    const name = this.expectString();

    this.pushContext(`NPC "${name}"`);
    this.expect('LBRACE');
    this.skipNewlines();

    const npc: HoloNPC = {
      type: 'NPC',
      name,
      properties: [],
      behaviors: [],
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('BEHAVIOR')) {
        npc.behaviors.push(this.parseBehavior());
      } else if (this.check('STATE')) {
        npc.state = this.parseState();
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();

        if (key === 'type') npc.npcType = value as string;
        else if (key === 'model') npc.model = value as string;
        else if (key === 'dialogue_tree') npc.dialogueTree = value as string;
        else npc.properties.push({ type: 'NPCProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return npc;
  }

  private parseBehavior(): HoloBehavior {
    this.expect('BEHAVIOR');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const behavior: HoloBehavior = {
      type: 'Behavior',
      name,
      trigger: 'idle',
      actions: [],
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'trigger') {
        behavior.trigger = this.parseValue() as string;
      } else if (key === 'condition') {
        behavior.condition = this.parseExpression();
      } else if (key === 'timeout') {
        behavior.timeout = this.parseValue() as number;
      } else if (key === 'priority') {
        behavior.priority = this.parseValue() as number;
      } else if (key === 'actions') {
        behavior.actions = this.parseBehaviorActions();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return behavior;
  }

  private parseBehaviorActions(): HoloBehaviorAction[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const actions: HoloBehaviorAction[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const action: HoloBehaviorAction = {
        type: 'BehaviorAction',
        actionType: 'call',
        config: {},
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();

        if (
          ['move', 'animate', 'face', 'damage', 'heal', 'spawn', 'emit', 'wait', 'call'].includes(
            key
          )
        ) {
          action.actionType = key as HoloBehaviorAction['actionType'];
          action.config =
            typeof value === 'object' ? (value as Record<string, HoloValue>) : { value };
        } else {
          action.config[key] = value;
        }
        this.skipNewlines();
      }

      this.expect('RBRACE');
      actions.push(action);

      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return actions;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - QUEST DEFINITION
  // ===========================================================================

  private parseQuest(): HoloQuest {
    this.expect('QUEST');
    const name = this.expectString();

    this.pushContext(`Quest "${name}"`);
    this.expect('LBRACE');
    this.skipNewlines();

    const quest: HoloQuest = {
      type: 'Quest',
      name,
      objectives: [],
      rewards: { type: 'QuestRewards' },
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'giver') quest.giver = this.parseValue() as string;
      else if (key === 'level') quest.level = this.parseValue() as number;
      else if (key === 'type') quest.questType = this.parseValue() as HoloQuest['questType'];
      else if (key === 'prerequisites') quest.prerequisites = this.parseValue() as string[];
      else if (key === 'objectives') quest.objectives = this.parseQuestObjectives();
      else if (key === 'rewards') quest.rewards = this.parseQuestRewards();
      else if (key === 'branches') quest.branches = this.parseQuestBranches();

      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return quest;
  }

  private parseQuestObjectives(): HoloQuestObjective[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const objectives: HoloQuestObjective[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const obj: HoloQuestObjective = {
        type: 'QuestObjective',
        id: '',
        description: '',
        objectiveType: 'interact',
        target: '',
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();

        if (key === 'id') obj.id = value as string;
        else if (key === 'description') obj.description = value as string;
        else if (key === 'type') obj.objectiveType = value as HoloQuestObjective['objectiveType'];
        else if (key === 'target') obj.target = value as string;
        else if (key === 'count') obj.count = value as number;
        else if (key === 'optional') obj.optional = value as boolean;

        this.skipNewlines();
      }

      this.expect('RBRACE');
      objectives.push(obj);
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return objectives;
  }

  private parseQuestRewards(): HoloQuestRewards {
    this.expect('LBRACE');
    this.skipNewlines();

    const rewards: HoloQuestRewards = { type: 'QuestRewards' };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();

      if (key === 'experience') rewards.experience = value as number;
      else if (key === 'gold') rewards.gold = value as number;
      else if (key === 'items') rewards.items = value as any[];
      else if (key === 'reputation') rewards.reputation = value as Record<string, number>;
      else if (key === 'unlocks') rewards.unlocks = value as string[];

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return rewards;
  }

  private parseQuestBranches(): HoloQuestBranch[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const branches: HoloQuestBranch[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const branch: HoloQuestBranch = {
        type: 'QuestBranch',
        condition: { type: 'Literal', value: true },
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');

        if (key === 'condition') branch.condition = this.parseExpression();
        else if (key === 'text') branch.text = this.parseValue() as string;
        else if (key === 'rewardMultiplier') branch.rewardMultiplier = this.parseValue() as number;
        else if (key === 'nextQuest') branch.nextQuest = this.parseValue() as string;

        this.skipNewlines();
      }

      this.expect('RBRACE');
      branches.push(branch);
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return branches;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - ABILITY/SPELL DEFINITION
  // ===========================================================================

  private parseAbility(): HoloAbility {
    this.expect('ABILITY');
    const name = this.expectString();

    this.pushContext(`Ability "${name}"`);
    this.expect('LBRACE');
    this.skipNewlines();

    const ability: HoloAbility = {
      type: 'Ability',
      name,
      abilityType: 'skill',
      stats: { type: 'AbilityStats' },
      effects: { type: 'AbilityEffects' },
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'type') ability.abilityType = this.parseValue() as HoloAbility['abilityType'];
      else if (key === 'class') ability.class = this.parseValue() as string;
      else if (key === 'level') ability.level = this.parseValue() as number;
      else if (key === 'stats') ability.stats = this.parseAbilityStats();
      else if (key === 'scaling') ability.scaling = this.parseAbilityScaling();
      else if (key === 'effects') ability.effects = this.parseAbilityEffects();
      else if (key === 'projectile') ability.projectile = this.parseAbilityProjectile();

      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return ability;
  }

  private parseAbilityStats(): HoloAbilityStats {
    this.expect('LBRACE');
    this.skipNewlines();

    const stats: HoloAbilityStats = { type: 'AbilityStats' };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue() as number;

      if (key === 'manaCost') stats.manaCost = value;
      else if (key === 'staminaCost') stats.staminaCost = value;
      else if (key === 'cooldown') stats.cooldown = value;
      else if (key === 'castTime') stats.castTime = value;
      else if (key === 'range') stats.range = value;
      else if (key === 'radius') stats.radius = value;
      else if (key === 'duration') stats.duration = value;

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return stats;
  }

  private parseAbilityScaling(): HoloAbilityScaling {
    this.expect('LBRACE');
    this.skipNewlines();

    const scaling: HoloAbilityScaling = { type: 'AbilityScaling' };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue() as number;

      if (key === 'baseDamage') scaling.baseDamage = value;
      else if (key === 'spellPower') scaling.spellPower = value;
      else if (key === 'attackPower') scaling.attackPower = value;
      else if (key === 'levelScale') scaling.levelScale = value;

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return scaling;
  }

  private parseAbilityEffects(): HoloAbilityEffects {
    this.expect('LBRACE');
    this.skipNewlines();

    const effects: HoloAbilityEffects = { type: 'AbilityEffects' };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'impact') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.impact = { type: 'AbilityImpact', ...val } as any;
      } else if (key === 'damage') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.damage = { type: 'AbilityDamage', damageType: 'physical', ...val } as any;
      } else if (key === 'buff') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.buff = { type: 'AbilityBuff', stat: '', amount: 0, duration: 0, ...val } as any;
      } else if (key === 'debuff') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.debuff = { type: 'AbilityDebuff', effect: 'slow', duration: 0, ...val } as any;
      }

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return effects;
  }

  private parseAbilityProjectile(): HoloAbilityProjectile {
    this.expect('LBRACE');
    this.skipNewlines();

    const projectile: HoloAbilityProjectile = { type: 'AbilityProjectile' };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();

      if (key === 'model') projectile.model = value as string;
      else if (key === 'speed') projectile.speed = value as number;
      else if (key === 'lifetime') projectile.lifetime = value as number;
      else if (key === 'trail') projectile.trail = value as string;
      else if (key === 'homing') projectile.homing = value as boolean;

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return projectile;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - DIALOGUE TREES
  // ===========================================================================

  private parseDialogue(): HoloDialogue {
    this.expect('DIALOGUE');
    const id = this.expectString();

    this.pushContext(`Dialogue "${id}"`);
    this.expect('LBRACE');
    this.skipNewlines();

    const dialogue: HoloDialogue = {
      type: 'Dialogue',
      id,
      content: '',
      options: [],
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'character') dialogue.character = this.parseValue() as string;
      else if (key === 'emotion') dialogue.emotion = this.parseValue() as HoloDialogue['emotion'];
      else if (key === 'content') dialogue.content = this.parseValue() as string;
      else if (key === 'condition') dialogue.condition = this.parseExpression();
      else if (key === 'nextDialogue') dialogue.nextDialogue = this.parseValue() as string;
      else if (key === 'options') dialogue.options = this.parseDialogueOptions();

      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return dialogue;
  }

  private parseDialogueOptions(): HoloDialogueOption[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const options: HoloDialogueOption[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const option: HoloDialogueOption = {
        type: 'DialogueOption',
        text: '',
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');

        if (key === 'text') option.text = this.parseValue() as string;
        else if (key === 'emotion') option.emotion = this.parseValue() as string;
        else if (key === 'next') option.next = this.parseValue() as string;
        else if (key === 'unlocked') option.unlocked = this.parseExpression();
        else if (key === 'action') option.action = this.parseStatementBlock();

        this.skipNewlines();
      }

      this.expect('RBRACE');
      options.push(option);
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return options;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - STATE MACHINES
  // ===========================================================================

  private parseStateMachine(): HoloStateMachine {
    this.expect('STATE_MACHINE');
    const name = this.expectString();

    this.pushContext(`StateMachine "${name}"`);
    this.expect('LBRACE');
    this.skipNewlines();

    const sm: HoloStateMachine = {
      type: 'StateMachine',
      name,
      initialState: '',
      states: {},
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'initialState') {
        sm.initialState = this.parseValue() as string;
      } else if (key === 'states') {
        sm.states = this.parseStateMachineStates();
      }

      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return sm;
  }

  private parseStateMachineStates(): Record<string, HoloState_Machine> {
    this.expect('LBRACE');
    this.skipNewlines();
    const states: Record<string, HoloState_Machine> = {};

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const stateName = this.expectString();
      this.expect('COLON');
      this.expect('LBRACE');
      this.skipNewlines();

      const state: HoloState_Machine = {
        type: 'State_Machine',
        name: stateName,
        actions: [],
        transitions: [],
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');

        if (key === 'entry') state.entry = this.parseStatementBlock();
        else if (key === 'exit') state.exit = this.parseStatementBlock();
        else if (key === 'actions') state.actions = this.parseBehaviorActions();
        else if (key === 'onDamage') state.onDamage = this.parseStatementBlock();
        else if (key === 'timeout') state.timeout = this.parseValue() as number;
        else if (key === 'onTimeout') state.onTimeout = this.parseStatementBlock();
        else if (key === 'transitions') state.transitions = this.parseStateTransitions();

        this.skipNewlines();
      }

      this.expect('RBRACE');
      states[stateName] = state;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return states;
  }

  private parseStateTransitions(): HoloStateTransition[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const transitions: HoloStateTransition[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const transition: HoloStateTransition = {
        type: 'StateTransition',
        target: '',
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');

        if (key === 'target') transition.target = this.parseValue() as string;
        else if (key === 'condition') transition.condition = this.parseExpression();
        else if (key === 'event') transition.event = this.parseValue() as string;

        this.skipNewlines();
      }

      this.expect('RBRACE');
      transitions.push(transition);
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return transitions;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - ACHIEVEMENTS
  // ===========================================================================

  private parseAchievement(): HoloAchievement {
    this.expect('ACHIEVEMENT');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const achievement: HoloAchievement = {
      type: 'Achievement',
      name,
      description: '',
      condition: { type: 'Literal', value: true },
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'description') achievement.description = this.parseValue() as string;
      else if (key === 'points') achievement.points = this.parseValue() as number;
      else if (key === 'hidden') achievement.hidden = this.parseValue() as boolean;
      else if (key === 'condition') achievement.condition = this.parseExpression();
      else if (key === 'progress') achievement.progress = this.parseExpression();
      else if (key === 'reward') {
        const val = this.parseValue() as Record<string, HoloValue>;
        achievement.reward = { type: 'AchievementReward', ...val } as any;
      }

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return achievement;
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - TALENT TREES
  // ===========================================================================

  private parseTalentTree(): HoloTalentTree {
    this.expect('TALENT_TREE');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const tree: HoloTalentTree = {
      type: 'TalentTree',
      name,
      rows: [],
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');

      if (key === 'class') tree.class = this.parseValue() as string;
      else if (key === 'rows') tree.rows = this.parseTalentRows();

      this.skipNewlines();
    }

    this.expect('RBRACE');
    return tree;
  }

  private parseTalentRows(): HoloTalentRow[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const rows: HoloTalentRow[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const row: HoloTalentRow = {
        type: 'TalentRow',
        tier: 1,
        nodes: [],
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');

        if (key === 'tier') row.tier = this.parseValue() as number;
        else if (key === 'nodes') row.nodes = this.parseTalentNodes();

        this.skipNewlines();
      }

      this.expect('RBRACE');
      rows.push(row);
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return rows;
  }

  private parseTalentNodes(): HoloTalentNode[] {
    this.expect('LBRACKET');
    this.skipNewlines();
    const nodes: HoloTalentNode[] = [];

    while (!this.check('RBRACKET') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACKET')) break;

      this.expect('LBRACE');
      this.skipNewlines();

      const node: HoloTalentNode = {
        type: 'TalentNode',
        id: '',
        name: '',
        points: 1,
        effect: { type: 'TalentEffect', effectType: 'passive' },
      };

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE')) break;

        const key = this.expectIdentifier();
        this.expect('COLON');

        if (key === 'id') node.id = this.parseValue() as string;
        else if (key === 'name') node.name = this.parseValue() as string;
        else if (key === 'description') node.description = this.parseValue() as string;
        else if (key === 'points') node.points = this.parseValue() as number;
        else if (key === 'maxPoints') node.maxPoints = this.parseValue() as number;
        else if (key === 'requires') node.requires = this.parseValue() as string[];
        else if (key === 'icon') node.icon = this.parseValue() as string;
        else if (key === 'effect') {
          const val = this.parseValue() as Record<string, HoloValue>;
          node.effect = { type: 'TalentEffect', effectType: 'passive', ...val } as any;
        }

        this.skipNewlines();
      }

      this.expect('RBRACE');
      nodes.push(node);
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET');
    return nodes;
  }

  private parseShapeDeclaration(): HoloShape {
    this.expect('SHAPE');
    const name = this.expectString();

    let shapeType = 'box';
    if (this.check('IDENTIFIER')) {
      const typeName = this.current().value.toLowerCase();
      if (PRIMITIVE_SHAPES.has(typeName)) {
        shapeType = typeName;
        this.advance();
      }
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloShapeProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({
        type: 'ShapeProperty',
        key,
        value,
      });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      type: 'Shape',
      name,
      shapeType,
      properties,
    };
  }
}

// =============================================================================
// CONVENIENCE FUNCTION
// =============================================================================

/**
 * Parse a .holo file into an AST
 */
export function parseHolo(source: string, options?: HoloParserOptions): HoloParseResult {
  const parser = new HoloCompositionParser(options);
  return parser.parse(source);
}

/**
 * Quick parse - throws on error
 */
export function parseHoloStrict(source: string): HoloComposition {
  const result = parseHolo(source, { tolerant: false });
  if (!result.success || !result.ast) {
    throw new Error(`Failed to parse: ${result.errors[0]?.message}`);
  }
  return result.ast;
}
