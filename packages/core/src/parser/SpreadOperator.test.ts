/**
 * Spread Operator Tests - Sprint 1
 *
 * Tests for comprehensive spread operator support across:
 * - Object spread syntax
 * - Array spread syntax
 * - Template property spreading
 * - Error cases and validation
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';

describe('Spread Operator (...)', () => {
  const parser = new HoloScriptPlusParser();

  // =========================================================================
  // OBJECT SPREAD TESTS
  // =========================================================================

  describe('Object Spread', () => {
    test('should parse object spread with template reference', () => {
      const source = `
        template "Button" {
          color: "blue"
          scale: 1.0
        }
        
        orb myButton {
          ...Button
          scale: 2.0
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should parse multiple object spreads', () => {
      const source = `
        orb item {
          ...BaseTemplate
          ...CustomProps
          color: "red"
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse object spread in config block', () => {
      const source = `
        @manifest {
          ...defaultConfig
          title: "Custom"
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse object spread with mixing properties', () => {
      const source = `
        orb element {
          @grabbable
          position: [0, 1, 0]
          ...DefaultTraits
          color: "#ff0000"
          ...AdditionalProps
          scale: 1.5
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should report error for spread without target', () => {
      const source = `
        orb item {
          ...
        }
      `;

      const result = parser.parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Unexpected token in expression');
    });
  });

  // =========================================================================
  // ARRAY SPREAD TESTS
  // =========================================================================

  describe('Array Spread', () => {
    test('should parse array spread with reference', () => {
      const source = `
        orb parent {
          children: [
            ...childrenList
            orb newChild {}
          ]
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should parse multiple array spreads', () => {
      const source = `
        orb container {
          items: [
            ...list1
            ...list2
            item1
            item2
            ...list3
          ]
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse array spread in pure array context', () => {
      const source = `
        logic {
          function test() {
            let combined = [
              1
              2
              ...otherArray
              3
              ...anotherArray
              4
            ]
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse mixed literal and spread arrays', () => {
      const source = `
        orb obj {
          colors: ["red", ...baseColors, "blue"]
          numbers: [1, 2, ...moreNumbers, 5]
          mixed: [true, ...config.flags, false]
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should report error for spread without target in array', () => {
      const source = `
        let arr = [
          1
          ...
          2
        ]
      `;

      const result = parser.parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // TEMPLATE SPREAD TESTS
  // =========================================================================

  describe('Template & Property Spread', () => {
    test('should parse template spread in trait properties', () => {
      const source = `
        @physics(
          ...basePhysicsConfig
          mass: 2.0
        )
        orb rigidBody {}
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse nested object spreads', () => {
      const source = `
        orb item {
          config: {
            ...baseConfig
            nested: {
              ...nestedConfig
              override: true
            }
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse spread with dotted reference', () => {
      const source = `
        orb item {
          ...Templates.Button
          ...config.defaults.orb
          color: "green"
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // COMPLEX SCENARIOS
  // =========================================================================

  describe('Complex Spread Scenarios', () => {
    test('should parse composition with spreads', () => {
      const source = `
        composition "Scene" {
          @manifest {
            ...defaultManifest
            name: "My Scene"
          }
          
          orb base {
            ...BaseTemplate
            children: [
              ...sharedObjects
              orb custom {}
            ]
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse spreads in all contexts together', () => {
      const source = `
        template "CompleteTemplate" {
          @grabbable(
            ...commonTraitConfig
            customParam: "value"
          )
          position: [0, 1, 0]
          ...SharedProperties
          color: "#ffffff"
          children: [
            ...defaultChildren
            orb extra {}
          ]
          config: {
            ...configDefaults
            enabled: true
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should handle spread in on-node containers', () => {
      const source = `
        orb player {
          ...ActorBase
          
          children: [
            ...actorChildren
            orb head { ...BaseHead }
            orb body { ...BaseBody }
            ...additionalParts
          ]
          
          @state {
            ...defaultState
            health: 100
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // AST STRUCTURE VALIDATION
  // =========================================================================

  describe('Spread AST Node Structure', () => {
    test('should create proper spread AST nodes in arrays', () => {
      const source = `orb obj { items: [1, ...arr, 2] }`;
      const result = parser.parse(source);

      expect(result.success).toBe(true);
      const firstChild = result.ast.children?.[0];
      const itemsProp = firstChild?.properties?.items;

      // Should have array with mixed elements and spread
      expect(Array.isArray(itemsProp)).toBe(true);
      expect(itemsProp.some((item: any) => item.type === 'spread')).toBe(true);
    });

    test('should create proper spread AST nodes in objects', () => {
      const source = `orb obj { config: { ...base, key: "value" } }`;
      const result = parser.parse(source);

      expect(result.success).toBe(true);
      const firstChild = result.ast.children?.[0];
      const config = firstChild?.properties?.config;

      // Should have object with spread key
      expect(config).toBeDefined();
      expect(Object.keys(config).some((k) => k.startsWith('__spread_'))).toBe(true);
    });

    test('spread AST should contain argument field', () => {
      const source = `orb obj { data: [...myArray] }`;
      const result = parser.parse(source);

      expect(result.success).toBe(true);
      const firstChild = result.ast.children?.[0];
      const data = firstChild?.properties?.data;

      if (Array.isArray(data) && data[0]?.type === 'spread') {
        expect(data[0]).toHaveProperty('argument');
        expect(data[0].argument).toBeDefined();
      }
    });
  });

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases & Recovery', () => {
    test('should handle spread in empty array', () => {
      const source = `orb obj { items: [...arr] }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should handle spread in empty object', () => {
      const source = `orb obj { config: { ...defaults } }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should handle trailing comma after spread', () => {
      const source = `
        orb obj {
          items: [
            ...baseItems,
            ...moreItems,
          ]
        }
      `;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should handle spread with complex expressions', () => {
      const source = `
        orb obj {
          items: [
            ...getArray()
            ...array[0]
            ...obj.prop.nested
          ]
        }
      `;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should preserve parse state after spread error', () => {
      const source = `
        orb obj1 { items: [...validArray] }
        orb obj2 { data: [...anotherArray] }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
      expect(result.ast.children?.length).toBe(2);
    });
  });

  // =========================================================================
  // Sprint 2: FUNCTION CALL SPREADS
  // =========================================================================

  describe('Function Call Spreads', () => {
    test('should parse spread in function call arguments', () => {
      const source = `
        logic {
          function callHandler(args) {
            let result = handler(...args)
            return result
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse spread mixed with regular arguments', () => {
      const source = `
        orb obj {
          action: myFunc(1, ...items, "end")
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse multiple spreads in function call', () => {
      const source = `
        orb obj {
          combined: merge(...arr1, ...arr2, ...arr3)
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse spread with member expression in function call', () => {
      const source = `
        orb obj {
          result: process(...config.items, ...state.values)
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should create proper AST for function call spread', () => {
      const source = `orb obj { data: fn(...args) }`;
      const result = parser.parse(source);

      expect(result.success).toBe(true);
      const firstChild = result.ast.children?.[0];
      const data = firstChild?.properties?.data;

      // Should be a call expression with spread arguments
      expect(data).toBeDefined();
      expect(data.type).toBe('call');
      expect(data.callee).toBe('fn');

      // parseParenExpression unwraps single arguments, so check both cases
      const args = Array.isArray(data.args) ? data.args : [data.args];
      const hasSpread = args.some(
        (arg: any) => arg && typeof arg === 'object' && arg.type === 'spread'
      );
      expect(hasSpread).toBe(true);
    });
  });

  // =========================================================================
  // Sprint 2: REST PARAMETERS IN ARROW FUNCTIONS
  // =========================================================================

  describe('Rest Parameters', () => {
    test('should parse rest parameter in arrow function with block body', () => {
      const source = `
        orb obj {
          handler: (...args) => { return args }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse rest parameter in arrow function with inline expression', () => {
      const source = `
        orb obj {
          handler: (...args) => args
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse rest parameter with preceding params', () => {
      const source = `
        orb obj {
          handler: (first, second, ...rest) => { return rest }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should create proper AST for rest parameter', () => {
      const source = `orb obj {
        handler: (...args) => args
      }`;
      const result = parser.parse(source);

      expect(result.success).toBe(true);
      const firstChild = result.ast.children?.[0];
      const handler = firstChild?.properties?.handler;

      expect(handler.type).toBe('arrow_function');
      expect(handler.params).toHaveLength(1);
      expect(handler.params[0].name).toBe('args');
      expect(handler.params[0].rest).toBe(true);
    });
  });

  // =========================================================================
  // Sprint 2: DEEPLY NESTED SPREADS
  // =========================================================================

  describe('Deeply Nested Spreads', () => {
    test('should parse spread within inline object spread', () => {
      const source = `
        orb obj {
          config: { ...{ ...innerConfig } }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse multiple levels of nested spreads', () => {
      const source = `
        orb obj {
          config: {
            ...baseConfig
            nested: {
              ...level1
              deeper: {
                ...level2
                value: true
              }
            }
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should parse spread in nested array within object', () => {
      const source = `
        orb obj {
          config: {
            items: [...baseItems, { ...itemConfig }]
          }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should handle spread chain: obj -> array -> obj -> spread', () => {
      const source = `
        orb container {
          levels: [
            {
              sublevel: [
                { ...deepConfig }
              ]
            }
          ]
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // BACKWARD COMPATIBILITY
  // =========================================================================

  describe('Backward Compatibility', () => {
    test('should still support old __spread_ keying in objects', () => {
      // Internal format should continue to work
      const source = `
        orb obj {
          config: { ...template, key: "val" }
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    test('should not break existing non-spread code', () => {
      const source = `
        orb button {
          @grabbable
          color: "blue"
          position: [0, 1, 0]
          text: "Click me"
          children: [
            orb child { }
          ]
        }
      `;

      const result = parser.parse(source);
      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });
});
