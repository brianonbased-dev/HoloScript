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
    console.log('VITEST GOT:', result.code);
    expect(result.success).toBe(true);
    expect(result.code).toContain("arRuntime.onBeaconDetected('global', (pose) => {");
  });
});
