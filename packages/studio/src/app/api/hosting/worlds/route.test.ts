import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/api/hosting/worlds', () => {
  it('returns hosted world inventory payload', async () => {
    const req = new Request('http://localhost/api/hosting/worlds');
    const response = await GET(req);
    const body = (await response.json()) as {
      provider: string;
      total: number;
      worlds: Array<{ id: string; status: string; liveUrl: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.provider).toBe('studio-hosting');
    expect(typeof body.total).toBe('number');
    expect(Array.isArray(body.worlds)).toBe(true);
  });
});
