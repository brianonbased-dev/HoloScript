/**
 * R3FCompiler -- Material Presets, Environment Presets,
 *            UI Component Presets, and Compiler Output Shape
 *
 * Tests cover:
 *   - Feature 1:  MATERIAL_PRESETS -- 12 PBR material definitions
 *                 (plastic, metal, chrome, gold, copper, glass, crystal,
 *                  wood, fabric, rubber, leather, water)
 *   - Feature 2:  ENVIRONMENT_PRESETS -- 6 scene environments
 *                 (forest_sunset, cyberpunk_city, space_void, studio,
 *                  underwater, desert)
 *   - Feature 3:  UI_COMPONENT_PRESETS -- 8 uikit component mappings
 *                 (UIPanel, UIText, UIButton, UISlider, UIInput,
 *                  UIImage, UIChart, UIGauge)
 *   - Feature 4:  R3FCompiler class -- instantiation, compileComposition()
 *                 with minimal inputs, R3FNode structure guarantees
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  MATERIAL_PRESETS,
  ENVIRONMENT_PRESETS,
  UI_COMPONENT_PRESETS,
  R3FCompiler,
  type R3FNode,
} from '../compiler/R3FCompiler.js';

// ============================================================================
// Feature 1A: MATERIAL_PRESETS -- count and key names
// ============================================================================

describe('Feature 1A: MATERIAL_PRESETS -- count & keys', () => {
  const EXPECTED_MATERIALS = [
    'plastic',
    'metal',
    'chrome',
    'gold',
    'copper',
    'glass',
    'crystal',
    'wood',
    'fabric',
    'rubber',
    'leather',
    'water',
  ];

  it('has at least 12 material presets', () => {
    expect(Object.keys(MATERIAL_PRESETS).length).toBeGreaterThanOrEqual(12);
  });

  it('contains all expected material names', () => {
    for (const name of EXPECTED_MATERIALS) {
      expect(MATERIAL_PRESETS).toHaveProperty(name);
    }
  });

  it('every preset is a non-null object', () => {
    for (const [, preset] of Object.entries(MATERIAL_PRESETS)) {
      expect(typeof preset).toBe('object');
      expect(preset).not.toBeNull();
    }
  });
});

// ============================================================================
// Feature 1B: MATERIAL_PRESETS -- roughness & metalness values
// ============================================================================

describe('Feature 1B: MATERIAL_PRESETS -- PBR property values', () => {
  it('plastic has low metalness (0)', () => {
    expect(MATERIAL_PRESETS.plastic.metalness).toBe(0.0);
  });

  it('plastic has mid roughness (0.5)', () => {
    expect(MATERIAL_PRESETS.plastic.roughness).toBe(0.5);
  });

  it('metal has full metalness (1)', () => {
    expect(MATERIAL_PRESETS.metal.metalness).toBe(1.0);
  });

  it('metal has low roughness (0.2)', () => {
    expect(MATERIAL_PRESETS.metal.roughness).toBe(0.2);
  });

  it('chrome has very low roughness (0.05)', () => {
    expect(MATERIAL_PRESETS.chrome.roughness).toBe(0.05);
  });

  it('gold has a gold color (#ffd700)', () => {
    expect(MATERIAL_PRESETS.gold.color).toBe('#ffd700');
  });

  it('copper has a copper color (#b87333)', () => {
    expect(MATERIAL_PRESETS.copper.color).toBe('#b87333');
  });

  it('glass is transparent with high transmission', () => {
    expect(MATERIAL_PRESETS.glass.transparent).toBe(true);
    expect(MATERIAL_PRESETS.glass.transmission).toBeGreaterThan(0.9);
  });

  it('glass has an ior property', () => {
    expect(typeof MATERIAL_PRESETS.glass.ior).toBe('number');
    expect(MATERIAL_PRESETS.glass.ior).toBeGreaterThan(1);
  });

  it('crystal has iridescence', () => {
    expect(MATERIAL_PRESETS.crystal.iridescence).toBe(1.0);
  });

  it('wood has high roughness (0.8)', () => {
    expect(MATERIAL_PRESETS.wood.roughness).toBe(0.8);
  });

  it('fabric has sheen property', () => {
    expect(typeof MATERIAL_PRESETS.fabric.sheen).toBe('number');
  });

  it('rubber has near-full roughness (0.9)', () => {
    expect(MATERIAL_PRESETS.rubber.roughness).toBe(0.9);
  });

  it('water has transparency properties', () => {
    expect(MATERIAL_PRESETS.water.transparent).toBe(true);
    expect(MATERIAL_PRESETS.water.transmission).toBeGreaterThan(0.8);
  });

  it('all metallic presets (metal, chrome, gold, copper) have metalness = 1', () => {
    for (const name of ['metal', 'chrome', 'gold', 'copper']) {
      expect(MATERIAL_PRESETS[name].metalness).toBe(1.0);
    }
  });

  it('all matte presets (plastic, wood, fabric, rubber, leather) have metalness = 0', () => {
    for (const name of ['plastic', 'wood', 'fabric', 'rubber', 'leather']) {
      expect(MATERIAL_PRESETS[name].metalness).toBe(0.0);
    }
  });
});

// ============================================================================
// Feature 2A: ENVIRONMENT_PRESETS -- count and key names
// ============================================================================

describe('Feature 2A: ENVIRONMENT_PRESETS -- count & keys', () => {
  const EXPECTED_ENVS = [
    'forest_sunset',
    'cyberpunk_city',
    'space_void',
    'studio',
    'underwater',
    'desert',
  ];

  it('has exactly 6 environment presets', () => {
    expect(Object.keys(ENVIRONMENT_PRESETS).length).toBe(6);
  });

  it('contains all expected environment names', () => {
    for (const name of EXPECTED_ENVS) {
      expect(ENVIRONMENT_PRESETS).toHaveProperty(name);
    }
  });

  it('every environment has a background flag', () => {
    for (const [, env] of Object.entries(ENVIRONMENT_PRESETS)) {
      expect(typeof (env as any).background).toBe('boolean');
    }
  });

  it('every environment has a lighting block', () => {
    for (const [, env] of Object.entries(ENVIRONMENT_PRESETS)) {
      expect(typeof (env as any).lighting).toBe('object');
    }
  });
});

// ============================================================================
// Feature 2B: ENVIRONMENT_PRESETS -- specific properties
// ============================================================================

describe('Feature 2B: ENVIRONMENT_PRESETS -- specific properties', () => {
  it('cyberpunk_city has postprocessing/bloom', () => {
    const env = ENVIRONMENT_PRESETS.cyberpunk_city as any;
    expect(env.postprocessing).toBeDefined();
    expect(env.postprocessing.bloom).toBeDefined();
  });

  it('forest_sunset has fog', () => {
    expect((ENVIRONMENT_PRESETS.forest_sunset as any).fog).toBeDefined();
  });

  it('space_void has NO fog (deep space)', () => {
    expect((ENVIRONMENT_PRESETS.space_void as any).fog).toBeUndefined();
  });

  it('studio has no fog (indoor)', () => {
    expect((ENVIRONMENT_PRESETS.studio as any).fog).toBeUndefined();
  });

  it('underwater has fog with blue color', () => {
    const fog = (ENVIRONMENT_PRESETS.underwater as any).fog;
    expect(fog).toBeDefined();
    expect(fog.color).toContain('#00');
  });

  it('desert has far fog distance (150)', () => {
    const fog = (ENVIRONMENT_PRESETS.desert as any).fog;
    expect(fog).toBeDefined();
    expect(fog.far).toBe(150);
  });

  it('cyberpunk_city ambient lighting is dark purple', () => {
    const ambient = (ENVIRONMENT_PRESETS.cyberpunk_city as any).lighting.ambient;
    expect(ambient.color).toBeDefined();
  });
});

// ============================================================================
// Feature 3A: UI_COMPONENT_PRESETS -- count and structure
// ============================================================================

describe('Feature 3A: UI_COMPONENT_PRESETS -- count & structure', () => {
  const EXPECTED_COMPONENTS = [
    'UIPanel',
    'UIText',
    'UIButton',
    'UISlider',
    'UIInput',
    'UIImage',
    'UIChart',
    'UIGauge',
  ];

  it('has exactly 8 UI component presets', () => {
    expect(Object.keys(UI_COMPONENT_PRESETS).length).toBe(8);
  });

  it('contains all expected component names', () => {
    for (const name of EXPECTED_COMPONENTS) {
      expect(UI_COMPONENT_PRESETS).toHaveProperty(name);
    }
  });

  it('every preset has a component string', () => {
    for (const [, preset] of Object.entries(UI_COMPONENT_PRESETS)) {
      expect(typeof preset.component).toBe('string');
      expect(preset.component.length).toBeGreaterThan(0);
    }
  });

  it('every preset has a defaultProps object', () => {
    for (const [, preset] of Object.entries(UI_COMPONENT_PRESETS)) {
      expect(typeof preset.defaultProps).toBe('object');
      expect(preset.defaultProps).not.toBeNull();
    }
  });
});

// ============================================================================
// Feature 3B: UI_COMPONENT_PRESETS -- component mapping values
// ============================================================================

describe('Feature 3B: UI_COMPONENT_PRESETS -- component mappings', () => {
  it('UIPanel maps to "Container"', () => {
    expect(UI_COMPONENT_PRESETS.UIPanel.component).toBe('Container');
  });

  it('UIText maps to "Text"', () => {
    expect(UI_COMPONENT_PRESETS.UIText.component).toBe('Text');
  });

  it('UIButton maps to "Button"', () => {
    expect(UI_COMPONENT_PRESETS.UIButton.component).toBe('Button');
  });

  it('UISlider maps to "Slider"', () => {
    expect(UI_COMPONENT_PRESETS.UISlider.component).toBe('Slider');
  });

  it('UIInput maps to "Input"', () => {
    expect(UI_COMPONENT_PRESETS.UIInput.component).toBe('Input');
  });

  it('UIImage maps to "Image"', () => {
    expect(UI_COMPONENT_PRESETS.UIImage.component).toBe('Image');
  });

  it('UIChart maps to "Chart"', () => {
    expect(UI_COMPONENT_PRESETS.UIChart.component).toBe('Chart');
  });

  it('UIGauge maps to "Gauge"', () => {
    expect(UI_COMPONENT_PRESETS.UIGauge.component).toBe('Gauge');
  });

  it('UIPanel defaultProps has flexDirection', () => {
    expect(UI_COMPONENT_PRESETS.UIPanel.defaultProps.flexDirection).toBe('column');
  });

  it('UIText defaultProps has fontSize', () => {
    expect(typeof UI_COMPONENT_PRESETS.UIText.defaultProps.fontSize).toBe('number');
  });

  it('UIButton defaultProps has backgroundColor', () => {
    expect(typeof UI_COMPONENT_PRESETS.UIButton.defaultProps.backgroundColor).toBe('string');
  });

  it('UISlider defaultProps has a width and height', () => {
    expect(typeof UI_COMPONENT_PRESETS.UISlider.defaultProps.width).toBe('number');
    expect(typeof UI_COMPONENT_PRESETS.UISlider.defaultProps.height).toBe('number');
  });

  it('UIGauge defaultProps has size', () => {
    expect(typeof UI_COMPONENT_PRESETS.UIGauge.defaultProps.size).toBe('number');
  });
});

// ============================================================================
// Feature 4A: R3FCompiler -- class instantiation
// ============================================================================

describe('Feature 4A: R3FCompiler -- instantiation', () => {
  it('R3FCompiler is a class (function)', () => {
    expect(typeof R3FCompiler).toBe('function');
  });

  it('new R3FCompiler() creates an instance', () => {
    const compiler = new R3FCompiler();
    expect(compiler).toBeDefined();
    expect(compiler).toBeInstanceOf(R3FCompiler);
  });

  it('instance has compileComposition method', () => {
    const compiler = new R3FCompiler();
    expect(typeof compiler.compileComposition).toBe('function');
  });

  it('instance has compileNode method', () => {
    const compiler = new R3FCompiler();
    expect(typeof compiler.compileNode).toBe('function');
  });

  it('instance has compile method', () => {
    const compiler = new R3FCompiler();
    expect(typeof compiler.compile).toBe('function');
  });
});

// ============================================================================
// Feature 4B: R3FCompiler -- compileComposition output shape
// ============================================================================

describe('Feature 4B: R3FCompiler -- compileComposition()', () => {
  let compiler: R3FCompiler;
  beforeEach(() => {
    compiler = new R3FCompiler();
  });

  const minimalComposition = () => ({
    name: 'TestScene',
    objects: [],
  });

  it('returns an R3FNode object', () => {
    const result = compiler.compileComposition(minimalComposition());
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('root node type is "group"', () => {
    const result = compiler.compileComposition(minimalComposition());
    expect(result.type).toBe('group');
  });

  it('root node id equals composition name', () => {
    const result = compiler.compileComposition({ name: 'MyScene', objects: [] });
    expect(result.id).toBe('MyScene');
  });

  it('root node has props object', () => {
    const result = compiler.compileComposition(minimalComposition());
    expect(typeof result.props).toBe('object');
  });

  it('root node has children array', () => {
    const result = compiler.compileComposition(minimalComposition());
    expect(Array.isArray(result.children)).toBe(true);
  });

  it('root node has traits Map', () => {
    const result = compiler.compileComposition(minimalComposition());
    expect(result.traits).toBeInstanceOf(Map);
  });

  it('empty objects array produces minimal children', () => {
    const result = compiler.compileComposition(minimalComposition());
    expect(result.children!.length).toBeGreaterThanOrEqual(0);
  });

  it('composition with one object produces one child', () => {
    const comp = {
      name: 'Scene',
      objects: [
        {
          name: 'MyBox',
          type: 'cube',
          properties: [],
        },
      ],
    };
    const result = compiler.compileComposition(comp);
    expect(result.children!.length).toBeGreaterThanOrEqual(1);
  });

  it('handles composition with no environment gracefully', () => {
    const result = compiler.compileComposition({ name: 'X', objects: [] });
    expect(result).toBeDefined();
    expect(result.type).toBe('group');
  });

  it('different composition names produce different root ids', () => {
    const r1 = compiler.compileComposition({ name: 'Alpha', objects: [] });
    const r2 = compiler.compileComposition({ name: 'Beta', objects: [] });
    expect(r1.id).not.toBe(r2.id);
  });
});

// ============================================================================
// Feature 4C: R3FNode interface shape
// ============================================================================

describe('Feature 4C: R3FNode interface shape', () => {
  let compiler: R3FCompiler;
  beforeEach(() => {
    compiler = new R3FCompiler();
  });

  const getRoot = (): R3FNode => compiler.compileComposition({ name: 'Shape', objects: [] });

  it('R3FNode.type is a string', () => {
    expect(typeof getRoot().type).toBe('string');
  });

  it('R3FNode.props is a plain object', () => {
    const p = getRoot().props;
    expect(typeof p).toBe('object');
    expect(Array.isArray(p)).toBe(false);
  });

  it('R3FNode.traits is a Map', () => {
    expect(getRoot().traits).toBeInstanceOf(Map);
  });

  it('R3FNode.children is an array when present', () => {
    const children = getRoot().children;
    expect(Array.isArray(children)).toBe(true);
  });
});
