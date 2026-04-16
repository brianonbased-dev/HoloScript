import { describe, expect, it, beforeEach, vi } from 'vitest';
import { R3FCompiler } from '../R3FCompiler';
import { HoloComposition } from '../../../parser/HoloCompositionTypes';

// Mock RBAC to allow compiler access
vi.mock('../../../identity/AgentRBAC', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getRBAC: () => ({ 
      checkAccess: () => ({ allowed: true }) 
    }),
  };
});

describe('R3FCompiler World Support', () => {
  let compiler: R3FCompiler;

  beforeEach(() => {
    compiler = new R3FCompiler();
  });

  it('should compile a top-level world block with ambient light and gravity', () => {
    const composition: HoloComposition = {
      name: 'TestComposition',
      worlds: [
        {
          type: 'world',
          id: 'main-world',
          properties: [
            { key: 'ambient_light', value: 0.5 },
            { key: 'gravity', value: 9.81 },
            { key: 'skybox_color', value: '#ff0000' }
          ]
        }
      ],
      children: []
    };

    const result = compiler.compileComposition(composition as any);

    // Check for ambientLight
    const ambientLight = result.children!.find(c => c.type === 'ambientLight');
    expect(ambientLight).toBeDefined();
    expect(ambientLight!.props.intensity).toBe(0.5);

    // Check for Physics (gravity)
    const physics = result.children!.find(c => c.type === 'Physics');
    expect(physics).toBeDefined();
    expect(physics!.props.gravity).toEqual([0, -9.81, 0]);

    // Check for skybox Environment
    const environment = result.children!.find(c => c.type === 'Environment');
    expect(environment).toBeDefined();
    expect(environment!.props.background).toBe(true);

    // Check for background color
    const color = result.children!.find(c => c.type === 'color' && c.props.attach === 'background');
    expect(color).toBeDefined();
    expect(color!.props.args).toEqual(['#ff0000']);
  });
});
