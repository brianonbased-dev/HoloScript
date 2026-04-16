import { describe, it, expect } from 'vitest';

import { createApp, startServer } from '../src/index.js';
import { parseHoloScriptCode } from '../src/parseScene.js';

describe('render-service startup contract', () => {
  it('exposes import graph exports', async () => {
    expect(typeof createApp).toBe('function');
    expect(typeof startServer).toBe('function');
    expect(typeof parseHoloScriptCode).toBe('function');
  });

  it('health endpoint is reachable after startup', async () => {
    const { server } = startServer({ port: 0 });

    try {
      const address = server.address();
      expect(address && typeof address === 'object' && 'port' in address).toBe(true);

      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.parser).toBe('parseScene.js');
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('parsed endpoint returns normalized scene data for shared scenes', async () => {
    const { server } = startServer({ port: 0 });

    try {
      const address = server.address();
      expect(address && typeof address === 'object' && 'port' in address).toBe(true);

      const shareResponse = await fetch(`http://127.0.0.1:${address.port}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'object "Cube" { geometry: "box" position: [1, 2, 3] color: "#ff00ff" }',
          title: 'Contract Scene',
        }),
      });

      expect(shareResponse.status).toBe(200);
      const shared = await shareResponse.json();
      expect(Boolean(shared.id)).toBe(true);

      const parsedResponse = await fetch(
        `http://127.0.0.1:${address.port}/scene/${shared.id}/parsed`
      );
      expect(parsedResponse.status).toBe(200);

      const parsed = await parsedResponse.json();
      expect(parsed.metadata.parser).toBe('render-service/minimal');
      expect(parsed.metadata.objectCount).toBe(1);
      expect(parsed.objects[0].geometry).toBe('cube');
      expect(parsed.objects[0].position).toEqual([1, 2, 3]);
      expect(parsed.objects[0].color).toBe('#ff00ff');
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
