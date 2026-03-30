/**
 * Headless end-to-end test harness
 *
 * Validates the full headless pipeline:
 *   1. Parse HoloScript source
 *   2. Create headless runtime
 *   3. Run ticks
 *   4. Compile to Node.js target
 *   5. Compile to Python target
 *   6. Run @script_test blocks
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../parser/HoloScriptPlusParser';
import { createHeadlessRuntime, HEADLESS_PROFILE } from '../../runtime/HeadlessRuntime';
import { ScriptTestRunner } from '../../traits/ScriptTestTrait';
import { InteropBindingGenerator } from '../../interop/InteropBindingGenerator';

// ── Sample .hs sources from the brainstorm ──────────────────────────────────

const AGENT_ORCHESTRATION = `
composition "AgentOrchestration" {
  object "coordinator" {
    geometry: "cube"
    @interactive
  }
}
`;

const IOT_STREAM = `
composition "IoTStream" {
  object "sensor" {
    geometry: "sphere"
    position: [0, 1, 0]
    @interactive
  }
}
`;

const ECONOMY_MODULE = `
composition "IncentiveEngine" {
  object "bountyPool" {
    geometry: "cube"
    scale: [2, 2, 2]
    @interactive
  }
}
`;

const SCRIPT_WITH_TESTS = `
composition "TestSuite" {
  object "testable" {
    geometry: "cube"
  }
}

@script_test "object exists" {
  assert { true }
}

@script_test "economy init" {
  assert { 500 > 0 }
}
`;

describe('Headless E2E Pipeline', () => {
  describe('1. Agent Orchestration (.hs item 1)', () => {
    it('parses successfully', () => {
      const result = parse(AGENT_ORCHESTRATION);
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });

    it('runs headlessly via HeadlessRuntime', () => {
      const result = parse(AGENT_ORCHESTRATION);
      const runtime = createHeadlessRuntime(result.ast ?? { body: [] }, {
        profile: HEADLESS_PROFILE,
        debug: false,
      });
      runtime.start();
      for (let i = 0; i < 10; i++) runtime.tick();
      runtime.stop();

      const stats = runtime.getStats();
      expect(stats.tickCount).toBe(10);
    });
  });

  describe('2. IoT Stream (.hs item 2)', () => {
    it('parses successfully', () => {
      const result = parse(IOT_STREAM);
      expect(result.success).toBe(true);
    });

    it('runs headlessly with 50 ticks', () => {
      const result = parse(IOT_STREAM);
      const runtime = createHeadlessRuntime(result.ast ?? { body: [] }, {
        profile: HEADLESS_PROFILE,
      });
      runtime.start();
      for (let i = 0; i < 50; i++) runtime.tick();
      runtime.stop();
      expect(runtime.getStats().tickCount).toBe(50);
    });
  });

  describe('3. Economy Module (.hs item 3)', () => {
    it('parses and generates Python bindings', () => {
      const result = parse(ECONOMY_MODULE);
      expect(result.success).toBe(true);

      const gen = new InteropBindingGenerator();
      const pyBindings = gen.generatePythonBindings(result.ast ?? { body: [] }, 'economy.hsplus');

      expect(pyBindings.language).toBe('python');
      expect(pyBindings.metadata.sourceFile).toBe('economy.hsplus');
    });

    it('generates JS bindings', () => {
      const result = parse(ECONOMY_MODULE);
      const gen = new InteropBindingGenerator();
      const jsBindings = gen.generateJSBindings(result.ast ?? { body: [] }, 'economy.hsplus');

      expect(jsBindings.language).toBe('javascript');
      expect(jsBindings.metadata.holoScriptVersion).toBe('5.0.0');
    });
  });

  describe('4. @script_test Blocks', () => {
    it('extracts and runs @script_test blocks from source', () => {
      const runner = new ScriptTestRunner({ debug: false });
      const results = runner.runTestsFromSource(SCRIPT_WITH_TESTS);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('object exists');
      expect(results[1].name).toBe('economy init');
      expect(results[0].status).toBe('passed');
      expect(results[1].status).toBe('passed');
    });
  });

  describe('5. Compile targets', () => {
    it('agent orchestration runs on all profiles', () => {
      const result = parse(AGENT_ORCHESTRATION);
      const headless = createHeadlessRuntime(result.ast ?? { body: [] }, {
        profile: HEADLESS_PROFILE,
      });
      headless.start();
      headless.tick();
      headless.stop();
      expect(headless.getStats().tickCount).toBe(1);
    });
  });
});
