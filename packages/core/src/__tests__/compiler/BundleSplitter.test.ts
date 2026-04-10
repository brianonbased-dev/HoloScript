import { describe, it, expect } from 'vitest';
import { BundleSplitter } from '../../compiler/BundleSplitter';
import { HoloScriptPlusParser } from '../../parser/HoloScriptPlusParser';

describe('BundleSplitter', () => {
  const parser = new HoloScriptPlusParser();
  const splitter = new BundleSplitter();

  it('should identify dynamic imports in logic blocks', () => {
    const code = `
      object "MyObject" {
        logic {
          function loadModule() {
            const mod = import("feature-a");
          }
        }
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);

    const points = splitter.analyze(result.ast);
    expect(points).toHaveLength(1);
    expect(points[0].targetModule).toBe('feature-a');
    expect(points[0].type).toBe('dynamic_import');
  });

  it('should identify dynamic imports in event handlers', () => {
    const code = `
      object "MyObject" {
        logic {
            on_tick(1.0) {
                import("background-task");
            }
        }
      }
    `;
    const result = parser.parse(code);
    expect(result.success).toBe(true);

    const points = splitter.analyze(result.ast);
    expect(points).toHaveLength(1);
    expect(points[0].targetModule).toBe('background-task');
  });
});
