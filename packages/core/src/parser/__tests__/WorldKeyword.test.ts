import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

describe('HoloScriptPlusParser - World Keyword', () => {
  it('should parse a top-level world node', () => {
    const code = `
      world #myWorld {
        @world_generator(prompt: "cyberpunk city")
      }
    `;
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);
    
    expect(result.success).toBe(true);
    expect(result.ast.children[0].type).toBe('world');
    expect(result.ast.children[0].traits.has('world_generator')).toBe(true);
  });

  it('should parse a world node nested in a composition', () => {
    const code = `
      composition "MyScene" {
        world #background {
          @world_generator(prompt: "desert ruins")
        }
        cube #box {
          @position(0, 1, 0)
        }
      }
    `;
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);
    
    if (!result.success) {
      console.log('Parser errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.success).toBe(true);
    const composition = result.ast.children[0];
    expect(composition.type).toBe('composition');
    const world = composition.children.find(c => c.type === 'world');
    expect(world).toBeDefined();
    expect(world?.traits.has('world_generator')).toBe(true);
  });
});
