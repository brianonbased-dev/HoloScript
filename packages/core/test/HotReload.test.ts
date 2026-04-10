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

  it('should detect template version increase and run migration blocks', async () => {
    // V1: template with version 1
    const codeV1 = `
      template BaseOrb {
        @version(1)
        size: 0.5
      }
      orb TestOrb using BaseOrb {
        @state { legacyScale: 2 }
      }
    `;

    const resultV1 = parser.parse(codeV1);
    await runtime.execute(resultV1.ast);

    const orbV1 = runtime.getVariable('TestOrb') as any;
    expect(orbV1).toBeDefined();
    expect(orbV1.properties.size).toBe(0.5);
    expect(orbV1.properties.legacyScale).toBe(2);

    // V2: template with version 2 and migration block
    const codeV2 = `
      template BaseOrb {
        @version(2)
        size: 1.0
        migrate from(1) {
          let migrated = true
        }
      }
      orb TestOrb using BaseOrb {
        @state { legacyScale: 2 }
      }
    `;

    const resultV2 = parser.parse(codeV2);
    // Verify the parser captured the migration block
    const templateNode = resultV2.ast.find(
      (n: any) => n.type === 'template' && n.name === 'BaseOrb'
    ) as any;
    expect(templateNode).toBeDefined();
    expect(templateNode.version).toBe(2);
    expect(templateNode.migrations).toBeDefined();
    expect(templateNode.migrations.length).toBe(1);
    expect(templateNode.migrations[0].fromVersion).toBe(1);

    // Re-evaluate: version increase should be detected and migration should run without error
    await runtime.execute(resultV2.ast);

    const orbV2 = runtime.getVariable('TestOrb') as any;
    expect(orbV2).toBeDefined();
    // Template properties are updated to v2 values
    expect(orbV2.properties.size).toBe(1.0);
    // @state properties are preserved across hot-reload
    expect(orbV2.properties.legacyScale).toBe(2);
  });

  it.todo(
    // The migration body is parsed as HoloScript, not JS. The HoloScript evaluator
    // can execute `let x = value` but cannot do dotted property assignment like
    // `this.properties.size = this.properties.size * 2`. Until the runtime supports
    // property mutation expressions in migration bodies (e.g. via a JS sandbox or
    // extended HoloScript assignment syntax), this test cannot be implemented.
    'should execute migration body expressions when template version increases (requires JS evaluator)'
  );
});
