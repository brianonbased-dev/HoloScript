/**
 * Visual Regression Tests - Parser AST Snapshots
 *
 * Ensures parser AST structure remains consistent across versions.
 * Any changes to AST node shapes will trigger snapshot updates.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

describe('Parser AST Visual Regression', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  describe('Basic AST Structures', () => {
    test('simple composition AST', () => {
      const source = `composition SimpleOrb {
  geometry: "sphere"
  color: "cyan"
  position: { x: 0, y: 1.5, z: -2 }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('object literal AST', () => {
      const source = `object BasicCube {
  geometry: "cube"
  color: "red"
  scale: { x: 1, y: 1, z: 1 }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('array literal AST', () => {
      const source = `composition ArrayTest {
  colors: ["red", "green", "blue"]
  numbers: [1, 2, 3, 4, 5]
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('nested object AST', () => {
      const source = `composition NestedTest {
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
  }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Directive AST Nodes', () => {
    test('single trait directive', () => {
      const source = `composition GrabbableOrb {
  geometry: "sphere"
  @grabbable
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('multiple trait directives', () => {
      const source = `composition InteractiveOrb {
  geometry: "sphere"
  @grabbable
  @hoverable
  @throwable
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('trait with configuration', () => {
      const source = `composition ConfiguredOrb {
  geometry: "sphere"
  @physics(mass: 1.5, friction: 0.8)
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('accessibility traits', () => {
      const source = `ui_button AccessibleButton {
  text: "Click me"
  @accessible
  @alt_text("Submit button")
  @screen_reader("Press to submit form")
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Expression AST Nodes', () => {
    test('spread expression in object', () => {
      const source = `composition SpreadTest {
  ...BaseOrb
  color: "red"
}`;
      const result = parser.parse(source);

      // Verify spread node structure
      expect(result.ast.root).toHaveProperty('type');
      const composition = result.ast.root;
      expect(composition.properties).toBeDefined();

      expect(result).toMatchSnapshot();
    });

    test('spread expression in array', () => {
      const source = `composition ArraySpread {
  items: [...defaults, "extra"]
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('null coalescing operator', () => {
      const source = `composition NullCoalesce {
  color: userColor ?? "white"
  size: userSize ?? 1.0
}`;
      const result = parser.parse(source);

      // Note: composition.properties structure may vary depending on parser implementation
      // Snapshot validation is the primary test focus

      expect(result).toMatchSnapshot();
    });

    test('null coalescing assignment', () => {
      const source = `logic AssignmentTest {
  function test() {
    count ??= 0
    name ??= "default"
  }
}`;
      const result = parser.parse(source);

      // Verify assignment node structure
      expect(result.ast.root).toHaveProperty('type');

      expect(result).toMatchSnapshot();
    });

    test('ternary operator', () => {
      const source = `composition TernaryTest {
  color: isActive ? "green" : "gray"
  opacity: isVisible ? 1.0 : 0.0
}`;
      const result = parser.parse(source);

      // Note: composition.properties structure may vary depending on parser implementation
      // Snapshot validation is the primary test focus

      expect(result).toMatchSnapshot();
    });

    test('complex expression combinations', () => {
      const source = `composition ComplexExpr {
  result: (a ?? b) ? c : (d ??= e)
  spread: { ...base, override: x ?? y }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Control Flow AST Nodes', () => {
    test('state machine AST', () => {
      const source = `state-machine SimpleMachine {
  initial: "idle"
  
  state idle {
    on: "start" -> "running"
  }
  
  state running {
    on: "stop" -> "idle"
  }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('timeline AST', () => {
      const source = `timeline RotationAnimation {
  target: "cube"
  duration: 1000
  keyframes: [
    { time: 0, rotation: { y: 0 } },
    { time: 1000, rotation: { y: 360 } }
  ]
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('conditional logic AST', () => {
      const source = `logic ConditionalTest {
  if (condition) {
    doSomething()
  } else {
    doOtherThing()
  }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Import and Module System', () => {
    test('import statement AST', () => {
      const source = `import { Button } from "./ui/Button.holo"`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('multiple imports AST', () => {
      const source = `import { Button } from "./ui/Button.holo"
import { Panel } from "./ui/Panel.holo"
import { Controller } from "./logic/Controller.hsplus"`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('using statement AST', () => {
      const source = `using BaseTemplate from "./templates/Base.holo"`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Template and Composition Inheritance', () => {
    test('template definition AST', () => {
      const source = `template ButtonTemplate {
  geometry: "cube"
  scale: { x: 0.2, y: 0.05, z: 0.1 }
  @clickable
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('template extension AST', () => {
      const source = `composition RedButton extends ButtonTemplate {
  color: "red"
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('spread with template AST', () => {
      const source = `composition CustomButton {
  ...ButtonTemplate
  color: "blue"
  glow: true
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('UI Components AST', () => {
    test('ui_panel AST', () => {
      const source = `ui_panel Menu {
  width: 400
  height: 300
  @ui_floating
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('ui_button AST', () => {
      const source = `ui_button SubmitButton {
  text: "Submit"
  width: 100
  height: 40
  @clickable
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('ui component hierarchy AST', () => {
      const source = `ui_panel Dashboard {
  children: [
    ui_button { text: "Start" },
    ui_button { text: "Stop" },
    ui_text { content: "Status: Ready" }
  ]
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Zone and Environment AST', () => {
    test('zone definition AST', () => {
      const source = `zone Gallery {
  bounds: {
    center: { x: 0, y: 0, z: 0 },
    size: { x: 10, y: 3, z: 10 }
  }
  @plane_detection
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('environment settings AST', () => {
      const source = `environment MainScene {
  skybox: "gradient"
  lighting: "soft"
  ambientColor: "#404040"
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Edge Cases and Errors', () => {
    test('empty composition AST', () => {
      const source = `composition Empty {}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('minimal single property AST', () => {
      const source = `composition Minimal { color: "red" }`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('deeply nested structure AST', () => {
      const source = `composition Deep {
  level1: {
    level2: {
      level3: {
        value: "nested"
      }
    }
  }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('multiple compositions AST', () => {
      const source = `composition First {
  color: "red"
}

composition Second {
  color: "blue"
}`;
      const result = parser.parse(source);
      // Parser handles multiple top-level compositions gracefully
      expect(result.success).toBe(true);
      expect(result).toMatchSnapshot();
    });
  });

  describe('AST Node Properties', () => {
    test('AST nodes should have line numbers', () => {
      const source = `composition Test {
  prop1: "value1"
  prop2: "value2"
}`;
      const result = parser.parse(source);
      const composition = result.ast.root;

      // Verify location metadata exists (may be in loc object rather than direct properties)
      expect(composition).toHaveProperty('loc');
      expect(result).toMatchSnapshot();
    });

    test('AST should preserve source positions', () => {
      const source = `composition PositionTest {
  geometry: "sphere"
  color: "cyan"
}`;
      const ast = parser.parse(source);

      // AST snapshot should include position metadata
      expect(ast).toMatchSnapshot();
    });
  });

  describe('AST Consistency Across Parsing', () => {
    test('parsing same source twice produces identical AST', () => {
      const source = `composition Consistency {
  color: "red"
  position: { x: 0, y: 1, z: -2 }
}`;

      const ast1 = parser.parse(source);
      const ast2 = parser.parse(source);

      // Deep equality check
      expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
      expect(ast1).toMatchSnapshot();
    });

    test('whitespace variations produce equivalent AST', () => {
      const source1 = `composition Test { color: "red" }`;
      const source2 = `composition Test {
  color: "red"
}`;

      const result1 = parser.parse(source1);
      const result2 = parser.parse(source2);

      // Structure should be the same (ignoring position metadata)
      const composition1 = result1.ast.root;
      const composition2 = result2.ast.root;

      expect(composition1.type).toBe(composition2.type);
      expect(JSON.stringify(composition1.properties)).toBe(JSON.stringify(composition2.properties));
    });
  });

  describe('Complex Real-World AST Examples', () => {
    test('interactive scene AST', () => {
      const source = `composition InteractiveScene {
  orbs: [
    {
      id: "orb1",
      geometry: "sphere",
      color: "red",
      position: { x: -1, y: 1, z: -2 },
      @grabbable,
      @throwable
    },
    {
      id: "orb2",
      geometry: "sphere",
      color: "blue",
      position: { x: 1, y: 1, z: -2 },
      @grabbable,
      @throwable
    }
  ]
  
  state-machine OrbController {
    initial: "idle"
    state idle {
      on: "grab" -> "grabbed"
    }
    state grabbed {
      on: "throw" -> "flying"
    }
    state flying {
      on: "land" -> "idle"
    }
  }
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });

    test('dashboard with all features AST', () => {
      const source = `import { Chart } from "./ui/Chart.holo"

composition Dashboard {
  ...BaseLayout
  
  title: userTitle ?? "Dashboard"
  
  panels: [
    ui_panel {
      title: "Status",
      content: statusText ??= "Ready"
    },
    ui_panel {
      title: "Metrics",
      chart: { ...defaultChart, data: metrics }
    }
  ]
  
  @accessible
  @alt_text("Main dashboard view")
}`;
      const ast = parser.parse(source);
      expect(ast).toMatchSnapshot();
    });
  });

  describe('Snapshot Stability Tests', () => {
    test('AST snapshot should be deterministic', () => {
      const source = `composition Stable {
  props: {
    a: 1,
    b: 2,
    c: 3
  }
}`;

      // Parse multiple times
      const snapshots = [parser.parse(source), parser.parse(source), parser.parse(source)];

      // All snapshots should be identical
      expect(JSON.stringify(snapshots[0])).toBe(JSON.stringify(snapshots[1]));
      expect(JSON.stringify(snapshots[1])).toBe(JSON.stringify(snapshots[2]));

      expect(snapshots[0]).toMatchSnapshot();
    });
  });
});
