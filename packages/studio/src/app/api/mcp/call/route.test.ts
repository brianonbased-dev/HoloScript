import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const VALID_WORLD_HOLO = `composition "GeneratedWorld" {
  environment {
    world_asset: "https://assets.example/world.splat"
    format: "3dgs"
    bounds: [0, 0, 0, 1, 1, 1]
  }
  object "Camera" {
    position: [0, 1.7, 0]
    @tracked
  }
}`;

const SURFACE_ONLY_SCENE = `composition "SurfaceOnly" {
  hero "Scene Card" {
    title: "A beautiful world"
  }
}`;

describe('/api/mcp/call generated output gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects surface-only generate_scene output from the proxy response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: { code: SURFACE_ONLY_SCENE } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const response = await POST(makeRequest('generate_scene'));
    const body = (await response.json()) as {
      generatedOutputValid?: boolean;
      validationErrors?: string[];
    };

    expect(response.status).toBe(422);
    expect(body.generatedOutputValid).toBe(false);
    expect(body.validationErrors).toContain(
      'Generated HoloScript parsed but produced no core scene/world primitives'
    );
  });

  it('accepts generate_world output only after core primitives are detected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: { holoCode: VALID_WORLD_HOLO } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const response = await POST(makeRequest('generate_world'));
    const body = (await response.json()) as {
      result?: {
        generatedOutputValidation?: {
          valid?: boolean;
          corePrimitives?: { objects?: number; total?: number };
        };
      };
    };

    expect(response.status).toBe(200);
    expect(body.result?.generatedOutputValidation?.valid).toBe(true);
    expect(body.result?.generatedOutputValidation?.corePrimitives?.objects).toBe(1);
    expect(body.result?.generatedOutputValidation?.corePrimitives?.total).toBeGreaterThan(0);
  });
});

function makeRequest(tool: string): Request {
  return new Request('http://localhost/api/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input: {} }),
  });
}
