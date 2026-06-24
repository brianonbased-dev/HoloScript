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
  HoloScene,
  HoloTheme,
  HoloThemeProperty,
  HoloEnvironment,
  HoloEnvironmentProperty,
  HoloParticleSystem,
  HoloState,
  HoloStateProperty,
  HoloTemplate,
  HoloObjectDecl,
  HoloInstancedObjectMetadata,
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
  HoloPosition,
  SourceLocation,
  SourceRange,
  // Brittney AI Features
  HoloNPC,
  AgentBrainAttachment,
  HoloBehavior,
  HoloBehaviorAction,
  HoloQuest,
  HoloQuestObjective,
  HoloQuestRewards,
  HoloQuestRewardItem,
  HoloQuestBranch,
  HoloAbility,
  HoloAbilityStats,
  HoloAbilityScaling,
  HoloAbilityEffects,
  HoloAbilityImpact,
  HoloAbilityDamage,
  HoloAbilityBuff,
  HoloAbilityDebuff,
  HoloAbilityProjectile,
  HoloDialogue,
  HoloDialogueOption,
  HoloStateMachine,
  HoloState_Machine,
  HoloStateTransition,
  HoloAchievement,
  HoloAchievementReward,
  HoloTalentTree,
  HoloTalentEffect,
  HoloTalentRow,
  HoloTalentNode,
  HoloShape,
  HoloShapeProperty,
  HoloOnErrorStatement,
  HoloSubOrb,
  HoloWhileStatement,
  HoloVariableDeclaration,
  HoloSpawnGroup,
  HoloWaypoints,
  HoloConstraintBlock,
  HoloTerrainBlock,
  HoloDomainBlock,
  HoloDomainType,
  // MMO/AAA game constructs (v6.2)
  HoloSpawnPoint,
  HoloGameTrigger,
  HoloLootTable,
  HoloLootEntry,
  HoloWorldChunk,
  HoloWorldLayer,
  HoloDungeonInstance,
  HoloWorldShard,
  HoloMovementPath,
  HoloReactionTrigger,
  HoloNormBlock,
  HoloNormCreation,
  HoloNormRepresentation,
  HoloNormSpreading,
  HoloNormEvaluation,
  HoloNormCompliance,
  HoloMetanorm,
  HoloMetanormRules,
  HoloMetanormEscalation,
  PlatformConstraint,
  HoloContract,
  HoloContractClause,
  HoloPolicyPackBlock,
  HoloTopic,
  HoloChannel,
  HoloConnection,
} from './HoloCompositionTypes';
import { parsePipeline as parsePipelineSource } from './PipelineParser';
import { TypoDetector } from './TypoDetector';
import { ErrorRecovery } from './ErrorRecovery';

// W1-T2: Token types, keywords, and lexer extracted to composition/ subdirectory.
// Re-exported here for backward compatibility — all consumers still import from
// HoloCompositionParser and get identical types/classes.
import {
  type TokenType,
  type Token,
  KEYWORDS,
  PRIMITIVE_SHAPES,
  LIGHT_PRIMITIVES,
} from './composition/tokens';
import { HoloLexer } from './composition/lexer';
// W1-T2: Expression rules extracted to composition/ subdirectory.
// Thin delegates in the parser class call through to these pure functions,
// maintaining the original public API while keeping the rule logic modular.
import {
  type ExpressionParserApi,
  parseExpression as parseExpressionRule,
  isKeywordAsIdentifierType as isKeywordAsIdentifierTypeRule,
  isKeywordAsIdentifier as isKeywordAsIdentifierRule,
} from './composition/expression-rules';

// Re-export token types so external consumers can import them from this module.
export { type TokenType, type Token, KEYWORDS, PRIMITIVE_SHAPES, LIGHT_PRIMITIVES };

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
  /**
   * Error-recovery / suggestion engine seeded with the injected `knownTraits`
   * union (the SSOT shared with the LSP and linter). When `options.knownTraits`
   * is absent this falls back to `ErrorRecovery`'s built-in `VR_TRAITS`-derived
   * dictionary, so default behavior is unchanged.
   */
  private errorRecovery: ErrorRecovery;

  constructor(options: HoloParserOptions = {}) {
    this.options = {
      locations: true,
      tolerant: true,
      strict: false,
      ...options,
    };
    // Thread the injectable known-trait union into ErrorRecovery. Passing
    // `undefined` preserves the exact prior (VR_TRAITS-based) behavior.
    this.errorRecovery = new ErrorRecovery(this.options.knownTraits);
  }

  /**
   * The error-recovery engine for this parser, seeded with the injected
   * `knownTraits` union when one was supplied via parser options. Exposed so
   * tooling (and tests) can verify the trait-vocabulary seam is wired through.
   */
  getErrorRecovery(): ErrorRecovery {
    return this.errorRecovery;
  }

  /** Instance accessor for the static DOMAIN_TOKENS set — satisfies ExpressionParserApi. */
  get DOMAIN_TOKENS(): Set<TokenType> {
    return HoloCompositionParser.DOMAIN_TOKENS;
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
    const startLoc = this.currentLocation();
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
      // v4 additions
      spawnGroups: [],
      waypointSets: [],
      constraints: [],
      terrains: [],
      domainBlocks: [],
      // v4.5 additions — CRSEC norm lifecycle
      norms: [],
      metanorms: [],
      // v6.2 additions — MMO/AAA game constructs
      spawnPoints: [],
      triggers: [],
      lootTables: [],
      worldChunks: [],
      worldLayers: [],
      dungeonInstances: [],
      worldShards: [],
      movementPaths: [],
      reactionTriggers: [],
      policyPacks: [],
    };

    while (!this.isAtEnd()) {
      try {
        this.skipNewlines();
        if (this.isAtEnd()) break;

        // Handle @world, @environment, @platform, etc. (root-level decorators)
        // But NOT if followed by a domain block (e.g. contract "X" @erc721 { } — the
        // domain block's parseDomainBlock() handles inline traits itself)
        if (this.check('AT')) {
          // Peek ahead to check if this is @platform(...)
          if (
            this.peek(1).type === 'IDENTIFIER' &&
            this.peek(1).value.toLowerCase() === 'platform'
          ) {
            this.advance(); // consume @
            this.advance(); // consume 'platform'
            const constraint = this.parsePlatformConstraint();
            this.skipNewlines();
            // Attach the constraint to the next block
            if (this.check('TEMPLATE')) {
              const tmpl = this.parseTemplate();
              tmpl.platformConstraint = constraint;
              composition.templates.push(tmpl);
            } else if (this.check('OBJECT')) {
              const obj = this.parseObject();
              obj.platformConstraint = constraint;
              composition.objects.push(obj);
            } else if (this.check('NORM')) {
              const norm = this.parseNormBlock();
              norm.platformConstraint = constraint;
              composition.norms!.push(norm);
            } else if (this.check('SPATIAL_GROUP')) {
              const grp = this.parseSpatialGroup();
              grp.platformConstraint = constraint;
              composition.spatialGroups.push(grp);
            } else if (this.check('LIGHT')) {
              const light = this.parseLight();
              light.platformConstraint = constraint;
              composition.lights.push(light);
            } else {
              // Unknown block after @platform — parse whatever follows
              // and discard the constraint (best-effort)
              if (this.check('LBRACE')) this.skipBlock();
            }
          } else {
            // Peek ahead: if the token after the decorator name is a domain block,
            // this @ is an inline trait on the previous domain block — skip it so
            // parseDomainBlock handles traits. But at ROOT level, there is no
            // "previous domain block", so we handle @world/@environment decorators.
            this.advance(); // consume @
            const decoratorName = this.current().value.toLowerCase();
            this.advance(); // consume decorator name

            if (decoratorName === 'world' || decoratorName === 'environment') {
              composition.environment = this.parseEnvironmentBody();
            } else if (decoratorName === 'state') {
              composition.state = this.parseStateBody();
            } else if (decoratorName === 'state_machine') {
              // @state_machine { initial: "..." state "name" { ... } ... }
              // Route through the real SM body parser so it lands in composition.stateMachines,
              // not as an opaque trait blob that compilers can't read.
              if (this.check('LBRACE')) {
                composition.stateMachines.push(this.parseStateMachineFromDecorator());
              }
            } else {
              // Capture unknown root-level traits (e.g., @page, @metadata)
              composition.traits = composition.traits || [];
              const config = this.parseOptionalTraitConfig();
              composition.traits.push({ type: 'ObjectTrait', name: decoratorName, config });
            }
          }
        } else if (this.check('COMPOSITION')) {
          // A named `composition "X" { ... }` appearing after file-level
          // statements (typically leading imports, which is why parse() routed
          // here instead of to parseComposition). Without this branch the
          // `composition` / name / `{` tokens fell to the "skip unknown" default
          // below, so only the inner objects survived — flattened into this root
          // with its name left as "implicit", silently dropping the declared
          // name (board task_1780215900589_8zoy).
          this.absorbComposition(composition, this.parseComposition());
        } else if (this.check('TEMPLATE')) {
          composition.templates.push(this.parseTemplate());
        } else if (this.check('OBJECT')) {
          composition.objects.push(this.parseObject());
        } else if (this.check('THEME')) {
          composition.theme = this.parseTheme();
        } else if (this.check('ENVIRONMENT')) {
          composition.environment = this.parseEnvironment();
        } else if (this.check('SPATIAL_GROUP')) {
          composition.spatialGroups.push(this.parseSpatialGroup());
        } else if (this.check('LIGHT')) {
          composition.lights.push(this.parseLight());
        } else if (this.check('AUDIO')) {
          composition.audio.push(this.parseAudio());
        } else if (this.check('CAMERA')) {
          composition.camera = this.parseCamera();
        } else if (this.check('LOGIC')) {
          composition.logic = this.parseLogic();
        } else if (this.check('TIMELINE')) {
          composition.timelines.push(this.parseTimeline());
        } else if (this.check('STATE') && this.peek(1).type !== 'COLON') {
          composition.state = this.parseState();
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
          // Spatial primitives (v4)
        } else if (this.check('SPAWN_GROUP')) {
          composition.spawnGroups!.push(this.parseSpawnGroup());
        } else if (this.check('WAYPOINTS')) {
          composition.waypointSets!.push(this.parseWaypointsBlock());
        } else if (this.check('CONSTRAINT')) {
          composition.constraints!.push(this.parseConstraintBlock());
        } else if (this.check('TERRAIN')) {
          composition.terrains!.push(this.parseTerrainBlock());
          // Norm lifecycle blocks (v4.5 — CRSEC model)
        } else if (this.check('NORM')) {
          composition.norms!.push(this.parseNormBlock());
        } else if (this.check('METANORM')) {
          composition.metanorms!.push(this.parseMetanormBlock());
          // SimulationContract block (v6.3 — NORTH_STAR thesis: simulation IS the proof)
        } else if (this.check('HOLO_CONTRACT')) {
          composition.contract = this.parseContractBlock();
        } else if (this.check('IDENTIFIER') && this.current().value === 'policy_pack') {
          composition.policyPacks!.push(this.parsePolicyPackBlock());
          // Pub/sub messaging primitives (v6.4)
        } else if (this.check('HOLO_TOPIC')) {
          if (!composition.topics) composition.topics = [];
          composition.topics.push(this.parseTopicBlock());
        } else if (this.check('HOLO_CHANNEL')) {
          if (!composition.channels) composition.channels = [];
          composition.channels.push(this.parseChannelBlock());
        } else if (this.check('CONNECT')) {
          if (!composition.connections) composition.connections = [];
          composition.connections.push(this.parseConnectionStmt());
        } else if (this.isLooseOnHandlerStart()) {
          this.skipLooseOnHandler();
          // MMO/AAA game constructs (v6.2)
        } else if (this.check('LOOT_TABLE')) {
          composition.lootTables!.push(this.parseLootTable());
        } else if (this.check('WORLD_CHUNK')) {
          composition.worldChunks!.push(this.parseWorldChunk());
        } else if (this.check('SPAWN_POINT')) {
          composition.spawnPoints!.push(this.parseSpawnPoint());
        } else if (this.check('GAME_TRIGGER')) {
          composition.triggers!.push(this.parseGameTrigger());
        } else if (this.check('MOVEMENT_PATH')) {
          composition.movementPaths!.push(this.parseMovementPath());
        } else if (this.check('REACTION_TRIGGER')) {
          composition.reactionTriggers!.push(this.parseReactionTrigger());
        } else if (this.check('WORLD_LAYER')) {
          composition.worldLayers!.push(this.parseWorldLayer());
        } else if (this.check('DUNGEON_INSTANCE')) {
          composition.dungeonInstances!.push(this.parseDungeonInstance());
        } else if (this.check('WORLD_SHARD')) {
          composition.worldShards!.push(this.parseWorldShard());
        } else if (this.check('REAL_ESTATE')) {
          // real_estate maps to a domain block (RealEstateTrait + ZoneWorldConstraints)
          composition.domainBlocks!.push(this.parseDomainBlock());
          // Named scene blocks (v4.6 — scene keyword)
        } else if (this.check('SCENE')) {
          if (!composition.scenes) composition.scenes = [];
          composition.scenes.push(this.parseScene());
          // Domain-specific blocks (v4.1)
        } else if (this.isDomainBlockToken()) {
          composition.domainBlocks!.push(this.parseDomainBlock());
        } else if (this.isLooseDomainBlockStart() || this.isLooseNamedDomainBlockStart()) {
          composition.domainBlocks!.push(this.parseDomainBlock());
        } else if (this.check('MODULE')) {
          // Module block — capture name and skip opaque body
          this.advance(); // consume 'module'
          if (this.check('STRING')) this.expectString();
          else if (this.check('IDENTIFIER')) this.expectIdentifier();
          if (this.check('LBRACE')) this.skipBlock();
        } else if (this.check('COMMENT') || this.check('LINE_COMMENT')) {
          this.advance(); // skip comments
        } else if (this.check('IDENTIFIER') && this.isLightPrimitive(this.current().value)) {
          composition.lights.push(this.parseLightPrimitive());
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
    composition.loc = { start: startLoc, end: this.currentLocation() };
    return composition;
  }

  /**
   * Merge a parsed `composition "X" { ... }` (inner) into the implicit root that
   * collected the file-level statements before it (typically imports). Preserves
   * the declared name and folds inner's contents into the root so nothing is
   * dropped. Generic over HoloComposition fields so new array/scalar members are
   * handled without touching this method.
   */
  private absorbComposition(root: HoloComposition, inner: HoloComposition): void {
    // First real composition's declared name wins over the "implicit" default.
    if (root.name === 'implicit' && inner.name) root.name = inner.name;
    const skip = new Set(['type', 'name', 'loc']);
    // HoloComposition has no index signature; go through `unknown` for the
    // dynamic key writes below (strict TS rejects a direct Record cast).
    const rootRec = root as unknown as Record<string, unknown>;
    for (const key of Object.keys(inner) as (keyof HoloComposition)[]) {
      if (skip.has(key)) continue;
      const innerVal = inner[key];
      if (innerVal === undefined) continue;
      if (Array.isArray(innerVal)) {
        const rootArr = root[key] as unknown[] | undefined;
        if (Array.isArray(rootArr)) rootArr.push(...innerVal);
        else rootRec[key] = [...innerVal];
      } else if (rootRec[key] === undefined) {
        // Scalar / object field (environment, theme, camera, logic, state) —
        // adopt only if the root hasn't already collected one.
        rootRec[key] = innerVal;
      }
    }
  }

  /**
   * Parse environment body (after @world or @environment decorator)
   */
  private parseEnvironmentBody(): HoloEnvironment {
    const startLoc = this.currentLocation();
    const properties: HoloEnvironmentProperty[] = [];

    if (this.check('LBRACE')) {
      this.expect('LBRACE');
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipBlockMemberSeparators();
        if (this.check('RBRACE')) break;

        if (this.isPropertyName() && this.peek(1).type === 'LBRACE') {
          const key = this.parsePropertyKey();
          const value = this.parseBlockTraitConfig();
          properties.push({ type: 'EnvironmentProperty', key, value });
        } else {
          const key = this.parsePropertyKey();
          this.expect('COLON');
          const value = this.parseValue();
          properties.push({ type: 'EnvironmentProperty', key, value });
        }
        this.skipNewlines();
      }

      this.expect('RBRACE');
    }

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Environment',
      properties,
    };
  }

  /**
   * Parse orb declaration: orb "name" @trait1 @trait2 { ... }
   */
  private parseOrbDeclaration(): HoloObjectDecl {
    const startLoc = this.currentLocation();
    this.advance(); // consume 'orb'
    const name = this.expectString();

    const traits: HoloObjectTrait[] = [];
    const properties: HoloObjectProperty[] = [];

    // Parse traits after name: @grabbable @glowing etc.
    while (this.check('AT')) {
      this.advance(); // consume @
      const traitName = this.expectIdentifier();
      const config = this.parseOptionalTraitConfig(true);
      traits.push({ type: 'ObjectTrait' as const, name: traitName, config });
    }

    // Parse body
    if (this.check('LBRACE')) {
      this.expect('LBRACE');
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipBlockMemberSeparators();
        if (this.check('RBRACE')) break;

        if (this.check('AT')) {
          this.advance();
          const traitName = this.expectIdentifier();
          const config = this.parseOptionalTraitConfig();
          traits.push({ type: 'ObjectTrait' as const, name: traitName, config });
        } else if (this.isPropertyName()) {
          const key = this.parsePropertyKey();
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
      loc: { start: startLoc, end: this.currentLocation() },
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
    const startLoc = this.currentLocation();
    this.pushContext('composition');

    this.expect('COMPOSITION');
    // Accept either a quoted name ("FleetWorker") or a bare identifier (FleetWorker).
    // HoloScript+ source files commonly use unquoted composition names.
    const name = this.check('STRING')
      ? this.expectString()
      : this.check('IDENTIFIER')
        ? this.expectIdentifier()
        : this.expectString();
    this.skipNewlines();
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
      // v4 additions
      spawnGroups: [],
      waypointSets: [],
      constraints: [],
      terrains: [],
      domainBlocks: [],
      // v4.5 additions — CRSEC norm lifecycle
      norms: [],
      metanorms: [],
      // v6.2 additions — MMO/AAA game constructs
      spawnPoints: [],
      triggers: [],
      lootTables: [],
      worldChunks: [],
      worldLayers: [],
      dungeonInstances: [],
      worldShards: [],
      movementPaths: [],
      reactionTriggers: [],
      policyPacks: [],
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      try {
        this.skipBlockMemberSeparators();
        if (this.check('RBRACE')) break;

        if (
          this.peek(1).type === 'COLON' &&
          (this.isPropertyName() || this.check('METADATA_BLOCK'))
        ) {
          const key = this.advance().value;
          this.advance(); // consume ':'
          const value = !this.check('RBRACE') && !this.isAtEnd() ? this.parseValue() : null;
          if (key === 'metadata' && value && typeof value === 'object' && !Array.isArray(value)) {
            composition.metadata = { ...(composition.metadata ?? {}), ...value };
          }
        } else if (this.check('IMPORT')) {
          composition.imports.push(this.parseImport());
        } else if (this.check('THEME')) {
          composition.theme = this.parseTheme();
        } else if (this.check('ENVIRONMENT')) {
          composition.environment = this.parseEnvironment();
        } else if (this.check('SCENE')) {
          if (!composition.scenes) composition.scenes = [];
          composition.scenes.push(this.parseScene());
        } else if (this.check('STATE') && this.peek(1).type !== 'COLON') {
          composition.state = this.parseState();
        } else if (this.check('METADATA_BLOCK')) {
          this.advance();
          const block = this.parseBlockTraitConfig();
          composition.metadata = { ...(composition.metadata ?? {}), ...block };
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
        } else if (this.check('IDENTIFIER') && this.isLightPrimitive(this.current().value)) {
          // Handle point_light { }, ambient_light { }, directional_light { } syntax
          composition.lights.push(this.parseLightPrimitive());
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
          // Spatial primitives (v4)
        } else if (this.check('SPAWN_GROUP')) {
          composition.spawnGroups!.push(this.parseSpawnGroup());
        } else if (this.check('WAYPOINTS')) {
          composition.waypointSets!.push(this.parseWaypointsBlock());
        } else if (this.check('CONSTRAINT')) {
          composition.constraints!.push(this.parseConstraintBlock());
        } else if (this.check('TERRAIN')) {
          composition.terrains!.push(this.parseTerrainBlock());
          // Norm lifecycle blocks (v4.5 — CRSEC model)
        } else if (this.check('NORM')) {
          composition.norms!.push(this.parseNormBlock());
        } else if (this.check('METANORM')) {
          composition.metanorms!.push(this.parseMetanormBlock());
          // SimulationContract block (v6.3 — NORTH_STAR thesis: simulation IS the proof)
        } else if (this.check('HOLO_CONTRACT')) {
          composition.contract = this.parseContractBlock();
        } else if (this.check('IDENTIFIER') && this.current().value === 'policy_pack') {
          composition.policyPacks!.push(this.parsePolicyPackBlock());
          // Pub/sub messaging primitives (v6.4)
        } else if (this.check('HOLO_TOPIC')) {
          if (!composition.topics) composition.topics = [];
          composition.topics.push(this.parseTopicBlock());
        } else if (this.check('HOLO_CHANNEL')) {
          if (!composition.channels) composition.channels = [];
          composition.channels.push(this.parseChannelBlock());
        } else if (this.check('CONNECT')) {
          if (!composition.connections) composition.connections = [];
          composition.connections.push(this.parseConnectionStmt());
          // MMO/AAA game constructs (v6.2)
        } else if (this.check('LOOT_TABLE')) {
          composition.lootTables!.push(this.parseLootTable());
        } else if (this.check('WORLD_CHUNK')) {
          composition.worldChunks!.push(this.parseWorldChunk());
        } else if (this.check('SPAWN_POINT')) {
          composition.spawnPoints!.push(this.parseSpawnPoint());
        } else if (this.check('GAME_TRIGGER')) {
          composition.triggers!.push(this.parseGameTrigger());
        } else if (this.check('MOVEMENT_PATH')) {
          composition.movementPaths!.push(this.parseMovementPath());
        } else if (this.check('REACTION_TRIGGER')) {
          composition.reactionTriggers!.push(this.parseReactionTrigger());
        } else if (this.check('WORLD_LAYER')) {
          composition.worldLayers!.push(this.parseWorldLayer());
        } else if (this.check('DUNGEON_INSTANCE')) {
          composition.dungeonInstances!.push(this.parseDungeonInstance());
        } else if (this.check('WORLD_SHARD')) {
          composition.worldShards!.push(this.parseWorldShard());
        } else if (this.check('REAL_ESTATE')) {
          // real_estate maps to a domain block (RealEstateTrait + ZoneWorldConstraints)
          composition.domainBlocks!.push(this.parseDomainBlock());
          // Domain-specific blocks (v4)
        } else if (this.isDomainBlockToken()) {
          composition.domainBlocks!.push(this.parseDomainBlock());
        } else if (this.isLooseDomainBlockStart() || this.isLooseNamedDomainBlockStart()) {
          composition.domainBlocks!.push(this.parseDomainBlock());
        } else if (this.check('MODULE')) {
          composition.domainBlocks!.push(this.parseDomainBlock());
        } else if (this.check('AT')) {
          // Check for @platform(...) decorator at composition level
          if (
            this.peek(1).type === 'IDENTIFIER' &&
            this.peek(1).value.toLowerCase() === 'platform'
          ) {
            this.advance(); // consume @
            this.advance(); // consume 'platform'
            const constraint = this.parsePlatformConstraint();
            this.skipNewlines();
            // Attach the constraint to the next block
            if (this.check('TEMPLATE')) {
              const tmpl = this.parseTemplate();
              tmpl.platformConstraint = constraint;
              composition.templates.push(tmpl);
            } else if (this.check('OBJECT')) {
              const obj = this.parseObject();
              obj.platformConstraint = constraint;
              composition.objects.push(obj);
            } else if (this.check('NORM')) {
              const norm = this.parseNormBlock();
              norm.platformConstraint = constraint;
              composition.norms!.push(norm);
            } else if (this.check('SPATIAL_GROUP')) {
              const grp = this.parseSpatialGroup();
              grp.platformConstraint = constraint;
              composition.spatialGroups.push(grp);
            } else if (this.check('LIGHT')) {
              const light = this.parseLight();
              light.platformConstraint = constraint;
              composition.lights.push(light);
            } else {
              // Unknown block after @platform — best-effort skip
              if (this.check('LBRACE')) this.skipBlock();
            }
          } else {
            // Handle @state, @world, and other decorators at composition level
            this.advance(); // consume @
            const decoratorName = this.current().value.toLowerCase();
            this.advance(); // consume decorator name

            if (decoratorName === 'state') {
              composition.state = this.parseStateBody();
            } else if (decoratorName === 'world' || decoratorName === 'environment') {
              composition.environment = this.parseEnvironmentBody();
            } else if (decoratorName === 'state_machine') {
              // @state_machine { initial: "..." state "name" { ... } ... }
              // Route through the real SM body parser so it lands in composition.stateMachines.
              if (this.check('LBRACE')) {
                composition.stateMachines.push(this.parseStateMachineFromDecorator());
              }
            } else {
              // Capture unknown decorator arguments (e.g. @page, @metadata)
              composition.traits = composition.traits || [];
              const config = this.parseOptionalTraitConfig();
              composition.traits.push({ type: 'ObjectTrait', name: decoratorName, config });
            }
          }
        } else if (this.check('ACTION') || this.check('ASYNC')) {
          // action / async action at composition level
          composition.actions = composition.actions || [];
          composition.actions.push(this.parseAction());
        } else if (this.check('USING')) {
          // using "path/to/module" [as Name] at composition level
          this.advance(); // consume USING
          if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // path or name
          if (this.check('IDENTIFIER') && this.current().value === 'as') {
            this.advance(); // as
            if (this.check('IDENTIFIER')) this.advance(); // alias
          }
        } else if (this.isLooseOnHandlerStart()) {
          this.skipLooseOnHandler();
        } else if (this.check('COLON')) {
          // Stray colon at composition level (e.g. from @anchored_to: "value")
          this.advance(); // skip colon
          if (!this.check('RBRACE') && !this.isAtEnd()) this.parseValue();
        } else if (this.check('IDENTIFIER')) {
          // Generic IDENTIFIER handler for DSL-level blocks:
          // config { }, anchor "name" { }, activity "name" { }, module "name" { },
          // permissions: [...], panel "HUD" { }, networked { }, gesture "pinch" { }, etc.
          const identValue = this.current().value;

          // Typo detection: check if identifier is a typo of a known composition-level keyword
          const knownBlocks = [
            'environment',
            'state',
            'logic',
            'template',
            'object',
            'spatial_group',
            'import',
            'light',
            'norm',
            'metanorm',
          ];
          const typoMatch = TypoDetector.findClosestMatch(identValue, knownBlocks);
          if (typoMatch && typoMatch !== identValue) {
            this.error(
              `Unknown block "${identValue}"`,
              `Did you mean "${typoMatch}"? Check for typos in the keyword.`
            );
          }

          this.advance(); // consume IDENTIFIER
          if (this.check('COLON')) {
            // identifier: value — property at composition level
            this.advance(); // consume :
            if (!this.check('RBRACE') && !this.isAtEnd()) this.parseValue();
          } else if (this.check('LBRACKET')) {
            // Brain-format string-array block: traits [ "name1", "name2" ]
            // HoloCompositionParser handles @DecoratorName syntax; this form is
            // emitted by .hsplus brain compositions and must be skipped here so
            // the token stream stays valid. Trait extraction in compile scripts
            // uses the extractBrainTraits() regex before parsing.
            this.advance(); // consume [
            while (!this.check('RBRACKET') && !this.isAtEnd()) this.advance();
            if (this.check('RBRACKET')) this.advance(); // consume ]
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

          this.error(
            `Unexpected token: ${this.current().type}. Expected one of: environment, state, logic, ` +
              'template, object, spatial_group, import, light, norm, metanorm, identifier/property, or }',
            suggestion
          );
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
    composition.loc = { start: startLoc, end: this.currentLocation() };
    return composition;
  }

  // ===========================================================================
  // IMPORT
  // ===========================================================================

  private parseImport(): HoloImport {
    const startLoc = this.currentLocation();
    this.expect('IMPORT');

    // Handle simple path import: import "./path/to/file.holo"
    if (this.check('STRING')) {
      const source = this.expectString();
      return {
        loc: { start: startLoc, end: this.currentLocation() },
        type: 'Import',
        specifiers: [],
        source,
      };
    }

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

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Import',
      specifiers,
      source,
    };
  }

  // ===========================================================================
  // USING (alias for import)
  // ===========================================================================

  private parseUsingStatement(): HoloImport | null {
    const startLoc = this.currentLocation();
    this.expect('USING');

    // using "path/to/module" syntax
    if (this.check('STRING')) {
      const source = this.expectString();
      return {
        loc: { start: startLoc, end: this.currentLocation() },
        type: 'Import',
        specifiers: [],
        source,
      };
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

      return {
        loc: { start: startLoc, end: this.currentLocation() },
        type: 'Import',
        specifiers,
        source,
      };
    }

    // Fallback: just skip unknown using syntax
    this.skipBlock();
    return null;
  }

  // ===========================================================================
  // THEME (brand identity tokens)
  // ===========================================================================

  private parseTheme(): HoloTheme {
    const startLoc = this.currentLocation();
    this.expect('THEME');
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloThemeProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'ThemeProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Theme',
      properties,
    };
  }

  // ENVIRONMENT
  // ===========================================================================

  private parseEnvironment(): HoloEnvironment {
    const startLoc = this.currentLocation();
    this.expect('ENVIRONMENT');
    this.skipNewlines();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloEnvironmentProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      if (this.check('PARTICLES') || this.check('PARTICLE_SYSTEM')) {
        const ps = this.parseParticleSystem();
        properties.push({
          type: 'EnvironmentProperty',
          key: ps.name,
          value: ps,
        });
      } else if (this.isPropertyName() && this.peek(1).type === 'LBRACE') {
        const key = this.parsePropertyKey();
        const value = this.parseBlockTraitConfig();
        properties.push({ type: 'EnvironmentProperty', key, value });
      } else {
        const key = this.parsePropertyKey();
        this.expect('COLON');
        const value = this.parseValue();
        properties.push({ type: 'EnvironmentProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Environment',
      properties,
    };
  }

  // ===========================================================================
  // SCENE (container for environment + objects)
  // ===========================================================================

  private parseScene(): HoloScene {
    const startLoc = this.currentLocation();
    this.expect('SCENE');
    let name = '';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.check('IDENTIFIER')) {
      name = this.expectIdentifier();
    } else {
      name = 'scene';
    }

    this.skipNewlines();
    this.expect('LBRACE');
    this.skipNewlines();

    let environment: HoloEnvironment | undefined;
    const objects: HoloObjectDecl[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      if (this.check('ENVIRONMENT')) {
        environment = this.parseEnvironment();
      } else if (this.check('OBJECT')) {
        objects.push(this.parseObject());
      } else if (this.check('LBRACE')) {
        // Nested block (unknown keyword body already consumed) — depth-track to avoid early exit
        this.skipBlock();
      } else {
        // Unknown token (keyword or other) — if followed by a block, skip the block too
        this.advance();
        if (this.check('STRING') || this.check('IDENTIFIER')) this.advance(); // optional name
        if (this.check('LPAREN')) this.skipParens(); // optional arg list
        if (this.check('LBRACE')) this.skipBlock(); // optional body
      }
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Scene',
      name,
      environment,
      objects,
    };
  }

  private parseParticleSystem(): HoloParticleSystem {
    const startLoc = this.currentLocation();
    if (this.check('PARTICLE_SYSTEM')) {
      this.advance();
    } else {
      this.expect('PARTICLES');
    }
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      properties[key] = this.parseValue();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'ParticleSystem',
      name,
      properties,
    };
  }

  // ===========================================================================
  // LIGHT (first-class block)
  // ===========================================================================

  private parseLight(): HoloLight {
    const startLoc = this.currentLocation();
    this.expect('LIGHT');
    // Name is optional — generators emit anonymous `light { ... }` (like primitives do).
    const name = this.check('STRING') ? this.expectString() : 'light';

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
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      // Tolerate @traits in a light body: generators emit `light { @position(...) @color(...) }`
      // instead of canonical key:value properties. Capture each as a light property (collapsing
      // positional args to an array) so nothing is lost; native-2d ignores lights anyway.
      if (this.check('AT')) {
        this.advance();
        const traitName = this.parseTraitName();
        const cfg = this.parseOptionalTraitConfig();
        const cfgKeys = Object.keys(cfg);
        let traitValue: HoloValue;
        if (cfgKeys.length === 0) traitValue = true;
        else if (cfgKeys.every((k) => /^_arg\d+$/.test(k))) {
          const arr = cfgKeys.sort().map((k) => cfg[k]);
          traitValue = (arr.length === 1 ? arr[0] : arr) as HoloValue;
        } else traitValue = cfg as HoloValue;
        properties.push({ type: 'LightProperty', key: traitName, value: traitValue });
        this.skipNewlines();
        continue;
      }

      const key = this.expectIdentifier();

      // Handle named sub-blocks: animation "pulse" { }, event "name" { }
      if (this.check('STRING')) {
        this.advance(); // consume quoted name
        if (this.check('LPAREN')) this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
        this.skipNewlines();
        continue;
      }

      // Handle LPAREN event handlers inside light body
      if (this.check('LPAREN')) {
        this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
        this.skipNewlines();
        continue;
      }

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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Light',
      name,
      lightType,
      properties,
    };
  }

  // ===========================================================================
  // EFFECTS (post-processing block)
  // ===========================================================================

  private parseEffects(): HoloEffects {
    const startLoc = this.currentLocation();
    this.expect('EFFECTS');
    this.expect('LBRACE');
    this.skipNewlines();

    const effects: HoloEffect[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const effectType = this.expectIdentifier();
      this.expect('LBRACE');
      this.skipNewlines();

      const properties: Record<string, HoloValue> = {};
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipBlockMemberSeparators();
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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Effects',
      effects,
    };
  }

  // ===========================================================================
  // CAMERA
  // ===========================================================================

  private parseCamera(): HoloCamera {
    const startLoc = this.currentLocation();
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

    // Optional quoted name: camera "MainCamera" { }
    if (this.check('STRING')) this.advance();

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloCameraProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      // Handle AT decorators in camera body: @camera_3d, @perspective etc.
      if (this.check('AT')) {
        this.advance(); // consume @
        if (!this.check('RBRACE') && !this.isAtEnd()) this.advance(); // decorator name
        if (this.check('LPAREN')) this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
        this.skipNewlines();
        continue;
      }

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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Camera',
      cameraType,
      properties,
    };
  }

  // ===========================================================================
  // TIMELINE
  // ===========================================================================

  private parseTimeline(): HoloTimeline {
    const startLoc = this.currentLocation();
    this.expect('TIMELINE');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const entries: HoloTimelineEntry[] = [];
    let autoplay: boolean | undefined;
    let loop: boolean | undefined;

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
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
        this.error(
          `Unexpected token in timeline: ${this.current().type}. ` +
            'Expected one of: autoplay, loop, numeric timestamp, or }'
        );
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Timeline',
      name,
      autoplay,
      loop,
      entries,
    };
  }

  private parseTimelineAction(): HoloTimelineAction {
    if (this.check('ANIMATE')) {
      this.advance();
      const target = this.expectString();
      this.expect('LBRACE');
      this.skipNewlines();
      const properties: Record<string, HoloValue> = {};
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipBlockMemberSeparators();
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
    const startLoc = this.currentLocation();
    this.expect('AUDIO');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloAudioProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
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
      // Skip expression continuations (e.g., trigger_when: GameState.time < 600)
      while (!this.check('RBRACE') && !this.check('NEWLINE') && !this.isAtEnd()) {
        this.advance();
      }
      properties.push({ type: 'AudioProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Audio',
      name,
      properties,
    };
  }

  // ===========================================================================
  // ZONE (trigger/interaction volume)
  // ===========================================================================

  private parseZone(): HoloZone {
    const startLoc = this.currentLocation();
    this.expect('ZONE');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloZoneProperty[] = [];
    const handlers: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Zone',
      name,
      properties,
      handlers,
    };
  }

  // ===========================================================================
  // UI (HUD overlay)
  // ===========================================================================

  private parseUI(): HoloUI {
    const startLoc = this.currentLocation();
    this.expect('UI');
    this.expect('LBRACE');
    this.skipNewlines();

    const elements: HoloUIElement[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'UI',
      elements,
    };
  }

  private parseUIElement(): HoloUIElement {
    const startLoc = this.currentLocation();
    this.expect('ELEMENT');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloUIProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'UIProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'UIElement',
      name,
      properties,
    };
  }

  // ===========================================================================
  // TRANSITION
  // ===========================================================================

  private parseTransition(): HoloTransition {
    const startLoc = this.currentLocation();
    this.expect('TRANSITION');
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloTransitionProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'TransitionProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Transition',
      name,
      properties,
    };
  }

  // ===========================================================================
  // CONDITIONAL BLOCK (scene-level if/else)
  // ===========================================================================

  private parseConditionalBlock(): HoloConditionalBlock {
    const startLoc = this.currentLocation();
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
      loc: { start: startLoc, end: this.currentLocation() },
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
    const startLoc = this.currentLocation();
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
      loc: { start: startLoc, end: this.currentLocation() },
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
    const startLoc = this.currentLocation();
    this.expect('STATE');
    // Support optional name: state TrainingState { } or state "MyState" { }
    if (this.check('IDENTIFIER') || this.check('STRING')) this.advance();
    return this.parseStateBody();
  }

  /**
   * Parse state body (after @state decorator or 'state' keyword)
   */
  private parseStateBody(): HoloState {
    const startLoc = this.currentLocation();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloStateProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'StateProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'State',
      properties,
    };
  }

  // ===========================================================================
  // TEMPLATE
  // ===========================================================================

  private parseTemplate(): HoloTemplate {
    const startLoc = this.currentLocation();
    this.expect('TEMPLATE');
    const name = this.expectString();
    this.skipNewlines();
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
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      if (this.check('STATE') && this.peek(1).type !== 'COLON') {
        template.state = this.parseState();
      } else if (this.check('ACTION') || this.check('ASYNC')) {
        const action = this.parseAction();
        template.actions.push(action);
        template.directives!.push({
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
          const config = this.parseOptionalTraitConfig();
          template.traits.push({ type: 'ObjectTrait', name: traitName, config } as HoloObjectTrait);
          // Also add traits as directives for compatibility
          template.directives!.push({ type: 'trait', name: traitName, config });
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

        let parameters: HoloParameter[] = [];
        if (this.check('LPAREN')) {
          parameters = this.parseParameterList();
        }

        // Use skipBlock() to safely skip handler body — may contain arrows, dot-chains, etc.
        this.skipBlock();

        // Add as lifecycle directive
        template.directives!.push({
          type: 'lifecycle',
          hook: eventName,
          parameters,
          body: [],
        });
      } else if (this.isPropertyName() && this.peek(1).type === 'LPAREN') {
        // method_name() { ... } — event handler / lifecycle method in template body
        const methodName = this.parsePropertyKey();
        this.skipParens(); // skip parameter list
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip body — too diverse (arrow fns, GDScript, etc.)
          template.directives!.push({
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
        const blockType = this.parsePropertyKey(); // e.g., "animation"
        const blockName = this.check('STRING') ? this.advance().value : this.expectIdentifier();
        if (this.check('LPAREN')) {
          this.skipParens();
        }
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip HoloScript property block (not code statements)
          template.directives!.push({
            type: blockType,
            name: blockName,
            parameters: [],
            body: [],
          });
        }
      } else if (this.isPropertyName() && this.peek(1).type === 'LBRACE') {
        // audio { } or unknown_block { } — bare block with no name
        const blockType = this.parsePropertyKey();
        if (this.check('LBRACE')) {
          this.skipBlock(); // skip HoloScript property block (not code statements)
          template.directives!.push({
            type: blockType,
            name: '',
            parameters: [],
            body: [],
          });
        }
      } else {
        const key = this.parsePropertyKey();
        this.expect('COLON');
        const value = this.parseValue();
        template.properties.push({ type: 'TemplateProperty', key, value });
      }
      this.skipBlockMemberSeparators();
    }

    this.expect('RBRACE');
    template.loc = { start: startLoc, end: this.currentLocation() };
    return template;
  }

  // ===========================================================================
  // OBJECT
  // ===========================================================================

  private parseObject(typeOverride?: string): HoloObjectDecl {
    // Capture start position BEFORE consuming the opening keyword so the
    // returned `loc.start` points at the declaration's first character —
    // the anchor downstream consumers (Absorb ReferenceGraph, DPO splitter)
    // use for the provenance semiring.
    const startLoc = this.currentLocation();
    const declarationKind = typeOverride ?? this.current().value.toLowerCase();
    if (!typeOverride) {
      this.expect('OBJECT');
    } else {
      this.advance(); // consume the type keyword (spatial_agent, etc.)
    }
    let name = '';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.isObjectNameToken()) {
      name = this.advance().value;
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
    let platformConstraint: PlatformConstraint | undefined;
    const traits: HoloObjectTrait[] = [];
    while (this.check('AT')) {
      this.advance(); // consume @
      const traitName = this.parseTraitName(); // handles digit-leading names like @2d_canvas
      if (String(traitName).toLowerCase() === 'platform') {
        platformConstraint = this.parsePlatformConstraint();
        this.skipNewlines();
        continue;
      }
      const config = this.parseOptionalTraitConfig(true);
      traits.push({ type: 'ObjectTrait' as const, name: traitName, config });
    }

    this.skipNewlines();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloObjectProperty[] = [];
    const children: HoloObjectDecl[] = [];
    const subOrbs: HoloSubOrb[] = [];
    const directives: Array<Record<string, unknown>> = [];
    let state: HoloState | undefined;

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipBlockMemberSeparators();
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

        let parameters: HoloParameter[] = [];
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
        if (String(traitName).toLowerCase() === 'platform') {
          const constraint = this.parsePlatformConstraint();
          this.skipNewlines();

          if (this.check('AT')) {
            this.advance(); // consume @
            const nextTraitName = this.isAtEnd() ? '' : this.advance().value;
            const config = this.parseOptionalTraitConfig();
            const trait = {
              type: 'ObjectTrait' as const,
              name: nextTraitName,
              config,
              platformConstraint: constraint,
            };
            traits.push(trait);
            directives.push({
              type: 'trait',
              name: nextTraitName,
              config,
              platformConstraint: constraint,
            });
          } else if (
            this.check('OBJECT') ||
            this.check('SPATIAL_AGENT') ||
            this.check('TOOL_SLOT') ||
            this.check('BEHAVIOR') ||
            this.current().type.startsWith('UI_')
          ) {
            const nestedType = this.check('OBJECT')
              ? undefined
              : this.current().value.toLowerCase();
            const child = this.parseObject(nestedType);
            child.platformConstraint = constraint;
            children.push(child);
          }
          this.skipNewlines();
          continue;
        }
        const config = this.parseOptionalTraitConfig();
        const trait = { type: 'ObjectTrait' as const, name: traitName, config };
        traits.push(trait);
        directives.push({ type: 'trait', name: traitName, config });
      } else if (this.check('STATE') && this.peek(1).type !== 'COLON') {
        // Handle state block in object
        state = this.parseState();
      } else if (this.isDomainBlockToken() && this.peek(1).type !== 'COLON') {
        // Structured physics sub-blocks directly inside objects:
        // collider box { ... }, rigidbody { ... }, force_field "name" { ... }, articulation "name" { ... }
        const domainBlock = this.parseDomainBlock();
        directives.push({ type: 'domainBlock', domain: domainBlock.domain, block: domainBlock });
      } else if (
        this.check('IDENTIFIER') &&
        this.current().value === 'physics' &&
        (this.peek(1).type === 'LBRACE' ||
          (this.peek(1).type === 'COLON' && this.peek(2).type === 'LBRACE'))
      ) {
        // Structured physics block: physics { collider { ... } rigidbody { ... } ... }
        // Also supports legacy: physics: { mass: 0.5 } (colon + flat object)
        const key = this.advance().value; // consume 'physics'
        const hasColon = this.check('COLON');
        if (hasColon) this.advance(); // consume optional ':'
        // Parse the block body — may contain sub-blocks or flat properties
        const physicsValue = this.parseValue();
        properties.push({ type: 'ObjectProperty', key, value: physicsValue });
      } else if (this.isPropertyName()) {
        // Handle identifier or keyword as property name
        const key = this.parsePropertyKey();
        if (this.check('COLON')) {
          this.advance();
          if (this.check('LBRACE')) {
            // Check if it's a statement block or object value
            // Treat on_xxx and onXxx (camelCase event handlers) as statement blocks
            const isCodeBlock =
              key.startsWith('on_') || /^on[A-Z]/.test(key) || key === 'lifecycle';
            if (isCodeBlock) {
              // Use skipBlock() for event handlers — bodies may contain non-HoloScript syntax
              this.skipBlock();
              properties.push({ type: 'ObjectProperty', key, value: [] });
            } else {
              properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
            }
          } else {
            properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
          }
        } else if (this.check('LPAREN')) {
          // Event handler style: on_event(params) { ... }
          // Use skipParens + skipBlock() for robustness — bodies may contain non-HoloScript syntax
          this.skipParens();
          if (this.check('LBRACE')) this.skipBlock();
          properties.push({
            type: 'ObjectProperty',
            key,
            value: { type: 'EventHandler', parameters: [], body: [] } as unknown as HoloValue,
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
          let parsedBody: Record<string, any> | '' = '';
          if (this.check('LBRACE')) {
            if (key === 'on' || key.startsWith('on_') || /^on[A-Z]/.test(key)) {
              this.skipBlock();
            } else {
              parsedBody = this.parseBlockTraitConfig();
            }
          }
          directives.push({ type: key, name: blockName, parameters: [], body: parsedBody });
        } else if (this.check('LBRACE')) {
          // `key { ... }` written WITHOUT a colon — most often an event handler
          // (`on_click { toggle_trait "x" }`). Mirror the `key: { ... }` handling
          // above. Without this, the key fell through to the bare-identifier case
          // below and the `{ ... }` body leaked into the object body, where its
          // closing `}` was consumed as the OBJECT's closing brace — silently
          // dropping every sibling object that followed (board task_1780212452397_ma1z).
          const isCodeBlock = key.startsWith('on_') || /^on[A-Z]/.test(key) || key === 'lifecycle';
          if (isCodeBlock) {
            this.skipBlock();
            properties.push({ type: 'ObjectProperty', key, value: [] });
          } else {
            properties.push({ type: 'ObjectProperty', key, value: this.parseValue() });
          }
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
    const endLoc = this.currentLocation();
    const obj: HoloObjectDecl = {
      type: 'Object',
      name,
      template,
      properties,
      state,
      traits, // Added traits property
      platformConstraint,
      directives, // Added directives
      children: children.length > 0 ? children : undefined,
      subOrbs: subOrbs.length > 0 ? subOrbs : undefined,
      // Byte-precise range — provenance semiring anchor (Absorb A3).
      loc: { start: startLoc, end: endLoc },
    };

    if (typeOverride) {
      obj.properties.unshift({ type: 'ObjectProperty', key: 'type', value: typeOverride });
    }

    if (declarationKind === 'instanced_object') {
      obj.declarationKind = 'instanced_object';
      obj.instanceMetadata = this.buildInstancedObjectMetadata(properties, traits, {
        start: startLoc,
        end: endLoc,
      });
    }

    return obj;
  }

  private buildInstancedObjectMetadata(
    properties: HoloObjectProperty[],
    traits: HoloObjectTrait[],
    loc: SourceRange
  ): HoloInstancedObjectMetadata {
    const propertyMap: Record<string, HoloValue> = {};
    for (const property of properties) {
      propertyMap[property.key] = property.value;
    }

    const count = this.asOptionalNumber(propertyMap['instance_count'] ?? propertyMap['count']);
    const anchor = this.asOptionalString(
      propertyMap['anchor'] ?? this.propertyFromObject(propertyMap['generator'], 'anchor')
    );
    const seed = propertyMap['seed'] ?? this.propertyFromObject(propertyMap['generator'], 'seed');
    const generator = propertyMap['generator'];

    return {
      type: 'InstancedObjectMetadata',
      sourceTrait: this.normalizeTraitRef(propertyMap['source_trait']),
      instanceTraits: this.normalizeTraitRefs(
        propertyMap['instance_trait'] ?? propertyMap['instance_traits']
      ),
      ...(count === undefined ? {} : { count }),
      ...(anchor === undefined ? {} : { anchor }),
      ...(seed === undefined ? {} : { seed }),
      ...(generator === undefined ? {} : { generator }),
      properties: propertyMap,
      traits: traits.map((trait) => ({
        ...trait,
        config: { ...trait.config },
        ...(trait.args ? { args: [...trait.args] } : {}),
      })),
      loc,
    };
  }

  private normalizeTraitRefs(value: HoloValue | undefined): string[] {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.normalizeTraitRef(entry))
        .filter((entry): entry is string => entry !== undefined);
    }
    const single = this.normalizeTraitRef(value);
    return single ? [single] : [];
  }

  private normalizeTraitRef(value: HoloValue | undefined): string | undefined {
    if (typeof value !== 'string' || value.length === 0) {
      return undefined;
    }
    return value.startsWith('@') ? value : `@${value}`;
  }

  private asOptionalNumber(value: HoloValue | undefined): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private asOptionalString(value: HoloValue | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private propertyFromObject(value: HoloValue | undefined, key: string): HoloValue | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value) || '__bind' in value) {
      return undefined;
    }
    return value[key];
  }

  private parseSpatialObject(type: string): HoloObjectDecl {
    return this.parseObject(type);
  }

  // ===========================================================================
  // SPATIAL GROUP
  // ===========================================================================

  private parseSpatialGroup(): HoloSpatialGroup {
    const startLoc = this.currentLocation();
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
      loc: { start: startLoc, end: this.currentLocation() },
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
    const startLoc = this.currentLocation();
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
          // Event handler with parameters: on_player_attack(enemy) { ... }
          const parameters = this.parseParameterList();
          if (this.check('LBRACE')) {
            this.advance(); // consume {
            this.skipNewlines();
            const body = this.parseStatementBlock();
            this.expect('RBRACE');
            handlers.push({ type: 'EventHandler' as const, event: name, parameters, body });
          } else {
            handlers.push({ type: 'EventHandler' as const, event: name, parameters, body: [] });
          }
        } else if (this.check('LBRACE')) {
          // No-parens style: on_enter { ... }
          this.advance(); // consume {
          this.skipNewlines();
          const body = this.parseStatementBlock();
          this.expect('RBRACE');
          handlers.push({ type: 'EventHandler' as const, event: name, parameters: [], body });
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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Logic',
      handlers,
      actions,
    };
  }

  private parseAction(): HoloAction {
    const startLoc = this.currentLocation();
    const isAsync = this.match('ASYNC');
    this.expect('ACTION');
    const name = this.expectIdentifier();
    const parameters = this.parseParameterList();
    if (this.check('LBRACE')) {
      this.skipBlock(); // skip action body — too diverse to parse statement-by-statement
    }
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Action',
      name,
      parameters,
      body: [],
      async: isAsync,
    };
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
    const startLoc = this.currentLocation();
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

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'IfStatement',
      condition,
      consequent,
      alternate,
    };
  }

  private parseWhileStatement(): HoloWhileStatement {
    const startLoc = this.currentLocation();
    this.expect('WHILE');
    const condition = this.parseExpression();
    this.expect('LBRACE');
    this.skipNewlines();
    const body = this.parseStatementBlock();
    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'WhileStatement',
      condition,
      body,
    };
  }

  private parseForStatement(): HoloStatement {
    const startLoc = this.currentLocation();
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

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'ForStatement',
      variable,
      iterable,
      body,
    };
  }

  private parseClassicForStatement(): HoloStatement {
    const startLoc = this.currentLocation();
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

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'ClassicForStatement',
      init,
      test,
      update,
      body,
    };
  }

  private parseVariableDeclaration(): HoloVariableDeclaration {
    const startLoc = this.currentLocation();
    const kind = this.advance().value as 'let' | 'var' | 'const';
    const name = this.expectIdentifier();
    let value: HoloExpression | undefined;
    if (this.match('EQUALS')) {
      value = this.parseExpression();
    }
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'VariableDeclaration',
      kind,
      name,
      value,
    };
  }

  private parseAwaitStatement(): HoloStatement {
    const startLoc = this.currentLocation();
    this.expect('AWAIT');
    const expression = this.parseExpression();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'AwaitStatement',
      expression,
    };
  }

  private parseReturnStatement(): HoloStatement {
    const startLoc = this.currentLocation();
    this.expect('RETURN');
    let value: HoloExpression | undefined;
    if (!this.check('NEWLINE') && !this.check('RBRACE')) {
      value = this.parseExpression();
    }
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'ReturnStatement',
      value,
    };
  }

  private parseEmitStatement(): HoloStatement {
    const startLoc = this.currentLocation();
    this.expect('EMIT');
    let event: string;
    let data: HoloExpression | undefined;
    if (this.check('LPAREN')) {
      // emit("event", data) — paren-call syntax
      this.advance(); // consume (
      event = this.expectString();
      if (this.check('COMMA')) {
        this.advance(); // consume ,
        data = this.parseExpression();
      }
      this.expect('RPAREN');
    } else {
      // emit "event" data — bare syntax
      event = this.expectString();
      if (this.check('LBRACE') || this.check('IDENTIFIER')) {
        data = this.parseExpression();
      }
    }
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'EmitStatement',
      event,
      data,
    };
  }

  private parseAnimateStatement(): HoloStatement {
    const startLoc = this.currentLocation();
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
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'AnimateStatement',
      target,
      properties,
    };
  }

  private parseOnErrorStatement(): HoloOnErrorStatement {
    const startLoc = this.currentLocation();
    this.expect('ON_ERROR');
    this.expect('LBRACE');
    this.skipNewlines();
    const body = this.parseStatementBlock();
    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'OnErrorStatement',
      body,
    };
  }

  private parseAssignmentOrExpression(): HoloStatement {
    const startLoc = this.currentLocation();
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
      return {
        loc: { start: startLoc, end: this.currentLocation() },
        type: 'Assignment',
        target,
        operator: op,
        value,
      };
    }

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'ExpressionStatement',
      expression: expr,
    };
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
    const startLoc = this.currentLocation();
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
        properties.push({ type: 'ObjectProperty', key, value });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'SubOrb',
      name,
      source,
      properties,
    };
  }

  // ===========================================================================
  // EXPRESSIONS — delegates to composition/expression-rules.ts (W1-T2)
  // ===========================================================================

  /**
   * Bridge accessor — satisfies ExpressionParserApi via duck typing.
   * Private methods on this class match the structural interface, but
   * TypeScript's visibility rules prevent `this` from being assigned
   * directly. The cast is safe: the methods exist with matching signatures.
   */
  private get _exprApi(): ExpressionParserApi {
    return this as unknown as ExpressionParserApi;
  }

  private parseExpression(): HoloExpression {
    return parseExpressionRule(this._exprApi);
  }

  private isKeywordAsIdentifierType(type: TokenType): boolean {
    return isKeywordAsIdentifierTypeRule(this._exprApi, type);
  }

  private isKeywordAsIdentifier(): boolean {
    return isKeywordAsIdentifierRule(this._exprApi);
  }

  private isObjectNameToken(): boolean {
    const type = this.current().type;
    if (type === 'IDENTIFIER') return true;

    // `entity` is tokenized as OBJECT, and `orb` remains an object-declaration
    // alias. Keep those reserved while accepting scene nouns like `Camera`.
    if (type === 'OBJECT') return false;

    return this.isKeywordAsIdentifierType(type);
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
    if (this.match('AT')) {
      const traitName = this.parseTraitName();
      if (traitName) return `@${traitName}`;
      this.error(`Expected trait name after '@', got ${this.current().type}`);
      return null;
    }
    if (this.match('HASH')) {
      return this.parseHashLiteral();
    }
    // enum() type-spec: enum("a" | "b") — used in @trait props blocks.
    // The ENUM keyword is tokenized differently from IDENTIFIER, so it must be
    // handled explicitly here. Parse the full enum(...) call and return it as a
    // string type-spec so downstream consumers (trait loaders, schema emitters)
    // can interpret it without the parser erroring out.
    if (this.check('ENUM')) {
      return this.parseEnumTypeSpec();
    }
    if (this.isBarewordPathToken()) {
      return this.parseBarewordPathValue();
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

  /**
   * Parse an `enum(...)` type-spec expression, e.g.:
   *   enum("button" | "slider" | "checkbox")
   *
   * Returns the canonical string representation so trait loaders and schema
   * emitters can read it as a type annotation. Called from parseValue() when
   * the current token is ENUM (the keyword `enum` tokenized as 'ENUM' rather
   * than 'IDENTIFIER').
   *
   * The opening `enum` token is consumed here. The caller should check for a
   * trailing `= defaultValue` if the context supports it (e.g. parseObjectValue).
   */
  private parseEnumTypeSpec(): string {
    this.advance(); // consume 'enum'
    let spec = 'enum';
    if (this.check('LPAREN')) {
      spec += this.parseParenthesizedLiteral();
    }
    return spec;
  }

  private isBarewordPathToken(): boolean {
    const type = this.current().type;
    return (
      type === 'IDENTIFIER' ||
      type === 'STATE' ||
      HoloCompositionParser.DOMAIN_TOKENS.has(type) ||
      this.isKeywordAsIdentifierType(type)
    );
  }

  private parseBarewordPathValue(): string {
    let value = this.advance().value;

    while (this.match('DOT')) {
      if (!this.isBarewordPathToken()) {
        this.error(`Expected identifier after '.', got ${this.current().type}`);
        break;
      }
      value += `.${this.advance().value}`;
    }

    if (this.match('LESS')) {
      value += '<';
      let depth = 1;
      while (depth > 0 && !this.isAtEnd()) {
        if (this.check('LESS')) {
          depth++;
          value += this.advance().value;
          continue;
        }
        if (this.check('GREATER')) {
          depth--;
          this.advance();
          value += '>';
          if (depth === 0) break;
          continue;
        }
        value += this.advance().value;
      }
    }

    if (this.check('LPAREN')) {
      value += this.parseParenthesizedLiteral();
    }

    return value;
  }

  private parseHashLiteral(): string {
    let value = '#';
    while (!this.isAtEnd()) {
      if (
        this.check('IDENTIFIER') ||
        this.check('NUMBER') ||
        this.check('MINUS') ||
        this.check('DOT')
      ) {
        value += this.advance().value;
        continue;
      }
      break;
    }
    return value;
  }

  private parseParenthesizedLiteral(): string {
    let value = '';
    if (!this.check('LPAREN')) return value;

    let depth = 0;
    while (!this.isAtEnd()) {
      const token = this.current();
      if (token.type === 'LPAREN') depth++;
      if (token.type === 'RPAREN') depth--;

      value += token.type === 'STRING' ? `"${token.value}"` : token.value;
      this.advance();

      if (depth === 0) break;
    }

    return value;
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
      if (this.check('RBRACKET')) break;
      elements.push(this.parseValue());
      this.skipNewlines();
      this.match('COMMA');
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
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      // Only parse key: value if it looks like a property (identifier followed by colon)
      if (this.isPropertyAssignmentStart()) {
        const key = this.parsePropertyKey();
        this.expect('COLON');
        obj[key] = this.parseValue();
        // Consume optional `= defaultValue` after type-spec annotations (e.g. in @trait props
        // blocks: `role: enum("a" | "b") = "a"` or `label: string = ""`). The EQUALS token
        // is not a block-member separator so it would confuse the loop if left unconsumed.
        if (this.match('EQUALS')) {
          this.parseValue(); // parse-and-discard the default value (not stored separately)
        }
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

  private isLightPrimitive(value: string): boolean {
    return LIGHT_PRIMITIVES.has(value.toLowerCase());
  }

  /**
   * Parse light shorthand: point_light { ... }, ambient_light { ... }, directional_light { ... }
   */
  private parseLightPrimitive(): HoloLight {
    const startLoc = this.currentLocation();
    const lightPrimitive = this.current().value.toLowerCase();
    this.advance(); // consume the light primitive identifier

    const LIGHT_TYPE_MAP: Record<string, HoloLight['lightType']> = {
      point_light: 'point',
      ambient_light: 'ambient',
      directional_light: 'directional',
      spot_light: 'spot',
      hemisphere_light: 'hemisphere',
    };
    const lightType = LIGHT_TYPE_MAP[lightPrimitive] || 'point';

    // Optional name
    let name = `${lightPrimitive}_${Date.now()}`;
    if (this.check('STRING')) {
      name = this.parseValue() as string;
    } else if (this.check('IDENTIFIER') && !this.check('LBRACE')) {
      name = this.expectIdentifier();
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: HoloLightProperty[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties.push({ type: 'LightProperty', key, value });
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Light',
      name,
      lightType,
      properties,
    };
  }

  /**
   * Check if current token can be used as a property name
   * Allows identifiers and keywords that can be property names (animate, material, etc.)
   */
  private isPropertyName(): boolean {
    const type = this.current().type;
    if (type === 'IDENTIFIER') return true;

    // All domain/simulation keywords can be property names in object bodies
    if (HoloCompositionParser.DOMAIN_TOKENS.has(type)) return true;

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
      'ACTION',
      'ON_ERROR',
      // Structured physics sub-block keywords (can also appear as property names)
      'COLLIDER',
      'RIGIDBODY',
      'FORCE_FIELD',
      'ARTICULATION',
      // Spatial primitives
      'SPAWN_GROUP',
      'WAYPOINTS',
      'CONSTRAINT',
      'TERRAIN',
      'PARTICLES',
      'HOLO_TOPIC',
      'HOLO_CHANNEL',
      'CONNECT',
      'BIND',
    ];
    return validPropertyKeywords.includes(type);
  }

  private isPropertyNameToken(token: Token): boolean {
    return (
      token.type === 'IDENTIFIER' ||
      HoloCompositionParser.DOMAIN_TOKENS.has(token.type) ||
      this.isKeywordAsIdentifierType(token.type)
    );
  }

  private isPropertyAssignmentStart(): boolean {
    if (!this.isPropertyName()) return false;
    let index = this.pos + 1;
    if (this.tokens[index]?.type === 'QUESTION') index++;

    while (this.tokens[index]?.type === 'DOT' && this.isPropertyNameToken(this.tokens[index + 1])) {
      index += 2;
      if (this.tokens[index]?.type === 'QUESTION') index++;
    }

    return this.tokens[index]?.type === 'COLON';
  }

  private parsePropertyKey(): string {
    const parts: string[] = [];
    parts.push(this.isPropertyName() ? this.advance().value : this.expectIdentifier());

    while (this.match('DOT')) {
      if (!this.isPropertyName()) {
        this.error(`Expected identifier after '.', got ${this.current().type}`);
        break;
      }
      parts.push(this.advance().value);
    }

    let key = parts.join('.');
    if (this.match('QUESTION')) key += '?';
    return key;
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
        this.skipBlockMemberSeparators();
        if (this.check('RBRACE')) break;

        // Parse object body members (similar to parseObject)
        if (this.check('AT')) {
          this.advance(); // consume @
          const name = this.parseTraitName(); // handles digit-leading names like @2d_canvas
          const config = this.parseOptionalTraitConfig();
          traits.push({ type: 'ObjectTrait' as const, name, config });
        } else if (this.isPropertyName()) {
          const key = this.parsePropertyKey();
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

  /**
   * Read a trait name after '@'. Trait names may start with a digit (e.g. @2d_canvas, a
   * registered Semantic2D trait), but the lexer cannot start an IDENTIFIER with a digit, so it
   * splits "2d_canvas" into NUMBER("2") + IDENTIFIER("d_canvas"). Reassemble those so the
   * canonical trait name parses in BOTH primitive and object bodies (the primitive body used to
   * error via expectIdentifier; the object body silently captured only "2", dropping the rest —
   * which also silently corrupted the shipped 2d-revolution template). Also accepts a quoted
   * name (@"2d_canvas") and keyword-as-identifier names.
   */
  private parseTraitName(): string {
    if (this.check('STRING')) {
      return this.advance().value;
    }
    if (this.check('NUMBER')) {
      let name = this.advance().value;
      // Reassemble a digit-leading name split by the lexer: NUMBER + IDENTIFIER (2 + d_canvas).
      if (this.check('IDENTIFIER')) {
        name += this.advance().value;
      }
      return name;
    }
    if (this.check('IDENTIFIER')) {
      return this.advance().value;
    }
    if (this.isKeywordAsIdentifierType(this.current().type)) {
      return this.advance().value;
    }
    return this.isAtEnd() ? '' : this.advance().value;
  }

  private expectIdentifier(): string {
    // Accept both IDENTIFIER tokens and keywords when used as property names
    // This allows `audio: { ... }` inside environment blocks
    if (this.check('IDENTIFIER')) {
      return this.advance().value;
    }

    // Keywords can also be used as property names (e.g., audio, object, state, material)
    // Use the unified isKeywordAsIdentifierType() check to avoid maintaining duplicate lists
    const current = this.current();
    if (this.isKeywordAsIdentifierType(current.type)) {
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

  private skipBlockMemberSeparators(): void {
    this.skipNewlines();
    while (this.matchBlockMemberSeparator()) {
      this.skipNewlines();
    }
  }

  private matchBlockMemberSeparator(): boolean {
    return this.match('COMMA') || this.match('SEMICOLON');
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

  private parseOptionalTraitConfig(requireBodyAfterBareBrace = false): Record<string, HoloValue> {
    if (this.check('LPAREN')) {
      return this.parseTraitConfig();
    }

    if (this.check('COLON')) {
      this.advance();
      this.skipNewlines();
      if (this.check('LBRACE')) {
        return this.parseBlockTraitConfig();
      }
      return { _arg0: this.parseValue() };
    }

    if (this.check('LBRACE')) {
      if (requireBodyAfterBareBrace && !this.isCurrentBraceBlockFollowedBy('LBRACE')) {
        return {};
      }
      return this.parseBlockTraitConfig();
    }

    return {};
  }

  private isCurrentBraceBlockFollowedBy(type: TokenType): boolean {
    if (!this.check('LBRACE')) {
      return false;
    }

    let depth = 0;
    for (let index = this.pos; index < this.tokens.length; index++) {
      const token = this.tokens[index];
      if (token.type === 'LBRACE') {
        depth++;
      } else if (token.type === 'RBRACE') {
        depth--;
        if (depth === 0) {
          let next = index + 1;
          while (this.tokens[next]?.type === 'NEWLINE') {
            next++;
          }
          return (this.tokens[next]?.type || 'EOF') === type;
        }
      }
    }

    return false;
  }

  private parseTraitConfig(): Record<string, HoloValue> {
    this.expect('LPAREN');
    const config: Record<string, HoloValue> = {};

    let argIndex = 0;
    while (!this.check('RPAREN') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RPAREN')) break;

      // Handle positional arguments: @tooltip("string"), @tags([...]), @version("1.0.0")
      // If the next token is NOT identifier:colon, treat as positional value
      if (!this.isPropertyAssignmentStart()) {
        config[`_arg${argIndex++}`] = this.parseValue();
      } else {
        const key = this.parsePropertyKey();
        this.expect('COLON');
        config[key] = this.parseValue();
      }

      this.matchBlockMemberSeparator();
      this.skipNewlines();
    }

    this.expect('RPAREN');
    return config;
  }

  private parseBlockTraitConfig(): Record<string, HoloValue> {
    this.expect('LBRACE');
    this.skipNewlines();

    const config: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      const key = this.parsePropertyKey();
      this.expect('COLON');
      config[key] = this.parseValue();

      this.matchBlockMemberSeparator();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    return config;
  }

  // ===========================================================================
  // PLATFORM CONSTRAINT PARSING
  // ===========================================================================

  /**
   * Parse @platform(...) decorator arguments into a PlatformConstraint.
   *
   * Supports three forms:
   *   @platform(quest3)                 → include: ['quest3'], exclude: []
   *   @platform(phone, desktop)         → include: ['phone', 'desktop'], exclude: []
   *   @platform(not: car, wearable)     → include: [], exclude: ['car', 'wearable']
   *
   * Assumes the `@` and `platform` tokens have already been consumed.
   * Expects the opening `(` to be the current token.
   */
  private parsePlatformConstraint(): PlatformConstraint {
    this.expect('LPAREN');

    const include: string[] = [];
    const exclude: string[] = [];
    let isExclude = false;
    let sawNotClause = false;

    this.skipNewlines();

    // Reject leading comma: @platform(, vr)
    if (this.check('COMMA')) {
      this.error(
        '@platform(): leading comma is not valid syntax — remove the comma before the first platform name',
        'Example: @platform(vr, ar)'
      );
      this.advance(); // consume the leading comma and continue
      this.skipNewlines();
    }

    // Reject empty @platform() at the parser level
    if (this.check('RPAREN')) {
      this.error(
        '@platform(): empty platform list — specify at least one platform or category (e.g. @platform(vr))',
        'Valid categories: vr, ar, mobile, desktop, automotive, wearable'
      );
      this.expect('RPAREN');
      return { include, exclude };
    }

    while (!this.check('RPAREN') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RPAREN')) break;

      // Check for "not:" prefix
      if (
        this.check('IDENTIFIER') &&
        this.current().value === 'not' &&
        this.peek(1).type === 'COLON'
      ) {
        this.advance(); // consume 'not'
        this.advance(); // consume ':'
        isExclude = true;
        sawNotClause = true;
        this.skipNewlines();

        // Reject empty not: clause: @platform(not: )
        if (this.check('RPAREN')) {
          this.error(
            '@platform(not: ...): empty exclusion list — specify at least one platform after "not:"',
            'Example: @platform(not: desktop)'
          );
          break;
        }
        continue;
      }

      // Check for invalid negation syntax: @platform(:not vr)
      // The lexer tokenises ':' as COLON; if we see COLON followed by 'not', it is a misplaced colon.
      if (this.check('COLON')) {
        const nextTok = this.peek(1);
        if (nextTok.type === 'IDENTIFIER' && nextTok.value === 'not') {
          this.error(
            '@platform(): invalid negation syntax ":not ..." — the correct form is "not: <platform>"',
            'Example: @platform(not: desktop)'
          );
          this.advance(); // consume ':'
          this.advance(); // consume 'not'
          isExclude = true;
          sawNotClause = true;
          this.skipNewlines();
          continue;
        }
        // Other stray colons — skip
        this.advance();
        continue;
      }

      // Read platform name (may be hyphenated like "android-xr")
      let platformName = '';
      if (this.check('IDENTIFIER') || this.check('STRING')) {
        platformName = this.check('STRING') ? this.expectString() : this.advance().value;
      } else {
        this.advance(); // skip unexpected token
        continue;
      }

      // Handle hyphenated names: phone-ios, android-xr, etc.
      while (this.check('MINUS') && this.peek(1).type === 'IDENTIFIER') {
        this.advance(); // consume '-'
        platformName += '-' + this.advance().value;
      }

      if (isExclude) {
        exclude.push(platformName);
      } else {
        include.push(platformName);
      }

      this.skipNewlines();

      if (this.check('COMMA')) {
        this.advance(); // consume ','
        this.skipNewlines();

        // Reject trailing comma: @platform(vr, )
        if (this.check('RPAREN')) {
          this.error(
            '@platform(): trailing comma is not valid syntax — remove the comma after the last platform name',
            'Example: @platform(vr, ar)'
          );
          break;
        }
      }
    }

    this.expect('RPAREN');
    return { include, exclude };
  }

  // ===========================================================================
  // BRITTNEY AI FEATURES - NPC BEHAVIOR TREES
  // ===========================================================================

  private parseNPC(): HoloNPC {
    const startLoc = this.currentLocation();
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
        else if (key === 'position') {
          // Accept [x, y, z] (coerced to {x,y,z}, mirroring spawn-point parsing) or {x,y,z}.
          if (Array.isArray(value) && value.length >= 3) {
            npc.position = { x: value[0] as number, y: value[1] as number, z: value[2] as number };
          } else if (value && typeof value === 'object' && 'x' in (value as object)) {
            const v = value as Record<string, number>;
            npc.position = { x: v.x, y: v.y, z: v.z };
          }
        } else if (key === 'brain_ref') {
          npc.brain = {
            ...(npc.brain ?? { type: 'AgentBrainAttachment', brainType: 'llm' }),
            type: 'AgentBrainAttachment',
            brainType: npc.brain?.brainType ?? 'llm',
            brainRef: value as string,
          };
        } else if (key === 'brain') {
          // brain: { type: "llm", autonomy: "autonomous", ref: "...", tools: [...] }
          const cfg = (value && typeof value === 'object' ? value : {}) as Record<
            string,
            HoloValue
          >;
          npc.brain = {
            type: 'AgentBrainAttachment',
            brainType: (cfg.type as AgentBrainAttachment['brainType']) ?? 'llm',
            autonomy: cfg.autonomy as AgentBrainAttachment['autonomy'] | undefined,
            brainRef:
              typeof cfg.ref === 'string'
                ? cfg.ref
                : typeof cfg.brainRef === 'string'
                  ? cfg.brainRef
                  : undefined,
            toolPermissions: Array.isArray(cfg.tools)
              ? (cfg.tools as HoloValue[]).map(String)
              : undefined,
            model:
              cfg.model && typeof cfg.model === 'object'
                ? (cfg.model as AgentBrainAttachment['model'])
                : undefined,
          };
        } else npc.properties.push({ type: 'NPCProperty', key, value });
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
    const startLoc = this.currentLocation();
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
      else if (key === 'items') rewards.items = value as unknown as HoloQuestRewardItem[];
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
    const startLoc = this.currentLocation();
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
        effects.impact = { type: 'AbilityImpact', ...val } as unknown as HoloAbilityImpact;
      } else if (key === 'damage') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.damage = {
          type: 'AbilityDamage',
          damageType: 'physical',
          ...val,
        } as unknown as HoloAbilityDamage;
      } else if (key === 'buff') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.buff = {
          type: 'AbilityBuff',
          stat: '',
          amount: 0,
          duration: 0,
          ...val,
        } as unknown as HoloAbilityBuff;
      } else if (key === 'debuff') {
        const val = this.parseValue() as Record<string, HoloValue>;
        effects.debuff = {
          type: 'AbilityDebuff',
          effect: 'slow',
          duration: 0,
          ...val,
        } as unknown as HoloAbilityDebuff;
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
    const startLoc = this.currentLocation();
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
      this.skipBlockMemberSeparators();
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
        this.skipBlockMemberSeparators();
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
    const startLoc = this.currentLocation();
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

      // Handle inline `state "name" { }` blocks (alternative state_machine syntax)
      if (this.check('STATE')) {
        this.advance(); // consume 'state'
        const stateName =
          this.check('STRING') || this.check('IDENTIFIER') ? this.advance().value : 'anonymous';
        // Auto-set first state as initial if not explicitly set
        if (!sm.initialState) sm.initialState = stateName;
        if (this.check('LBRACE')) {
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
            // Guard: if the current token cannot be an identifier, skip it to
            // avoid the infinite loop that occurs when expectIdentifier() fails
            // (adds an error but does NOT advance), e.g. on_tap: transition("x")
            // leaves "(" as the next token after parseValue() reads "transition".
            if (
              this.current().type !== 'IDENTIFIER' &&
              !this.isKeywordAsIdentifierType(this.current().type)
            ) {
              if (this.check('LPAREN')) this.skipParens();
              else if (this.check('LBRACE')) this.skipBlock();
              else this.advance();
              continue;
            }
            const key = this.expectIdentifier();
            if (this.check('COLON')) {
              this.advance(); // consume :
              if (key === 'enter' || key === 'entry') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.entry = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'exit') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.exit = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'actions') {
                state.actions = this.parseBehaviorActions();
              } else if (key === 'transitions') {
                state.transitions = this.parseStateTransitions();
              } else if (key === 'onDamage') {
                state.onDamage = this.parseStatementBlock();
              } else if (key === 'timeout') {
                state.timeout = this.parseValue() as number;
              } else if (key === 'onTimeout') {
                state.onTimeout = this.parseStatementBlock();
              } else {
                // Unknown key:value — consume the value (which may include
                // a call expression like `transition("placing")`).
                if (!this.check('RBRACE') && !this.isAtEnd()) {
                  const v = this.parseValue();
                  // parseValue() reads the identifier but NOT a following call
                  // expression — skip any trailing parens/block.
                  if (this.check('LPAREN')) this.skipParens();
                  if (this.check('LBRACE')) this.skipBlock();
                  void v;
                }
              }
            } else if (this.check('LBRACE')) {
              // key { ... } shorthand (e.g., enter { ... })
              if (key === 'enter' || key === 'entry') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.entry = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'exit') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.exit = this.parseStatementBlock();
                this.expect('RBRACE');
              } else {
                this.skipBlock();
              }
            } else if (this.check('LPAREN')) {
              // Bare call expression (e.g. key was already the fn name): skip args.
              this.skipParens();
              if (this.check('LBRACE')) this.skipBlock();
            }
            this.skipNewlines();
          }
          this.expect('RBRACE');
          sm.states[stateName] = state;
        }
        this.skipNewlines();
        continue;
      }

      // Same guard at the outer level (initial:, state-level unknown blocks).
      if (
        this.current().type !== 'IDENTIFIER' &&
        !this.isKeywordAsIdentifierType(this.current().type)
      ) {
        if (this.check('LPAREN')) this.skipParens();
        else if (this.check('LBRACE')) this.skipBlock();
        else this.advance();
        this.skipNewlines();
        continue;
      }
      const key = this.expectIdentifier();

      // Handle `initial: "stateName"` (short form of initialState)
      if (key === 'initial' || key === 'initialState') {
        this.expect('COLON');
        sm.initialState = this.parseValue() as string;
      } else if (key === 'states' && this.check('COLON')) {
        this.advance(); // consume ':'
        sm.states = this.parseStateMachineStates();
      } else if (this.check('COLON')) {
        // Unknown key:value — skip value
        this.advance(); // consume ':'
        this.parseValue();
        if (this.check('LPAREN')) this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
      } else if (this.check('LBRACE')) {
        // Unknown block — skip it
        this.skipBlock();
      } else if (this.check('LPAREN')) {
        this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
      }

      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return sm;
  }

  /**
   * Parse the body of an `@state_machine { ... }` decorator.
   *
   * Called after @ and state_machine tokens are already consumed — starts
   * at the opening LBRACE. Handles:
   *   - `initial: "stateName"` / `initialState: "stateName"`
   *   - `state "name" { on_entry { ... } on_exit { ... } transitions { ... } }`
   *   - `state identifier { ... }` (unquoted state names)
   *
   * Stores the result in composition.stateMachines so compilers can read it.
   * Without this, @state_machine blocks were stored as opaque traits and
   * invisible to compile_to_a2a_agent_card and other compilers.
   */
  private parseStateMachineFromDecorator(): HoloStateMachine {
    const startLoc = this.currentLocation();
    this.expect('LBRACE');
    this.skipNewlines();

    const sm: HoloStateMachine = {
      type: 'StateMachine',
      name: 'implicit',
      initialState: '',
      states: {},
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      if (this.check('STATE')) {
        this.advance(); // consume 'state'
        const stateName =
          this.check('STRING') || this.check('IDENTIFIER') ? this.advance().value : 'anonymous';
        if (!sm.initialState) sm.initialState = stateName;
        if (this.check('LBRACE')) {
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
            // Guard: skip non-identifier tokens to avoid an infinite loop when
            // expectIdentifier() fails without advancing (tolerant mode).
            if (
              this.current().type !== 'IDENTIFIER' &&
              !this.isKeywordAsIdentifierType(this.current().type)
            ) {
              if (this.check('LPAREN')) this.skipParens();
              else if (this.check('LBRACE')) this.skipBlock();
              else this.advance();
              continue;
            }
            const key = this.expectIdentifier();
            if (this.check('COLON')) {
              this.advance();
              if (key === 'enter' || key === 'entry' || key === 'on_entry') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.entry = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'exit' || key === 'on_exit') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.exit = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'actions') {
                state.actions = this.parseBehaviorActions();
              } else if (key === 'transitions') {
                state.transitions = this.parseStateTransitions();
              } else if (key === 'timeout') {
                state.timeout = this.parseValue() as number;
              } else {
                if (!this.check('RBRACE') && !this.isAtEnd()) {
                  this.parseValue();
                  if (this.check('LPAREN')) this.skipParens();
                  if (this.check('LBRACE')) this.skipBlock();
                }
              }
            } else if (this.check('LBRACE')) {
              if (key === 'enter' || key === 'entry' || key === 'on_entry') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.entry = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'exit' || key === 'on_exit') {
                this.expect('LBRACE');
                this.skipNewlines();
                state.exit = this.parseStatementBlock();
                this.expect('RBRACE');
              } else if (key === 'transitions') {
                state.transitions = this.parseStateTransitions();
              } else {
                this.skipBlock();
              }
            } else if (this.check('LPAREN')) {
              this.skipParens();
              if (this.check('LBRACE')) this.skipBlock();
            }
            this.skipNewlines();
          }
          this.expect('RBRACE');
          sm.states[stateName] = state;
        }
        this.skipNewlines();
        continue;
      }

      // Guard at outer level too.
      if (
        this.current().type !== 'IDENTIFIER' &&
        !this.isKeywordAsIdentifierType(this.current().type)
      ) {
        if (this.check('LPAREN')) this.skipParens();
        else if (this.check('LBRACE')) this.skipBlock();
        else this.advance();
        this.skipNewlines();
        continue;
      }
      const key = this.expectIdentifier();
      if (key === 'initial' || key === 'initialState') {
        this.expect('COLON');
        sm.initialState = this.parseValue() as string;
      } else if (key === 'name') {
        this.expect('COLON');
        sm.name = this.parseValue() as string;
      } else if (key === 'states' && this.check('COLON')) {
        this.advance();
        sm.states = this.parseStateMachineStates();
      } else if (this.check('COLON')) {
        this.advance();
        this.parseValue();
        if (this.check('LPAREN')) this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
      } else if (this.check('LBRACE')) {
        this.skipBlock();
      } else if (this.check('LPAREN')) {
        this.skipParens();
        if (this.check('LBRACE')) this.skipBlock();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    sm.loc = { start: startLoc, end: this.currentLocation() };
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
    const startLoc = this.currentLocation();
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
        achievement.reward = {
          type: 'AchievementReward',
          ...val,
        } as unknown as HoloAchievementReward;
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
    const startLoc = this.currentLocation();
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
          node.effect = {
            type: 'TalentEffect',
            effectType: 'passive',
            ...val,
          } as unknown as HoloTalentEffect;
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
    const startLoc = this.currentLocation();
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
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Shape',
      name,
      shapeType,
      properties,
    };
  }

  // ===========================================================================
  // SPATIAL PRIMITIVES (v4 — March 2026)
  // ===========================================================================

  private parseSpawnGroup(): HoloSpawnGroup {
    const startLoc = this.currentLocation();
    this.pushContext('spawn-group');
    this.advance(); // consume 'spawn_group'
    const name = this.expectString();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties[key] = value;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }
    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'SpawnGroup',
      name,
      properties,
    };
  }

  private parseWaypointsBlock(): HoloWaypoints {
    const startLoc = this.currentLocation();
    this.pushContext('waypoints');
    this.advance(); // consume 'waypoints'
    const name = this.expectString();
    const points = this.parseValue(); // expects array literal
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Waypoints',
      name,
      points,
    };
  }

  private parseConstraintBlock(): HoloConstraintBlock {
    const startLoc = this.currentLocation();
    this.pushContext('constraint');
    this.advance(); // consume 'constraint'
    const name = this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties[key] = value;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }
    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Constraint',
      name,
      properties,
    };
  }

  private parseTerrainBlock(): HoloTerrainBlock {
    const startLoc = this.currentLocation();
    this.pushContext('terrain');
    this.advance(); // consume 'terrain'
    const name = this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties[key] = value;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }
    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Terrain',
      name,
      properties,
    };
  }

  // ===========================================================================
  // DOMAIN-SPECIFIC BLOCKS (v4.1 — March 2026)
  // ===========================================================================

  /** Domain block token type set */
  private static readonly DOMAIN_TOKENS: Set<TokenType> = new Set([
    // Original 8 domain blocks
    'IOT_SENSOR',
    'IOT_DEVICE',
    'IOT_BINDING',
    'IOT_TELEMETRY',
    'IOT_DIGITAL_TWIN',
    'ROBOT_JOINT',
    'ROBOT_ACTUATOR',
    'ROBOT_CONTROLLER',
    'ROBOT_END_EFFECTOR',
    'DATAVIZ_DASHBOARD',
    'DATAVIZ_CHART',
    'DATAVIZ_DATA_SOURCE',
    'DATAVIZ_WIDGET',
    'DATAVIZ_METRIC',
    'EDU_LESSON',
    'EDU_QUIZ',
    'EDU_CURRICULUM',
    'HEALTH_PROCEDURE',
    'HEALTH_PATIENT_MODEL',
    'HEALTH_VITAL_MONITOR',
    'MUSIC_INSTRUMENT',
    'MUSIC_TRACK',
    'MUSIC_SEQUENCE',
    'MUSIC_EFFECT_CHAIN',
    'ARCH_FLOOR_PLAN',
    'ARCH_ROOM',
    'ARCH_BUILDING',
    'ARCH_HVAC',
    'WEB3_CONTRACT',
    'WEB3_TOKEN',
    'WEB3_WALLET',
    'WEB3_MARKETPLACE',
    'WEB3_GOVERNANCE',
    // Simulation domain (PDE solvers)
    'SIMULATION',
    // Perception & simulation layer
    'MATERIAL',
    'PBR_MATERIAL',
    'UNLIT_MATERIAL',
    'SHADER',
    'COLLIDER',
    'RIGIDBODY',
    'FORCE_FIELD',
    'ARTICULATION',
    'PARTICLES',
    'EMITTER',
    'VFX',
    'POST_PROCESSING',
    'POST_FX',
    'AUDIO_SOURCE',
    'REVERB_ZONE',
    'AMBIENCE',
    'WEATHER',
    'ATMOSPHERE',
    'PROCEDURAL',
    'PCG_GRAPH',
    'SCATTER',
    'LOD_BLOCK',
    'RENDER',
    'NAVMESH',
    'NAV_AGENT',
    'BEHAVIOR_TREE',
    'INPUT_BLOCK',
    'INTERACTION',
    // Codebase absorption (v4.3)
    'CODEBASE',
    'MODULE_MAP',
    'DEPENDENCY_GRAPH',
    'CALL_GRAPH',
    // Graph RAG (v4.4)
    'SEMANTIC_SEARCH',
    'GRAPH_QUERY',
    // Norm lifecycle / cultural engineering (v4.5)
    'NORM_PROPOSAL',
    'NORM_VOTING',
    'NORM_ADOPTION',
    'NORM_VIOLATION',
    'NORM_SANCTION',
    // Narrative / StoryWeaver Protocol (v4.6)
    'NARRATIVE_BLOCK',
    'CHAPTER',
    'DIALOGUE_TREE',
    'CUTSCENE_SEQUENCE',
    // Payment / x402 Protocol (v4.7)
    'PAYWALL',
    'PAYMENT_GATE',
    'SUBSCRIPTION',
    'TIP_JAR',
    // v6 Universal domains (v5.4 — Domains Unified)
    'SERVICE_BLOCK',
    'ENDPOINT_BLOCK',
    'ROUTE_BLOCK',
    'HANDLER_BLOCK',
    'MIDDLEWARE_BLOCK',
    'GATEWAY_BLOCK',
    'CONTRACT_BLOCK',
    'SCHEMA_BLOCK',
    'VALIDATOR_BLOCK',
    'SERIALIZER_BLOCK',
    'DB_BLOCK',
    'MODEL_BLOCK',
    'QUERY_BLOCK',
    'MIGRATION_BLOCK',
    'CACHE_BLOCK',
    'HTTP_BLOCK',
    'WEBSOCKET_BLOCK',
    'GRPC_BLOCK',
    'GRAPHQL_BLOCK',
    'PIPELINE_BLOCK',
    'STREAM_BLOCK',
    'QUEUE_BLOCK',
    'WORKER_BLOCK',
    'SCHEDULER_BLOCK',
    'METRIC_BLOCK',
    'TRACE_BLOCK',
    'LOG_BLOCK',
    'HEALTH_CHECK_BLOCK',
    'CONTAINER_BLOCK',
    'DEPLOYMENT_BLOCK',
    'SCALING_BLOCK',
    'SECRET_BLOCK',
    'CIRCUIT_BREAKER_BLOCK',
    'RETRY_BLOCK',
    'TIMEOUT_BLOCK',
    'FALLBACK_BLOCK',
    'BULKHEAD_BLOCK',
    // MMO/AAA game constructs (v6.2) — real_estate only; others handled by dedicated parsers
    'REAL_ESTATE',
  ]);

  /** Token → domain type mapping */
  private static readonly TOKEN_DOMAIN_MAP: Record<string, HoloDomainType> = {
    // Original 8 domains
    IOT_SENSOR: 'iot',
    IOT_DEVICE: 'iot',
    IOT_BINDING: 'iot',
    IOT_TELEMETRY: 'iot',
    IOT_DIGITAL_TWIN: 'iot',
    ROBOT_JOINT: 'robotics',
    ROBOT_ACTUATOR: 'robotics',
    ROBOT_CONTROLLER: 'robotics',
    ROBOT_END_EFFECTOR: 'robotics',
    DATAVIZ_DASHBOARD: 'dataviz',
    DATAVIZ_CHART: 'dataviz',
    DATAVIZ_DATA_SOURCE: 'dataviz',
    DATAVIZ_WIDGET: 'dataviz',
    DATAVIZ_METRIC: 'dataviz',
    EDU_LESSON: 'education',
    EDU_QUIZ: 'education',
    EDU_CURRICULUM: 'education',
    HEALTH_PROCEDURE: 'healthcare',
    HEALTH_PATIENT_MODEL: 'healthcare',
    HEALTH_VITAL_MONITOR: 'healthcare',
    MUSIC_INSTRUMENT: 'music',
    MUSIC_TRACK: 'music',
    MUSIC_SEQUENCE: 'music',
    MUSIC_EFFECT_CHAIN: 'music',
    ARCH_FLOOR_PLAN: 'architecture',
    ARCH_ROOM: 'architecture',
    ARCH_BUILDING: 'architecture',
    ARCH_HVAC: 'architecture',
    WEB3_CONTRACT: 'web3',
    WEB3_TOKEN: 'web3',
    WEB3_WALLET: 'web3',
    WEB3_MARKETPLACE: 'web3',
    WEB3_GOVERNANCE: 'web3',
    // Simulation domain (PDE solvers)
    SIMULATION: 'simulation',
    // Perception & simulation layer
    MATERIAL: 'material',
    PBR_MATERIAL: 'material',
    UNLIT_MATERIAL: 'material',
    SHADER: 'material',
    COLLIDER: 'physics',
    RIGIDBODY: 'physics',
    FORCE_FIELD: 'physics',
    ARTICULATION: 'physics',
    PARTICLES: 'vfx',
    EMITTER: 'vfx',
    VFX: 'vfx',
    POST_PROCESSING: 'postfx',
    POST_FX: 'postfx',
    AUDIO_SOURCE: 'audio',
    REVERB_ZONE: 'audio',
    AMBIENCE: 'audio',
    WEATHER: 'weather',
    ATMOSPHERE: 'weather',
    PROCEDURAL: 'procedural',
    PCG_GRAPH: 'procedural',
    SCATTER: 'procedural',
    LOD_BLOCK: 'rendering',
    RENDER: 'rendering',
    NAVMESH: 'navigation',
    NAV_AGENT: 'navigation',
    BEHAVIOR_TREE: 'navigation',
    INPUT_BLOCK: 'input',
    INTERACTION: 'input',
    // Codebase absorption (v4.3)
    CODEBASE: 'codebase',
    MODULE_MAP: 'codebase',
    DEPENDENCY_GRAPH: 'codebase',
    CALL_GRAPH: 'codebase',
    // Graph RAG (v4.4)
    SEMANTIC_SEARCH: 'codebase',
    GRAPH_QUERY: 'codebase',
    // Norm lifecycle / cultural engineering (v4.5)
    NORM_PROPOSAL: 'norms',
    NORM_VOTING: 'norms',
    NORM_ADOPTION: 'norms',
    NORM_VIOLATION: 'norms',
    NORM_SANCTION: 'norms',
    // Narrative / StoryWeaver Protocol (v4.6)
    NARRATIVE_BLOCK: 'narrative',
    CHAPTER: 'narrative',
    DIALOGUE_TREE: 'narrative',
    CUTSCENE_SEQUENCE: 'narrative',
    // Payment / x402 Protocol (v4.7)
    PAYWALL: 'payment',
    PAYMENT_GATE: 'payment',
    SUBSCRIPTION: 'payment',
    TIP_JAR: 'payment',
    // v6 Universal domains (v5.4 — Domains Unified)
    SERVICE_BLOCK: 'service',
    ENDPOINT_BLOCK: 'service',
    ROUTE_BLOCK: 'service',
    HANDLER_BLOCK: 'service',
    MIDDLEWARE_BLOCK: 'service',
    GATEWAY_BLOCK: 'service',
    CONTRACT_BLOCK: 'contract',
    SCHEMA_BLOCK: 'contract',
    VALIDATOR_BLOCK: 'contract',
    SERIALIZER_BLOCK: 'contract',
    DB_BLOCK: 'data',
    MODEL_BLOCK: 'data',
    QUERY_BLOCK: 'data',
    MIGRATION_BLOCK: 'data',
    CACHE_BLOCK: 'data',
    HTTP_BLOCK: 'network',
    WEBSOCKET_BLOCK: 'network',
    GRPC_BLOCK: 'network',
    GRAPHQL_BLOCK: 'network',
    PIPELINE_BLOCK: 'pipeline',
    STREAM_BLOCK: 'pipeline',
    QUEUE_BLOCK: 'pipeline',
    WORKER_BLOCK: 'pipeline',
    SCHEDULER_BLOCK: 'pipeline',
    METRIC_BLOCK: 'metric',
    TRACE_BLOCK: 'metric',
    LOG_BLOCK: 'metric',
    HEALTH_CHECK_BLOCK: 'metric',
    CONTAINER_BLOCK: 'container',
    DEPLOYMENT_BLOCK: 'container',
    SCALING_BLOCK: 'container',
    SECRET_BLOCK: 'container',
    CIRCUIT_BREAKER_BLOCK: 'resilience',
    RETRY_BLOCK: 'resilience',
    TIMEOUT_BLOCK: 'resilience',
    FALLBACK_BLOCK: 'resilience',
    BULKHEAD_BLOCK: 'resilience',
    // MMO/AAA game constructs (v6.2)
    REAL_ESTATE: 'custom',
  };

  /** Check if current token is a domain block token */
  private isDomainBlockToken(): boolean {
    return HoloCompositionParser.DOMAIN_TOKENS.has(this.current().type);
  }

  private isLooseOnHandlerStart(): boolean {
    return this.check('IDENTIFIER') && this.current().value === 'on';
  }

  private skipLooseOnHandler(): void {
    if (!this.isLooseOnHandlerStart()) return;
    this.advance(); // on

    while (!this.check('LBRACE') && !this.isAtEnd()) {
      if (this.check('LPAREN')) {
        this.skipParens();
      } else {
        this.advance();
      }
    }

    if (this.check('LBRACE')) {
      this.skipBlock();
    }
  }

  private isLooseDomainBlockStart(): boolean {
    if (!this.check('IDENTIFIER')) return false;
    const keyword = this.current().value;
    if (!/_material$/i.test(keyword)) return false;

    let index = this.pos + 1;
    if (this.tokens[index]?.type === 'STRING' || this.tokens[index]?.type === 'IDENTIFIER') {
      index++;
    }
    while (this.tokens[index]?.type === 'AT') {
      index += 2;
      if (this.tokens[index]?.type === 'LPAREN') {
        let depth = 1;
        index++;
        while (depth > 0 && index < this.tokens.length) {
          if (this.tokens[index].type === 'LPAREN') depth++;
          else if (this.tokens[index].type === 'RPAREN') depth--;
          index++;
        }
      }
    }
    while (this.tokens[index]?.type === 'NEWLINE') index++;
    return this.tokens[index]?.type === 'LBRACE';
  }

  private isLooseNamedDomainBlockStart(): boolean {
    if (!this.check('IDENTIFIER')) return false;
    const keyword = this.current().value.toLowerCase();
    if (this.isPrimitiveShape(keyword) || this.isLightPrimitive(keyword) || keyword === 'on') {
      return false;
    }

    let index = this.pos + 1;
    if (this.tokens[index]?.type !== 'STRING' && this.tokens[index]?.type !== 'IDENTIFIER') {
      return false;
    }
    index++;

    while (this.tokens[index]?.type === 'AT') {
      index += 2;
      if (this.tokens[index]?.type === 'LPAREN') {
        let depth = 1;
        index++;
        while (depth > 0 && index < this.tokens.length) {
          if (this.tokens[index].type === 'LPAREN') depth++;
          else if (this.tokens[index].type === 'RPAREN') depth--;
          index++;
        }
      }
    }
    while (this.tokens[index]?.type === 'NEWLINE') index++;

    return this.tokens[index]?.type === 'LBRACE';
  }

  // ===========================================================================
  // MMO/AAA GAME CONSTRUCTS (v6.2 — June 2026)
  // ===========================================================================

  /**
   * Parse a loot_table block with weighted entry sub-blocks and optional
   * guaranteed drop section.
   *
   * Syntax:
   *   loot_table goblin_drops {
   *     entry common_coin { item: "gold_coin" qty: "1..5" weight: 60 }
   *     entry nothing     { weight: 10 }
   *     guaranteed { item: "goblin_ear" qty: 1 }
   *     multiplier_on_faction_hostile: "ironveil * 1.5"
   *   }
   */
  private parseLootTable(): HoloLootTable {
    const startLoc = this.currentLocation();
    this.pushContext('loot-table');
    this.advance(); // consume 'loot_table'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const entries: HoloLootEntry[] = [];
    let guaranteed: Record<string, HoloValue> | undefined;
    const properties: Record<string, HoloValue> = {};

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      // 'entry' sub-block
      if (this.check('IDENTIFIER') && this.current().value === 'entry') {
        this.advance(); // consume 'entry'
        const entryId = this.check('STRING') ? this.expectString() : this.expectIdentifier();
        const entryProps: Record<string, HoloValue> = {};
        let weight = 0;
        let itemId: string | undefined;
        let qty: string | number | undefined;
        let rarity: HoloLootEntry['rarity'];
        let condition: string | undefined;

        if (this.check('LBRACE')) {
          this.advance(); // consume {
          this.skipNewlines();
          while (!this.check('RBRACE') && !this.isAtEnd()) {
            this.skipNewlines();
            if (this.check('RBRACE')) break;
            const key = this.expectIdentifier();
            this.expect('COLON');
            const val = this.parseValue();
            if (key === 'item') itemId = val as string;
            else if (key === 'weight') weight = val as number;
            else if (key === 'qty') qty = val as string | number;
            else if (key === 'rarity') rarity = val as HoloLootEntry['rarity'];
            else if (key === 'condition') condition = val as string;
            else entryProps[key] = val;
            if (this.check('COMMA')) this.advance();
            this.skipNewlines();
          }
          this.expect('RBRACE');
        }

        entries.push({
          type: 'LootEntry',
          id: entryId,
          itemId,
          weight,
          qty,
          rarity,
          condition,
          properties: entryProps,
        });
      } else if (this.check('IDENTIFIER') && this.current().value === 'guaranteed') {
        // 'guaranteed' sub-block — items that always drop
        this.advance(); // consume 'guaranteed'
        if (this.check('LBRACE')) {
          this.advance(); // consume {
          this.skipNewlines();
          guaranteed = {};
          while (!this.check('RBRACE') && !this.isAtEnd()) {
            this.skipNewlines();
            if (this.check('RBRACE')) break;
            const key = this.expectIdentifier();
            this.expect('COLON');
            guaranteed[key] = this.parseValue();
            if (this.check('COMMA')) this.advance();
            this.skipNewlines();
          }
          this.expect('RBRACE');
        }
      } else {
        // top-level properties (multipliers, global modifiers)
        const key = this.expectIdentifier();
        this.expect('COLON');
        properties[key] = this.parseValue();
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'LootTable',
      name,
      entries,
      guaranteed,
      properties,
    };
  }

  /**
   * Parse a world_chunk block for open-world streaming.
   *
   * Syntax:
   *   world_chunk dockside {
   *     bounds: ((-200, 0, -200), (200, 100, 200))
   *     priority: "high"
   *     lod_distances: [50, 150, 400]
   *     biome: "coastal_urban"
   *     npc_roster: ["merchant_alva", "harbor_guard_01"]
   *     streaming { load_radius: 300 unload_radius: 500 budget_kb: 32768 }
   *   }
   */
  private parseWorldChunk(): HoloWorldChunk {
    const startLoc = this.currentLocation();
    this.pushContext('world-chunk');
    this.advance(); // consume 'world_chunk'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let priority: string | number | undefined;
    let biome: string | undefined;
    let lodDistances: number[] | undefined;
    let assetManifest: string[] | undefined;
    let npcRoster: string[] | undefined;
    let spawnPoints: HoloPosition[] | undefined;
    let streaming: Record<string, HoloValue> | undefined;

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      // 'streaming' sub-block
      if (this.check('IDENTIFIER') && this.current().value === 'streaming') {
        this.advance(); // consume 'streaming'
        if (this.check('LBRACE')) {
          this.advance(); // consume {
          this.skipNewlines();
          streaming = {};
          while (!this.check('RBRACE') && !this.isAtEnd()) {
            this.skipNewlines();
            if (this.check('RBRACE')) break;
            const key = this.expectIdentifier();
            this.expect('COLON');
            streaming[key] = this.parseValue();
            if (this.check('COMMA')) this.advance();
            this.skipNewlines();
          }
          this.expect('RBRACE');
        }
      } else if (this.check('IDENTIFIER') && this.current().value === 'asset_manifest') {
        this.advance(); // consume 'asset_manifest'
        const val = this.parseValue();
        assetManifest = (Array.isArray(val) ? val : [val]) as string[];
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const val = this.parseValue();
        if (key === 'priority') priority = val as string | number;
        else if (key === 'biome') biome = val as string;
        else if (key === 'lod_distances')
          lodDistances = (Array.isArray(val) ? val : [val]) as number[];
        else if (key === 'npc_roster') npcRoster = (Array.isArray(val) ? val : [val]) as string[];
        else if (key === 'spawn_points') spawnPoints = val as unknown as HoloPosition[];
        else properties[key] = val;
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'WorldChunk',
      name,
      priority,
      biome,
      lodDistances,
      assetManifest,
      npcRoster,
      spawnPoints,
      streaming,
      properties,
    };
  }

  /**
   * Parse a world_layer block (P2.4 — phasing).
   *
   * Syntax:
   *   world_layer post_awakening {
   *     requires_quest: "main_chapter_1"   // visible AFTER the quest is done
   *     npcs: ["restored_keeper"]          // forbids_quest = visible BEFORE
   *     objects: ["healed_shrine"]
   *   }
   */
  private parseWorldLayer(): HoloWorldLayer {
    const startLoc = this.currentLocation();
    this.pushContext('world-layer');
    this.advance(); // consume 'world_layer'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let questId = '';
    let mustBeCompleted = true;
    let npcs: string[] = [];
    let objects: string[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const val = this.parseValue();
      if (key === 'requires_quest') {
        questId = String(val);
        mustBeCompleted = true;
      } else if (key === 'forbids_quest') {
        questId = String(val);
        mustBeCompleted = false;
      } else if (key === 'npcs') {
        npcs = (Array.isArray(val) ? val : [val]).map((v) => String(v));
      } else if (key === 'objects') {
        objects = (Array.isArray(val) ? val : [val]).map((v) => String(v));
      } else {
        properties[key] = val;
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'WorldLayer',
      name,
      predicate: { type: 'PhasePredicate', kind: 'quest_flag', questId, mustBeCompleted },
      npcs,
      objects,
      properties,
    };
  }

  /**
   * Parse a dungeon_instance block (P2.6 — instanced content).
   *
   * Syntax:
   *   dungeon_instance shadowfen_keep {
   *     max_instances: 10
   *     party_size: 5
   *     reset_timer: 3600
   *     completion_quest: "shadowfen_cleared"
   *     npcs: ["dungeon_boss"]
   *   }
   */
  private parseDungeonInstance(): HoloDungeonInstance {
    const startLoc = this.currentLocation();
    this.pushContext('dungeon-instance');
    this.advance(); // consume 'dungeon_instance'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let maxInstances = 1;
    let partySize = 1;
    let resetTimer = 0;
    let completionQuest = '';
    let npcs: string[] = [];
    let objects: string[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const val = this.parseValue();
      if (key === 'max_instances') maxInstances = Number(val) || 1;
      else if (key === 'party_size') partySize = Number(val) || 1;
      else if (key === 'reset_timer') resetTimer = Number(val) || 0;
      else if (key === 'completion_quest') completionQuest = String(val);
      else if (key === 'npcs') npcs = (Array.isArray(val) ? val : [val]).map((v) => String(v));
      else if (key === 'objects')
        objects = (Array.isArray(val) ? val : [val]).map((v) => String(v));
      else properties[key] = val;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'DungeonInstance',
      name,
      maxInstances,
      partySize,
      resetTimer,
      completionQuest,
      npcs,
      objects,
      properties,
    };
  }

  /**
   * Parse a world_shard block (P2.5 — world sharding).
   *
   * Syntax:
   *   world_shard north_province {
   *     min: [-1000, 0, -1000]
   *     max: [0, 256, 1000]
   *     neighbors: ["south_province"]
   *     max_players: 200
   *     handoff: "seamless"
   *   }
   */
  private parseWorldShard(): HoloWorldShard {
    const startLoc = this.currentLocation();
    this.pushContext('world-shard');
    this.advance(); // consume 'world_shard'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let min: [number, number, number] = [0, 0, 0];
    let max: [number, number, number] = [0, 0, 0];
    let neighbors: string[] = [];
    let maxPlayers = 100;
    let handoff = 'seamless';

    const toVec3 = (val: HoloValue): [number, number, number] => {
      const a = (Array.isArray(val) ? val : [val]).map((v) => Number(v) || 0);
      return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const val = this.parseValue();
      if (key === 'min') min = toVec3(val);
      else if (key === 'max') max = toVec3(val);
      else if (key === 'neighbors')
        neighbors = (Array.isArray(val) ? val : [val]).map((v) => String(v));
      else if (key === 'max_players') maxPlayers = Number(val) || 100;
      else if (key === 'handoff') handoff = String(val);
      else properties[key] = val;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'WorldShard',
      name,
      min,
      max,
      neighbors,
      maxPlayers,
      handoff,
      properties,
    };
  }

  /**
   * Parse a spawn_point block.
   *
   * Syntax:
   *   spawn_point village_entry {
   *     faction: "neutral"
   *     max_count: 10
   *     respawn_radius: 5
   *     position: (10, 0, 10)
   *   }
   */
  private parseSpawnPoint(): HoloSpawnPoint {
    const startLoc = this.currentLocation();
    this.pushContext('spawn-point');
    this.advance(); // consume 'spawn_point'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let faction: string | undefined;
    let maxCount: number | undefined;
    let respawnRadius: number | undefined;
    let position: HoloPosition | undefined;

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const val = this.parseValue();
      if (key === 'faction') faction = val as string;
      else if (key === 'max_count') maxCount = val as number;
      else if (key === 'respawn_radius') respawnRadius = val as number;
      else if (key === 'position') {
        // Accept array or tuple: position: [x, y, z] or (x, y, z)
        if (Array.isArray(val) && val.length >= 3) {
          position = { x: val[0] as number, y: val[1] as number, z: val[2] as number };
        }
      } else {
        properties[key] = val;
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'SpawnPoint',
      name,
      faction,
      maxCount,
      respawnRadius,
      position,
      properties,
    };
  }

  /**
   * Parse a trigger block for MMO interaction volumes.
   *
   * Syntax:
   *   trigger dungeon_entrance {
   *     radius: 3
   *     faction_filter: ["alliance", "neutral"]
   *     on_enter { emit("dungeon_enter") }
   *     on_exit  { emit("dungeon_exit")  }
   *   }
   */
  private parseGameTrigger(): HoloGameTrigger {
    const startLoc = this.currentLocation();
    this.pushContext('game-trigger');
    this.advance(); // consume 'game_trigger'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let radius = 1;
    let factionFilter: string[] | undefined;
    let position: HoloPosition | undefined;
    const onEnter: HoloEventHandler[] = [];
    const onExit: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      // Event handler sub-blocks
      if (this.check('IDENTIFIER') && this.current().value === 'on_enter') {
        this.advance(); // consume 'on_enter'
        const params = this.check('LPAREN') ? this.parseParameterList() : [];
        const body = this.check('LBRACE')
          ? (() => {
              this.advance(); // consume {
              this.skipNewlines();
              const stmts = this.parseStatementBlock();
              this.expect('RBRACE');
              return stmts;
            })()
          : [];
        onEnter.push({ type: 'EventHandler', event: 'on_enter', parameters: params, body });
      } else if (this.check('IDENTIFIER') && this.current().value === 'on_exit') {
        this.advance(); // consume 'on_exit'
        const params = this.check('LPAREN') ? this.parseParameterList() : [];
        const body = this.check('LBRACE')
          ? (() => {
              this.advance(); // consume {
              this.skipNewlines();
              const stmts = this.parseStatementBlock();
              this.expect('RBRACE');
              return stmts;
            })()
          : [];
        onExit.push({ type: 'EventHandler', event: 'on_exit', parameters: params, body });
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const val = this.parseValue();
        if (key === 'radius') radius = val as number;
        else if (key === 'faction_filter')
          factionFilter = (Array.isArray(val) ? val : [val]) as string[];
        else if (key === 'position') {
          if (Array.isArray(val) && val.length >= 3) {
            position = { x: val[0] as number, y: val[1] as number, z: val[2] as number };
          }
        } else {
          properties[key] = val;
        }
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'GameTrigger',
      name,
      radius,
      factionFilter,
      onEnter: onEnter.length > 0 ? onEnter : undefined,
      onExit: onExit.length > 0 ? onExit : undefined,
      position,
      properties,
    };
  }

  /**
   * Parse a scene-level movement path:
   *   movement_path patrol_route { mode: "patrol" loop: true speed: 2.5
   *     waypoints: [[0,0,0],[10,0,0]] easing: "linear" }
   */
  private parseMovementPath(): HoloMovementPath {
    const startLoc = this.currentLocation();
    this.pushContext('movement-path');
    this.advance(); // consume 'movement_path'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let mode: string | undefined;
    let loop: boolean | undefined;
    let speed: number | undefined;
    let waypoints: HoloValue | undefined;
    let easing: string | undefined;

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;
      const key = this.expectIdentifier();
      this.expect('COLON');
      const val = this.parseValue();
      if (key === 'mode') mode = val as string;
      else if (key === 'loop') loop = val as boolean;
      else if (key === 'speed') speed = val as number;
      else if (key === 'waypoints') waypoints = val;
      else if (key === 'easing') easing = val as string;
      else properties[key] = val;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'MovementPath',
      name,
      mode,
      loop,
      speed,
      waypoints,
      easing,
      properties,
    };
  }

  /**
   * Parse a scene-level reaction trigger:
   *   reaction_trigger on_player_enter { target: "player" condition: "..."
   *     on_activate { emit("zone_entered") } on_deactivate { ... } cooldown: 2 }
   */
  private parseReactionTrigger(): HoloReactionTrigger {
    const startLoc = this.currentLocation();
    this.pushContext('reaction-trigger');
    this.advance(); // consume 'reaction_trigger'

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let target: string | undefined;
    let condition: string | undefined;
    let cooldown: number | undefined;
    const onActivate: HoloEventHandler[] = [];
    const onDeactivate: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      // Handler sub-blocks (mirror parseGameTrigger's on_enter/on_exit pattern)
      if (this.check('IDENTIFIER') && this.current().value === 'on_activate') {
        this.advance();
        const params = this.check('LPAREN') ? this.parseParameterList() : [];
        const body = this.check('LBRACE')
          ? (() => {
              this.advance();
              this.skipNewlines();
              const stmts = this.parseStatementBlock();
              this.expect('RBRACE');
              return stmts;
            })()
          : [];
        onActivate.push({ type: 'EventHandler', event: 'on_activate', parameters: params, body });
      } else if (this.check('IDENTIFIER') && this.current().value === 'on_deactivate') {
        this.advance();
        const params = this.check('LPAREN') ? this.parseParameterList() : [];
        const body = this.check('LBRACE')
          ? (() => {
              this.advance();
              this.skipNewlines();
              const stmts = this.parseStatementBlock();
              this.expect('RBRACE');
              return stmts;
            })()
          : [];
        onDeactivate.push({
          type: 'EventHandler',
          event: 'on_deactivate',
          parameters: params,
          body,
        });
      } else {
        const key = this.expectIdentifier();
        this.expect('COLON');
        const val = this.parseValue();
        if (key === 'target') target = val as string;
        else if (key === 'condition') condition = val as string;
        else if (key === 'cooldown') cooldown = val as number;
        else properties[key] = val;
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();
    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'ReactionTrigger',
      name,
      target,
      condition,
      cooldown,
      onActivate: onActivate.length > 0 ? onActivate : undefined,
      onDeactivate: onDeactivate.length > 0 ? onDeactivate : undefined,
      properties,
    };
  }

  // ===========================================================================
  // NORM LIFECYCLE BLOCKS (v4.5 — March 2026, CRSEC Model)
  // ===========================================================================

  /**
   * Parse a norm block with full CRSEC lifecycle sub-blocks.
   *
   * Pattern:
   * ```
   * norm "NormName" @trait1 @trait2 {
   *   description: "..."
   *   category: "..."
   *   priority: 8
   *
   *   creation { ... }
   *   representation { ... }
   *   spreading { ... }
   *   evaluation { ... }
   *   compliance { ... }
   *
   *   on norm_violated(agent, context) { ... }
   * }
   * ```
   */
  private parseNormBlock(): HoloNormBlock {
    const startLoc = this.currentLocation();
    this.pushContext('norm');
    this.advance(); // consume 'norm'

    // Parse name (string or identifier)
    let name = 'unnamed';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.check('IDENTIFIER')) {
      name = this.expectIdentifier();
    }

    // Parse optional inline traits (@enforceable @community_driven)
    const traits: string[] = [];
    while (this.check('AT') && this.peek(1)?.type === 'IDENTIFIER') {
      this.advance(); // consume @
      traits.push(this.current().value);
      this.advance(); // consume trait name
      // Handle trait with parenthesized config: @trait(key: value)
      if (this.check('LPAREN')) {
        this.skipParens();
      }
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let creation: HoloNormCreation | undefined;
    let representation: HoloNormRepresentation | undefined;
    let spreading: HoloNormSpreading | undefined;
    let evaluation: HoloNormEvaluation | undefined;
    let compliance: HoloNormCompliance | undefined;
    const eventHandlers: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const tokenVal = this.current().value;
      const tokenLower = tokenVal.toLowerCase();

      // CRSEC lifecycle sub-blocks
      if (tokenLower === 'creation' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'creation'
        creation = this.parseNormSubBlock('NormCreation') as HoloNormCreation;
      } else if (tokenLower === 'representation' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'representation'
        representation = this.parseNormSubBlock('NormRepresentation') as HoloNormRepresentation;
      } else if (tokenLower === 'spreading' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'spreading'
        spreading = this.parseNormSubBlock('NormSpreading') as HoloNormSpreading;
      } else if (tokenLower === 'evaluation' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'evaluation'
        evaluation = this.parseNormSubBlock('NormEvaluation') as HoloNormEvaluation;
      } else if (tokenLower === 'compliance' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'compliance'
        compliance = this.parseNormSubBlock('NormCompliance') as HoloNormCompliance;
      }
      // Event handlers (on_norm_violated, on_adopted, etc.)
      else if (
        this.check('IDENTIFIER') &&
        tokenLower.startsWith('on') &&
        tokenLower.length > 2 &&
        (this.peek(1)?.type === 'LPAREN' || this.peek(1)?.type === 'LBRACE')
      ) {
        const evtName = this.current().value;
        this.advance(); // consume event name
        const parameters: HoloParameter[] = [];
        if (this.check('LPAREN')) {
          this.advance(); // consume (
          while (!this.check('RPAREN') && !this.isAtEnd()) {
            const pName = this.expectIdentifier();
            parameters.push({ type: 'Parameter', name: pName });
            if (this.check('COMMA')) this.advance();
          }
          this.expect('RPAREN');
        }
        if (this.check('LBRACE')) {
          this.advance(); // consume LBRACE
          const body = this.parseStatementBlock();
          this.expect('RBRACE');
          eventHandlers.push({
            type: 'EventHandler',
            event: evtName,
            parameters,
            body,
          } as HoloEventHandler);
        }
      }
      // Regular key: value properties
      else if (this.check('IDENTIFIER') || this.check('STRING')) {
        const key = this.check('STRING') ? this.expectString() : this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        properties[key] = value;
        if (this.check('COMMA')) this.advance();
      } else {
        // Skip unrecognized tokens
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'NormBlock',
      name,
      traits,
      properties,
      creation,
      representation,
      spreading,
      evaluation,
      compliance,
      eventHandlers: eventHandlers.length > 0 ? eventHandlers : undefined,
    };
  }

  /**
   * Parse a norm lifecycle sub-block (creation, representation, spreading, evaluation, compliance).
   * All sub-blocks follow the same pattern: { key: value, ... }
   */
  private parseNormSubBlock(nodeType: string): {
    type: string;
    properties: Record<string, HoloValue>;
    loc?: import('./HoloCompositionTypes').SourceRange;
  } {
    const startLoc = this.currentLocation();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.check('STRING') ? this.expectString() : this.expectIdentifier();
      this.expect('COLON');
      const value = this.parseValue();
      properties[key] = value;
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: nodeType,
      properties,
    };
  }

  /**
   * Parse a metanorm block (norms about norms).
   *
   * Pattern:
   * ```
   * metanorm "MetanormName" @trait1 {
   *   description: "..."
   *   applies_to: "all_norms"
   *
   *   rules { ... }
   *   escalation { ... }
   *
   *   on norm_conflict(normA, normB) { ... }
   * }
   * ```
   */
  private parseMetanormBlock(): HoloMetanorm {
    const startLoc = this.currentLocation();
    this.pushContext('metanorm');
    this.advance(); // consume 'metanorm'

    // Parse name
    let name = 'unnamed';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.check('IDENTIFIER')) {
      name = this.expectIdentifier();
    }

    // Parse optional inline traits
    const traits: string[] = [];
    while (this.check('AT') && this.peek(1)?.type === 'IDENTIFIER') {
      this.advance(); // consume @
      traits.push(this.current().value);
      this.advance(); // consume trait name
      // Handle trait with parenthesized config: @trait(key: value)
      if (this.check('LPAREN')) {
        this.skipParens();
      }
    }

    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let rules: HoloMetanormRules | undefined;
    let escalation: HoloMetanormEscalation | undefined;
    const eventHandlers: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const tokenVal = this.current().value;
      const tokenLower = tokenVal.toLowerCase();

      // Sub-blocks
      if (tokenLower === 'rules' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'rules'
        rules = this.parseNormSubBlock('MetanormRules') as HoloMetanormRules;
      } else if (tokenLower === 'escalation' && this.peek(1)?.type === 'LBRACE') {
        this.advance(); // consume 'escalation'
        escalation = this.parseNormSubBlock('MetanormEscalation') as HoloMetanormEscalation;
      }
      // Event handlers (on_norm_conflict, etc.)
      else if (
        this.check('IDENTIFIER') &&
        tokenLower.startsWith('on') &&
        tokenLower.length > 2 &&
        (this.peek(1)?.type === 'LPAREN' || this.peek(1)?.type === 'LBRACE')
      ) {
        const evtName = this.current().value;
        this.advance(); // consume event name
        const parameters: HoloParameter[] = [];
        if (this.check('LPAREN')) {
          this.advance(); // consume (
          while (!this.check('RPAREN') && !this.isAtEnd()) {
            const pName = this.expectIdentifier();
            parameters.push({ type: 'Parameter', name: pName });
            if (this.check('COMMA')) this.advance();
          }
          this.expect('RPAREN');
        }
        if (this.check('LBRACE')) {
          this.advance(); // consume LBRACE
          const body = this.parseStatementBlock();
          this.expect('RBRACE');
          eventHandlers.push({
            type: 'EventHandler',
            event: evtName,
            parameters,
            body,
          } as HoloEventHandler);
        }
      }
      // Regular properties
      else if (this.check('IDENTIFIER') || this.check('STRING')) {
        const key = this.check('STRING') ? this.expectString() : this.expectIdentifier();
        this.expect('COLON');
        const value = this.parseValue();
        properties[key] = value;
        if (this.check('COMMA')) this.advance();
      } else {
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Metanorm',
      name,
      traits,
      properties,
      rules,
      escalation,
      eventHandlers: eventHandlers.length > 0 ? eventHandlers : undefined,
    };
  }

  // ===========================================================================
  // SIMULATION CONTRACT BLOCK (v6.3)
  // ===========================================================================

  /**
   * Parse a `sim_contract { ... }` block.
   *
   * Syntax:
   * ```
   * sim_contract {
   *   precondition "name" { expr }
   *   precondition "name" "description" { expr }
   *   invariant "name" { expr }
   *   receipt { field: type, ... }
   * }
   * ```
   */
  private parseContractBlock(): HoloContract {
    const startLoc = this.currentLocation();
    this.pushContext('sim_contract');
    this.advance(); // consume 'sim_contract' (HOLO_CONTRACT token)

    this.expect('LBRACE');
    this.skipNewlines();

    const preconditions: HoloContractClause[] = [];
    const invariants: HoloContractClause[] = [];
    const receipt: Record<string, string> = {};

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const tokenLower = this.current().value.toLowerCase();

      if (
        (tokenLower === 'precondition' || tokenLower === 'invariant') &&
        this.check('IDENTIFIER')
      ) {
        const clauseKind = tokenLower as 'precondition' | 'invariant';
        this.advance(); // consume keyword

        // Parse name (required string)
        let clauseName = 'unnamed';
        if (this.check('STRING')) {
          clauseName = this.expectString();
        } else if (this.check('IDENTIFIER')) {
          clauseName = this.expectIdentifier();
        }

        // Optional description: second string before the block
        let description: string | undefined;
        if (this.check('STRING')) {
          description = this.expectString();
        }

        // Expression body: { expr_string }
        let expr = '';
        if (this.check('LBRACE')) {
          this.advance(); // consume {
          const parts: string[] = [];
          let depth = 1;
          while (depth > 0 && !this.isAtEnd()) {
            if (this.check('LBRACE')) depth++;
            if (this.check('RBRACE')) {
              depth--;
              if (depth === 0) break;
            }
            parts.push(this.current().value);
            this.advance();
          }
          this.expect('RBRACE');
          expr = parts.join(' ').trim();
        }

        const clause: HoloContractClause = { name: clauseName, expr };
        if (description !== undefined) clause.description = description;

        if (clauseKind === 'precondition') {
          preconditions.push(clause);
        } else {
          invariants.push(clause);
        }
      } else if (tokenLower === 'receipt' && this.check('IDENTIFIER')) {
        this.advance(); // consume 'receipt'
        if (this.check('LBRACE')) {
          this.advance(); // consume {
          this.skipNewlines();
          while (!this.check('RBRACE') && !this.isAtEnd()) {
            this.skipNewlines();
            if (this.check('RBRACE')) break;

            // field_name: type_name
            let fieldName = '';
            if (this.check('IDENTIFIER')) {
              fieldName = this.expectIdentifier();
            } else if (this.check('STRING')) {
              fieldName = this.expectString();
            } else {
              this.advance();
              continue;
            }

            let typeName = 'unknown';
            if (this.check('COLON')) {
              this.advance(); // consume :
              if (this.check('IDENTIFIER')) {
                typeName = this.expectIdentifier();
              } else if (this.check('STRING')) {
                typeName = this.expectString();
              }
            }

            if (fieldName) receipt[fieldName] = typeName;

            if (this.check('COMMA')) this.advance();
            this.skipNewlines();
          }
          this.expect('RBRACE');
        }
      } else {
        // Skip unrecognized tokens
        this.advance();
      }

      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'contract',
      preconditions,
      invariants,
      receipt,
    };
  }

  // ── Pub/sub messaging primitives (v6.4) ───────────────────────────────────

  /**
   * Parse policy_pack Name { ... } as a first-class regulated-AI governance
   * primitive. Validation lives in policy/PolicyPack.ts so compilers and deploy
   * gates consume the same schema the parser emits.
   */
  private parsePolicyPackBlock(): HoloPolicyPackBlock {
    const startLoc = this.currentLocation();
    this.pushContext('policy-pack');
    this.advance(); // consume policy_pack

    const name = this.check('STRING') ? this.expectString() : this.expectIdentifier();
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    let version = '1.0.0';
    let frameworkId = '';
    let requiredTests: HoloValue[] = [];
    let requiredCompileTargets: string[] = [];
    let auditRetention: Record<string, HoloValue> = {};
    let monitoringCadence: Record<string, HoloValue> = {};

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const key = this.expectIdentifier();

      if ((key === 'audit_retention' || key === 'auditRetention') && this.check('LBRACE')) {
        auditRetention = this.parseBlockTraitConfig();
      } else if (
        (key === 'monitoring' || key === 'monitoring_cadence' || key === 'monitoringCadence') &&
        this.check('LBRACE')
      ) {
        monitoringCadence = this.parseBlockTraitConfig();
      } else {
        this.expect('COLON');
        const value = this.parseValue();
        if (key === 'version') version = typeof value === 'string' ? value : String(value);
        else if (key === 'framework_id' || key === 'frameworkId') {
          frameworkId = typeof value === 'string' ? value : String(value);
        } else if (key === 'required_tests' || key === 'requiredTests') {
          requiredTests = Array.isArray(value) ? value : [value];
        } else if (key === 'required_compile_targets' || key === 'requiredCompileTargets') {
          requiredCompileTargets = (Array.isArray(value) ? value : [value]).map((target) =>
            String(target)
          );
        } else if (key === 'audit_retention' || key === 'auditRetention') {
          auditRetention = this.asRecord(value);
        } else if (
          key === 'monitoring' ||
          key === 'monitoring_cadence' ||
          key === 'monitoringCadence'
        ) {
          monitoringCadence = this.asRecord(value);
        } else {
          properties[key] = value;
        }
      }

      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'PolicyPack',
      name,
      version,
      frameworkId,
      requiredTests,
      requiredCompileTargets,
      auditRetention,
      monitoringCadence,
      properties,
    };
  }

  private asRecord(value: HoloValue): Record<string, HoloValue> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || '__bind' in value) {
      return {};
    }
    return value;
  }

  /** Parse `topic Name { type: "T" broadcast: true }` */
  private parseTopicBlock(): HoloTopic {
    const startLoc = this.currentLocation();
    this.advance(); // consume HOLO_TOPIC

    const name = this.check('IDENTIFIER') ? this.expectIdentifier() : 'unnamed';
    const metadata: Record<string, HoloValue> = {};
    let dataType: string | undefined;
    let broadcast: boolean | undefined;

    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE') || this.check('NEWLINE')) {
          if (!this.check('RBRACE')) this.advance();
          continue;
        }
        // Accept any token as a property key (keywords like 'type' may not be IDENTIFIER)
        const key = this.current().value;
        this.advance();
        if (this.check('COLON')) this.advance();
        if (key === 'type' || key === 'dataType') {
          dataType = this.check('STRING')
            ? this.expectString()
            : this.check('IDENTIFIER')
              ? this.expectIdentifier()
              : (this.advance(), undefined);
        } else if (key === 'broadcast') {
          broadcast = this.current().value === 'true';
          this.advance();
        } else if (
          this.check('LBRACE') ||
          this.check('STRING') ||
          this.check('NUMBER') ||
          this.check('IDENTIFIER') ||
          this.check('LBRACKET')
        ) {
          metadata[key] = this.parseValue();
        }
        if (this.check('COMMA')) this.advance();
        this.skipNewlines();
      }
      this.expect('RBRACE');
    }

    const topic: HoloTopic = {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Topic',
      name,
    };
    if (dataType !== undefined) topic.dataType = dataType;
    if (broadcast !== undefined) topic.broadcast = broadcast;
    if (Object.keys(metadata).length > 0) topic.metadata = metadata;
    return topic;
  }

  /** Parse `channel Name { from: A to: B capacity: N }` */
  private parseChannelBlock(): HoloChannel {
    const startLoc = this.currentLocation();
    this.advance(); // consume HOLO_CHANNEL

    const name = this.check('IDENTIFIER') ? this.expectIdentifier() : 'unnamed';
    const metadata: Record<string, HoloValue> = {};
    let from: string | undefined;
    let to: string | undefined;
    let capacity: number | undefined;

    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();
      while (!this.check('RBRACE') && !this.isAtEnd()) {
        this.skipNewlines();
        if (this.check('RBRACE') || this.check('NEWLINE')) {
          if (!this.check('RBRACE')) this.advance();
          continue;
        }
        // Accept any token as a property key (keywords like 'from'/'to' may not be IDENTIFIER)
        const key = this.current().value;
        this.advance();
        if (this.check('COLON')) this.advance();
        if (key === 'from') {
          from = this.check('STRING')
            ? this.expectString()
            : this.check('IDENTIFIER')
              ? this.expectIdentifier()
              : undefined;
        } else if (key === 'to') {
          to = this.check('STRING')
            ? this.expectString()
            : this.check('IDENTIFIER')
              ? this.expectIdentifier()
              : undefined;
        } else if (key === 'capacity') {
          capacity = this.check('NUMBER') ? Number(this.current().value) : undefined;
          if (capacity !== undefined) this.advance();
        } else if (
          this.check('LBRACE') ||
          this.check('STRING') ||
          this.check('NUMBER') ||
          this.check('IDENTIFIER') ||
          this.check('LBRACKET')
        ) {
          metadata[key] = this.parseValue();
        }
        if (this.check('COMMA')) this.advance();
        this.skipNewlines();
      }
      this.expect('RBRACE');
    }

    const ch: HoloChannel = {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Channel',
      name,
    };
    if (from !== undefined) ch.from = from;
    if (to !== undefined) ch.to = to;
    if (capacity !== undefined) ch.capacity = capacity;
    if (Object.keys(metadata).length > 0) ch.metadata = metadata;
    return ch;
  }

  /** Parse `connect Identifier to Identifier [as "edgeType"]` */
  private parseConnectionStmt(): HoloConnection {
    const startLoc = this.currentLocation();
    this.advance(); // consume CONNECT

    const from = this.check('IDENTIFIER') ? this.expectIdentifier() : '';

    // consume optional 'to' keyword (parsed as IDENTIFIER with value "to")
    if (this.check('IDENTIFIER') && this.current().value === 'to') this.advance();

    const to = this.check('IDENTIFIER') ? this.expectIdentifier() : '';

    let edgeType: string | undefined;
    // consume optional `as "type"`
    if (this.check('IDENTIFIER') && this.current().value === 'as') {
      this.advance();
      if (this.check('STRING')) edgeType = this.expectString();
      else if (this.check('IDENTIFIER')) edgeType = this.expectIdentifier();
    }

    const conn: HoloConnection = {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'Connection',
      from,
      to,
    };
    if (edgeType !== undefined) conn.edgeType = edgeType;
    return conn;
  }

  /**
   * Unified parser for all domain-specific blocks.
   * Pattern: KEYWORD NAME @trait1 @trait2 { properties... }
   */
  private parseDomainBlock(): HoloDomainBlock {
    const startLoc = this.currentLocation();
    const token = this.current();
    const keyword = token.value; // Original keyword (e.g. "sensor", "joint")
    const domain = HoloCompositionParser.TOKEN_DOMAIN_MAP[token.type] || 'custom';

    this.pushContext(`domain-${domain}`);
    this.advance(); // consume domain keyword

    // Parse name (string or identifier)
    let name = 'unnamed';
    if (this.check('STRING')) {
      name = this.expectString();
    } else if (this.check('IDENTIFIER')) {
      name = this.expectIdentifier();
    }

    // Parse optional inline traits (@trait1 @trait2)
    const traits: string[] = [];
    while (this.check('AT')) {
      this.advance(); // @
      if (this.check('IDENTIFIER') || this.current().type !== 'EOF') {
        traits.push(this.current().value);
        this.advance();
        // Handle trait with parenthesized config: @trait(key: value)
        if (this.check('LPAREN')) {
          this.skipParens();
        }
      }
    }

    // Module blocks are intentionally opaque at this parser level.
    // Their internals can contain JS-like statements (function/let/export/etc.)
    // that do not follow domain property grammar key: value.
    if (token.type === 'MODULE') {
      if (this.check('LBRACE')) {
        this.skipBlock();
      }
      this.popContext();
      return {
        loc: { start: startLoc, end: this.currentLocation() },
        type: 'DomainBlock',
        domain,
        keyword,
        name,
        traits,
        properties: {},
      };
    }

    // ── Pipeline fast-path: delegate to PipelineParser for structured AST ──
    if (domain === 'pipeline' && keyword === 'pipeline') {
      return this.parsePipelineDomainBlock(name, traits);
    }

    if (token.type === 'PCG_GRAPH') {
      return this.parsePCGGraphDomainBlock(startLoc, name, traits, keyword, domain);
    }

    // Parse body { properties... }
    this.expect('LBRACE');
    this.skipNewlines();

    const properties: Record<string, HoloValue> = {};
    const children: HoloObjectDecl[] = [];
    const eventHandlers: HoloEventHandler[] = [];

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipBlockMemberSeparators();
      if (this.check('RBRACE')) break;

      // Nested objects
      if (this.check('OBJECT')) {
        children.push(this.parseObject());
      } else if (this.check('IDENTIFIER') && this.isPrimitiveShape(this.current().value)) {
        children.push(this.parsePrimitiveObject());
      }
      // Event handlers
      else if (this.check('IDENTIFIER') && this.current().value.startsWith('on')) {
        const evtName = this.current().value;
        // Peek ahead: if followed by ( or { it's an event handler
        if (
          this.tokens[this.pos + 1]?.type === 'LPAREN' ||
          this.tokens[this.pos + 1]?.type === 'LBRACE'
        ) {
          this.advance(); // consume event name
          // Simple event handler: skip parameters and body.
          // Use skipParens() so non-identifier arguments (strings, calls) don't
          // cause expectIdentifier() to stall without advancing in tolerant mode.
          if (this.check('LPAREN')) {
            this.skipParens();
          }
          if (this.check('LBRACE')) {
            this.skipBlock();
          }
          eventHandlers.push({
            type: 'EventHandler',
            event: evtName,
            parameters: [],
            body: [],
          });
        } else {
          // Regular property
          const key = this.parsePropertyKey();
          this.expect('COLON');
          const value = this.parseValue();
          properties[key] = value;
        }
      }
      // Bare domain decorators used as body directives, e.g. service { @cors_policy }.
      else if (this.check('AT')) {
        this.advance();
        const traitName = this.parseTraitName();
        if (traitName) traits.push(traitName);
        if (this.check('LPAREN') || this.check('LBRACE') || this.check('COLON')) {
          properties[`@${traitName}`] = this.parseOptionalTraitConfig();
        }
      }
      // Nested domain property block: post_processing { bloom { intensity: 0.3 } }
      else if (this.isPropertyName() && this.peek(1).type === 'LBRACE') {
        const key = this.parsePropertyKey();
        properties[key] = this.parseBlockTraitConfig();
      }
      // Labeled nested domain block: pass "ForwardBase" { vertex: "..." }.
      else if (
        this.isPropertyName() &&
        (this.peek(1).type === 'STRING' || this.peek(1).type === 'IDENTIFIER') &&
        this.peek(2).type === 'LBRACE'
      ) {
        const key = this.parsePropertyKey();
        const blockName = this.advance().value;
        properties[key] = {
          name: blockName,
          ...this.parseBlockTraitConfig(),
        };
      }
      // Connection-style material graph line: heightBlend -> material.baseColor.
      else if (
        this.isPropertyName() &&
        (this.peek(1).type === 'ARROW' ||
          (this.peek(1).type === 'MINUS' && this.peek(2).type === 'GREATER'))
      ) {
        const from = this.parsePropertyKey();
        if (this.check('ARROW')) {
          this.advance();
        } else {
          this.advance();
          this.advance();
        }
        const to = this.isBarewordPathToken() ? this.parseBarewordPathValue() : '';
        const existing = properties.connections;
        const connection = { from, to };
        properties.connections = Array.isArray(existing) ? [...existing, connection] : [connection];
      }
      // Regular property
      else {
        const key = this.parsePropertyKey();
        this.expect('COLON');
        const value = this.parseValue();
        properties[key] = value;
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'DomainBlock',
      domain,
      keyword,
      name,
      traits,
      properties,
      children: children.length > 0 ? children : undefined,
      eventHandlers: eventHandlers.length > 0 ? eventHandlers : undefined,
    };
  }

  private parsePCGGraphDomainBlock(
    startLoc: SourceLocation,
    name: string,
    traits: string[],
    keyword: string,
    domain: HoloDomainType
  ): HoloDomainBlock {
    this.expect('LBRACE');
    this.skipNewlines();

    const nodes: HoloValue[] = [];
    const properties: Record<string, HoloValue> = {
      nodes,
    };

    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const token = this.current();
      const next = this.peek(1);

      if (next?.type === 'COLON' && (token.type === 'IDENTIFIER' || token.type === 'PCG_GRAPH')) {
        const key = token.value;
        this.advance();
        this.expect('COLON');
        properties[key] = this.parseValue();
      } else {
        const kind = token.value;
        this.advance();

        const nodeProperties: Record<string, HoloValue> = {};
        if (this.check('LPAREN')) {
          this.parsePCGNodeArgs(kind, nodeProperties);
        }

        nodes.push({
          kind,
          properties: nodeProperties,
        });
      }

      this.skipNewlines();
      if (this.check('ARROW')) {
        this.advance();
      } else if (this.check('MINUS') && this.peek(1).type === 'GREATER') {
        this.advance();
        this.advance();
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE');
    this.popContext();

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'DomainBlock',
      domain,
      keyword,
      name,
      traits,
      properties,
    };
  }

  private parsePCGNodeArgs(kind: string, properties: Record<string, HoloValue>): void {
    this.expect('LPAREN');
    const args: HoloValue[] = [];

    while (!this.check('RPAREN') && !this.isAtEnd()) {
      if (this.check('COMMA')) {
        this.advance();
        continue;
      }

      if (this.check('IDENTIFIER') && this.peek(1).type === 'COLON') {
        const key = this.expectIdentifier();
        this.expect('COLON');
        properties[key] = this.parseValue();
      } else {
        args.push(this.parsePCGArgumentValue());
      }

      if (this.check('COMMA')) this.advance();
    }

    this.expect('RPAREN');

    if (kind === 'scatter') {
      if (args[0] !== undefined) properties['source_mesh'] = args[0];
      if (args[1] !== undefined) properties['count'] = args[1];
    } else if (args.length > 0) {
      properties['args'] = args;
    }
  }

  private parsePCGArgumentValue(): HoloValue {
    if (
      this.check('STRING') ||
      this.check('NUMBER') ||
      this.check('BOOLEAN') ||
      this.check('NULL') ||
      this.check('LBRACKET')
    ) {
      return this.parseValue();
    }

    const value = this.current().value;
    this.advance();
    return value;
  }

  /**
   * Parse a pipeline domain block by extracting the raw body text
   * and delegating to PipelineParser for structured AST.
   */
  private parsePipelineDomainBlock(name: string, traits: string[]): HoloDomainBlock {
    const startLoc = this.currentLocation();
    // Expect opening brace
    this.expect('LBRACE');

    // Track brace depth to find matching close
    let depth = 1;
    const bodyTokens: string[] = [];

    while (depth > 0 && !this.isAtEnd()) {
      if (this.check('LBRACE')) {
        depth++;
      } else if (this.check('RBRACE')) {
        depth--;
        if (depth === 0) break;
        bodyTokens.push('}\n');
        this.advance();
        continue;
      }
      // Reconstruct source text from tokens
      const tok = this.current();
      if (tok.type === 'STRING') {
        bodyTokens.push(`"${tok.value}"`);
        // Add newline after string values ONLY if next token starts a new statement
        // (i.e., next is an identifier that could be a keyword like source/sink/filter)
        const nextTok = this.tokens[this.pos + 1];
        if (!nextTok || nextTok.type === 'NEWLINE' || nextTok.type === 'RBRACE') {
          bodyTokens.push('\n');
        } else if (nextTok.type === 'IDENTIFIER' || nextTok.type === 'DEFAULT') {
          // Check if it's a pipeline keyword (source, sink, transform, etc.) or branch keyword (when, default)
          const nv = nextTok.value;
          if (
            [
              'source',
              'sink',
              'transform',
              'filter',
              'validate',
              'merge',
              'branch',
              'when',
              'default',
            ].includes(nv) ||
            nextTok.type === 'DEFAULT'
          ) {
            bodyTokens.push('\n');
          } else {
            bodyTokens.push(' ');
          }
        } else {
          bodyTokens.push(' ');
        }
      } else if (tok.type === 'NEWLINE') {
        bodyTokens.push('\n');
      } else if (tok.type === 'COLON') {
        bodyTokens.push(': '); // PipelineParser expects ": " separator
      } else if (tok.type === 'LBRACE') {
        bodyTokens.push(' {\n');
      } else if (tok.type === 'MINUS' && this.tokens[this.pos + 1]?.type === 'GREATER') {
        bodyTokens.push(' -> ');
        this.advance(); // skip GREATER
      } else if (tok.type === 'EQUALS_EQUALS') {
        bodyTokens.push(' == ');
      } else if (tok.type === 'BANG_EQUALS') {
        bodyTokens.push(' != ');
      } else {
        bodyTokens.push(tok.value);
        const next = this.tokens[this.pos + 1];
        if (
          next &&
          next.type !== 'NEWLINE' &&
          next.type !== 'RBRACE' &&
          next.type !== 'COMMA' &&
          next.type !== 'COLON' &&
          next.type !== 'LBRACE' &&
          next.type !== 'MINUS'
        ) {
          bodyTokens.push(' ');
        }
      }
      this.advance();
    }

    this.expect('RBRACE'); // consume closing brace
    this.popContext();

    // Reconstruct pipeline source for PipelineParser
    const bodyText = bodyTokens.join('');
    const pipelineSource = `pipeline "${name}" {\n${bodyText}\n}`;
    const pipelineResult = parsePipelineSource(pipelineSource);

    // Extract flat properties for backward compat
    const properties: Record<string, HoloValue> = {};
    if (pipelineResult.pipeline) {
      const p = pipelineResult.pipeline;
      if (p.schedule) properties['schedule'] = p.schedule;
      if (p.sources.length) properties['sources'] = p.sources.length;
      if (p.sinks.length) properties['sinks'] = p.sinks.length;
      if (p.transforms.length) properties['transforms'] = p.transforms.length;
      properties['steps'] = p.steps.length;
    }

    return {
      loc: { start: startLoc, end: this.currentLocation() },
      type: 'DomainBlock',
      domain: 'pipeline',
      keyword: 'pipeline',
      name,
      traits,
      properties,
      pipelineAST: pipelineResult.pipeline,
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

/**
 * Parse a potentially incomplete HoloScript source fragment.
 *
 * Unlike `parseHoloStrict`, this never throws. Unlike `parseHolo`, it
 * guarantees a non-null `ast` on the return — callers can always walk
 * children without null-guards. Intended for:
 *   - REPL / live-preview tools where the user is still typing
 *   - LSP servers providing completions on mid-keystroke source
 *   - Syntax highlighters that need a best-effort AST
 *   - Any consumer that would otherwise reach for regex
 *
 * The returned `ast` may be a stub implicit composition when input is
 * too incomplete to attribute to a declaration; errors describe what
 * was missing. The `partial` flag distinguishes a tolerated parse from
 * a clean one — it's true whenever `errors.length > 0`.
 *
 * This is the sanctioned alternative to regex parsing of HoloScript
 * syntax outside @holoscript/core. See NORTH_STAR.md DT-14 and the
 * `no-regex-hs-parsing` ESLint rule.
 */
export function parseHoloPartial(
  source: string,
  options?: HoloParserOptions
): HoloParseResult & { partial: boolean } {
  let result: HoloParseResult;
  try {
    const parser = new HoloCompositionParser({ ...options, tolerant: true });
    result = parser.parse(source ?? '');
  } catch (error) {
    // Defensive: parse() itself swallows errors, but a lexer/tokenizer
    // crash on exotic input should still yield a usable shape.
    result = {
      success: false,
      errors: [
        {
          message:
            error instanceof Error ? error.message : String(error ?? 'unknown parse failure'),
          loc: { line: 0, column: 0 },
        },
      ],
      warnings: [],
    };
  }

  const ast: HoloComposition =
    result.ast ??
    ({
      type: 'Composition',
      name: 'partial',
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
      spawnGroups: [],
      waypointSets: [],
      constraints: [],
      terrains: [],
      domainBlocks: [],
      norms: [],
      metanorms: [],
    } as HoloComposition);

  return {
    success: result.success,
    ast,
    errors: result.errors,
    warnings: result.warnings,
    partial: result.errors.length > 0,
  };
}
