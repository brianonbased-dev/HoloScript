/**
 * tree-sitter-holoscript — Parser binding tests
 *
 * Tests the WASM-based parser for grammar rules, node types,
 * query patterns, and syntax highlighting captures.
 *
 * Uses web-tree-sitter (WASM runtime) for portability.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';

// web-tree-sitter types (minimal — the package ships JS, not TS)
interface TreeSitterParser {
  setLanguage(lang: TreeSitterLanguage): void;
  parse(input: string): SyntaxTree;
}

interface TreeSitterLanguage {
  query(source: string): TreeSitterQuery;
}

interface TreeSitterQuery {
  matches(node: SyntaxNode): QueryMatch[];
  captures(node: SyntaxNode): QueryCapture[];
}

interface QueryMatch {
  pattern: number;
  captures: QueryCapture[];
}

interface QueryCapture {
  name: string;
  node: SyntaxNode;
}

interface SyntaxTree {
  rootNode: SyntaxNode;
}

interface SyntaxNode {
  type: string;
  text: string;
  childCount: number;
  namedChildCount: number;
  children: SyntaxNode[];
  namedChildren: SyntaxNode[];
  /** In web-tree-sitter, hasError is a boolean property, not a method */
  hasError: boolean;
  child(index: number): SyntaxNode | null;
  namedChild(index: number): SyntaxNode | null;
  childForFieldName(name: string): SyntaxNode | null;
  descendantsOfType(type: string): SyntaxNode[];
  toString(): string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
}

let parser: TreeSitterParser;
let language: TreeSitterLanguage;

beforeAll(async () => {
  // Dynamic require because web-tree-sitter is CJS with async init
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Parser = await import('web-tree-sitter');
  const ParserClass = Parser.default ?? Parser;
  await ParserClass.init();

  const wasmPath = path.resolve(
    __dirname,
    '..',
    'tree-sitter-holoscript.wasm',
  );
  language = await ParserClass.Language.load(wasmPath);

  parser = new ParserClass() as unknown as TreeSitterParser;
  parser.setLanguage(language);
});

// ---------------------------------------------------------------------------
// Helper: parse and assert no errors
// ---------------------------------------------------------------------------
function parseValid(source: string): SyntaxNode {
  const tree = parser.parse(source);
  expect(tree.rootNode.hasError).toBe(false);
  return tree.rootNode;
}

// ===========================================================================
// 1. GRAMMAR RULES — Top-level definitions
// ===========================================================================

describe('Grammar Rules', () => {
  it('parses a composition block', () => {
    const root = parseValid(`
      composition "My Scene" {
        environment {
          skybox: "sky.hdr"
        }
      }
    `);
    expect(root.type).toBe('source_file');
    const comp = root.namedChildren[0];
    expect(comp.type).toBe('composition');
    const nameNode = comp.childForFieldName('name');
    expect(nameNode).not.toBeNull();
    expect(nameNode!.text).toContain('My Scene');
  });

  it('parses an object with traits', () => {
    const root = parseValid(`
      object "Cube" @grabbable @physics(mass: 5) {
        geometry: "cube"
        position: [0, 1, 0]
      }
    `);
    const obj = root.namedChildren[0];
    expect(obj.type).toBe('object');
    expect(obj.childForFieldName('name')!.text).toContain('Cube');
    // Should have trait_inline children
    const traits = obj.descendantsOfType('trait_inline');
    expect(traits.length).toBeGreaterThanOrEqual(2);
    expect(traits[0].childForFieldName('name')!.text).toBe('grabbable');
    expect(traits[1].childForFieldName('name')!.text).toBe('physics');
  });

  it('parses a world block', () => {
    const root = parseValid(`
      world "Overworld" @persistent {
        environment {
          gravity: 9.81
        }
      }
    `);
    const world = root.namedChildren[0];
    expect(world.type).toBe('world');
    expect(world.childForFieldName('name')!.text).toContain('Overworld');
    // Verify the environment sub-block is present
    const envs = world.descendantsOfType('environment');
    expect(envs.length).toBeGreaterThanOrEqual(1);
  });

  it('parses a template definition', () => {
    const root = parseValid(`
      template "Weapon" @equippable {
        damage: 10
        animation idle {
          loop: true
        }
      }
    `);
    const tmpl = root.namedChildren[0];
    expect(tmpl.type).toBe('template');
    expect(tmpl.childForFieldName('name')!.text).toContain('Weapon');
  });

  it('parses an entity with components', () => {
    const root = parseValid(`
      entity "Player" @networked {
        component Health {
          max: 100
          current: 100
        }
      }
    `);
    const entity = root.namedChildren[0];
    expect(entity.type).toBe('entity');
    // descendantsOfType matches both the component node and the keyword literal,
    // so filter to named nodes only
    const components = entity
      .descendantsOfType('component')
      .filter((n: SyntaxNode) => n.namedChildCount > 0);
    expect(components.length).toBe(1);
    expect(components[0].childForFieldName('name')!.text).toBe('Health');
  });
});

// ===========================================================================
// 2. HSPLUS — Modules, structs, enums, functions, imports
// ===========================================================================

describe('HSPlus Language Constructs', () => {
  it('parses module declarations', () => {
    const root = parseValid(`
      module GameState {
        let score = 0
        function reset() {
          score = 0
        }
      }
    `);
    const mod = root.namedChildren[0];
    expect(mod.type).toBe('module_declaration');
    expect(mod.childForFieldName('name')!.text).toBe('GameState');
  });

  it('parses struct definitions with typed fields', () => {
    const root = parseValid(`
      struct Vector3 {
        x: number,
        y: number,
        z: number
      }
    `);
    const struct = root.namedChildren[0];
    expect(struct.type).toBe('struct_definition');
    expect(struct.childForFieldName('name')!.text).toBe('Vector3');
    const fields = struct.descendantsOfType('typed_field');
    expect(fields.length).toBe(3);
  });

  it('parses enum definitions', () => {
    const root = parseValid(`
      enum Direction {
        NORTH,
        SOUTH,
        EAST = 3,
        WEST
      }
    `);
    const enumDef = root.namedChildren[0];
    expect(enumDef.type).toBe('enum_definition');
    expect(enumDef.childForFieldName('name')!.text).toBe('Direction');
    const members = enumDef.descendantsOfType('enum_member');
    expect(members.length).toBe(4);
  });

  it('parses import and export statements', () => {
    const root = parseValid(`
      import { Vector3, Quaternion } from "math"
      export function add(a: number, b: number): number {
        return a + b
      }
    `);
    const importStmt = root.namedChildren[0];
    expect(importStmt.type).toBe('import_statement');
    const exportStmt = root.namedChildren[1];
    expect(exportStmt.type).toBe('export_statement');
  });

  it('parses function declarations with typed parameters', () => {
    const root = parseValid(`
      function applyGravity(entity: Entity): void {
        let force = 9.81
      }
    `);
    const fn = root.namedChildren[0];
    expect(fn.type).toBe('function_declaration');
    expect(fn.childForFieldName('name')!.text).toBe('applyGravity');
    const params = fn.descendantsOfType('parameter');
    expect(params.length).toBe(1);
    expect(params[0].childForFieldName('name')!.text).toBe('entity');
    const returnType = fn.childForFieldName('return_type');
    expect(returnType).not.toBeNull();
    expect(returnType!.text).toBe('void');
  });
});

// ===========================================================================
// 3. NODE TYPES — Verify AST structure
// ===========================================================================

describe('Node Types', () => {
  it('produces correct node types for properties', () => {
    const root = parseValid(`
      object "Light" {
        color: #ff8800
        intensity: 2.5
        visible: true
        label: "main"
        tags: ["indoor", "warm"]
      }
    `);
    const props = root.descendantsOfType('property');
    expect(props.length).toBe(5);

    // color literal
    const colorVal = props[0].childForFieldName('value')!;
    expect(colorVal.type).toBe('color');
    expect(colorVal.text).toBe('#ff8800');

    // number
    const numVal = props[1].childForFieldName('value')!;
    expect(numVal.type).toBe('number');
    expect(numVal.text).toBe('2.5');

    // boolean
    const boolVal = props[2].childForFieldName('value')!;
    expect(boolVal.type).toBe('boolean');

    // string
    const strVal = props[3].childForFieldName('value')!;
    expect(strVal.type).toBe('string');

    // array
    const arrVal = props[4].childForFieldName('value')!;
    expect(arrVal.type).toBe('array');
  });

  it('produces correct node types for expressions', () => {
    const root = parseValid(`
      action compute(x: number) {
        let result = x * 2 + 1
        if (result > 10) {
          return result
        }
      }
    `);
    const binaryExprs = root.descendantsOfType('binary_expression');
    expect(binaryExprs.length).toBeGreaterThanOrEqual(2);

    const ifStmt = root.descendantsOfType('if_statement');
    expect(ifStmt.length).toBe(1);

    const returnStmt = root.descendantsOfType('return_statement');
    expect(returnStmt.length).toBe(1);
  });

  it('parses nested object hierarchies', () => {
    const root = parseValid(`
      composition "Nested" {
        spatial_group "Group1" {
          object "A" { position: [0,0,0] }
          spatial_group "SubGroup" {
            object "B" { position: [1,1,1] }
          }
        }
      }
    `);
    // descendantsOfType matches keyword literals and named nodes;
    // filter to nodes with children (the actual AST nodes, not keyword tokens)
    const spatialGroups = root
      .descendantsOfType('spatial_group')
      .filter((n: SyntaxNode) => n.namedChildCount > 0);
    expect(spatialGroups.length).toBe(2);
    const objects = root
      .descendantsOfType('object')
      .filter((n: SyntaxNode) => n.namedChildCount > 0);
    expect(objects.length).toBe(2);
  });
});

// ===========================================================================
// 4. QUERY PATTERNS — S-expression tree queries
// ===========================================================================

describe('Query Patterns', () => {
  it('captures composition names via query', () => {
    const root = parseValid(`
      composition "Alpha" {
        object "Box" { size: 1 }
      }
      composition "Beta" {
        object "Sphere" { radius: 0.5 }
      }
    `);
    const query = language.query('(composition name: (string) @comp.name)');
    const captures = query.captures(root);
    const names = captures
      .filter((c: QueryCapture) => c.name === 'comp.name')
      .map((c: QueryCapture) => c.node.text);
    expect(names).toContain('"Alpha"');
    expect(names).toContain('"Beta"');
  });

  it('captures object trait names via query', () => {
    const root = parseValid(`
      object "Player" @networked @grabbable @physics(mass: 80) {
        health: 100
      }
    `);
    const query = language.query('(trait_inline name: (identifier) @trait.name)');
    const captures = query.captures(root);
    const traitNames = captures
      .filter((c: QueryCapture) => c.name === 'trait.name')
      .map((c: QueryCapture) => c.node.text);
    expect(traitNames).toContain('networked');
    expect(traitNames).toContain('grabbable');
    expect(traitNames).toContain('physics');
  });

  it('captures property keys and values via query', () => {
    const root = parseValid(`
      object "Item" {
        weight: 5
        name: "Sword"
      }
    `);
    const query = language.query(
      '(property key: (identifier) @prop.key value: (_) @prop.value)',
    );
    const captures = query.captures(root);
    const keys = captures
      .filter((c: QueryCapture) => c.name === 'prop.key')
      .map((c: QueryCapture) => c.node.text);
    expect(keys).toContain('weight');
    expect(keys).toContain('name');
  });

  it('captures function declarations via query', () => {
    const root = parseValid(`
      function greet(name: string): void {
        log(name)
      }
      function add(a: number, b: number): number {
        return a + b
      }
    `);
    const query = language.query(
      '(function_declaration name: (identifier) @fn.name)',
    );
    const captures = query.captures(root);
    const fnNames = captures
      .filter((c: QueryCapture) => c.name === 'fn.name')
      .map((c: QueryCapture) => c.node.text);
    expect(fnNames).toContain('greet');
    expect(fnNames).toContain('add');
  });
});

// ===========================================================================
// 5. SYNTAX HIGHLIGHTING — Verify highlight query captures
// ===========================================================================

describe('Syntax Highlighting', () => {
  it('highlights keywords correctly', () => {
    const root = parseValid(`
      composition "Test" {
        object "Cube" @grabbable {
          position: [0, 0, 0]
        }
      }
    `);
    // Use a subset of the highlights query to test keyword captures
    const query = language.query(`
      ["composition" "object"] @keyword
    `);
    const captures = query.captures(root);
    const keywords = captures
      .filter((c: QueryCapture) => c.name === 'keyword')
      .map((c: QueryCapture) => c.node.text);
    expect(keywords).toContain('composition');
    expect(keywords).toContain('object');
  });

  it('highlights boolean and null literals', () => {
    const root = parseValid(`
      object "Config" {
        active: true
        debug: false
        parent: null
      }
    `);
    const query = language.query(`
      ["true" "false"] @constant.builtin.boolean
      (null) @constant.builtin
    `);
    const captures = query.captures(root);
    const boolCaptures = captures.filter(
      (c: QueryCapture) => c.name === 'constant.builtin.boolean',
    );
    const nullCaptures = captures.filter(
      (c: QueryCapture) => c.name === 'constant.builtin',
    );
    expect(boolCaptures.length).toBe(2);
    expect(nullCaptures.length).toBe(1);
  });

  it('highlights control flow keywords', () => {
    const root = parseValid(`
      action process(x: number) {
        if (x > 0) {
          return x
        } else {
          return 0
        }
      }
    `);
    const query = language.query(`
      ["if" "else" "return"] @keyword.control
    `);
    const captures = query.captures(root);
    const controlKeywords = captures
      .filter((c: QueryCapture) => c.name === 'keyword.control')
      .map((c: QueryCapture) => c.node.text);
    expect(controlKeywords).toContain('if');
    expect(controlKeywords).toContain('else');
    expect(controlKeywords).toContain('return');
  });
});

// ===========================================================================
// 6. DOMAIN BLOCKS — Verify domain-specific grammar rules
// ===========================================================================

describe('Domain-Specific Blocks', () => {
  it('parses IoT / digital twin blocks', () => {
    const root = parseValid(`
      sensor "TempProbe" {
        type: "thermocouple"
        binding: "mqtt://factory/temp"
      }
    `);
    const iot = root.namedChildren[0];
    expect(iot.type).toBe('iot_block');
  });

  it('parses material blocks with PBR properties', () => {
    const root = parseValid(`
      pbr_material "Steel" @metallic {
        roughness: 0.3
        metallic: 1.0
        baseColor: #888888
      }
    `);
    const mat = root.namedChildren[0];
    expect(mat.type).toBe('material_block');
    expect(mat.childForFieldName('name')!.text).toContain('Steel');
  });

  it('parses particle system blocks', () => {
    const root = parseValid(`
      particles "Sparks" @looping {
        rate: 500
        emission {
          rate: 200
        }
      }
    `);
    const particles = root.namedChildren[0];
    expect(particles.type).toBe('particle_block');
    // Filter to actual particle_module nodes (not keyword tokens)
    const modules = particles
      .descendantsOfType('particle_module')
      .filter((n: SyntaxNode) => n.namedChildCount > 0);
    expect(modules.length).toBe(1);
  });

  it('parses custom domain blocks', () => {
    // In the current WASM build, domain keywords like 'service' and 'queue'
    // are parsed via the custom_block catch-all rule. This validates
    // the extensible block mechanism works correctly.
    const root = parseValid(`
      service "UserAPI" {
        port: 3000
        base_path: "/api/v1"
      }
      queue "EmailQueue" {
        backend: "redis"
        max_retries: 3
      }
    `);
    // Both parse as custom_block (extensible domain block)
    expect(root.namedChildren[0].type).toBe('custom_block');
    expect(root.namedChildren[0].childForFieldName('kind')!.text).toBe('service');
    expect(root.namedChildren[0].childForFieldName('name')!.text).toContain('UserAPI');
    expect(root.namedChildren[1].type).toBe('custom_block');
    expect(root.namedChildren[1].childForFieldName('kind')!.text).toBe('queue');
  });
});

// ===========================================================================
// 7. ERROR RECOVERY — Verify parser handles malformed input
// ===========================================================================

describe('Error Recovery', () => {
  it('flags syntax errors for unclosed blocks', () => {
    const tree = parser.parse(`
      object "Broken" {
        position: [0, 0, 0]
    `);
    expect(tree.rootNode.hasError).toBe(true);
  });

  it('recovers and parses subsequent valid blocks after an error', () => {
    const tree = parser.parse(`
      object "Bad" {
      object "Good" {
        size: 1
      }
    `);
    // Root should have error, but "Good" object should still be parseable
    const objects = tree.rootNode.descendantsOfType('object');
    // At least one object should be found (the parser recovers)
    expect(objects.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 8. POSITION TRACKING — Verify source locations
// ===========================================================================

describe('Position Tracking', () => {
  it('tracks start and end positions of nodes', () => {
    const source = 'object "Cube" {\n  size: 1\n}';
    const root = parseValid(source);
    const obj = root.namedChildren[0];
    expect(obj.startPosition.row).toBe(0);
    expect(obj.startPosition.column).toBe(0);
    expect(obj.endPosition.row).toBe(2);
    expect(obj.endPosition.column).toBe(1);
  });
});
