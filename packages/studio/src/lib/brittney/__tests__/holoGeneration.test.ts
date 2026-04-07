/**
 * holoGeneration.test.ts — Validates that AI-generated HoloScript output
 * is structurally correct and parses without errors.
 *
 * Tests use fixture strings that represent what an LLM *should* generate
 * for common prompts. Each fixture is validated both by the lightweight
 * structural validator (holoValidator) AND the real HoloScript parser
 * from @holoscript/core.
 *
 * These are deterministic — no LLM calls.
 */

import { describe, it, expect } from 'vitest';
import { validateHoloOutput, stripMarkdownFences } from '../holoValidator';
import { parseHolo } from '@holoscript/core';

// ═══════════════════════════════════���═══════════════════════════════════════
// FIXTURES — representative outputs for common generation prompts
// ═══════════════════��════════════════════════════��══════════════════════════

/**
 * Prompt: "A simple scene with a red cube"
 * Expected: composition block, object with geometry + color, material trait
 */
const FIXTURE_RED_CUBE = `composition "Red Cube Scene" {
  environment {
    skybox: "studio"
    ambient: 0.5
  }

  object "Floor" @collidable {
    geometry: "plane"
    position: [0, 0, 0]
    scale: [10, 10, 1]
    color: "#333333"
  }

  object "RedCube" @hoverable @grabbable {
    geometry: "cube"
    position: [0, 1, -3]
    scale: [1, 1, 1]
    color: "#ff0000"
    material: "standard"
  }

  object "Light" {
    type: "directional_light"
    intensity: 0.8
    color: "#ffffff"
    position: [5, 10, 5]
  }
}`;

/**
 * Prompt: "A VR room with two lights and a camera"
 * Expected: composition with light objects and camera block
 */
const FIXTURE_VR_ROOM = `composition "VR Room" {
  environment {
    skybox: "studio_soft"
    ambient: 0.3
  }

  object "RoomFloor" @collidable {
    geometry: "plane"
    position: [0, 0, 0]
    scale: [8, 8, 1]
    color: "#2a2a3a"
    material: "matte"
  }

  object "WallBack" @collidable {
    geometry: "cube"
    position: [0, 2, -4]
    scale: [8, 4, 0.2]
    color: "#1a1a2e"
  }

  object "SpotlightWarm" {
    type: "point_light"
    intensity: 0.7
    color: "#ffddaa"
    position: [-2, 3, -2]
  }

  object "SpotlightCool" {
    type: "point_light"
    intensity: 0.5
    color: "#aaddff"
    position: [2, 3, -2]
  }

  camera {
    position: [0, 1.6, 0]
    target: [0, 1.6, -4]
    fov: 75
  }
}`;

/**
 * Prompt: "A robot arm with 3 joints"
 * Expected: objects with physics traits and joint-like structure
 */
const FIXTURE_ROBOT_ARM = `composition "Robot Arm" {
  environment {
    skybox: "industrial"
    ambient: 0.4
  }

  object "Base" @collidable {
    geometry: "cylinder"
    position: [0, 0.25, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#444444"
    material: "metal"
  }

  object "Joint1" @physics(mass: 2.0, restitution: 0.1) @collidable {
    geometry: "sphere"
    position: [0, 0.5, 0]
    scale: [0.15, 0.15, 0.15]
    color: "#ff6600"
    material: "metal"
  }

  object "Arm1" @physics(mass: 1.5) @collidable {
    geometry: "cube"
    position: [0, 1.0, 0]
    scale: [0.1, 0.8, 0.1]
    color: "#888888"
    material: "metal"
  }

  object "Joint2" @physics(mass: 1.5, restitution: 0.1) @collidable {
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.12, 0.12, 0.12]
    color: "#ff6600"
    material: "metal"
  }

  object "Arm2" @physics(mass: 1.0) @collidable {
    geometry: "cube"
    position: [0, 2.0, 0]
    scale: [0.08, 0.6, 0.08]
    color: "#888888"
    material: "metal"
  }

  object "Joint3" @physics(mass: 1.0, restitution: 0.1) @collidable {
    geometry: "sphere"
    position: [0, 2.4, 0]
    scale: [0.1, 0.1, 0.1]
    color: "#ff6600"
    material: "metal"
  }

  object "Gripper" @grabbable @physics(mass: 0.5) {
    geometry: "cube"
    position: [0, 2.7, 0]
    scale: [0.2, 0.15, 0.15]
    color: "#cccccc"
    material: "metal"
  }
}`;

/**
 * Prompt: "A storefront with inventory"
 * Expected: objects with business/inventory traits
 */
const FIXTURE_STOREFRONT = `composition "Storefront" {
  environment {
    skybox: "urban"
    ambient: 0.5
  }

  object "StoreFloor" @collidable {
    geometry: "plane"
    position: [0, 0, 0]
    scale: [12, 12, 1]
    color: "#d4c4a8"
    material: "wood"
  }

  object "Counter" @collidable {
    geometry: "cube"
    position: [0, 0.5, -3]
    scale: [4, 1, 1]
    color: "#5c3a1e"
    material: "wood"
  }

  object "ShelfLeft" @collidable @inventory_sync {
    geometry: "cube"
    position: [-3, 1.5, -4]
    scale: [1.5, 3, 0.5]
    color: "#8b7355"
    material: "wood"
  }

  object "ShelfRight" @collidable @inventory_sync {
    geometry: "cube"
    position: [3, 1.5, -4]
    scale: [1.5, 3, 0.5]
    color: "#8b7355"
    material: "wood"
  }

  object "Product1" @grabbable @hoverable @x402_paywall {
    geometry: "cube"
    position: [-3, 2.5, -3.8]
    scale: [0.3, 0.3, 0.3]
    color: "#ff4444"
  }

  object "Product2" @grabbable @hoverable @x402_paywall {
    geometry: "sphere"
    position: [3, 2.5, -3.8]
    scale: [0.25, 0.25, 0.25]
    color: "#4444ff"
  }

  object "CashRegister" @clickable @hoverable {
    geometry: "cube"
    position: [1.5, 1.2, -3]
    scale: [0.4, 0.3, 0.3]
    color: "#222222"
    material: "metal"
  }
}`;

/**
 * Prompt: "An AI agent that answers questions"
 * Expected: agent-like block with model/AI traits.
 * Note: The parser supports `object` blocks with @ai_npc and similar traits.
 * A dedicated `agent` block may also be used for inference targets.
 */
const FIXTURE_AI_AGENT = `composition "AI Assistant" {
  environment {
    skybox: "digital"
    ambient: 0.6
  }

  object "AgentAvatar" @ai_npc @hoverable @clickable @glowing(intensity: 1.5, color: "#00ffff") {
    geometry: "sphere"
    position: [0, 1.5, -3]
    scale: [0.5, 0.5, 0.5]
    color: "#00ccff"
    material: "hologram"
  }

  object "QuestionPanel" @clickable @hoverable {
    geometry: "cube"
    position: [0, 2.5, -3]
    scale: [2, 0.5, 0.05]
    color: "#1a1a2e"
  }

  object "ResponseArea" @glowing(intensity: 0.5, color: "#00ff88") {
    geometry: "plane"
    position: [0, 1, -4]
    scale: [3, 2, 1]
    color: "#0a0a1a"
  }

  object "PlatformBase" @collidable {
    geometry: "cylinder"
    position: [0, 0, -3]
    scale: [2, 0.1, 2]
    color: "#1a1a2e"
    material: "emissive"
  }
}`;

// ═══════════════════════════════════════════════════════════════════════════
// NEGATIVE FIXTURES — intentionally broken outputs to test error detection
// ═══════════════════════════════════════════════════���═══════════════════════

const FIXTURE_MARKDOWN_WRAPPED = '```holoscript\ncomposition "Test" {\n  object "Cube" {\n    geometry: "cube"\n  }\n}\n```';

const FIXTURE_UNBALANCED_BRACES = `composition "Broken" {
  object "Cube" {
    geometry: "cube"
    position: [0, 1, 0]
  }
`;

const FIXTURE_EMPTY = '';

const FIXTURE_NO_BLOCK = `
// Just a comment
// No actual blocks here
position: [0, 1, 0]
color: "#ff0000"
`;

const FIXTURE_EQUALS_SYNTAX = `composition "WrongSyntax" {
  object "Cube" {
    geometry = "cube"
    position = [0, 1, 0]
  }
}`;

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — Structural Validator
// ═════��════════════��═════════════════════════════════════��══════════════════

describe('holoValidator — validateHoloOutput', () => {
  describe('valid fixtures pass structural validation', () => {
    it('red cube scene', () => {
      const result = validateHoloOutput(FIXTURE_RED_CUBE);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('VR room with lights and camera', () => {
      const result = validateHoloOutput(FIXTURE_VR_ROOM);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('robot arm with joints', () => {
      const result = validateHoloOutput(FIXTURE_ROBOT_ARM);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('storefront with inventory', () => {
      const result = validateHoloOutput(FIXTURE_STOREFRONT);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('AI agent', () => {
      const result = validateHoloOutput(FIXTURE_AI_AGENT);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('detects common LLM generation errors', () => {
    it('rejects markdown-wrapped output', () => {
      const result = validateHoloOutput(FIXTURE_MARKDOWN_WRAPPED);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('markdown'))).toBe(true);
    });

    it('rejects unbalanced braces', () => {
      const result = validateHoloOutput(FIXTURE_UNBALANCED_BRACES);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unclosed'))).toBe(true);
    });

    it('rejects empty output', () => {
      const result = validateHoloOutput(FIXTURE_EMPTY);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('empty'))).toBe(true);
    });

    it('rejects output with no block types', () => {
      const result = validateHoloOutput(FIXTURE_NO_BLOCK);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No recognized top-level block'))).toBe(true);
    });

    it('warns about = instead of : for properties', () => {
      const result = validateHoloOutput(FIXTURE_EQUALS_SYNTAX);
      // The output is still structurally valid (has blocks, balanced braces)
      // but should produce warnings about property syntax
      expect(result.warnings.some((w) => w.includes('"="'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles comments correctly', () => {
      const code = `// This is a comment
composition "Test" {
  // Another comment
  object "Cube" {
    geometry: "cube" // inline comment
    position: [0, 1, 0]
  }
}`;
      const result = validateHoloOutput(code);
      expect(result.valid).toBe(true);
    });

    it('handles strings with braces inside them', () => {
      const code = `composition "Test {with braces}" {
  object "Cube" {
    geometry: "cube"
    label: "some {text}"
  }
}`;
      const result = validateHoloOutput(code);
      expect(result.valid).toBe(true);
    });

    it('handles nested blocks', () => {
      const code = `composition "Nested" {
  object "Outer" @collidable {
    geometry: "cube"
    position: [0, 0, 0]

    on_click {
      toggle_trait "glowing"
    }
  }
}`;
      const result = validateHoloOutput(code);
      expect(result.valid).toBe(true);
    });

    it('detects multiple unclosed braces', () => {
      const code = `composition "Deep" {
  object "A" {
    object "B" {`;
      const result = validateHoloOutput(code);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('unclosed'))).toBe(true);
    });

    it('detects extra closing braces', () => {
      const code = `composition "Extra" {
  object "A" {
    geometry: "cube"
  }
}
}`;
      const result = validateHoloOutput(code);
      expect(result.valid).toBe(false);
    });
  });
});

// ════��══════════════════���═══════════════════════════════════��═══════════════
// TESTS — stripMarkdownFences
// ═══════════════���════════════════════════════════════════════════════════���══

describe('holoValidator — stripMarkdownFences', () => {
  it('strips ```holoscript fences', () => {
    const raw = '```holoscript\ncomposition "Test" { }\n```';
    expect(stripMarkdownFences(raw)).toBe('composition "Test" { }');
  });

  it('strips ```holo fences', () => {
    const raw = '```holo\ncomposition "Test" { }\n```';
    expect(stripMarkdownFences(raw)).toBe('composition "Test" { }');
  });

  it('strips bare ``` fences', () => {
    const raw = '```\ncomposition "Test" { }\n```';
    expect(stripMarkdownFences(raw)).toBe('composition "Test" { }');
  });

  it('returns clean code as-is', () => {
    const raw = 'composition "Test" { }';
    expect(stripMarkdownFences(raw)).toBe('composition "Test" { }');
  });
});

// ═���═══════════════════════════════���═════════════════════════════════════════
// TESTS — Real Parser Integration
//
// Each fixture is fed through the actual HoloScript parser from
// @holoscript/core to verify it produces a valid AST.
// ═════════════��═══════════════════════════════════���═════════════════════════

describe('holoGeneration — parseHolo integration', () => {
  it('red cube scene parses without errors', () => {
    const result = parseHolo(FIXTURE_RED_CUBE);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('Red Cube Scene');
    // Should contain objects
    expect(result.ast?.objects.length).toBeGreaterThanOrEqual(2);
    // Find the red cube
    const cube = result.ast?.objects.find((o) => o.name === 'RedCube');
    expect(cube).toBeDefined();
    // It should have traits
    expect(cube?.traits.length).toBeGreaterThanOrEqual(1);
  });

  it('VR room parses without errors and has lights', () => {
    const result = parseHolo(FIXTURE_VR_ROOM);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('VR Room');
    // Should have camera
    expect(result.ast?.camera).toBeDefined();
    // Should have light objects
    const lightObjects = result.ast?.objects.filter((o) =>
      o.properties.some(
        (p) => p.key === 'type' && typeof p.value === 'string' && p.value.includes('light'),
      ),
    );
    expect(lightObjects?.length).toBeGreaterThanOrEqual(2);
  });

  it('robot arm parses and has physics traits', () => {
    const result = parseHolo(FIXTURE_ROBOT_ARM);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('Robot Arm');
    // Find objects with physics traits
    const physicsObjects = result.ast?.objects.filter((o) =>
      o.traits.some((t) => t.name === 'physics'),
    );
    expect(physicsObjects?.length).toBeGreaterThanOrEqual(3);
    // Check joints exist
    const joints = result.ast?.objects.filter((o) => o.name.startsWith('Joint'));
    expect(joints?.length).toBe(3);
  });

  it('storefront parses and has business traits', () => {
    const result = parseHolo(FIXTURE_STOREFRONT);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('Storefront');
    // Find objects with inventory/paywall traits
    const inventoryObjects = result.ast?.objects.filter((o) =>
      o.traits.some((t) => t.name === 'inventory_sync'),
    );
    expect(inventoryObjects?.length).toBeGreaterThanOrEqual(1);
    const paywallObjects = result.ast?.objects.filter((o) =>
      o.traits.some((t) => t.name === 'x402_paywall'),
    );
    expect(paywallObjects?.length).toBeGreaterThanOrEqual(1);
  });

  it('AI agent parses and has AI traits', () => {
    const result = parseHolo(FIXTURE_AI_AGENT);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast?.name).toBe('AI Assistant');
    // Find objects with ai_npc trait
    const aiObjects = result.ast?.objects.filter((o) =>
      o.traits.some((t) => t.name === 'ai_npc'),
    );
    expect(aiObjects?.length).toBeGreaterThanOrEqual(1);
  });

  it('all objects have required properties (geometry/type and position)', () => {
    const fixtures = [
      FIXTURE_RED_CUBE,
      FIXTURE_VR_ROOM,
      FIXTURE_ROBOT_ARM,
      FIXTURE_STOREFRONT,
      FIXTURE_AI_AGENT,
    ];

    for (const fixture of fixtures) {
      const result = parseHolo(fixture);
      expect(result.success).toBe(true);
      for (const obj of result.ast?.objects ?? []) {
        const hasGeometry = obj.properties.some((p) => p.key === 'geometry');
        const hasType = obj.properties.some((p) => p.key === 'type');
        const hasPosition = obj.properties.some((p) => p.key === 'position');
        // Every object should have either geometry or type, and a position
        expect(hasGeometry || hasType).toBe(true);
        expect(hasPosition).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — Combined pipeline: strip fences -> validate -> parse
// ═════════════════════════���═══════════════════════════════════��═════════════

describe('holoGeneration — full validation pipeline', () => {
  it('markdown-wrapped output can be recovered and parsed', () => {
    const raw = '```holoscript\n' + FIXTURE_RED_CUBE + '\n```';
    // Step 1: structural validation catches markdown fences
    const validation = validateHoloOutput(raw);
    expect(validation.valid).toBe(false);
    // Step 2: strip fences
    const cleaned = stripMarkdownFences(raw);
    // Step 3: re-validate
    const revalidation = validateHoloOutput(cleaned);
    expect(revalidation.valid).toBe(true);
    // Step 4: parse
    const parsed = parseHolo(cleaned);
    expect(parsed.success).toBe(true);
  });

  it('real template files parse successfully', () => {
    // These are actual .holo files from the codebase, used as golden fixtures
    const artGallery = `composition "Art Gallery" {
  environment {
    skybox: "studio"
    ambient: 0.6
  }

  object "Gallery Floor" @collidable {
    geometry: "plane"
    position: [0, 0, -6]
    scale: [15, 15, 1]
    color: "#f5f0e8"
    material: "marble"
  }

  object "Pedestal 1" @collidable {
    geometry: "cylinder"
    position: [-3, 0.5, -5]
    scale: [0.6, 1, 0.6]
    color: "#e8e0d0"
    material: "marble"
  }

  object "Sculpture Crystal" @glowing @grabbable {
    geometry: "cone"
    position: [-3, 1.5, -5]
    scale: [0.4, 0.8, 0.4]
    color: "#88ccff"
    material: "crystal"
  }
}`;
    const validation = validateHoloOutput(artGallery);
    expect(validation.valid).toBe(true);
    const parsed = parseHolo(artGallery);
    expect(parsed.success).toBe(true);
    expect(parsed.ast?.objects.length).toBe(3);
  });
});
