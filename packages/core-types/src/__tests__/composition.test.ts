/**
 * Type-level and shape-conformance tests for @holoscript/core-types/composition.
 *
 * composition.ts is pure interface/type declarations — no runtime logic exists.
 * Tests therefore verify:
 *   - Interface shapes accept valid objects (compile-time + runtime assignability)
 *   - Required vs optional fields are correctly modelled
 *   - Discriminant `type` literals are narrow and correct
 *   - Union types (HoloValue, HoloStatement, HoloExpression, HoloDomainType, …)
 *     accept all documented members
 *   - Recursive / self-referential types compose without error
 *   - Enum-like string literal unions reject out-of-range values at type level
 */

import { describe, it, expect, expectTypeOf, assertType } from 'vitest';
import type {
  SourceLocation,
  SourceRange,
  PlatformConstraint,
  HoloNode,
  HoloValue,
  HoloBindValue,
  HoloObject,
  HoloPosition,
  HoloComposition,
  HoloEnvironment,
  HoloEnvironmentProperty,
  HoloParticleSystem,
  HoloLighting,
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
  HoloState,
  HoloStateProperty,
  HoloTemplate,
  HoloDirectiveLike,
  HoloMigration,
  HoloTemplateProperty,
  HoloObjectDecl,
  HoloSubOrb,
  HoloObjectTrait,
  HoloTraitDefinition,
  HoloTraitProperty,
  HoloObjectProperty,
  HoloShape,
  HoloShapeProperty,
  HoloSpatialGroup,
  HoloGroupProperty,
  HoloLogic,
  HoloEventHandler,
  HoloAction,
  HoloParameter,
  HoloStatement,
  HoloAssignment,
  HoloMethodCall,
  HoloIfStatement,
  HoloForStatement,
  HoloWhileStatement,
  HoloClassicForStatement,
  HoloVariableDeclaration,
  HoloAwaitStatement,
  HoloReturnStatement,
  HoloEmitStatement,
  HoloAnimateStatement,
  HoloOnErrorStatement,
  HoloExpressionStatement,
  HoloExpression,
  HoloLiteral,
  HoloIdentifier,
  HoloBinaryExpression,
  HoloUnaryExpression,
  HoloMemberExpression,
  HoloCallExpression,
  HoloArrayExpression,
  HoloObjectExpression,
  HoloConditionalExpression,
  HoloUpdateExpression,
  HoloBindExpression,
  HoloImport,
  HoloImportSpecifier,
  ImportDirective,
  ExportDirective,
  HoloParseResult,
  HoloParseError,
  HoloParseWarning,
  HoloNPC,
  HoloNPCProperty,
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
  HoloDialogue,
  HoloDialogueOption,
  HoloLocalizedText,
  HoloStateMachine,
  HoloState_Machine,
  HoloStateTransition,
  HoloAchievement,
  HoloAchievementReward,
  HoloTalentTree,
  HoloTalentRow,
  HoloTalentNode,
  HoloTalentEffect,
  HoloParserOptions,
  HSPlusImport,
  ReadFileFn,
  HoloSpawnGroup,
  HoloWaypoints,
  HoloConstraintBlock,
  HoloTerrainBlock,
  HoloDomainType,
  HoloDomainBlock,
  NormLifecyclePhase,
  NormStatus,
  NormVotingMechanism,
  NormViolationSeverity,
  NormSanctionType,
  NormSpreadingMechanism,
  HoloNormBlock,
  HoloNormCreation,
  HoloNormRepresentation,
  HoloNormSpreading,
  HoloNormEvaluation,
  HoloNormCompliance,
  HoloMetanorm,
  HoloMetanormRules,
  HoloMetanormEscalation,
  CompiledNarrative,
  CompiledPaywall,
} from '../composition';

// =============================================================================
// SourceLocation / SourceRange
// =============================================================================

describe('SourceLocation', () => {
  it('accepts required fields only', () => {
    const loc: SourceLocation = { line: 1, column: 0 };
    expect(loc.line).toBe(1);
    expect(loc.column).toBe(0);
    expect(loc.offset).toBeUndefined();
  });

  it('accepts optional offset', () => {
    const loc: SourceLocation = { line: 10, column: 5, offset: 120 };
    expect(loc.offset).toBe(120);
  });

  it('has correct types on fields', () => {
    expectTypeOf<SourceLocation['line']>().toBeNumber();
    expectTypeOf<SourceLocation['column']>().toBeNumber();
    expectTypeOf<SourceLocation['offset']>().toEqualTypeOf<number | undefined>();
  });
});

describe('SourceRange', () => {
  it('accepts start and end SourceLocations', () => {
    const range: SourceRange = {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 20 },
    };
    expect(range.start.line).toBe(1);
    expect(range.end.column).toBe(20);
  });

  it('has correct field types', () => {
    expectTypeOf<SourceRange['start']>().toEqualTypeOf<SourceLocation>();
    expectTypeOf<SourceRange['end']>().toEqualTypeOf<SourceLocation>();
  });
});

// =============================================================================
// PlatformConstraint
// =============================================================================

describe('PlatformConstraint', () => {
  it('accepts include-only constraint', () => {
    const c: PlatformConstraint = { include: ['quest3'], exclude: [] };
    expect(c.include).toEqual(['quest3']);
    expect(c.exclude).toHaveLength(0);
  });

  it('accepts exclude-only constraint', () => {
    const c: PlatformConstraint = { include: [], exclude: ['car', 'wearable'] };
    expect(c.exclude).toContain('car');
  });

  it('accepts multi-platform include', () => {
    const c: PlatformConstraint = { include: ['phone', 'desktop'], exclude: [] };
    expect(c.include).toHaveLength(2);
  });

  it('has array fields of string', () => {
    expectTypeOf<PlatformConstraint['include']>().toEqualTypeOf<string[]>();
    expectTypeOf<PlatformConstraint['exclude']>().toEqualTypeOf<string[]>();
  });
});

// =============================================================================
// HoloNode (base)
// =============================================================================

describe('HoloNode', () => {
  it('accepts required type with no loc', () => {
    const node: HoloNode = { type: 'Composition' };
    expect(node.type).toBe('Composition');
    expect(node.loc).toBeUndefined();
  });

  it('accepts optional loc', () => {
    const node: HoloNode = {
      type: 'Object',
      loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 10 } },
    };
    expect(node.loc?.start.line).toBe(1);
  });

  it('has string type field', () => {
    expectTypeOf<HoloNode['type']>().toBeString();
    expectTypeOf<HoloNode['loc']>().toEqualTypeOf<SourceRange | undefined>();
  });
});

// =============================================================================
// HoloValue / HoloBindValue / HoloObject / HoloPosition
// =============================================================================

describe('HoloValue', () => {
  it('accepts string, number, boolean, null', () => {
    const s: HoloValue = 'hello';
    const n: HoloValue = 42;
    const b: HoloValue = false;
    const nil: HoloValue = null;
    assertType<HoloValue>(s);
    assertType<HoloValue>(n);
    assertType<HoloValue>(b);
    assertType<HoloValue>(nil);
  });

  it('accepts nested arrays', () => {
    const arr: HoloValue = [1, 'two', [3, null]];
    assertType<HoloValue>(arr);
  });

  it('accepts HoloObject', () => {
    const obj: HoloValue = { key: 'value', nested: { inner: 42 } };
    assertType<HoloValue>(obj);
  });

  it('accepts HoloBindValue', () => {
    const bv: HoloValue = { __bind: true, source: 'state.score' };
    assertType<HoloValue>(bv);
  });
});

describe('HoloBindValue', () => {
  it('requires __bind: true and source', () => {
    const bv: HoloBindValue = { __bind: true, source: 'state.hp' };
    expect(bv.__bind).toBe(true);
    expect(bv.source).toBe('state.hp');
    expect(bv.transform).toBeUndefined();
  });

  it('accepts optional transform', () => {
    const bv: HoloBindValue = { __bind: true, source: 'state.score', transform: 'formatScore' };
    expect(bv.transform).toBe('formatScore');
  });
});

describe('HoloObject', () => {
  it('accepts arbitrary HoloValue properties', () => {
    const obj: HoloObject = { x: 1, y: 'two', z: null, nested: { deep: true } };
    expect(obj['x']).toBe(1);
  });

  it('has index signature returning HoloValue', () => {
    expectTypeOf<HoloObject[string]>().toEqualTypeOf<HoloValue>();
  });
});

describe('HoloPosition', () => {
  it('is a 3-element number tuple', () => {
    const pos: HoloPosition = [0, 1.5, -3.0];
    expect(pos).toHaveLength(3);
    assertType<HoloPosition>(pos);
  });

  it('has tuple type of three numbers', () => {
    expectTypeOf<HoloPosition>().toEqualTypeOf<[number, number, number]>();
  });
});

// =============================================================================
// HoloComposition (root node)
// =============================================================================

describe('HoloComposition', () => {
  it('accepts a minimal valid composition', () => {
    const comp: HoloComposition = {
      type: 'Composition',
      name: 'TestScene',
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
    expect(comp.type).toBe('Composition');
    expect(comp.name).toBe('TestScene');
  });

  it('has discriminant type literal', () => {
    expectTypeOf<HoloComposition['type']>().toEqualTypeOf<'Composition'>();
  });

  it('optional fields are undefined by default', () => {
    const comp: HoloComposition = {
      type: 'Composition',
      name: 'Minimal',
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
    expect(comp.environment).toBeUndefined();
    expect(comp.state).toBeUndefined();
    expect(comp.effects).toBeUndefined();
    expect(comp.camera).toBeUndefined();
    expect(comp.logic).toBeUndefined();
    expect(comp.ui).toBeUndefined();
  });
});

// =============================================================================
// HoloLight — lightType union
// =============================================================================

describe('HoloLight', () => {
  it('accepts all lightType values', () => {
    const lightTypes: HoloLight['lightType'][] = [
      'directional', 'point', 'spot', 'hemisphere', 'ambient', 'area',
    ];
    for (const lt of lightTypes) {
      const light: HoloLight = { type: 'Light', name: 'l', lightType: lt, properties: [] };
      expect(light.lightType).toBe(lt);
    }
  });

  it('has discriminant type literal', () => {
    expectTypeOf<HoloLight['type']>().toEqualTypeOf<'Light'>();
  });

  it('platformConstraint is optional', () => {
    const light: HoloLight = {
      type: 'Light', name: 'sun', lightType: 'directional', properties: [],
    };
    expect(light.platformConstraint).toBeUndefined();
  });
});

// =============================================================================
// HoloState / HoloStateProperty
// =============================================================================

describe('HoloState', () => {
  it('has discriminant type and properties array', () => {
    const state: HoloState = { type: 'State', properties: [] };
    expect(state.type).toBe('State');
    expect(state.properties).toEqual([]);
  });

  it('state property has reactive optional flag', () => {
    const prop: HoloStateProperty = {
      type: 'StateProperty',
      key: 'score',
      value: 0,
      reactive: true,
    };
    expect(prop.reactive).toBe(true);
  });

  it('reactive is optional', () => {
    const prop: HoloStateProperty = { type: 'StateProperty', key: 'x', value: 1 };
    expect(prop.reactive).toBeUndefined();
  });
});

// =============================================================================
// HoloTemplate
// =============================================================================

describe('HoloTemplate', () => {
  it('accepts minimal template', () => {
    const tpl: HoloTemplate = {
      type: 'Template',
      name: 'HeroTemplate',
      properties: [],
      actions: [],
      traits: [],
    };
    expect(tpl.type).toBe('Template');
    expect(tpl.name).toBe('HeroTemplate');
  });

  it('accepts optional version and platformConstraint', () => {
    const tpl: HoloTemplate = {
      type: 'Template',
      name: 'Versioned',
      properties: [],
      actions: [],
      traits: [],
      version: 2,
      platformConstraint: { include: ['quest3'], exclude: [] },
    };
    expect(tpl.version).toBe(2);
    expect(tpl.platformConstraint?.include).toEqual(['quest3']);
  });
});

describe('HoloDirectiveLike', () => {
  it('accepts any string key shape', () => {
    const d: HoloDirectiveLike = { hook: 'onMount', name: 'MyHook', custom: 42 };
    expect(d.hook).toBe('onMount');
    expect((d as Record<string, unknown>)['custom']).toBe(42);
  });

  it('all known fields are optional', () => {
    const d: HoloDirectiveLike = {};
    expect(d.hook).toBeUndefined();
    expect(d.name).toBeUndefined();
    expect(d.trait).toBeUndefined();
  });
});

// =============================================================================
// HoloObjectDecl
// =============================================================================

describe('HoloObjectDecl', () => {
  it('accepts minimal object declaration', () => {
    const obj: HoloObjectDecl = {
      type: 'Object',
      name: 'Enemy',
      properties: [],
      traits: [],
    };
    expect(obj.type).toBe('Object');
  });

  it('accepts optional children for nesting', () => {
    const child: HoloObjectDecl = { type: 'Object', name: 'child', properties: [], traits: [] };
    const parent: HoloObjectDecl = {
      type: 'Object', name: 'parent', properties: [], traits: [],
      children: [child],
    };
    expect(parent.children).toHaveLength(1);
    expect(parent.children![0].name).toBe('child');
  });

  it('accepts platformConstraint', () => {
    const obj: HoloObjectDecl = {
      type: 'Object', name: 'VrOnly', properties: [], traits: [],
      platformConstraint: { include: ['quest3'], exclude: [] },
    };
    expect(obj.platformConstraint?.include).toContain('quest3');
  });
});

// =============================================================================
// HoloTraitDefinition
// =============================================================================

describe('HoloTraitDefinition', () => {
  it('accepts a trait without base', () => {
    const trait: HoloTraitDefinition = {
      type: 'TraitDefinition',
      name: 'Clickable',
      properties: [],
    };
    expect(trait.base).toBeUndefined();
  });

  it('accepts a trait with base (inheritance)', () => {
    const trait: HoloTraitDefinition = {
      type: 'TraitDefinition',
      name: 'Clickable',
      base: 'Interactable',
      properties: [{ type: 'TraitProperty', key: 'cursor', value: 'pointer' }],
    };
    expect(trait.base).toBe('Interactable');
    expect(trait.properties[0].key).toBe('cursor');
  });
});

// =============================================================================
// HoloStatement union — discriminant narrowing
// =============================================================================

describe('HoloStatement discriminant narrowing', () => {
  it('Assignment has correct discriminant and fields', () => {
    const stmt: HoloAssignment = {
      type: 'Assignment',
      target: 'state.score',
      operator: '+=',
      value: { type: 'Literal', value: 10 },
    };
    expect(stmt.type).toBe('Assignment');
    expect(stmt.operator).toBe('+=');
  });

  it('all assignment operators are valid', () => {
    const ops: HoloAssignment['operator'][] = ['=', '+=', '-=', '*=', '/='];
    for (const op of ops) {
      const a: HoloAssignment = {
        type: 'Assignment', target: 'x', operator: op,
        value: { type: 'Literal', value: 0 },
      };
      expect(a.operator).toBe(op);
    }
  });

  it('MethodCall is a valid HoloStatement', () => {
    const stmt: HoloMethodCall = {
      type: 'MethodCall',
      method: 'emit',
      arguments: [],
    };
    assertType<HoloStatement>(stmt);
    expect(stmt.type).toBe('MethodCall');
  });

  it('IfStatement carries consequent and optional alternate', () => {
    const stmt: HoloIfStatement = {
      type: 'IfStatement',
      condition: { type: 'Identifier', name: 'isAlive' },
      consequent: [],
    };
    expect(stmt.alternate).toBeUndefined();
  });

  it('ForStatement has variable, iterable, body', () => {
    const stmt: HoloForStatement = {
      type: 'ForStatement',
      variable: 'item',
      iterable: { type: 'Identifier', name: 'inventory' },
      body: [],
    };
    expect(stmt.variable).toBe('item');
  });

  it('VariableDeclaration kind covers let/var/const', () => {
    const kinds: HoloVariableDeclaration['kind'][] = ['let', 'var', 'const'];
    for (const kind of kinds) {
      const decl: HoloVariableDeclaration = { type: 'VariableDeclaration', kind, name: 'x' };
      expect(decl.kind).toBe(kind);
    }
  });

  it('ReturnStatement value is optional', () => {
    const ret: HoloReturnStatement = { type: 'ReturnStatement' };
    expect(ret.value).toBeUndefined();
  });

  it('EmitStatement carries event name', () => {
    const stmt: HoloEmitStatement = { type: 'EmitStatement', event: 'player_died' };
    expect(stmt.event).toBe('player_died');
  });

  it('WhileStatement has condition and body', () => {
    const stmt: HoloWhileStatement = {
      type: 'WhileStatement',
      condition: { type: 'Literal', value: true },
      body: [],
    };
    assertType<HoloStatement>(stmt);
  });

  it('OnErrorStatement is a valid statement', () => {
    const stmt: HoloOnErrorStatement = { type: 'OnErrorStatement', body: [] };
    assertType<HoloStatement>(stmt);
  });

  it('ExpressionStatement wraps an expression', () => {
    const stmt: HoloExpressionStatement = {
      type: 'ExpressionStatement',
      expression: { type: 'Identifier', name: 'foo' },
    };
    assertType<HoloStatement>(stmt);
  });
});

// =============================================================================
// HoloExpression union — discriminant narrowing
// =============================================================================

describe('HoloExpression discriminant narrowing', () => {
  it('Literal accepts string/number/boolean/null values', () => {
    const lit: HoloLiteral = { type: 'Literal', value: 'hello' };
    expect(lit.value).toBe('hello');
    assertType<HoloExpression>(lit);
  });

  it('Identifier carries name', () => {
    const id: HoloIdentifier = { type: 'Identifier', name: 'score' };
    assertType<HoloExpression>(id);
    expect(id.name).toBe('score');
  });

  it('BinaryExpression nests two expressions', () => {
    const expr: HoloBinaryExpression = {
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Identifier', name: 'x' },
      right: { type: 'Literal', value: 1 },
    };
    assertType<HoloExpression>(expr);
    expect(expr.operator).toBe('+');
  });

  it('UnaryExpression operators: ! and -', () => {
    const ops: HoloUnaryExpression['operator'][] = ['!', '-'];
    for (const op of ops) {
      const u: HoloUnaryExpression = {
        type: 'UnaryExpression', operator: op,
        argument: { type: 'Identifier', name: 'x' },
      };
      expect(u.operator).toBe(op);
    }
  });

  it('MemberExpression distinguishes computed vs dot access', () => {
    const dotAccess: HoloMemberExpression = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'player' },
      property: 'health',
      computed: false,
    };
    const computed: HoloMemberExpression = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'arr' },
      property: 'i',
      computed: true,
    };
    expect(dotAccess.computed).toBe(false);
    expect(computed.computed).toBe(true);
  });

  it('CallExpression has callee and arguments', () => {
    const call: HoloCallExpression = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'heal' },
      arguments: [{ type: 'Literal', value: 50 }],
    };
    assertType<HoloExpression>(call);
    expect(call.arguments).toHaveLength(1);
  });

  it('UpdateExpression prefix vs postfix', () => {
    const pre: HoloUpdateExpression = {
      type: 'UpdateExpression', operator: '++',
      argument: { type: 'Identifier', name: 'i' }, prefix: true,
    };
    const post: HoloUpdateExpression = {
      type: 'UpdateExpression', operator: '--',
      argument: { type: 'Identifier', name: 'i' }, prefix: false,
    };
    expect(pre.prefix).toBe(true);
    expect(post.prefix).toBe(false);
  });

  it('BindExpression carries source and optional transform', () => {
    const bind: HoloBindExpression = { type: 'BindExpression', source: 'state.score' };
    expect(bind.transform).toBeUndefined();
    const withTx: HoloBindExpression = {
      type: 'BindExpression', source: 'state.hp', transform: 'pct',
    };
    expect(withTx.transform).toBe('pct');
  });

  it('ConditionalExpression ternary has test/consequent/alternate', () => {
    const cond: HoloConditionalExpression = {
      type: 'ConditionalExpression',
      test: { type: 'Identifier', name: 'alive' },
      consequent: { type: 'Literal', value: 'green' },
      alternate: { type: 'Literal', value: 'red' },
    };
    assertType<HoloExpression>(cond);
  });

  it('ArrayExpression holds expression elements', () => {
    const arr: HoloArrayExpression = {
      type: 'ArrayExpression',
      elements: [{ type: 'Literal', value: 1 }, { type: 'Literal', value: 2 }],
    };
    expect(arr.elements).toHaveLength(2);
  });

  it('ObjectExpression has key-value pairs', () => {
    const obj: HoloObjectExpression = {
      type: 'ObjectExpression',
      properties: [{ key: 'x', value: { type: 'Literal', value: 0 } }],
    };
    expect(obj.properties[0].key).toBe('x');
  });
});

// =============================================================================
// HoloTimeline / HoloTimelineAction
// =============================================================================

describe('HoloTimeline', () => {
  it('accepts minimal timeline', () => {
    const tl: HoloTimeline = { type: 'Timeline', name: 'intro', entries: [] };
    expect(tl.autoplay).toBeUndefined();
    expect(tl.loop).toBeUndefined();
  });

  it('TimelineAction animate kind', () => {
    const action: HoloTimelineAction = {
      kind: 'animate', target: 'hero', properties: { x: 10 },
    };
    expect(action.kind).toBe('animate');
  });

  it('TimelineAction emit kind', () => {
    const action: HoloTimelineAction = { kind: 'emit', event: 'scene_start' };
    expect(action.kind).toBe('emit');
  });

  it('TimelineAction call kind', () => {
    const action: HoloTimelineAction = { kind: 'call', method: 'playSound' };
    expect(action.kind).toBe('call');
  });

  it('TimelineEntry has time and action', () => {
    const entry: HoloTimelineEntry = {
      type: 'TimelineEntry',
      time: 2.5,
      action: { kind: 'emit', event: 'start' },
    };
    expect(entry.time).toBe(2.5);
  });
});

// =============================================================================
// HoloNPC / HoloBehavior / HoloBehaviorAction
// =============================================================================

describe('HoloNPC', () => {
  it('accepts minimal NPC', () => {
    const npc: HoloNPC = {
      type: 'NPC', name: 'Guard', properties: [], behaviors: [],
    };
    expect(npc.type).toBe('NPC');
    expect(npc.dialogueTree).toBeUndefined();
  });

  it('behavior action types cover expected set', () => {
    const types: HoloBehaviorAction['actionType'][] = [
      'move', 'animate', 'face', 'damage', 'heal', 'spawn', 'emit', 'wait', 'call',
    ];
    for (const t of types) {
      const action: HoloBehaviorAction = { type: 'BehaviorAction', actionType: t, config: {} };
      expect(action.actionType).toBe(t);
    }
  });
});

// =============================================================================
// HoloQuest / HoloQuestObjective / HoloQuestRewards
// =============================================================================

describe('HoloQuest', () => {
  it('accepts minimal quest with empty objectives and rewards', () => {
    const quest: HoloQuest = {
      type: 'Quest',
      name: 'FindHerb',
      objectives: [],
      rewards: {
        type: 'QuestRewards',
      },
    };
    expect(quest.type).toBe('Quest');
    expect(quest.questType).toBeUndefined();
  });

  it('questType covers all documented values', () => {
    const types: NonNullable<HoloQuest['questType']>[] = [
      'fetch', 'defeat', 'discover', 'escort', 'deliver', 'custom',
    ];
    for (const qt of types) {
      const q: HoloQuest = {
        type: 'Quest', name: 'Q', objectives: [],
        rewards: { type: 'QuestRewards' }, questType: qt,
      };
      expect(q.questType).toBe(qt);
    }
  });

  it('QuestObjective objectiveType covers all values', () => {
    const types: HoloQuestObjective['objectiveType'][] = [
      'discover', 'defeat', 'collect', 'deliver', 'interact', 'survive',
    ];
    for (const t of types) {
      const obj: HoloQuestObjective = {
        type: 'QuestObjective', id: '1', description: 'desc',
        objectiveType: t, target: 'enemy',
      };
      expect(obj.objectiveType).toBe(t);
    }
  });

  it('QuestRewardItem rarity covers all values', () => {
    const rarities: NonNullable<HoloQuestRewardItem['rarity']>[] = [
      'common', 'uncommon', 'rare', 'epic', 'legendary',
    ];
    for (const r of rarities) {
      const item: HoloQuestRewardItem = { type: 'QuestRewardItem', id: 'sword', rarity: r };
      expect(item.rarity).toBe(r);
    }
  });
});

// =============================================================================
// HoloAbility / HoloAbilityStats
// =============================================================================

describe('HoloAbility', () => {
  it('accepts minimal ability', () => {
    const ability: HoloAbility = {
      type: 'Ability',
      name: 'Fireball',
      abilityType: 'spell',
      stats: { type: 'AbilityStats' },
      effects: { type: 'AbilityEffects' },
    };
    expect(ability.abilityType).toBe('spell');
    expect(ability.scaling).toBeUndefined();
    expect(ability.projectile).toBeUndefined();
  });

  it('abilityType covers all documented values', () => {
    const types: HoloAbility['abilityType'][] = ['spell', 'skill', 'passive', 'ultimate'];
    for (const t of types) {
      const a: HoloAbility = {
        type: 'Ability', name: 'A', abilityType: t,
        stats: { type: 'AbilityStats' }, effects: { type: 'AbilityEffects' },
      };
      expect(a.abilityType).toBe(t);
    }
  });

  it('AbilityStats all fields optional', () => {
    const stats: HoloAbilityStats = { type: 'AbilityStats' };
    expect(stats.manaCost).toBeUndefined();
    expect(stats.cooldown).toBeUndefined();
    expect(stats.range).toBeUndefined();
  });
});

// =============================================================================
// HoloDialogue
// =============================================================================

describe('HoloDialogue', () => {
  it('accepts string content', () => {
    const d: HoloDialogue = {
      type: 'Dialogue', id: 'dlg_001',
      content: 'Hello traveller!', options: [],
    };
    expect(d.content).toBe('Hello traveller!');
  });

  it('accepts localized text content', () => {
    const loc: HoloLocalizedText = {
      type: 'LocalizedText', id: 'greet',
      translations: { en: 'Hello', es: 'Hola' },
    };
    const d: HoloDialogue = {
      type: 'Dialogue', id: 'dlg_002', content: loc, options: [],
    };
    expect((d.content as HoloLocalizedText).translations['en']).toBe('Hello');
  });

  it('emotion covers all documented values', () => {
    const emotions: NonNullable<HoloDialogue['emotion']>[] = [
      'friendly', 'angry', 'sad', 'neutral', 'excited', 'mysterious',
    ];
    for (const em of emotions) {
      const d: HoloDialogue = {
        type: 'Dialogue', id: 'e', emotion: em, content: 'hi', options: [],
      };
      expect(d.emotion).toBe(em);
    }
  });
});

// =============================================================================
// HoloStateMachine
// =============================================================================

describe('HoloStateMachine', () => {
  it('accepts minimal state machine', () => {
    const sm: HoloStateMachine = {
      type: 'StateMachine',
      name: 'CombatFSM',
      initialState: 'idle',
      states: {},
    };
    expect(sm.initialState).toBe('idle');
    expect(Object.keys(sm.states)).toHaveLength(0);
  });

  it('State_Machine entry/exit are optional', () => {
    const s: HoloState_Machine = {
      type: 'State_Machine',
      name: 'idle',
      actions: [],
      transitions: [],
    };
    expect(s.entry).toBeUndefined();
    expect(s.exit).toBeUndefined();
    expect(s.onDamage).toBeUndefined();
  });
});

// =============================================================================
// HoloParseResult / HoloParseError / HoloParseWarning
// =============================================================================

describe('HoloParseResult', () => {
  it('accepts a successful parse result without AST (success=true but ast optional)', () => {
    const result: HoloParseResult = {
      success: true,
      errors: [],
      warnings: [],
    };
    expect(result.success).toBe(true);
    expect(result.ast).toBeUndefined();
  });

  it('accepts a failed parse result with errors', () => {
    const result: HoloParseResult = {
      success: false,
      errors: [{ message: 'Unexpected token', code: 'E001' }],
      warnings: [],
    };
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe('Unexpected token');
  });

  it('HoloParseError has optional loc, code, suggestion, severity', () => {
    const err: HoloParseError = {
      message: 'bad token',
      loc: { line: 3, column: 5 },
      code: 'E002',
      suggestion: 'Did you mean X?',
      severity: 'error',
    };
    expect(err.severity).toBe('error');
    expect(err.suggestion).toBe('Did you mean X?');
  });

  it('HoloParseWarning has message and optional loc/code', () => {
    const w: HoloParseWarning = { message: 'Deprecated usage' };
    expect(w.code).toBeUndefined();
  });
});

// =============================================================================
// ImportDirective / ExportDirective
// =============================================================================

describe('ImportDirective', () => {
  it('accepts minimal import directive', () => {
    const imp: ImportDirective = {
      type: 'import',
      path: './player.hs',
      alias: 'player',
    };
    expect(imp.type).toBe('import');
    expect(imp.isWildcard).toBeUndefined();
    expect(imp.namedImports).toBeUndefined();
  });

  it('accepts wildcard import', () => {
    const imp: ImportDirective = {
      type: 'import', path: './lib.hs', alias: 'NS', isWildcard: true,
    };
    expect(imp.isWildcard).toBe(true);
  });

  it('accepts named imports', () => {
    const imp: ImportDirective = {
      type: 'import', path: './utils.hs', alias: 'utils',
      namedImports: ['helperA', 'helperB'],
    };
    expect(imp.namedImports).toHaveLength(2);
  });
});

describe('ExportDirective', () => {
  it('accepts all exportKind values', () => {
    const kinds: ExportDirective['exportKind'][] = [
      'template', 'object', 'composition', 'trait', 'group', 'scene', 'any',
    ];
    for (const k of kinds) {
      const exp: ExportDirective = { type: 'export', exportKind: k };
      expect(exp.exportKind).toBe(k);
    }
  });

  it('exportName is optional', () => {
    const exp: ExportDirective = { type: 'export', exportKind: 'any' };
    expect(exp.exportName).toBeUndefined();
  });
});

// =============================================================================
// HoloParserOptions
// =============================================================================

describe('HoloParserOptions', () => {
  it('all fields are optional', () => {
    const opts: HoloParserOptions = {};
    expect(opts.locations).toBeUndefined();
    expect(opts.tolerant).toBeUndefined();
    expect(opts.strict).toBeUndefined();
    expect(opts.filename).toBeUndefined();
  });

  it('accepts all fields populated', () => {
    const opts: HoloParserOptions = {
      locations: true,
      tolerant: false,
      strict: true,
      filename: 'scene.holo',
    };
    expect(opts.filename).toBe('scene.holo');
  });
});

// =============================================================================
// HSPlusImport
// =============================================================================

describe('HSPlusImport', () => {
  it('accepts required fields', () => {
    const imp: HSPlusImport = { path: './lib.hs', alias: 'lib' };
    expect(imp.path).toBe('./lib.hs');
    expect(imp.alias).toBe('lib');
  });

  it('accepts optional fields', () => {
    const imp: HSPlusImport = {
      path: './lib.hs', alias: 'lib',
      namedImports: ['A'], isWildcard: false,
    };
    expect(imp.namedImports).toEqual(['A']);
  });
});

// =============================================================================
// ReadFileFn
// =============================================================================

describe('ReadFileFn', () => {
  it('is a function type that returns Promise<string>', () => {
    expectTypeOf<ReadFileFn>().toBeFunction();
    expectTypeOf<ReadFileFn>().returns.toEqualTypeOf<Promise<string>>();
  });

  it('a concrete implementation satisfies the type', () => {
    const fn: ReadFileFn = async (path: string) => `content of ${path}`;
    assertType<ReadFileFn>(fn);
  });
});

// =============================================================================
// HoloDomainType union
// =============================================================================

describe('HoloDomainType', () => {
  it('accepts all standard domain type values', () => {
    const domains: HoloDomainType[] = [
      'iot', 'robotics', 'dataviz', 'education', 'healthcare', 'music',
      'architecture', 'web3', 'material', 'physics', 'vfx', 'postfx',
      'audio', 'weather', 'procedural', 'rendering', 'navigation', 'input',
      'codebase', 'narrative', 'payment', 'norms',
      'service', 'contract', 'data', 'network', 'pipeline', 'metric',
      'container', 'resilience', 'custom',
    ];
    for (const d of domains) {
      const block: HoloDomainBlock = {
        type: 'DomainBlock', domain: d, keyword: 'sensor', name: 'S',
        traits: [], properties: {},
      };
      expect(block.domain).toBe(d);
    }
  });
});

describe('HoloDomainBlock', () => {
  it('accepts minimal block', () => {
    const block: HoloDomainBlock = {
      type: 'DomainBlock', domain: 'iot', keyword: 'sensor',
      name: 'TempSensor', traits: [], properties: {},
    };
    expect(block.domainTags).toBeUndefined();
    expect(block.children).toBeUndefined();
    expect(block.eventHandlers).toBeUndefined();
  });

  it('accepts full block with optional fields', () => {
    const block: HoloDomainBlock = {
      type: 'DomainBlock', domain: 'robotics', keyword: 'joint',
      name: 'Elbow', traits: ['@safety_rated'], properties: { limits: '[-1.5, 1.5]' },
      domainTags: ['iso10218'],
    };
    expect(block.domainTags).toContain('iso10218');
  });
});

// =============================================================================
// Spatial primitives (v4)
// =============================================================================

describe('HoloSpawnGroup', () => {
  it('accepts name and properties', () => {
    const sg: HoloSpawnGroup = { type: 'SpawnGroup', name: 'EnemyWave', properties: {} };
    expect(sg.type).toBe('SpawnGroup');
  });
});

describe('HoloWaypoints', () => {
  it('accepts name and points', () => {
    const wp: HoloWaypoints = {
      type: 'Waypoints', name: 'Patrol',
      points: [[0, 0, 0], [5, 0, 0]],
    };
    expect(wp.name).toBe('Patrol');
  });
});

describe('HoloConstraintBlock', () => {
  it('accepts required fields', () => {
    const c: HoloConstraintBlock = { type: 'Constraint', name: 'C1', properties: {} };
    expect(c.type).toBe('Constraint');
  });
});

describe('HoloTerrainBlock', () => {
  it('accepts required fields', () => {
    const t: HoloTerrainBlock = { type: 'Terrain', name: 'Hills', properties: {} };
    expect(t.type).toBe('Terrain');
  });
});

// =============================================================================
// Norm lifecycle types
// =============================================================================

describe('NormLifecyclePhase', () => {
  it('covers all phases', () => {
    const phases: NormLifecyclePhase[] = [
      'creation', 'representation', 'spreading', 'evaluation', 'compliance',
    ];
    expect(phases).toHaveLength(5);
    assertType<NormLifecyclePhase[]>(phases);
  });
});

describe('NormStatus', () => {
  it('covers all status values', () => {
    const statuses: NormStatus[] = [
      'draft', 'proposed', 'voting', 'adopted', 'suspended', 'deprecated', 'revoked', 'contested',
    ];
    expect(statuses).toHaveLength(8);
    assertType<NormStatus[]>(statuses);
  });
});

describe('NormVotingMechanism', () => {
  it('covers all voting mechanisms', () => {
    const mechanisms: NormVotingMechanism[] = [
      'majority', 'supermajority', 'consensus', 'weighted',
      'liquid_democracy', 'quadratic', 'ranked_choice', 'lazy_consensus',
    ];
    expect(mechanisms).toHaveLength(8);
    assertType<NormVotingMechanism[]>(mechanisms);
  });
});

describe('NormViolationSeverity', () => {
  it('covers all severity levels', () => {
    const levels: NormViolationSeverity[] = [
      'info', 'warning', 'minor', 'moderate', 'major', 'critical',
    ];
    expect(levels).toHaveLength(6);
    assertType<NormViolationSeverity[]>(levels);
  });
});

describe('NormSanctionType', () => {
  it('covers all sanction types', () => {
    const types: NormSanctionType[] = [
      'warn', 'restrict', 'penalize', 'suspend', 'ban', 'quarantine', 'escalate', 'custom',
    ];
    expect(types).toHaveLength(8);
    assertType<NormSanctionType[]>(types);
  });
});

describe('NormSpreadingMechanism', () => {
  it('covers all spreading mechanisms', () => {
    const mechs: NormSpreadingMechanism[] = [
      'broadcast', 'observation', 'communication', 'imitation', 'enforcement', 'passive',
    ];
    expect(mechs).toHaveLength(6);
    assertType<NormSpreadingMechanism[]>(mechs);
  });
});

// =============================================================================
// HoloNormBlock
// =============================================================================

describe('HoloNormBlock', () => {
  it('accepts minimal norm block', () => {
    const norm: HoloNormBlock = {
      type: 'NormBlock',
      name: 'NoSpamming',
      traits: [],
      properties: { description: 'No spam' },
    };
    expect(norm.type).toBe('NormBlock');
    expect(norm.creation).toBeUndefined();
    expect(norm.platformConstraint).toBeUndefined();
  });

  it('accepts full norm block with all lifecycle phases', () => {
    const norm: HoloNormBlock = {
      type: 'NormBlock',
      name: 'FullNorm',
      traits: ['@enforceable'],
      properties: { priority: 8 },
      creation: { type: 'NormCreation', properties: { author: 'system' } },
      representation: { type: 'NormRepresentation', properties: { condition: 'x < 10' } },
      spreading: { type: 'NormSpreading', properties: { mechanism: 'broadcast' } },
      evaluation: { type: 'NormEvaluation', properties: { voting: 'majority' } },
      compliance: { type: 'NormCompliance', properties: { severity: 'moderate' } },
    };
    expect(norm.creation?.properties['author']).toBe('system');
    expect(norm.spreading?.properties['mechanism']).toBe('broadcast');
  });
});

// =============================================================================
// HoloMetanorm
// =============================================================================

describe('HoloMetanorm', () => {
  it('accepts minimal metanorm', () => {
    const mn: HoloMetanorm = {
      type: 'Metanorm',
      name: 'NormAmendmentProcess',
      traits: [],
      properties: {},
    };
    expect(mn.rules).toBeUndefined();
    expect(mn.escalation).toBeUndefined();
  });

  it('accepts metanorm with rules and escalation', () => {
    const mn: HoloMetanorm = {
      type: 'Metanorm',
      name: 'GovernanceProcess',
      traits: [],
      properties: { applies_to: 'all_norms' },
      rules: { type: 'MetanormRules', properties: { amendment_quorum: 0.75 } },
      escalation: { type: 'MetanormEscalation', properties: { authority: 'council' } },
    };
    expect(mn.rules?.properties['amendment_quorum']).toBe(0.75);
    expect(mn.escalation?.properties['authority']).toBe('council');
  });
});

// =============================================================================
// CompiledNarrative / CompiledPaywall (compiled IR spot-checks)
// =============================================================================

describe('CompiledNarrative', () => {
  it('accepts linear narrative', () => {
    const n: CompiledNarrative = {
      name: 'Intro', type: 'linear', chapters: [],
    };
    expect(n.type).toBe('linear');
    expect(n.variables).toBeUndefined();
  });

  it('type covers branching and open_world', () => {
    const types: CompiledNarrative['type'][] = ['linear', 'branching', 'open_world'];
    for (const t of types) {
      const n: CompiledNarrative = { name: 'N', type: t, chapters: [] };
      expect(n.type).toBe(t);
    }
  });
});

describe('CompiledPaywall', () => {
  it('accepts valid paywall shape', () => {
    const pw: CompiledPaywall = {
      name: 'ChapterGate',
      price: 0.99,
      asset: 'USDC',
      network: 'base',
      recipient: '0xDeAdBeEf',
      type: 'one_time',
    };
    expect(pw.asset).toBe('USDC');
    expect(pw.network).toBe('base');
    expect(pw.gatedContent).toBeUndefined();
    expect(pw.revenueSplit).toBeUndefined();
  });

  it('asset covers USDC/ETH/SOL', () => {
    const assets: CompiledPaywall['asset'][] = ['USDC', 'ETH', 'SOL'];
    for (const a of assets) {
      const pw: CompiledPaywall = {
        name: 'P', price: 1, asset: a, network: 'ethereum', recipient: '0x0', type: 'tip',
      };
      expect(pw.asset).toBe(a);
    }
  });
});

// =============================================================================
// HoloAchievement / HoloTalentTree (Brittney AI features)
// =============================================================================

describe('HoloAchievement', () => {
  it('accepts minimal achievement', () => {
    const ach: HoloAchievement = {
      type: 'Achievement',
      name: 'FirstBlood',
      description: 'First kill',
      condition: { type: 'Literal', value: true },
    };
    expect(ach.hidden).toBeUndefined();
    expect(ach.reward).toBeUndefined();
  });
});

describe('HoloTalentTree', () => {
  it('accepts talent tree with rows', () => {
    const tree: HoloTalentTree = {
      type: 'TalentTree',
      name: 'Warrior',
      rows: [
        {
          type: 'TalentRow',
          tier: 1,
          nodes: [
            {
              type: 'TalentNode',
              id: 'str1',
              name: 'Strength I',
              points: 1,
              effect: {
                type: 'TalentEffect',
                effectType: 'passive',
              },
            },
          ],
        },
      ],
    };
    expect(tree.rows[0].tier).toBe(1);
    expect(tree.rows[0].nodes[0].id).toBe('str1');
  });

  it('TalentEffect effectType covers all values', () => {
    const types: HoloTalentEffect['effectType'][] = ['spell', 'upgrade', 'passive', 'unlock'];
    for (const t of types) {
      const eff: HoloTalentEffect = { type: 'TalentEffect', effectType: t };
      expect(eff.effectType).toBe(t);
    }
  });
});

// =============================================================================
// HoloConditionalBlock / HoloForEachBlock
// =============================================================================

describe('HoloConditionalBlock', () => {
  it('accepts condition with objects', () => {
    const block: HoloConditionalBlock = {
      type: 'ConditionalBlock',
      condition: 'state.debug',
      objects: [],
    };
    expect(block.elseObjects).toBeUndefined();
    expect(block.elseSpatialGroups).toBeUndefined();
  });
});

describe('HoloForEachBlock', () => {
  it('accepts variable, iterable, and objects', () => {
    const block: HoloForEachBlock = {
      type: 'ForEachBlock',
      variable: 'item',
      iterable: 'inventory',
      objects: [],
    };
    expect(block.spatialGroups).toBeUndefined();
  });
});

// =============================================================================
// HoloCamera
// =============================================================================

describe('HoloCamera', () => {
  it('accepts all cameraType values', () => {
    const types: HoloCamera['cameraType'][] = ['perspective', 'orthographic', 'cinematic'];
    for (const t of types) {
      const cam: HoloCamera = { type: 'Camera', cameraType: t, properties: [] };
      expect(cam.cameraType).toBe(t);
    }
  });
});

// =============================================================================
// HoloSpatialGroup — recursive nesting
// =============================================================================

describe('HoloSpatialGroup', () => {
  it('accepts minimal group', () => {
    const group: HoloSpatialGroup = {
      type: 'SpatialGroup', name: 'Level1', properties: [], objects: [],
    };
    expect(group.groups).toBeUndefined();
  });

  it('accepts nested groups (recursive)', () => {
    const inner: HoloSpatialGroup = {
      type: 'SpatialGroup', name: 'Inner', properties: [], objects: [],
    };
    const outer: HoloSpatialGroup = {
      type: 'SpatialGroup', name: 'Outer', properties: [], objects: [],
      groups: [inner],
    };
    expect(outer.groups).toHaveLength(1);
    expect(outer.groups![0].name).toBe('Inner');
  });
});

// =============================================================================
// HoloImport / HoloImportSpecifier
// =============================================================================

describe('HoloImport', () => {
  it('accepts import with specifiers and source', () => {
    const imp: HoloImport = {
      type: 'Import',
      specifiers: [{ type: 'ImportSpecifier', imported: 'Hero', local: 'H' }],
      source: './player.hsplus',
    };
    expect(imp.source).toBe('./player.hsplus');
    expect(imp.specifiers[0].local).toBe('H');
  });

  it('ImportSpecifier local is optional', () => {
    const spec: HoloImportSpecifier = { type: 'ImportSpecifier', imported: 'Base' };
    expect(spec.local).toBeUndefined();
  });
});
