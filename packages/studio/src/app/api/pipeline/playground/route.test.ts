import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const validPipeline = `pipeline "InventorySync" {
  source Inventory {
    type: "list"
    items: [{ sku: "A-100", qty: 3 }]
  }

  transform MapFields {
    sku -> productId
    qty -> stock
  }

  sink Out {
    type: "stdout"
  }
}`;

describe('/api/pipeline/playground', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns endpoint metadata on GET', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.endpoint).toBe('/api/pipeline/playground');
  });

  it('parses valid pipeline input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, pipeline: { name: 'InventorySync' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const request = new Request('http://localhost/api/pipeline/playground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'parse', code: validPipeline }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pipeline.name).toBe('InventorySync');
  });

  it('returns 400 for failed compile response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, errors: [{ message: 'compile failed' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const request = new Request('http://localhost/api/pipeline/playground', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'compile', code: validPipeline }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors[0].message).toContain('compile failed');
  });
});
