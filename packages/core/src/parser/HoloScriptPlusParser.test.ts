import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

describe('HoloScriptPlusParser - Extended Features', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses @networked trait correctly', () => {
    const source = `cube#networked_box @networked(sync_mode: "reliable", authority: "owner") { position: [1, 2, 3] }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);

    const node = result.ast.root;
    expect(node.traits.has('networked')).toBe(true);
    const config = node.traits.get('networked');
    expect(config.sync_mode).toBe('reliable');
    expect(config.authority).toBe('owner');
  });

  it('Parses @external_api directive correctly', () => {
    const source = `object api_sensor @external_api(url: "https://api.iot.com/sensor", method: "GET", interval: "10s") {
      @on_data_update(data) => state.val = data.value
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    // Note: implementation might put body in directive logic
  });

  it('Handles multiple directives and traits', () => {
    const source = `light#living_room @networked(sync_mode: "state-only") @external_api(url: "https://api.home.com/light", interval: "5m") @grabbable { color: "#ffffff" }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const node = result.ast.root;
    expect(node.traits.has('networked')).toBe(true);
    expect(node.traits.has('grabbable')).toBe(true);
  });
});

describe('HoloScriptPlusParser - Control Flow', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses @while loop correctly', () => {
    const source = `scene#main {
      @while count < 10 {
        orb#item { size: 1 }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  it('Parses @forEach loop correctly', () => {
    const source = `scene#main {
      @forEach item in items {
        orb#item { size: 1 }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  it('Parses @for loop correctly', () => {
    const source = `scene#main {
      @for i in range(5) {
        orb#item { size: 1 }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });
});

describe('HoloScriptPlusParser - Import Statements', () => {
  it('Parses @import with path', () => {
    const parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
    });
    const source = `@import "./utils/helpers.ts"
    scene#main { size: 1 }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.imports.length).toBe(1);
    expect(result.ast.imports[0].path).toBe('./utils/helpers.ts');
    expect(result.ast.imports[0].alias).toBe('helpers');
  });

  it('Parses @import with alias', () => {
    const parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
    });
    const source = `@import "./utils/math-helpers.ts" as MathUtils
    scene#main { size: 1 }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.imports.length).toBe(1);
    expect(result.ast.imports[0].path).toBe('./utils/math-helpers.ts');
    expect(result.ast.imports[0].alias).toBe('MathUtils');
  });

  it('Parses multiple @import statements', () => {
    const parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
    });
    const source = `@import "./utils.ts"
    @import "./helpers.ts" as H
    @import "./config.ts"
    scene#main { size: 1 }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast.imports.length).toBe(3);
    expect(result.ast.imports[0].alias).toBe('utils');
    expect(result.ast.imports[1].alias).toBe('H');
    expect(result.ast.imports[2].alias).toBe('config');
  });
});

describe('HoloScriptPlusParser - Logic Block', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses logic block with functions', () => {
    const source = `composition "Game" {
      logic {
        function take_damage(amount) {
          @state.health = @state.health - amount
        }
      }
      object "Player" { position: [0, 0, 0] }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const logicNode = result.ast.root.children?.find((c: any) => c.type === 'logic');
    expect(logicNode).toBeDefined();
    expect(logicNode.body.functions.length).toBeGreaterThan(0);
  });
});

describe('HoloScriptPlusParser - Environment & Lighting', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses environment block', () => {
    const source = `composition "Scene" {
      environment {
        @skybox { type: "procedural" }
        @ambient_light { color: "#ffffff", intensity: 0.4 }
      }
      object "Floor" { geometry: "box" }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });
});

describe('HoloScriptPlusParser - Expression Parsing', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  it('Parses string concatenation with +', () => {
    const source = `composition "Test" {
      greeting: "hello" + " world"
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.greeting).toEqual({
      type: 'binary',
      operator: '+',
      left: 'hello',
      right: ' world',
    });
  });

  it('Parses arithmetic with correct precedence (* before +)', () => {
    const source = `composition "Test" {
      result: 3 + 4 * 2
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.result).toEqual({
      type: 'binary',
      operator: '+',
      left: 3,
      right: { type: 'binary', operator: '*', left: 4, right: 2 },
    });
  });

  it('Parses $stateVar identifier with $ prefix', () => {
    const source = `composition "Test" {
      total: $counter + 1
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.total).toEqual({
      type: 'binary',
      operator: '+',
      left: { __ref: '$counter' },
      right: 1,
    });
  });

  it('Parses method call on $stateVar', () => {
    const source = `composition "Test" {
      label: $cost.toFixed(2)
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.label).toEqual({
      type: 'call',
      callee: '$cost.toFixed',
      args: 2,
    });
  });

  it('Parses ternary with comparison', () => {
    const source = `composition "Test" {
      color: $score > 70 ? "green" : "red"
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.color).toEqual({
      type: 'ternary',
      condition: {
        type: 'binary',
        operator: '>',
        left: { __ref: '$score' },
        right: 70,
      },
      trueValue: 'green',
      falseValue: 'red',
    });
  });

  it('Parses compound expression: string + method call', () => {
    const source = `composition "Test" {
      label: "$" + $cost.toFixed(2)
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.label).toEqual({
      type: 'binary',
      operator: '+',
      left: '$',
      right: { type: 'call', callee: '$cost.toFixed', args: 2 },
    });
  });

  it('Parses division and modulo', () => {
    const source = `composition "Test" {
      half: $total / 2
      remainder: $count % 3
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    expect(props.half).toEqual({
      type: 'binary',
      operator: '/',
      left: { __ref: '$total' },
      right: 2,
    });
    expect(props.remainder).toEqual({
      type: 'binary',
      operator: '%',
      left: { __ref: '$count' },
      right: 3,
    });
  });

  it('Parses unary minus in expression', () => {
    const source = `composition "Test" {
      neg: -3 + 5
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    const props = result.ast.root.properties;
    // -3 is folded into the number literal, then + 5
    expect(props.neg).toEqual({
      type: 'binary',
      operator: '+',
      left: -3,
      right: 5,
    });
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

describe('HoloScriptPlusParser - Agent Behavior Examples', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });
  const repoRoot = join(__dirname, '../../../..'); // From packages/core/src/parser up to root

  const examples = [
    'examples/hsplus/agents/moderator-agent.hsplus',
    'examples/hsplus/agents/planner-agent.hsplus',
    'examples/hsplus/agents/researcher-agent.hsplus',
    'examples/hsplus/agents/watcher-agent.hsplus',
    'examples/hsplus/multi-agent/planner-executor-reviewer.hsplus',
    'examples/hsplus/multi-agent/swarm-consensus.hsplus',
    'examples/hsplus/governance/norm-enforcer.hsplus',
  ];

  for (const examplePath of examples) {
    it(`Parses ${examplePath} successfully`, () => {
      const fullPath = join(repoRoot, examplePath);
      const sourceCode = readFileSync(fullPath, 'utf-8');

      const result = parser.parse(sourceCode);

      if (!result.success) {
        console.error(`Parse failed for ${examplePath}: ${JSON.stringify(result.errors, null, 2)}`);
      }

      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });
  }
});
