import { describe, expect, test, vi } from 'vitest';
import { ARCompiler } from '../ARCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('ARCompiler', () => {
  const parser = new HoloCompositionParser();

  test('should generate WebXR AR setup for a basic AR composition', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: {
        hit_test: true,
        image_tracking: false,
      },
    });

    const input = `
      composition "ARMenu" {
        spatial_group "cafe_table" {
          object "menu_panel" @overlay {
            layout: "vertical"
            text: "Today's Specials"
          }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.success).toBe(true);
    expect(result.target).toBe('webxr');
    expect(result.code).toContain('const arRuntime = new ARRuntime({');
    expect(result.code).toContain('hit_test: true');
    // @overlay content flows into the emitted registry (was extracted-then-dropped).
    expect(result.code).toContain('const arOverlays = [');
    expect(result.code).toContain("Today's Specials");
    expect(result.code).toContain('vertical');
  });

  test('should include beacon tracking for @ar_beacon traits', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: {
        hit_test: false,
        image_tracking: true,
      },
    });

    const input = `
      composition "QuestHub" {
        spatial_group "store_front" {
          object "scan_target" @ar_beacon(type: "qr", id: "quest_123") {
            mesh: "cube"
          }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');
    expect(result.success).toBe(true);
    // The beacon's REAL id/type flow into an input-driven registry — not a
    // fixed 'global' toggle (deep-ratchet C-AR: was OVERCLAIMED).
    expect(result.code).toContain('const arBeacons = [');
    expect(result.code).toContain('"id":"quest_123"');
    expect(result.code).toContain('"type":"qr"');
    // Binding is per-beacon keyed on the real id, never the old hardcoded 'global'.
    expect(result.code).toContain('arRuntime.onBeaconDetected(beacon.id');
    expect(result.code).not.toContain("onBeaconDetected('global'");
  });

  test('beacon registry scales with input (distinct beacons both emitted)', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: true, image_tracking: true },
    });

    const input = `
      composition "MultiBeacon" {
        spatial_group "yard" {
          object "north_post" @ar_beacon(type: "qr", id: "quest_a") { mesh: "cube" }
          object "south_post" @ar_beacon(type: "image", id: "quest_b") { mesh: "cube" }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');
    expect(result.success).toBe(true);
    // Two distinct source beacons → two distinct registry entries. A fixed
    // template could not produce both ids.
    expect(result.code).toContain('"id":"quest_a"');
    expect(result.code).toContain('"id":"quest_b"');
    const entries = (result.code.match(/"id":"quest_/g) ?? []).length;
    expect(entries).toBe(2);
  });
});
