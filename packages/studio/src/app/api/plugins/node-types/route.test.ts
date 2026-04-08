import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/api/plugins/node-types', () => {
  it('returns custom node templates for plugin SDK surface', async () => {
    const response = await GET();
    const body = (await response.json()) as { nodeTypes: Array<{ id: string; expression: string; arity: number }> };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.nodeTypes)).toBe(true);
    expect(body.nodeTypes.length).toBeGreaterThan(0);
    expect(body.nodeTypes[0]?.id).toBeTruthy();
    expect(body.nodeTypes[0]?.expression).toContain('{a}');
  });
});
