import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { createRuntime, NodeInstance } from '@holoscript/engine/runtime/HoloScriptPlusRuntime';

describe('HotReloadIntegrated', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  const mockRenderer = {
    createElement: vi.fn((type, props) => ({ type, props })),
    updateElement: vi.fn(),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    destroy: vi.fn(),
  };

  it('should preserve state and run migrations on template reload', async () => {
    const codeV1 = `
template "UserOrb" {
  @version(1)
  @state {
    points: 10
  }
  
  cube {
    color: "#ff0000"
  }
}

UserOrb #player {}
`;

    const resultV1 = parser.parse(codeV1);
    const runtime = createRuntime(resultV1.ast, { renderer: mockRenderer as any });
    runtime.mount({});

    const player = (runtime as any).findInstanceById('player');
    expect(player).toBeDefined();
    expect(player.templateName).toBe('UserOrb');
    expect(runtime.state.get('points' as any)).toBe(10);

    // Update state manually
    runtime.state.set('points' as any, 25);
    expect(runtime.state.get('points' as any)).toBe(25);

    const codeV2 = `
template "UserOrb" {
  @version(2)
  @migrate from(1) {
    state.points = state.points + 100;
  }
  
  @state {
    points: 10
  }
  
  cube {
    color: "#00ff00"
  }
}

UserOrb #player {}
`;

    console.log('DEBUG: Parsing codeV2...');
    const resultV2 = parser.parse(codeV2);
    console.log('DEBUG: Parser errors:', JSON.stringify(resultV2.errors));
    console.log('DEBUG: Calling hotReload...');
    await runtime.hotReload(resultV2.ast);
    console.log('DEBUG: hotReload complete.');

    // State should be 25 (preserved) + 100 (migration) = 125
    expect(runtime.state.get('points' as any)).toBe(125);

    // Verify template version updated
    console.log('DEBUG: Checking template version. Current version:', player.templateVersion);
    expect(player.templateVersion).toBe(2);
  });

  it('should handle global @version and @migrate', async () => {
    // This test verifies top-level program migration if needed,
    // though currently hotReload focus is on templates.
    const codeV1 = `
@version(1)
orb cube_1 {
  points: 10
}
`;
    const resultV1 = parser.parse(codeV1);
    const runtime = createRuntime(resultV1.ast, { renderer: mockRenderer as any });
    runtime.mount({});

    // Update state
    runtime.state.set('points' as any, 10);

    const codeV2 = `
@version(2)
@migrate from(1) {
  state.points = state.points * 2;
}
orb cube_1 {
  points: 10
}
`;
    const resultV2 = parser.parse(codeV2);
    await runtime.hotReload(resultV2.ast);

    // State should be 10 * 2 = 20
    expect(runtime.state.get('points' as any)).toBe(20);
    expect((runtime as any).ast.version).toBe(2);
  });
});
