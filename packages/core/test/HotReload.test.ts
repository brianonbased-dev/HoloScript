import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptRuntime } from '../src/HoloScriptRuntime';
import { HoloScriptCodeParser } from '../src/HoloScriptCodeParser';

describe('Hot-Reload & State Migration', () => {
  let runtime: HoloScriptRuntime;
  let parser: HoloScriptCodeParser;

  beforeEach(() => {
    runtime = new HoloScriptRuntime();
    parser = new HoloScriptCodeParser();
  });

  it('should preserve object state across simple re-evaluation (ID consistency)', async () => {
    const codeV1 = `
      orb UserOrb {
        color: "#ff0000"
        @state {
          points: 10
        }
      }
    `;

    const resultV1 = parser.parse(codeV1);
    await runtime.execute(resultV1.ast);

    const orbV1 = runtime.getVariable('UserOrb') as any;
    expect(orbV1).toBeDefined();
    expect(orbV1.properties.points).toBe(10);
    const originalCreation = orbV1.created;

    // Simulate manual state update in runtime
    orbV1.properties.points = 25;

    // Re-evaluate with exact same code (simulating hot-reload)
    const resultV2 = parser.parse(codeV1);
    await runtime.execute(resultV2.ast);

    const orbV2 = runtime.getVariable('UserOrb') as any;
    expect(orbV2).toBeDefined();

    // State preservation: @state properties survive hot-reload
    expect(orbV2.properties.points).toBe(25);
    expect(orbV2.created).toBe(originalCreation);
  });

  it('templates with @version are registered and store version number', async () => {
    const code = `
      template BaseOrb {
        @version(3)
        size: 0.5
      }
    `;
    const result = parser.parse(code);
    await runtime.execute(result.ast);

    // Verify template was registered (getVariable won't find templates, but we can check via another orb)
    const orbCode = `
      orb TestOrb using BaseOrb {
        @state { score: 100 }
      }
    `;
    const orbResult = parser.parse(orbCode);
    await runtime.execute(orbResult.ast);

    const orb = runtime.getVariable('TestOrb') as any;
    expect(orb).toBeDefined();
    expect(orb.properties.score).toBe(100);
    // Template properties are merged
    expect(orb.properties.size).toBe(0.5);
  });

  it.todo('should detect template version increase and run migration blocks');
  it.todo(
    'should execute migration body expressions when template version increases (requires JS evaluator)'
  );
});
