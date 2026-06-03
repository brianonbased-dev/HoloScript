#!/usr/bin/env node
// Tests for scripts/connect.mjs — the external-client connector source of truth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClient, CLIENTS, ENDPOINT, TOKEN_ENV } from '../connect.mjs';

test('every client builds a config in all four modes', () => {
  for (const id of Object.keys(CLIENTS)) {
    for (const opts of [{}, { local: true }, { noAuth: true }, { token: 'JWT' }]) {
      const r = buildClient(id, opts);
      assert.ok(r.config, `${id} built config for ${JSON.stringify(opts)}`);
      assert.ok(
        !JSON.stringify(r.config).includes('undefined'),
        `${id} emits no literal "undefined" for ${JSON.stringify(opts)}`
      );
    }
  }
});

test('default config uses the env-var placeholder, never a blank token', () => {
  for (const id of Object.keys(CLIENTS)) {
    const blob = JSON.stringify(buildClient(id).config);
    assert.ok(blob.includes(TOKEN_ENV), `${id} references ${TOKEN_ENV}`);
  }
});

test('--token inlines the bearer token into remote configs', () => {
  const blob = JSON.stringify(buildClient('cursor', { token: 'SECRET123' }).config);
  assert.ok(blob.includes('SECRET123'));
  assert.ok(!blob.includes(TOKEN_ENV));
});

test('--no-auth strips every Authorization header', () => {
  for (const id of Object.keys(CLIENTS)) {
    const blob = JSON.stringify(buildClient(id, { noAuth: true }).config);
    assert.ok(!blob.includes('Authorization'), `${id} omits Authorization under --no-auth`);
  }
});

test('every remote config points at the canonical endpoint', () => {
  for (const id of Object.keys(CLIENTS)) {
    const blob = JSON.stringify(buildClient(id).config);
    assert.ok(blob.includes(ENDPOINT), `${id} uses ${ENDPOINT}`);
  }
});

test('client-specific config shapes are correct', () => {
  // VS Code uses `servers` + a `type` discriminator, not `mcpServers`.
  const vscode = buildClient('vscode').config;
  assert.ok(vscode.servers?.holoscript, 'vscode uses servers key');
  assert.equal(vscode.servers.holoscript.type, 'http');

  // Windsurf uses `serverUrl`.
  const windsurf = buildClient('windsurf').config;
  assert.equal(windsurf.mcpServers.holoscript.serverUrl, ENDPOINT);

  // Zed nests under context_servers.<name>.command.
  const zed = buildClient('zed').config;
  assert.ok(zed.context_servers?.holoscript?.command, 'zed nests under context_servers');

  // Claude Code returns a shell command string.
  const cc = buildClient('claude-code');
  assert.equal(cc.shape, 'shell');
  assert.equal(typeof cc.config, 'string');
  assert.ok(cc.config.startsWith('claude mcp add'));
});

test('unknown client id throws with a helpful message', () => {
  assert.throws(() => buildClient('nope'), /Unknown client/);
});

test('--local switches to a stdio install for config-shaped clients', () => {
  const r = buildClient('cursor', { local: true });
  const blob = JSON.stringify(r.config);
  assert.ok(blob.includes('@holoscript/mcp-server'), 'local mode references the npm package');
  assert.ok(!blob.includes('mcp-remote'), 'local mode does not use the remote bridge');
});
