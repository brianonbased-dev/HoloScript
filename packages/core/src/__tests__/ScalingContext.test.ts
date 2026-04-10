import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptCodeParser } from '../HoloScriptCodeParser';
import { HoloScriptRuntime } from '../HoloScriptRuntime';

describe('HoloScript Scaling & Context', () => {
  let parser: HoloScriptCodeParser;
  let runtime: HoloScriptRuntime;

  beforeEach(() => {
    parser = new HoloScriptCodeParser();
    runtime = new HoloScriptRuntime();
  });

  it('should parse and execute galactic scale with multiplier', async () => {
    const script = `
      scale galactic {
        orb Star {
          color: "red"
          at: [1, 0, 0]
        }
      }
    `;
    const result = parser.parse(script);
    expect(result.success).toBe(true);
    await runtime.executeProgram(result.ast);

    const context = runtime.getContext();
    const star = context.variables.get('Star') as any;
    expect(star).toBeDefined();

    expect(star.position.x).toBe(1000000); // 1 * 1,000,000
    expect(star.hologram.size).toBe(0.5 * 1000000);
  });

  it('should restore scale after block', async () => {
    const script = `
      scale macro {
        orb Planet { at: [1, 1, 1] }
      }
      orb Moon { at: [1, 1, 1] }
    `;
    const result = parser.parse(script);
    expect(result.success).toBe(true);
    await runtime.executeProgram(result.ast);

    const context = runtime.getContext();
    const planet = context.variables.get('Planet');
    const moon = context.variables.get('Moon');

    expect(planet).toBeDefined();
    expect(moon).toBeDefined();

    expect((planet as any).position.x).toBe(1000);
    expect((moon as any).position.x).toBe(1); // Restored to 1.0 multiplier
  });

  it('should handle focus history', async () => {
    const script = `focus LocalSolarSystem { }`;
    const result = parser.parse(script);
    await runtime.executeProgram(result.ast);

    const context = runtime.getContext();
    expect(context.focusHistory).toContain('LocalSolarSystem');
  });

  it('should update environment settings', async () => {
    const script = `environment theme "forest_dense_fog" fog true`;
    const result = parser.parse(script);
    await runtime.executeProgram(result.ast);

    const context = runtime.getContext();
    expect(context.environment.theme).toBe('forest_dense_fog');
    expect(context.environment.fog).toBe(true);
  });
});
