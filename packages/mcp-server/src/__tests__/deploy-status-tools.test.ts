import { describe, expect, it } from 'vitest';

import { storeScene } from '../renderer';

describe('deploy_status MCP tool', () => {
  it('returns stored deployment metadata by id', async () => {
    const scene = storeScene('composition "StatusTest" { object "Cube" { geometry: "cube" } }', {
      title: 'StatusTest',
      description: 'Deployment status test scene',
      author: 'copilot-agent',
      license: 'MIT',
      provenance: {
        hash: 'abc123',
        publishMode: 'original',
        imports: [],
      },
    });

    const handlers = await import('../handlers');
    const result = (await handlers.handleTool('deploy_status', {
      id: scene.id,
    })) as {
      success: boolean;
      id?: string;
      status?: string;
      title?: string;
      provenance?: { publishMode: string };
    };

    expect(result.success).toBe(true);
    expect(result.id).toBe(scene.id);
    expect(result.status).toBe('available');
    expect(result.title).toBe('StatusTest');
    expect(result.provenance?.publishMode).toBe('original');
  }, 20000);

  it('returns a not found error for unknown deployment id', async () => {
    const handlers = await import('../handlers');
    const result = (await handlers.handleTool('deploy_status', {
      id: 'missing123',
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('Deployment not found');
  }, 20000);
});