import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp, startServer } from '../src/index.js';
import { parseHoloScriptCode } from '../src/parseScene.js';

test('render-service startup contract exposes import graph exports', async () => {
  assert.equal(typeof createApp, 'function');
  assert.equal(typeof startServer, 'function');
  assert.equal(typeof parseHoloScriptCode, 'function');
});

test('render-service health endpoint is reachable after startup', async () => {
  const { server } = startServer({ port: 0 });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object' && 'port' in address);

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.parser, 'parseScene.js');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test('render-service parsed endpoint returns normalized scene data for shared scenes', async () => {
  const { server } = startServer({ port: 0 });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object' && 'port' in address);

    const shareResponse = await fetch(`http://127.0.0.1:${address.port}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'object "Cube" { geometry: "box" position: [1, 2, 3] color: "#ff00ff" }',
        title: 'Contract Scene',
      }),
    });

    assert.equal(shareResponse.status, 200);
    const shared = await shareResponse.json();
    assert.ok(shared.id);

    const parsedResponse = await fetch(
      `http://127.0.0.1:${address.port}/scene/${shared.id}/parsed`
    );
    assert.equal(parsedResponse.status, 200);

    const parsed = await parsedResponse.json();
    assert.equal(parsed.metadata.parser, 'render-service/minimal');
    assert.equal(parsed.metadata.objectCount, 1);
    assert.equal(parsed.objects[0].geometry, 'cube');
    assert.deepEqual(parsed.objects[0].position, [1, 2, 3]);
    assert.equal(parsed.objects[0].color, '#ff00ff');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
