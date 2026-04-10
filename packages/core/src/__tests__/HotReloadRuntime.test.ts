import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { HoloScriptPlusRuntimeImpl } from '@holoscript/engine/runtime/HoloScriptPlusRuntime';

describe('Hot-Reload Runtime Migration', () => {
  let parser: HoloScriptPlusParser;
  let runtime: HoloScriptPlusRuntimeImpl;

  beforeEach(() => {
    parser = new HoloScriptPlusParser({ enableVRTraits: true });
  });

  it('should preserve state and run migrations during hot-reload', async () => {
    // 1. Initial State: Template v1
    const v1Code = `
      composition "World" {
        template "Counter" {
          @version(1)
          count: 0
          
          @on_tick {
            state.count = state.count + 1
          }
        }
        
        object "MyCounter" using "Counter" {
          position: [0, 0, 0]
        }
      }
    `;

    const v1Result = parser.parse(v1Code);
    expect(v1Result.success).toBe(true);

    runtime = new HoloScriptPlusRuntimeImpl(v1Result.ast, { devMode: true } as any);
    await runtime.mount({});

    // Simulate initial state
    runtime.state.set('count' as any, 10);
    expect(runtime.state.get('count' as any)).toBe(10);

    // 2. Hot-Reload: Template v2 with migration
    const v2Code = `
      composition "World" {
        template "Counter" {
          @version(2)
          @migrate from(1) {
            state.total = state.count * 2
          }
          
          count: 0
          total: 0
          
          @on_tick {
            state.count = state.count + 1
          }
        }
        
        object "MyCounter" using "Counter" {
          position: [0, 0, 0]
        }
      }
    `;

    const v2Result = parser.parse(v2Code);
    expect(v2Result.success).toBe(true);

    // Verify AST node has version and migrations
    const composition = v2Result.ast.body.find((c: any) => c.type === 'composition');
    const templateNode = composition?.children?.find((c: any) => c.type === 'template');

    expect(templateNode).toBeDefined();
    expect(templateNode.version).toBe(2);
    expect(templateNode.migrations?.length).toBe(1);

    // PERFORM HOT-RELOAD
    await runtime.hotReload(v2Result.ast);

    // 3. Verify Results
    // Original state should be preserved
    expect(runtime.state.get('count' as any)).toBe(10);

    // Migration should have run: total = count * 2 = 20
    expect(runtime.state.get('total' as any)).toBe(20);

    console.log('[Test] Hot-reload verified: count=10, total=20');
  });
});
