/**
 * @fileoverview Tests for @platform() conditional compilation
 *
 * Covers:
 * - Parsing @platform(quest3) on objects
 * - Parsing @platform(phone, desktop) multi-platform
 * - Parsing @platform(not: car) exclusion
 * - Filtering composition for quest3 target (removes non-quest3 blocks)
 * - Filtering composition for phone target
 * - Blocks without @platform() pass all filters
 * - Filtering norms with @platform() constraints
 * - Round-trip: parse -> filter -> verify for a multi-platform composition
 */

import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition, PlatformConstraint } from '../../parser/HoloCompositionTypes';
import {
  PlatformConditionalCompilerMixin,
  matchesPlatformConstraint,
  createPlatformTarget,
} from '../PlatformConditionalCompilerMixin';

// =============================================================================
// HELPERS
// =============================================================================

function parse(source: string): HoloComposition {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  if (!result.success || !result.ast) {
    throw new Error(`Parse failed: ${result.errors.map((e) => e.message).join('; ')}`);
  }
  return result.ast;
}

function parseTolerant(source: string): HoloComposition {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source, { tolerant: true });
  return result.ast!;
}

const mixin = new PlatformConditionalCompilerMixin();

// =============================================================================
// PARSER TESTS
// =============================================================================

describe('@platform() parser support', () => {
  it('parses @platform(quest3) on an object', () => {
    const ast = parse(`
      composition "TestScene" {
        @platform(quest3) object "VRPanel" {
          width: 100
        }
      }
    `);

    expect(ast.objects).toHaveLength(1);
    expect(ast.objects[0].name).toBe('VRPanel');
    expect(ast.objects[0].platformConstraint).toBeDefined();
    expect(ast.objects[0].platformConstraint!.include).toEqual(['quest3']);
    expect(ast.objects[0].platformConstraint!.exclude).toEqual([]);
  });

  it('parses @platform(phone, desktop) multi-platform on an object', () => {
    const ast = parse(`
      composition "TestScene" {
        @platform(phone, desktop) object "FlatUI" {
          mode: "2d"
        }
      }
    `);

    expect(ast.objects).toHaveLength(1);
    expect(ast.objects[0].name).toBe('FlatUI');
    expect(ast.objects[0].platformConstraint).toBeDefined();
    expect(ast.objects[0].platformConstraint!.include).toEqual(['phone', 'desktop']);
    expect(ast.objects[0].platformConstraint!.exclude).toEqual([]);
  });

  it('parses @platform(not: car, wearable) exclusion on an object', () => {
    const ast = parse(`
      composition "TestScene" {
        @platform(not: car, wearable) object "FullMap" {
          detail: "high"
        }
      }
    `);

    expect(ast.objects).toHaveLength(1);
    expect(ast.objects[0].name).toBe('FullMap');
    expect(ast.objects[0].platformConstraint).toBeDefined();
    expect(ast.objects[0].platformConstraint!.include).toEqual([]);
    expect(ast.objects[0].platformConstraint!.exclude).toEqual(['car', 'wearable']);
  });

  it('parses @platform() on a template', () => {
    const ast = parse(`
      composition "TestScene" {
        @platform(vr) template "ImmersiveWidget" {
          depth: 10
        }
      }
    `);

    expect(ast.templates).toHaveLength(1);
    expect(ast.templates[0].name).toBe('ImmersiveWidget');
    expect(ast.templates[0].platformConstraint).toBeDefined();
    expect(ast.templates[0].platformConstraint!.include).toEqual(['vr']);
  });

  it('parses objects without @platform() (no constraint)', () => {
    const ast = parse(`
      composition "TestScene" {
        object "Universal" {
          visible: true
        }
      }
    `);

    expect(ast.objects).toHaveLength(1);
    expect(ast.objects[0].name).toBe('Universal');
    expect(ast.objects[0].platformConstraint).toBeUndefined();
  });

  it('parses multiple objects with different platform constraints', () => {
    const ast = parse(`
      composition "MultiPlatform" {
        @platform(quest3) object "VROnly" {
          mode: "vr"
        }
        object "Universal" {
          mode: "any"
        }
        @platform(phone, desktop) object "FlatOnly" {
          mode: "flat"
        }
      }
    `);

    expect(ast.objects).toHaveLength(3);

    expect(ast.objects[0].name).toBe('VROnly');
    expect(ast.objects[0].platformConstraint!.include).toEqual(['quest3']);

    expect(ast.objects[1].name).toBe('Universal');
    expect(ast.objects[1].platformConstraint).toBeUndefined();

    expect(ast.objects[2].name).toBe('FlatOnly');
    expect(ast.objects[2].platformConstraint!.include).toEqual(['phone', 'desktop']);
  });

  it('parses @platform() at root level (outside composition block)', () => {
    const ast = parseTolerant(`
      @platform(quest3) object "RootVR" {
        immersive: true
      }
    `);

    expect(ast.objects).toHaveLength(1);
    expect(ast.objects[0].name).toBe('RootVR');
    expect(ast.objects[0].platformConstraint).toBeDefined();
    expect(ast.objects[0].platformConstraint!.include).toEqual(['quest3']);
  });

  it('parses hyphenated platform names like android-xr', () => {
    const ast = parse(`
      composition "TestScene" {
        @platform(android-xr) object "AndroidXR" {
          tracking: true
        }
      }
    `);

    expect(ast.objects).toHaveLength(1);
    expect(ast.objects[0].platformConstraint!.include).toEqual(['android-xr']);
  });
});

// =============================================================================
// CONSTRAINT MATCHING TESTS
// =============================================================================

describe('matchesPlatformConstraint', () => {
  it('undefined constraint matches all platforms', () => {
    expect(matchesPlatformConstraint(undefined, createPlatformTarget('quest3'))).toBe(true);
    expect(matchesPlatformConstraint(undefined, createPlatformTarget('ios'))).toBe(true);
    expect(matchesPlatformConstraint(undefined, createPlatformTarget('android-auto'))).toBe(true);
  });

  it('include constraint matches listed platforms', () => {
    const constraint: PlatformConstraint = { include: ['quest3'], exclude: [] };
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('quest3'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('ios'))).toBe(false);
  });

  it('include with category expands to member platforms', () => {
    const constraint: PlatformConstraint = { include: ['vr'], exclude: [] };
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('quest3'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('pcvr'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('visionos'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('ios'))).toBe(false);
  });

  it('multi-platform include matches any listed platform', () => {
    const constraint: PlatformConstraint = { include: ['phone', 'desktop'], exclude: [] };
    // 'phone' is not a PlatformTarget but a plain string - test category matching
    // The mixin checks against both platform and category
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('ios'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('windows'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('quest3'))).toBe(false);
  });

  it('exclude constraint rejects listed platforms', () => {
    const constraint: PlatformConstraint = { include: [], exclude: ['automotive'] };
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('quest3'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('ios'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('android-auto'))).toBe(false);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('carplay'))).toBe(false);
  });

  it('exclude with specific platform name', () => {
    const constraint: PlatformConstraint = { include: [], exclude: ['quest3'] };
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('quest3'))).toBe(false);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('pcvr'))).toBe(true);
  });

  it('combined include + exclude', () => {
    const constraint: PlatformConstraint = { include: ['vr'], exclude: ['visionos'] };
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('quest3'))).toBe(true);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('visionos'))).toBe(false);
    expect(matchesPlatformConstraint(constraint, createPlatformTarget('ios'))).toBe(false);
  });
});

// =============================================================================
// COMPILER MIXIN TESTS
// =============================================================================

describe('PlatformConditionalCompilerMixin', () => {
  describe('filterForPlatform', () => {
    it('filters composition for quest3 target, removes non-quest3 blocks', () => {
      const ast = parse(`
        composition "MultiPlatform" {
          @platform(quest3) object "VRPanel" {
            mode: "vr"
          }
          @platform(ios) object "PhoneUI" {
            mode: "phone"
          }
          object "SharedWidget" {
            universal: true
          }
        }
      `);

      const filtered = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

      expect(filtered.objects).toHaveLength(2);
      expect(filtered.objects.map((o) => o.name)).toContain('VRPanel');
      expect(filtered.objects.map((o) => o.name)).toContain('SharedWidget');
      expect(filtered.objects.map((o) => o.name)).not.toContain('PhoneUI');
    });

    it('filters composition for ios target', () => {
      const ast = parse(`
        composition "MultiPlatform" {
          @platform(quest3) object "VRPanel" {
            mode: "vr"
          }
          @platform(mobile) object "MobileUI" {
            mode: "phone"
          }
          object "SharedWidget" {
            universal: true
          }
        }
      `);

      const filtered = mixin.filterForPlatform(ast, createPlatformTarget('ios'));

      expect(filtered.objects).toHaveLength(2);
      expect(filtered.objects.map((o) => o.name)).toContain('MobileUI');
      expect(filtered.objects.map((o) => o.name)).toContain('SharedWidget');
      expect(filtered.objects.map((o) => o.name)).not.toContain('VRPanel');
    });

    it('blocks without @platform() pass all filters', () => {
      const ast = parse(`
        composition "Universal" {
          object "AlwaysIncluded" {
            visible: true
          }
        }
      `);

      const forQuest = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));
      const forIos = mixin.filterForPlatform(ast, createPlatformTarget('ios'));
      const forCar = mixin.filterForPlatform(ast, createPlatformTarget('android-auto'));

      expect(forQuest.objects).toHaveLength(1);
      expect(forIos.objects).toHaveLength(1);
      expect(forCar.objects).toHaveLength(1);
    });

    it('filters templates with @platform() constraints', () => {
      const ast = parse(`
        composition "TestScene" {
          @platform(vr) template "ImmersiveTemplate" {
            depth: 10
          }
          @platform(mobile) template "FlatTemplate" {
            flat: true
          }
          template "CommonTemplate" {
            shared: true
          }
        }
      `);

      const forQuest = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

      expect(forQuest.templates).toHaveLength(2);
      expect(forQuest.templates.map((t) => t.name)).toContain('ImmersiveTemplate');
      expect(forQuest.templates.map((t) => t.name)).toContain('CommonTemplate');
      expect(forQuest.templates.map((t) => t.name)).not.toContain('FlatTemplate');
    });

    it('filters with exclusion constraints', () => {
      const ast = parse(`
        composition "TestScene" {
          @platform(not: automotive) object "RichMap" {
            detail: "high"
          }
          object "Basic" {
            detail: "low"
          }
        }
      `);

      const forCar = mixin.filterForPlatform(ast, createPlatformTarget('android-auto'));
      expect(forCar.objects).toHaveLength(1);
      expect(forCar.objects[0].name).toBe('Basic');

      const forDesktop = mixin.filterForPlatform(ast, createPlatformTarget('windows'));
      expect(forDesktop.objects).toHaveLength(2);
    });

    it('preserves composition metadata during filtering', () => {
      const ast = parse(`
        composition "MyScene" {
          @platform(quest3) object "VROnly" {
            mode: "vr"
          }
        }
      `);

      const filtered = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

      expect(filtered.name).toBe('MyScene');
      expect(filtered.type).toBe('Composition');
    });
  });

  describe('matchesPlatform (mixin method)', () => {
    it('returns true for undefined constraint', () => {
      expect(mixin.matchesPlatform(undefined, createPlatformTarget('quest3'))).toBe(true);
    });

    it('returns true for matching constraint', () => {
      const constraint: PlatformConstraint = { include: ['quest3'], exclude: [] };
      expect(mixin.matchesPlatform(constraint, createPlatformTarget('quest3'))).toBe(true);
    });

    it('returns false for non-matching constraint', () => {
      const constraint: PlatformConstraint = { include: ['ios'], exclude: [] };
      expect(mixin.matchesPlatform(constraint, createPlatformTarget('quest3'))).toBe(false);
    });
  });
});

// =============================================================================
// ROUND-TRIP TEST: parse -> filter -> verify
// =============================================================================

describe('Round-trip: parse -> filter -> verify', () => {
  it('full multi-platform composition filtered for quest3', () => {
    const source = `
      composition "CrossPlatformApp" {
        @platform(quest3) object "VRControlPanel" {
          position: [0, 1.5, -2]
          width: 200
        }

        @platform(ios, android) object "MobileMenu" {
          layout: "vertical"
        }

        @platform(not: automotive, wearable) object "DetailedMap" {
          resolution: "4k"
        }

        object "StatusBar" {
          always_visible: true
        }

        @platform(vr) template "HandGrabTemplate" {
          snap: true
        }

        @platform(desktop) template "MouseTemplate" {
          cursor: "pointer"
        }

        template "BaseTemplate" {
          version: 1
        }
      }
    `;

    const ast = parse(source);

    // Verify parsing captured all blocks
    expect(ast.objects).toHaveLength(4);
    expect(ast.templates).toHaveLength(3);

    // Filter for quest3
    const quest3 = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

    // quest3 should see: VRControlPanel, DetailedMap, StatusBar
    expect(quest3.objects).toHaveLength(3);
    expect(quest3.objects.map((o) => o.name)).toContain('VRControlPanel');
    expect(quest3.objects.map((o) => o.name)).toContain('DetailedMap');
    expect(quest3.objects.map((o) => o.name)).toContain('StatusBar');
    expect(quest3.objects.map((o) => o.name)).not.toContain('MobileMenu');

    // quest3 should see: HandGrabTemplate, BaseTemplate
    expect(quest3.templates).toHaveLength(2);
    expect(quest3.templates.map((t) => t.name)).toContain('HandGrabTemplate');
    expect(quest3.templates.map((t) => t.name)).toContain('BaseTemplate');
    expect(quest3.templates.map((t) => t.name)).not.toContain('MouseTemplate');

    // Filter for ios
    const ios = mixin.filterForPlatform(ast, createPlatformTarget('ios'));

    // ios should see: MobileMenu, DetailedMap, StatusBar
    expect(ios.objects).toHaveLength(3);
    expect(ios.objects.map((o) => o.name)).toContain('MobileMenu');
    expect(ios.objects.map((o) => o.name)).toContain('DetailedMap');
    expect(ios.objects.map((o) => o.name)).toContain('StatusBar');

    // ios should see: BaseTemplate only
    expect(ios.templates).toHaveLength(1);
    expect(ios.templates[0].name).toBe('BaseTemplate');

    // Filter for android-auto (automotive)
    const car = mixin.filterForPlatform(ast, createPlatformTarget('android-auto'));

    // android-auto should see: StatusBar only (DetailedMap excluded by not: automotive)
    expect(car.objects).toHaveLength(1);
    expect(car.objects[0].name).toBe('StatusBar');

    // android-auto should see: BaseTemplate only
    expect(car.templates).toHaveLength(1);
    expect(car.templates[0].name).toBe('BaseTemplate');
  });

  it('filtered composition properties are preserved', () => {
    const source = `
      composition "PropTest" {
        @platform(quest3) object "VRObj" {
          width: 100
          height: 200
          color: "blue"
        }
      }
    `;

    const ast = parse(source);
    const filtered = mixin.filterForPlatform(ast, createPlatformTarget('quest3'));

    expect(filtered.objects).toHaveLength(1);
    const obj = filtered.objects[0];
    expect(obj.name).toBe('VRObj');
    expect(obj.properties).toHaveLength(3);

    const propMap = Object.fromEntries(obj.properties.map((p) => [p.key, p.value]));
    expect(propMap.width).toBe(100);
    expect(propMap.height).toBe(200);
    expect(propMap.color).toBe('blue');
  });
});

// =============================================================================
// createPlatformTarget TESTS
// =============================================================================

describe('createPlatformTarget', () => {
  it('derives VR form factor for quest3', () => {
    const target = createPlatformTarget('quest3');
    expect(target.platform).toBe('quest3');
    expect(target.formFactor).toBe('vr');
  });

  it('derives mobile form factor for ios', () => {
    const target = createPlatformTarget('ios');
    expect(target.platform).toBe('ios');
    expect(target.formFactor).toBe('mobile');
  });

  it('derives automotive form factor for android-auto', () => {
    const target = createPlatformTarget('android-auto');
    expect(target.platform).toBe('android-auto');
    expect(target.formFactor).toBe('automotive');
  });

  it('derives desktop form factor for windows', () => {
    const target = createPlatformTarget('windows');
    expect(target.platform).toBe('windows');
    expect(target.formFactor).toBe('desktop');
  });

  it('derives wearable form factor for watchos', () => {
    const target = createPlatformTarget('watchos');
    expect(target.platform).toBe('watchos');
    expect(target.formFactor).toBe('wearable');
  });
});
