/**
 * Visual Regression Tests - Formatter Snapshots
 *
 * Ensures formatter output remains consistent across versions.
 * Any changes to formatting logic will trigger snapshot updates.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptFormatter, DEFAULT_CONFIG } from '../index';

describe('Formatter Visual Regression', () => {
  let formatter: HoloScriptFormatter;

  beforeEach(() => {
    formatter = new HoloScriptFormatter(DEFAULT_CONFIG);
  });

  describe('Basic HoloScript Structures', () => {
    test('simple orb composition', () => {
      const source = `composition Orb {
  geometry: "sphere"
  color: "cyan"
  position: { x: 0, y: 1.5, z: -2 }
  @grabbable
  @hoverable
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('object with nested properties', () => {
      const source = `object ComplexCube {
  geometry: "cube"
  material: {
    color: "blue",
    metalness: 0.8,
    roughness: 0.2
  }
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 45, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  }
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('array with multiple elements', () => {
      const source = `composition ColorPalette {
  colors: [
    "red",
    "green",
    "blue",
    "yellow"
  ]
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('template definition', () => {
      const source = `template Button {
  geometry: "cube"
  scale: { x: 0.2, y: 0.05, z: 0.1 }
  color: "white"
  @clickable
  @hoverable
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('state machine', () => {
      const source = `state-machine DoorController {
  initial: "closed"
  
  state closed {
    on: "open" -> "opening"
  }
  
  state opening {
    on: "opened" -> "open"
  }
  
  state open {
    on: "close" -> "closing"
  }
  
  state closing {
    on: "closed" -> "closed"
  }
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });
  });

  describe('HoloScript+ Features', () => {
    test('spread operator in objects', () => {
      const source = `composition ExtendedOrb {
  ...BaseOrb
  color: "red"
  glow: true
}`;
      const result = formatter.format(source, 'hsplus');
      expect(result.formatted).toMatchSnapshot();
    });

    test('spread operator in arrays', () => {
      const source = `composition MergedArray {
  items: [...defaults, "extra1", "extra2", ...more]
}`;
      const result = formatter.format(source, 'hsplus');
      expect(result.formatted).toMatchSnapshot();
    });

    test('null coalescing operator', () => {
      const source = `composition ConfigWithDefaults {
  color: userColor ?? "white"
  size: userSize ?? 1.0
  enabled: userEnabled ?? true
}`;
      const result = formatter.format(source, 'hsplus');
      expect(result.formatted).toMatchSnapshot();
    });

    test('null coalescing assignment', () => {
      const source = `logic Setup {
  count ??= 0
  name ??= "Unnamed"
  position ??= { x: 0, y: 0, z: 0 }
}`;
      const result = formatter.format(source, 'hsplus');
      expect(result.formatted).toMatchSnapshot();
    });

    test('ternary operator', () => {
      const source = `composition ConditionalColor {
  color: isActive ? "green" : "gray"
  opacity: isVisible ? 1.0 : 0.0
}`;
      const result = formatter.format(source, 'hsplus');
      expect(result.formatted).toMatchSnapshot();
    });

    test('logic blocks with TypeScript code', () => {
      const source = `logic InteractionHandler {
  function onGrab(orb: Orb) {
    orb.scale *= 1.2
    orb.emit("grabbed", { time: Date.now() })
  }
  
  function onRelease(orb: Orb) {
    orb.scale /= 1.2
    orb.emit("released")
  }
}`;
      const result = formatter.format(source, 'hsplus');
      expect(result.formatted).toMatchSnapshot();
    });
  });

  describe('Complex Real-World Scenarios', () => {
    test('interactive button panel', () => {
      const source = `composition ButtonPanel {
  group: "ui"
  position: { x: 0, y: 1.5, z: -1 }
  
  buttons: [
    {
      id: "red",
      color: "red",
      position: { x: -0.3, y: 0, z: 0 },
      @clickable
    },
    {
      id: "green",
      color: "green",
      position: { x: 0, y: 0, z: 0 },
      @clickable
    },
    {
      id: "blue",
      color: "blue",
      position: { x: 0.3, y: 0, z: 0 },
      @clickable
    }
  ]
  
  @hoverable
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('zone with environment settings', () => {
      const source = `zone Gallery {
  bounds: {
    center: { x: 0, y: 0, z: 0 },
    size: { x: 10, y: 3, z: 10 }
  }
  
  environment: {
    skybox: "gradient",
    lighting: "soft",
    ambientColor: "#404040",
    fogColor: "#808080",
    fogDensity: 0.01
  }
  
  @plane_detection
  @anchor
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('import statements', () => {
      const source = `import { Button } from "./ui/Button.holo"
import { Panel } from "./ui/Panel.holo"
import { Controller } from "./logic/Controller.hsplus"

composition Dashboard {
  panel: Panel {
    buttons: [
      Button { label: "Start" },
      Button { label: "Stop" }
    ]
  }
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('UI components with accessibility', () => {
      const source = `ui_panel AccessibleMenu {
  @accessible
  @alt_text("Main navigation menu")
  
  items: [
    ui_button {
      text: "Home"
      @screen_reader("Navigate to home")
    },
    ui_button {
      text: "Settings"
      @screen_reader("Open settings")
    }
  ]
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('timeline animation', () => {
      const source = `timeline RotatingCube {
  target: "cube"
  duration: 5000
  loop: true
  
  keyframes: [
    { time: 0, rotation: { x: 0, y: 0, z: 0 } },
    { time: 2500, rotation: { x: 180, y: 180, z: 0 } },
    { time: 5000, rotation: { x: 360, y: 360, z: 0 } }
  ]
  
  easing: "ease-in-out"
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('empty composition', () => {
      const source = `composition Empty {}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('single-line composition', () => {
      const source = `composition Minimal { color: "red" }`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('deeply nested structures', () => {
      const source = `composition Nested {
  level1: {
    level2: {
      level3: {
        level4: {
          value: "deep"
        }
      }
    }
  }
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('long property values', () => {
      const source = `composition LongValues {
  description: "This is a very long description that exceeds the typical line length and might need special handling"
  url: "https://example.com/very/long/path/to/resource/that/might/need/formatting"
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('multiple blank lines', () => {
      const source = `composition WithBlanks {
  prop1: "value1"


  prop2: "value2"



  prop3: "value3"
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('mixed indentation styles', () => {
      const source = `composition Mixed {
  property1: "value"
    property2: "value"
      property3: "value"
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('trailing commas in arrays', () => {
      const source = `composition TrailingCommas {
  items: [
    "one",
    "two",
    "three",
  ]
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('comments preservation', () => {
      const source = `// Main composition
composition Documented {
  // Color property
  color: "blue" // Sky blue
  
  // Position
  position: { x: 0, y: 0, z: 0 }
}`;
      const result = formatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });
  });

  describe('Configuration Variations', () => {
    test('format with tabs instead of spaces', () => {
      const tabFormatter = new HoloScriptFormatter({
        ...DEFAULT_CONFIG,
        useTabs: true,
      });

      const source = `composition Tabbed {
  color: "red"
  size: 1.0
}`;
      const result = tabFormatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('format with 4-space indentation', () => {
      const fourSpaceFormatter = new HoloScriptFormatter({
        ...DEFAULT_CONFIG,
        indentSize: 4,
      });

      const source = `composition FourSpace {
  nested: {
    value: "test"
  }
}`;
      const result = fourSpaceFormatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('format with single quotes', () => {
      const singleQuoteFormatter = new HoloScriptFormatter({
        ...DEFAULT_CONFIG,
        singleQuote: true,
      });

      const source = `composition Singles {
  text: "double quotes"
  label: 'single quotes'
}`;
      const result = singleQuoteFormatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('format with next-line braces', () => {
      const nextLineFormatter = new HoloScriptFormatter({
        ...DEFAULT_CONFIG,
        braceStyle: 'next-line',
      });

      const source = `composition NextLine {
  nested: {
    value: "test"
  }
}`;
      const result = nextLineFormatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });

    test('format with no trailing commas', () => {
      const noTrailingCommaFormatter = new HoloScriptFormatter({
        ...DEFAULT_CONFIG,
        trailingComma: 'none',
      });

      const source = `composition NoTrailing {
  items: [
    "one",
    "two",
    "three"
  ]
}`;
      const result = noTrailingCommaFormatter.format(source, 'holo');
      expect(result.formatted).toMatchSnapshot();
    });
  });

  describe('Idempotency Tests', () => {
    test('formatting should be idempotent', () => {
      const source = `composition Test {
  color: "red"
  position: { x: 0, y: 1, z: -2 }
}`;

      const result1 = formatter.format(source, 'holo');
      const result2 = formatter.format(result1.formatted, 'holo');
      const result3 = formatter.format(result2.formatted, 'holo');

      expect(result2.formatted).toBe(result1.formatted);
      expect(result3.formatted).toBe(result1.formatted);
      expect(result2.changed).toBe(false);
      expect(result3.changed).toBe(false);
    });

    test('complex structure should remain stable', () => {
      const source = `composition Complex {
  nested: {
    array: [1, 2, 3],
    object: { key: "value" }
  },
  spread: { ...base, override: true }
}`;

      const result1 = formatter.format(source, 'hsplus');
      const result2 = formatter.format(result1.formatted, 'hsplus');

      expect(result2.formatted).toBe(result1.formatted);
    });
  });
});
