/**
 * @fileoverview Cross-file ProvenanceBoundsChecker (P2.12) — verified obligations
 * @module @holoscript/core/compiler/authority
 *
 * Proves the round-3 upgrade: with a CrossFileContext, the 3 obligations that
 * single-file analysis could only ASSUME (ability_spam, unvalidated_cast,
 * info_leak) become genuinely verified — and `provablyBounded` can no longer be
 * true when a client-authoritative ability or an info leak is present.
 */

import { describe, it, expect } from 'vitest';
import { ProvenanceBoundsChecker, type CrossFileContext } from '../../ProvenanceBoundsChecker';
import { AuthoritySymbolGraph } from '../AuthoritySymbolGraph';
import { buildColyseusCrossFileContext } from '../ColyseusAuthorityManifest';
import { ColyseusCompiler } from '../../ColyseusCompiler';
import { createTestCompilerToken } from '../../CompilerBase';
import type {
  HoloComposition,
  HoloAbility,
  HoloObjectTrait,
} from '../../../parser/HoloCompositionTypes';

const token = createTestCompilerToken();

function comp(partial: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestWorld',
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
    traits: [],
    ...partial,
  } as unknown as HoloComposition;
}

function ability(name: string): HoloAbility {
  return {
    type: 'Ability',
    name,
    abilityType: 'spell',
    stats: { type: 'AbilityStats', range: 30 },
    effects: { type: 'AbilityEffects' },
  } as unknown as HoloAbility;
}

function trait(name: string): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config: {} } as unknown as HoloObjectTrait;
}

function envelopes(
  pairs: Array<[string, 'server' | 'client_predicted' | 'client']>
): Map<string, 'server' | 'client_predicted' | 'client'> {
  return new Map(pairs);
}

function find(report: ReturnType<ProvenanceBoundsChecker['check']>, cls: string) {
  return report.obligations.find((o) => o.exploitClass === cls)!;
}

describe('ProvenanceBoundsChecker — single-file behaviour is unchanged without context', () => {
  it('keeps the caveated "satisfied" ability obligations when no CrossFileContext is given', () => {
    const checker = new ProvenanceBoundsChecker();
    const report = checker.check(comp({ abilities: [ability('fireball')] }));
    expect(find(report, 'ability_spam').status).toBe('satisfied');
    expect(find(report, 'ability_spam').evidence).toContain('single-file');
    expect(find(report, 'unvalidated_cast').status).toBe('satisfied');
  });
});

describe('ProvenanceBoundsChecker — cross-file ability authority (P2.12)', () => {
  const checker = new ProvenanceBoundsChecker();

  it('UNMET ability_spam when an ability resolves to client authority', () => {
    const ctx: CrossFileContext = {
      abilityEnvelopes: envelopes([
        ['fireball', 'server'],
        ['blink', 'client'],
      ]),
    };
    const report = checker.check(comp({ abilities: [ability('fireball'), ability('blink')] }), ctx);
    const ob = find(report, 'ability_spam');
    expect(ob.status).toBe('unmet');
    expect(ob.evidence).toContain('blink');
  });

  it('client_predicted is spam-risk (ability_spam unmet) but cast IS validated (unvalidated_cast satisfied)', () => {
    const ctx: CrossFileContext = {
      abilityEnvelopes: envelopes([['arrow', 'client_predicted']]),
    };
    const report = checker.check(comp({ abilities: [ability('arrow')] }), ctx);
    expect(find(report, 'ability_spam').status).toBe('unmet');
    expect(find(report, 'unvalidated_cast').status).toBe('satisfied');
  });

  it('SATISFIED (verified) when all abilities resolve to server authority', () => {
    const ctx: CrossFileContext = {
      abilityEnvelopes: envelopes([
        ['fireball', 'server'],
        ['frostbolt', 'server'],
      ]),
    };
    const report = checker.check(
      comp({ abilities: [ability('fireball'), ability('frostbolt')] }),
      ctx
    );
    const ob = find(report, 'ability_spam');
    expect(ob.status).toBe('satisfied');
    expect(ob.evidence).toContain('verified server-authoritative');
  });
});

describe('ProvenanceBoundsChecker — cross-file info_leak via authority graph', () => {
  const checker = new ProvenanceBoundsChecker();

  it('UNMET info_leak when the graph reports a leaked server_only symbol', () => {
    const graph = new AuthoritySymbolGraph();
    const leak = AuthoritySymbolGraph.keyFor('f', 'rngState', 'GameRoomState');
    graph.addSymbol({
      key: leak,
      name: 'rngState',
      sourceFile: 'f',
      kind: 'schema_field',
      tier: 'server_only',
      clientExposed: true,
    });
    const report = checker.check(comp({}), { graph });
    const ob = find(report, 'info_leak');
    expect(ob.status).toBe('unmet');
    expect(ob.evidence).toContain('rngState');
  });

  it('SATISFIED info_leak when the graph proves no leak', () => {
    const graph = new AuthoritySymbolGraph();
    graph.addSymbol({
      key: AuthoritySymbolGraph.keyFor('f', 'rng'),
      name: 'rng',
      sourceFile: 'f',
      kind: 'constant',
      tier: 'server_only',
    });
    const report = checker.check(comp({}), { graph });
    expect(find(report, 'info_leak').status).toBe('satisfied');
  });
});

describe('ProvenanceBoundsChecker — paper-claim risk closed', () => {
  it('@provably_bounded no longer passes when a client-authoritative ability leaks through', () => {
    const checker = new ProvenanceBoundsChecker();
    const composition = comp({
      traits: [trait('provably_bounded')],
      abilities: [ability('fireball'), ability('cheatcast')],
    });

    // Single-file: optimistically "bounded" (the gap this seed closes).
    expect(checker.check(composition).provablyBounded).toBe(true);

    // Cross-file: a client-authoritative ability makes it NOT bounded.
    const ctx: CrossFileContext = {
      abilityEnvelopes: envelopes([
        ['fireball', 'server'],
        ['cheatcast', 'client'],
      ]),
    };
    expect(checker.check(composition, ctx).provablyBounded).toBe(false);
  });
});

describe('ProvenanceBoundsChecker — end-to-end via buildColyseusCrossFileContext', () => {
  it('a clean compiled world is provably bounded with the cross-file context', () => {
    const composition = comp({
      name: 'FrontierMMO',
      traits: [trait('provably_bounded'), trait('movement_contract'), trait('receipt_on')],
      abilities: [ability('fireball')],
    });
    const result = new ColyseusCompiler().compile(composition, token);
    const ctx = buildColyseusCrossFileContext(result, composition);

    const report = new ProvenanceBoundsChecker().check(composition, ctx);
    expect(find(report, 'info_leak').status).toBe('satisfied');
    expect(find(report, 'ability_spam').status).toBe('satisfied');
    expect(find(report, 'unvalidated_cast').status).toBe('satisfied');
  });
});
