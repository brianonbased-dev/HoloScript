import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readFixture(name) {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');
}

async function withServer(run) {
  const { server } = startServer({ port: 0 });
  try {
    const address = server.address();
    expect(address && typeof address === 'object' && 'port' in address).toBe(true);
    await run(address.port);
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) rejectClose(error);
        else resolveClose();
      });
    });
  }
}

async function shareScene(port, code) {
  const shareResponse = await fetch(`http://127.0.0.1:${port}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, title: 'Fixture Scene' }),
  });
  expect(shareResponse.status).toBe(200);
  const shared = await shareResponse.json();
  expect(Boolean(shared.id)).toBe(true);
  return shared.id;
}

describe('parsed endpoint regression', () => {
  it('returns stable diagnostics shape for valid fixture', async () => {
    await withServer(async (port) => {
      const validCode = readFixture('valid-scene.holo');
      const sceneId = await shareScene(port, validCode);

      const parsedResponse = await fetch(`http://127.0.0.1:${port}/scene/${sceneId}/parsed`);
      expect(parsedResponse.status).toBe(200);

      const parsed = await parsedResponse.json();
      expect(parsed.metadata.parser).toBe('render-service/minimal');
      expect(parsed.metadata.objectCount).toBe(2);

      expect(Boolean(parsed.metadata.diagnostics)).toBe(true);
      expect(Array.isArray(parsed.metadata.diagnostics.errors)).toBe(true);
      expect(Array.isArray(parsed.metadata.diagnostics.warnings)).toBe(true);
      expect(typeof parsed.metadata.diagnostics.sourceLength).toBe('number');

      expect(parsed.metadata.diagnostics.errors.length).toBe(0);
      expect(parsed.metadata.diagnostics.warnings.length).toBe(0);
    });
  });

  it('returns stable diagnostics shape for invalid fixture', async () => {
    await withServer(async (port) => {
      const invalidCode = readFixture('invalid-scene.holo');
      const sceneId = await shareScene(port, invalidCode);

      const parsedResponse = await fetch(`http://127.0.0.1:${port}/scene/${sceneId}/parsed`);
      expect(parsedResponse.status).toBe(200);

      const parsed = await parsedResponse.json();
      expect(parsed.metadata.parser).toBe('render-service/minimal');

      expect(Boolean(parsed.metadata.diagnostics)).toBe(true);
      expect(Array.isArray(parsed.metadata.diagnostics.errors)).toBe(true);
      expect(Array.isArray(parsed.metadata.diagnostics.warnings)).toBe(true);
      expect(typeof parsed.metadata.diagnostics.sourceLength).toBe('number');

      expect(parsed.metadata.diagnostics.errors.length).toBe(0);
      expect(parsed.metadata.diagnostics.warnings.length >= 1).toBe(true);

      const warning = parsed.metadata.diagnostics.warnings[0];
      expect(warning.code).toBe('NO_OBJECTS_PARSED');
      expect(warning.severity).toBe('warning');
      expect(typeof warning.message).toBe('string');
    });
  });
});
