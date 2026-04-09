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
