/**
 * http_request tool — SSRF guard and spec contract.
 *
 * Verifies that private IPs, loopback, and non-HTTPS schemes are rejected
 * before any network call is made, and that the tool spec is present in
 * MESH_TOOLS with the correct shape.
 */
import { describe, it, expect } from 'vitest';
import { runTool, MESH_TOOLS } from '../tools.js';
import type { ToolUseBlock } from '@holoscript/llm-provider';

function httpUse(url: string): ToolUseBlock {
  return { type: 'tool_use', id: 'h1', name: 'http_request', input: { url } };
}

describe('http_request — SSRF guard', () => {
  const blocked = [
    'http://example.com',           // plain HTTP
    'ftp://example.com',            // wrong scheme
    'https://127.0.0.1/secret',     // loopback
    'https://localhost/admin',      // loopback by name
    'https://10.0.0.1/internal',    // RFC-1918 class A
    'https://192.168.1.1/router',   // RFC-1918 class C
    'https://172.16.0.1/db',        // RFC-1918 class B low
    'https://172.31.255.1/db',      // RFC-1918 class B high
    'https://169.254.169.254/meta', // AWS/GCP metadata
  ];

  for (const url of blocked) {
    it(`blocks "${url}"`, async () => {
      const res = await runTool(httpUse(url));
      expect(res.is_error).toBe(true);
      expect(res.content).toMatch(/blocked|only https|private|loopback|invalid/i);
    });
  }

  it('rejects a malformed URL', async () => {
    const res = await runTool(httpUse('not-a-url'));
    expect(res.is_error).toBe(true);
  });
});

describe('http_request — MESH_TOOLS spec', () => {
  it('is present in MESH_TOOLS', () => {
    const spec = MESH_TOOLS.find((t) => t.name === 'http_request');
    expect(spec).toBeDefined();
    expect(spec?.input_schema.required).toContain('url');
  });
});
