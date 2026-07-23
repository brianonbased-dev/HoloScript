import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crossFamilyConsistency, resolveAccess, resolveOcclusion } from '@holoscript/meaning';
import { HoloContainmentPerceptionError, perceiveContainmentIR } from '../HoloContainmentPerceiver';

const source = readFileSync(new URL('./fixtures/containment-world.holo', import.meta.url), 'utf8');

function perceptionError(run: () => unknown): HoloContainmentPerceptionError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(HoloContainmentPerceptionError);
    return error as HoloContainmentPerceptionError;
  }
  throw new Error('Expected containment perception to fail closed');
}

describe('perceiveContainmentIR', () => {
  it('uses the canonical .holo parser to recover entities, nesting, and provenance', () => {
    const ir = perceiveContainmentIR(source, {
      sourceId: 'containment-world.holo',
      query: { agent: 'agent', object: 'coin' },
    });

    expect(ir.perception).toEqual({
      format: '.holo',
      parser: 'HoloCompositionParser',
      composition: 'ContainmentWorld',
      sourceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      sourceId: 'containment-world.holo',
    });
    expect(ir.query).toEqual({ agent: 'agent', object: 'coin' });
    expect(ir.entities.find((entity) => entity.id === 'agent')).toMatchObject({
      kind: 'agent',
      label: 'Scene observer',
      source: {
        format: '.holo',
        parser: 'HoloCompositionParser',
        sourceDigest: ir.perception.sourceDigest,
        sourceId: 'containment-world.holo',
      },
    });
    expect(ir.containment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inner: 'agent', outer: 'room' }),
        expect.objectContaining({ inner: 'coin', outer: 'opaque_box' }),
        expect.objectContaining({ inner: 'opaque_box', outer: 'room' }),
      ])
    );
    expect(ir.entities.every((entity) => entity.source.line !== undefined)).toBe(true);
    expect(ir.containment.every((relation) => relation.source.path.length > 0)).toBe(true);
  });

  it('binds provenance to exact source text with a deterministic digest', () => {
    const first = perceiveContainmentIR(source);
    const second = perceiveContainmentIR(source);
    const changed = perceiveContainmentIR(
      source.replace('Scene observer', 'Changed scene observer')
    );

    expect(first.perception.sourceDigest).toBe(second.perception.sourceDigest);
    expect(changed.perception.sourceDigest).not.toBe(first.perception.sourceDigest);
    expect(
      first.entities.every((entity) => entity.source.sourceDigest === first.perception.sourceDigest)
    ).toBe(true);
  });

  it('preserves opaque true, false, and absent as three distinct meaning states', () => {
    const ir = perceiveContainmentIR(source);
    const opaqueBox = ir.entities.find((entity) => entity.id === 'opaque_box');
    const transparentBox = ir.entities.find((entity) => entity.id === 'transparent_box');
    const unknownBox = ir.entities.find((entity) => entity.id === 'unknown_box');

    expect(opaqueBox?.opaque).toBe(true);
    expect(transparentBox?.opaque).toBe(false);
    expect(unknownBox).not.toHaveProperty('opaque');

    expect(resolveOcclusion(ir, 'agent', 'coin')).toMatchObject({
      status: 'resolved',
      answer: { occluded: true, occluder: 'opaque_box' },
    });
    expect(resolveOcclusion(ir, 'agent', 'map')).toMatchObject({
      status: 'resolved',
      answer: { occluded: false, occluder: null },
    });
    expect(resolveOcclusion(ir, 'agent', 'key')).toMatchObject({
      status: 'unresolvable',
      gap: { code: 'occlusion.opacity_unstated', evidence: 'unknown_box' },
    });
  });

  it('preserves explicit unknown modality blocking for resolveAccess', () => {
    const ir = perceiveContainmentIR(source);

    expect(resolveAccess(ir, 'agent', 'bell')).toMatchObject({
      status: 'unresolvable',
      gap: {
        code: 'access.underdetermined_modality',
        evidence: 'audible@audible_unknown_box',
      },
    });
  });

  it('passes cross-family consistency on a perceived real scene', () => {
    const ir = perceiveContainmentIR(source);
    const occlusion = resolveOcclusion(ir, 'agent', 'coin');
    const access = resolveAccess(ir, 'agent', 'coin');
    expect(occlusion).toMatchObject({
      status: 'resolved',
      answer: { occluded: true, occluder: 'opaque_box' },
    });
    expect(access).toMatchObject({
      status: 'resolved',
      answer: { access: { visual: false } },
    });

    const consistency = crossFamilyConsistency(ir, {
      agent: 'agent',
      object: 'coin',
    });

    expect(consistency.coherent).toBe(true);
    expect(consistency.violations).toEqual([]);
    expect(consistency.checks.length).toBeGreaterThan(0);
  });

  it('abstains when a query crosses distinct named scene contexts', () => {
    const ir = perceiveContainmentIR(
      `
      composition "SceneContexts" {
        scene "ObservationDeck" {
          object "agent" { kind: "agent" }
          object "nearby" {}
        }
        scene "Vault" {
          object "artifact" {}
        }
      }
    `,
      {
        query: { agent: 'agent', object: 'artifact' },
      }
    );

    expect(resolveOcclusion(ir, 'agent', 'artifact')).toMatchObject({
      status: 'unresolvable',
      gap: {
        code: 'occlusion.opacity_unstated',
        evidence: 'holo:scene:Vault',
      },
    });
    expect(resolveAccess(ir, 'agent', 'artifact')).toMatchObject({
      status: 'unresolvable',
      gap: {
        code: 'access.underdetermined_modality',
        evidence: 'visual@holo:scene:Vault',
      },
    });
    expect(resolveOcclusion(ir, 'agent', 'nearby')).toMatchObject({
      status: 'resolved',
      answer: { occluded: false, occluder: null },
    });
  });

  it('fails closed on ambiguous IDs and contradictory modality annotations', () => {
    const duplicate = perceptionError(() =>
      perceiveContainmentIR(`
        composition "Duplicate" {
          object "room" {
            opaque: false
            object "one" { id: "same" }
            object "two" { semantic_id: "same" }
          }
        }
      `)
    );
    expect(duplicate.code).toBe('duplicate-semantic-id');
    expect(duplicate.message).toContain('semantic id "same"');

    const contradiction = perceptionError(() =>
      perceiveContainmentIR(`
        composition "Contradiction" {
          object "room" {
            opaque: false
            object "box" {
              blocks: ["visual"]
              blocks_unknown: ["visual"]
            }
          }
        }
      `)
    );
    expect(contradiction.code).toBe('conflicting-semantic-property');
    expect(contradiction.message).toContain('cannot appear in both blocks and blocks_unknown');
  });

  it('rejects wrong types, empty IDs, duplicate keys, and conflicting aliases', () => {
    const cases: Array<{
      body: string;
      code: HoloContainmentPerceptionError['code'];
    }> = [
      { body: 'opaque: "true"', code: 'invalid-semantic-property' },
      { body: 'blocks: "visual"', code: 'invalid-semantic-property' },
      { body: 'blocks: ["visual", 1]', code: 'invalid-semantic-property' },
      { body: 'id: "   "', code: 'invalid-semantic-property' },
      { body: 'type: 42', code: 'invalid-semantic-property' },
      {
        body: 'opaque: true opaque: false',
        code: 'conflicting-semantic-property',
      },
      {
        body: 'id: "box-a" semantic_id: "box-b"',
        code: 'conflicting-semantic-property',
      },
      {
        body: 'blocks_unknown: ["audible"] blocksUnknown: ["visual"]',
        code: 'conflicting-semantic-property',
      },
    ];

    for (const testCase of cases) {
      const error = perceptionError(() =>
        perceiveContainmentIR(`
          composition "InvalidProperty" {
            object "box" { ${testCase.body} }
          }
        `)
      );
      expect(error.code, testCase.body).toBe(testCase.code);
    }
  });

  it('fails closed when imports, templates, or dynamic/platform membership are unresolved', () => {
    const imported = perceptionError(() =>
      perceiveContainmentIR(`
        composition "ImportedWorld" {
          import "./other-world.holo"
          object "local" {}
        }
      `)
    );
    expect(imported.code).toBe('unsupported-import');

    const template = perceptionError(() =>
      perceiveContainmentIR(`
        composition "TemplateScene" {
          template "Barrier" { opaque: true }
          object "box" using "Barrier" {}
        }
      `)
    );
    expect(template.code).toBe('unsupported-template');

    const conditional = perceptionError(() =>
      perceiveContainmentIR(`
        composition "ConditionalScene" {
          if true {
            object "sometimes_box" { opaque: true }
          }
        }
      `)
    );
    expect(conditional.code).toBe('unsupported-dynamic-containment');

    const platform = perceptionError(() =>
      perceiveContainmentIR(`
        composition "PlatformScene" {
          @platform(quest3)
          object "quest_box" { opaque: true }
        }
      `)
    );
    expect(platform.code).toBe('unsupported-platform-constraint');
  });

  it('preserves authored spatial-group barrier semantics', () => {
    const ir = perceiveContainmentIR(`
      composition "GroupScene" {
        spatial_agent "agent" {}
        spatial_group "sealed_group" {
          id: "sealed"
          role: "container"
          opaque: true
          blocks: ["visual"]
          object "artifact" {}
        }
      }
    `);
    const group = ir.entities.find((entity) => entity.id === 'sealed');

    expect(group).toMatchObject({
      kind: 'container',
      opaque: true,
      blocks: ['visual'],
    });
    expect(resolveOcclusion(ir, 'agent', 'artifact')).toMatchObject({
      status: 'resolved',
      answer: { occluded: true, occluder: 'sealed' },
    });
  });

  it('reports canonical parser rejection with a stable admission code', () => {
    const error = perceptionError(() =>
      perceiveContainmentIR('composition "Broken" { object "box" {')
    );
    expect(error.code).toBe('invalid-source');
  });

  it('does not infer a query and rejects query IDs absent from the scene', () => {
    expect(perceiveContainmentIR(source).query).toBeUndefined();
    const absent = perceptionError(() =>
      perceiveContainmentIR(source, {
        query: { agent: 'agent', object: 'not_in_scene' },
      })
    );
    expect(absent.code).toBe('unknown-query-entity');

    const empty = perceptionError(() =>
      perceiveContainmentIR(source, {
        query: { agent: '   ', object: 'coin' },
      })
    );
    expect(empty.code).toBe('invalid-semantic-property');

    const emptySource = perceptionError(() => perceiveContainmentIR(source, { sourceId: '   ' }));
    expect(emptySource.code).toBe('invalid-semantic-property');
  });
});
