import { describe, it, expect, beforeEach } from 'vitest';
import { CrossRealityValidator } from '../CrossRealityValidator';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

// =============================================================================
// HELPERS
// =============================================================================

/** Create a minimal valid composition for testing */
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestComposition',
    objects: [],
    templates: [],
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
    ...overrides,
  };
}

/** Create a test object with traits */
function makeObject(
  name: string,
  traits: HoloObjectTrait[] = [],
  overrides: Partial<HoloObjectDecl> = {}
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [],
    traits,
    ...overrides,
  };
}

/** Create a trait */
function makeTrait(name: string, config: Record<string, any> = {}): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

// =============================================================================
// TESTS
// =============================================================================

describe('CrossRealityValidator', () => {
  let validator: CrossRealityValidator;

  beforeEach(() => {
    validator = new CrossRealityValidator();
  });

  // ---------------------------------------------------------------------------
  // Valid composition passes all checks
  // ---------------------------------------------------------------------------

  describe('valid composition', () => {
    it('passes all checks for a simple composition with no cross-reality issues', () => {
      const composition = makeComposition({
        objects: [
          makeObject('universalOrb', [makeTrait('grabbable', { snap: true })]),
          makeObject('floatingPanel', [makeTrait('hoverable')]),
        ],
      });

      const result = validator.validate(composition);

      expect(result.valid).toBe(true);
      const errors = result.issues.filter((i) => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('passes when VR-only traits have @platform() constraint', () => {
      const composition = makeComposition({
        objects: [
          makeObject('vrHandMenu', [
            makeTrait('hand_tracking', { mode: 'full' }),
            makeTrait('platform', { include: ['vr'] }),
          ]),
          // Universal fallback
          makeObject('mobileMenu', [
            makeTrait('platform', {
              include: ['mobile', 'desktop', 'ar', 'automotive', 'wearable'],
            }),
          ]),
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CR001: VR-only traits without @platform() constraint
  // ---------------------------------------------------------------------------

  describe('CR001: VR-only traits without @platform() constraint', () => {
    it('flags hand_tracking without @platform()', () => {
      const composition = makeComposition({
        objects: [makeObject('handMenu', [makeTrait('hand_tracking', { mode: 'full' })])],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(1);
      expect(cr001[0].severity).toBe('error');
      expect(cr001[0].blockName).toBe('handMenu');
      expect(cr001[0].message).toContain('hand_tracking');
      expect(cr001[0].suggestion).toBeDefined();
    });

    it('flags spatial_audio_3d without @platform()', () => {
      const composition = makeComposition({
        objects: [makeObject('audioSource', [makeTrait('spatial_audio_3d', { mode: 'hrtf' })])],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(1);
      expect(cr001[0].blockName).toBe('audioSource');
    });

    it('flags multiple VR-only traits on same object', () => {
      const composition = makeComposition({
        objects: [
          makeObject('vrPanel', [
            makeTrait('hand_tracking'),
            makeTrait('eye_tracking'),
            makeTrait('body_tracking'),
          ]),
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(3);
    });

    it('does not flag VR-only trait with @platform() constraint', () => {
      const composition = makeComposition({
        objects: [
          makeObject('constrainedObject', [
            makeTrait('hand_tracking'),
            makeTrait('platform', { include: ['vr'] }),
          ]),
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(0);
    });

    it('does not flag non-VR traits', () => {
      const composition = makeComposition({
        objects: [
          makeObject('normalObj', [
            makeTrait('grabbable'),
            makeTrait('hoverable'),
            makeTrait('scalable'),
          ]),
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CR002: No fallback object
  // ---------------------------------------------------------------------------

  describe('CR002: No fallback for excluded platforms', () => {
    it('warns when VR-constrained object has no fallback', () => {
      const composition = makeComposition({
        objects: [makeObject('vrOnlyWidget', [makeTrait('platform', { include: ['vr'] })])],
      });

      const result = validator.validate(composition);

      const cr002 = result.issues.filter((i) => i.code === 'CR002');
      expect(cr002).toHaveLength(1);
      expect(cr002[0].severity).toBe('warning');
      expect(cr002[0].blockName).toBe('vrOnlyWidget');
    });

    it('does not warn when a fallback exists', () => {
      const composition = makeComposition({
        objects: [
          makeObject('vrWidget', [makeTrait('platform', { include: ['vr'] })]),
          // This unconstrained object serves as a universal fallback
          makeObject('fallbackWidget', [makeTrait('hoverable')]),
        ],
      });

      const result = validator.validate(composition);

      const cr002 = result.issues.filter((i) => i.code === 'CR002');
      expect(cr002).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CR003: Norm references spatial zone missing on platforms
  // ---------------------------------------------------------------------------

  describe('CR003: Norm referencing missing spatial zone', () => {
    it('flags norm referencing a nonexistent zone', () => {
      const composition = makeComposition({
        norms: [
          {
            type: 'NormBlock',
            name: 'NoRunning',
            traits: [],
            properties: { scope: 'zone:lobby' },
          },
        ],
        zones: [], // No zones defined
      });

      const result = validator.validate(composition);

      const cr003 = result.issues.filter((i) => i.code === 'CR003');
      expect(cr003).toHaveLength(1);
      expect(cr003[0].severity).toBe('error');
      expect(cr003[0].message).toContain('lobby');
    });

    it('passes when norm references an existing zone', () => {
      const composition = makeComposition({
        norms: [
          {
            type: 'NormBlock',
            name: 'NoRunning',
            traits: [],
            properties: { scope: 'zone:lobby' },
          },
        ],
        zones: [
          {
            type: 'Zone',
            name: 'lobby',
            properties: [],
            handlers: [],
          },
        ],
      });

      const result = validator.validate(composition);

      const cr003 = result.issues.filter((i) => i.code === 'CR003');
      expect(cr003).toHaveLength(0);
    });

    it('flags norm representation referencing missing zone', () => {
      const composition = makeComposition({
        norms: [
          {
            type: 'NormBlock',
            name: 'QuietZone',
            traits: [],
            properties: {},
            representation: {
              type: 'NormRepresentation',
              properties: { scope: 'zone:library' },
            },
          },
        ],
        zones: [],
      });

      const result = validator.validate(composition);

      const cr003 = result.issues.filter((i) => i.code === 'CR003');
      expect(cr003).toHaveLength(1);
      expect(cr003[0].message).toContain('library');
    });
  });

  // ---------------------------------------------------------------------------
  // CR004: Platform with zero objects
  // ---------------------------------------------------------------------------

  describe('CR004: Platform with zero objects', () => {
    it('warns about platforms with no content when all objects are VR-constrained', () => {
      const composition = makeComposition({
        objects: [makeObject('vrOnlyObj', [makeTrait('platform', { include: ['vr'] })])],
      });

      const result = validator.validate(composition);

      const cr004 = result.issues.filter((i) => i.code === 'CR004');
      // Should warn about ar, mobile, desktop, automotive, wearable (5 categories with 0 objects)
      expect(cr004.length).toBeGreaterThanOrEqual(1);

      const warningCategories = cr004.map((i) => {
        const match = i.message.match(/category "(\w+)"/);
        return match ? match[1] : '';
      });
      expect(warningCategories).toContain('mobile');
      expect(warningCategories).toContain('desktop');
    });

    it('does not warn when universal objects exist', () => {
      const composition = makeComposition({
        objects: [
          // No platform constraint = available on all platforms
          makeObject('universalOrb'),
        ],
      });

      const result = validator.validate(composition);

      const cr004 = result.issues.filter((i) => i.code === 'CR004');
      expect(cr004).toHaveLength(0);
    });

    it('does not warn when each platform has at least one object', () => {
      const composition = makeComposition({
        objects: [
          makeObject('vrObj', [makeTrait('platform', { include: ['vr'] })]),
          makeObject('arObj', [makeTrait('platform', { include: ['ar'] })]),
          makeObject('mobileObj', [makeTrait('platform', { include: ['mobile'] })]),
          makeObject('desktopObj', [makeTrait('platform', { include: ['desktop'] })]),
          makeObject('carObj', [makeTrait('platform', { include: ['automotive'] })]),
          makeObject('watchObj', [makeTrait('platform', { include: ['wearable'] })]),
        ],
      });

      const result = validator.validate(composition);

      const cr004 = result.issues.filter((i) => i.code === 'CR004');
      expect(cr004).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CR005: Large embodiment change path
  // ---------------------------------------------------------------------------

  describe('CR005: Significant embodiment change', () => {
    it('reports info for handoff from vr-headset to wearable (Avatar3D -> UI2D)', () => {
      const composition = makeComposition();
      const result = validator.validate(composition);

      const cr005 = result.issues.filter(
        (i) => i.code === 'CR005' && i.blockName === 'vr-headset->wearable'
      );
      expect(cr005.length).toBeGreaterThanOrEqual(1);
      expect(cr005[0].severity).toBe('info');
      expect(cr005[0].message).toContain('embodiment');
    });

    it('reports safety concern for car -> vr-headset transition', () => {
      const composition = makeComposition();
      const result = validator.validate(composition);

      const carToVr = result.issues.filter(
        (i) => i.code === 'CR005' && i.blockName === 'car->vr-headset'
      );
      expect(carToVr.length).toBeGreaterThanOrEqual(1);
      expect(carToVr[0].message).toContain('Safety');
    });

    it('reports safety concern for vr-headset -> car transition', () => {
      const composition = makeComposition();
      const result = validator.validate(composition);

      const vrToCar = result.issues.filter(
        (i) => i.code === 'CR005' && i.blockName === 'vr-headset->car'
      );
      expect(vrToCar.length).toBeGreaterThanOrEqual(1);
      expect(vrToCar[0].message).toContain('Safety');
    });
  });

  // ---------------------------------------------------------------------------
  // CR006: MVC payload might exceed 10KB
  // ---------------------------------------------------------------------------

  describe('CR006: MVC payload size', () => {
    it('warns when state is excessively large', () => {
      const largeString = 'x'.repeat(12000); // 12KB string
      const composition = makeComposition({
        state: {
          type: 'State',
          properties: [{ type: 'StateProperty', key: 'bigData', value: largeString }],
        },
      });

      const result = validator.validate(composition);

      const cr006 = result.issues.filter((i) => i.code === 'CR006');
      expect(cr006).toHaveLength(1);
      expect(cr006[0].severity).toBe('warning');
      expect(cr006[0].message).toContain('10KB');
    });

    it('does not warn for small state', () => {
      const composition = makeComposition({
        state: {
          type: 'State',
          properties: [
            { type: 'StateProperty', key: 'score', value: 100 },
            { type: 'StateProperty', key: 'name', value: 'player1' },
          ],
        },
      });

      const result = validator.validate(composition);

      const cr006 = result.issues.filter((i) => i.code === 'CR006');
      expect(cr006).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CR007: Circular handoff dependency
  // ---------------------------------------------------------------------------

  describe('CR007: Circular handoff dependency', () => {
    it('detects circular handoff between two objects', () => {
      const composition = makeComposition({
        objects: [
          makeObject('deviceA', [makeTrait('handoff', { target: 'deviceB' })]),
          makeObject('deviceB', [makeTrait('handoff', { target: 'deviceA' })]),
        ],
      });

      const result = validator.validate(composition);

      const cr007 = result.issues.filter((i) => i.code === 'CR007');
      expect(cr007).toHaveLength(1);
      expect(cr007[0].severity).toBe('error');
      expect(cr007[0].message).toContain('Circular');
    });

    it('detects circular handoff in a chain of three', () => {
      const composition = makeComposition({
        objects: [
          makeObject('A', [makeTrait('handoff', { target: 'B' })]),
          makeObject('B', [makeTrait('handoff', { target: 'C' })]),
          makeObject('C', [makeTrait('handoff', { target: 'A' })]),
        ],
      });

      const result = validator.validate(composition);

      const cr007 = result.issues.filter((i) => i.code === 'CR007');
      expect(cr007).toHaveLength(1);
      expect(cr007[0].message).toContain('Circular');
    });

    it('does not flag linear handoff chain', () => {
      const composition = makeComposition({
        objects: [
          makeObject('A', [makeTrait('handoff', { target: 'B' })]),
          makeObject('B', [makeTrait('handoff', { target: 'C' })]),
          makeObject('C', []),
        ],
      });

      const result = validator.validate(composition);

      const cr007 = result.issues.filter((i) => i.code === 'CR007');
      expect(cr007).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Handoff path analysis: all 30 form factor pairs (6 x 5)
  // ---------------------------------------------------------------------------

  describe('handoff path analysis', () => {
    const FORM_FACTORS = ['vr-headset', 'ar-glasses', 'phone', 'desktop', 'car', 'wearable'];

    it('generates exactly 30 handoff paths (6 x 5)', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      expect(paths).toHaveLength(30);
    });

    it('each path has from, to, feasible, and adaptations', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      for (const path of paths) {
        expect(path.from).toBeDefined();
        expect(path.to).toBeDefined();
        expect(typeof path.feasible).toBe('boolean');
        expect(Array.isArray(path.adaptations)).toBe(true);
      }
    });

    it('covers all unique form factor pairs', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const pairSet = new Set(paths.map((p) => `${p.from}->${p.to}`));
      for (const from of FORM_FACTORS) {
        for (const to of FORM_FACTORS) {
          if (from === to) continue;
          expect(pairSet.has(`${from}->${to}`)).toBe(true);
        }
      }
    });

    it('marks car <-> vr-headset as not feasible', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const carToVr = paths.find((p) => p.from === 'car' && p.to === 'vr-headset');
      const vrToCar = paths.find((p) => p.from === 'vr-headset' && p.to === 'car');

      expect(carToVr?.feasible).toBe(false);
      expect(vrToCar?.feasible).toBe(false);
      expect(carToVr?.reason).toContain('Safety');
      expect(vrToCar?.reason).toContain('Safety');
    });

    it('marks phone -> vr-headset as feasible', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const phoneToVr = paths.find((p) => p.from === 'phone' && p.to === 'vr-headset');
      expect(phoneToVr?.feasible).toBe(true);
    });

    it('marks wearable -> vr-headset as feasible', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const wearableToVr = paths.find((p) => p.from === 'wearable' && p.to === 'vr-headset');
      expect(wearableToVr?.feasible).toBe(true);
    });

    it('reports embodiment adaptation for vr-headset -> phone', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const vrToPhone = paths.find((p) => p.from === 'vr-headset' && p.to === 'phone');
      expect(vrToPhone?.adaptations).toContain('embodiment: Avatar3D -> UI2D');
    });

    it('reports spatial context adaptation for vr-headset -> desktop', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const vrToDesktop = paths.find((p) => p.from === 'vr-headset' && p.to === 'desktop');
      expect(vrToDesktop?.adaptations).toContain('spatial_context: 3D -> 2D projection');
    });

    it('reports input modality adaptation', () => {
      const composition = makeComposition();
      const paths = validator.analyzeHandoffPaths(composition);

      const vrToDesktop = paths.find((p) => p.from === 'vr-headset' && p.to === 'desktop');
      const inputAdaptation = vrToDesktop?.adaptations.find((a) => a.startsWith('input:'));
      expect(inputAdaptation).toBeDefined();
      expect(inputAdaptation).toContain('hand/controller');
      expect(inputAdaptation).toContain('mouse/keyboard');
    });
  });

  // ---------------------------------------------------------------------------
  // Platform coverage analysis
  // ---------------------------------------------------------------------------

  describe('platform coverage analysis', () => {
    it('returns coverage for all 6 platform categories', () => {
      const composition = makeComposition();
      const coverage = validator.analyzePlatformCoverage(composition);

      expect(Object.keys(coverage)).toHaveLength(6);
      expect(coverage).toHaveProperty('vr');
      expect(coverage).toHaveProperty('ar');
      expect(coverage).toHaveProperty('mobile');
      expect(coverage).toHaveProperty('desktop');
      expect(coverage).toHaveProperty('automotive');
      expect(coverage).toHaveProperty('wearable');
    });

    it('counts unconstrained objects for all platforms', () => {
      const composition = makeComposition({
        objects: [makeObject('universal1'), makeObject('universal2')],
      });

      const coverage = validator.analyzePlatformCoverage(composition);

      expect(coverage['vr']).toBe(2);
      expect(coverage['mobile']).toBe(2);
      expect(coverage['desktop']).toBe(2);
    });

    it('counts constrained objects only for their platforms', () => {
      const composition = makeComposition({
        objects: [
          makeObject('vrObj', [makeTrait('platform', { include: ['vr'] })]),
          makeObject('mobileObj', [makeTrait('platform', { include: ['mobile'] })]),
        ],
      });

      const coverage = validator.analyzePlatformCoverage(composition);

      expect(coverage['vr']).toBe(1);
      expect(coverage['mobile']).toBe(1);
      expect(coverage['desktop']).toBe(0);
      expect(coverage['ar']).toBe(0);
    });

    it('handles mixed constrained and unconstrained objects', () => {
      const composition = makeComposition({
        objects: [
          makeObject('universal'),
          makeObject('vrOnly', [makeTrait('platform', { include: ['vr'] })]),
        ],
      });

      const coverage = validator.analyzePlatformCoverage(composition);

      expect(coverage['vr']).toBe(2); // universal + vrOnly
      expect(coverage['mobile']).toBe(1); // universal only
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple issues in one composition
  // ---------------------------------------------------------------------------

  describe('multiple issues in one composition', () => {
    it('detects multiple different issue types in a single composition', () => {
      const composition = makeComposition({
        objects: [
          // CR001: VR-only trait without platform constraint
          makeObject('unguardedVR', [makeTrait('hand_tracking')]),
          // CR004 + CR002: Only VR-constrained, no fallback
          makeObject('vrWidget', [makeTrait('platform', { include: ['vr'] })]),
          // CR007: Circular handoff
          makeObject('hubA', [makeTrait('handoff', { target: 'hubB' })]),
          makeObject('hubB', [makeTrait('handoff', { target: 'hubA' })]),
        ],
        // CR003: Norm referencing missing zone
        norms: [
          {
            type: 'NormBlock' as const,
            name: 'QuietNorm',
            traits: [],
            properties: { scope: 'zone:library' },
          },
        ],
        zones: [],
        // CR006: Oversized state
        state: {
          type: 'State' as const,
          properties: [
            { type: 'StateProperty' as const, key: 'bigData', value: 'x'.repeat(12000) },
          ],
        },
      });

      const result = validator.validate(composition);

      expect(result.valid).toBe(false); // Has errors (CR001, CR003, CR007)

      const codes = new Set(result.issues.map((i) => i.code));
      expect(codes.has('CR001')).toBe(true);
      expect(codes.has('CR003')).toBe(true);
      expect(codes.has('CR006')).toBe(true);
      expect(codes.has('CR007')).toBe(true);
    });

    it('valid is true when only warnings and info exist', () => {
      const composition = makeComposition({
        objects: [
          // Only creates CR004 warnings (some platforms empty) and CR005 info
          makeObject('vrOnly', [
            makeTrait('platform', { include: ['vr'] }),
            makeTrait('grabbable'),
          ]),
        ],
      });

      const result = validator.validate(composition);

      // CR001 should not fire (no VR-only traits)
      // CR004 will fire (some platforms empty)
      // CR002 will fire (no fallback)
      // These are all warnings, not errors
      const errors = result.issues.filter((i) => i.severity === 'error');
      expect(errors).toHaveLength(0);
      expect(result.valid).toBe(true);

      const warnings = result.issues.filter((i) => i.severity === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Objects inside spatial groups, conditionals, iterators
  // ---------------------------------------------------------------------------

  describe('objects in nested structures', () => {
    it('validates objects inside spatial groups', () => {
      const composition = makeComposition({
        spatialGroups: [
          {
            type: 'SpatialGroup',
            name: 'mainGroup',
            properties: [],
            objects: [makeObject('nestedVR', [makeTrait('hand_tracking')])],
          },
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(1);
      expect(cr001[0].blockName).toBe('nestedVR');
    });

    it('validates objects inside conditionals', () => {
      const composition = makeComposition({
        conditionals: [
          {
            type: 'ConditionalBlock',
            condition: 'state.isVR',
            objects: [makeObject('conditionalVR', [makeTrait('eye_tracking')])],
          },
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(1);
      expect(cr001[0].blockName).toBe('conditionalVR');
    });

    it('validates objects inside iterators', () => {
      const composition = makeComposition({
        iterators: [
          {
            type: 'ForEachBlock',
            variable: 'item',
            iterable: 'items',
            objects: [makeObject('iteratedVR', [makeTrait('spatial_audio_3d')])],
          },
        ],
      });

      const result = validator.validate(composition);

      const cr001 = result.issues.filter((i) => i.code === 'CR001');
      expect(cr001).toHaveLength(1);
      expect(cr001[0].blockName).toBe('iteratedVR');
    });
  });
});
