#!/usr/bin/env node
/**
 * Stored MCP client credentials (card tools-codebase-scope, Option 1): callers
 * use an admin-provisioned client from env or Windows Credential Manager and
 * skip self-registration; without one they register from loopback with a
 * redirect URI (an empty list is refused by the server).
 *
 * Run: node scripts/__tests__/stored-mcp-client.test.mjs
 */
import assert from 'node:assert/strict';
import {
  DEV_LOOPBACK_REDIRECT_URI,
  readStoredMcpClient,
  readWindowsCredential,
} from '../lib/stored-mcp-client.mjs';
import { getMcpAccessToken, HOLOSHELL_STORED_CLIENT } from '../holoshell-local-codebase-absorb-bundle.mjs';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
}

const ids = { idVar: 'X_ID', secretVar: 'X_SECRET', credentialTarget: 'holoscript/mcp-client/x' };
const noCred = () => null;

await test('env wins and is trimmed', () => {
  const c = readStoredMcpClient({ ...ids, env: { X_ID: ' hsc_a ', X_SECRET: 's' }, readCredential: () => assert.fail('no cred read') });
  assert.deepEqual(c, { clientId: 'hsc_a', clientSecret: 's', source: 'env' });
});

await test('half-set env falls through to Credential Manager', () => {
  let asked;
  const c = readStoredMcpClient({ ...ids, env: { X_ID: 'hsc_a' }, readCredential: (t) => ((asked = t), { clientId: 'hsc_c', clientSecret: 'cs' }) });
  assert.equal(asked, 'holoscript/mcp-client/x');
  assert.deepEqual(c, { clientId: 'hsc_c', clientSecret: 'cs', source: 'credential-manager' });
});

await test('nothing stored -> null', () => {
  assert.equal(readStoredMcpClient({ ...ids, env: {}, readCredential: noCred }), null);
});

await test('readWindowsCredential is a no-op off Windows and parses the PowerShell reply on Windows', () => {
  assert.equal(readWindowsCredential('t', { platform: 'linux', spawn: () => assert.fail('spawned') }), null);
  let env;
  const ok = readWindowsCredential('holoscript/mcp-client/x', {
    platform: 'win32',
    spawn: (_cmd, _args, opts) => ((env = opts.env), { status: 0, stdout: '{"u":"hsc_w","p":"wp"}' }),
  });
  assert.equal(env.HOLO_CRED_TARGET, 'holoscript/mcp-client/x');
  assert.deepEqual(ok, { clientId: 'hsc_w', clientSecret: 'wp' });
  assert.equal(readWindowsCredential('t', { platform: 'win32', spawn: () => ({ status: 3, stdout: '' }) }), null);
});

function fakePost() {
  const calls = [];
  const post = async (_base, path, body) => {
    calls.push({ path, body });
    if (path === '/oauth/register') return { response: { ok: true, status: 201 }, json: { client_id: 'hsc_dev', client_secret: 'dev' }, text: '' };
    return { response: { ok: true, status: 200 }, json: { access_token: 'at' }, text: '' };
  };
  return { post, calls };
}

await test('holoshell: stored client skips /oauth/register', async () => {
  const { post, calls } = fakePost();
  const r = await getMcpAccessToken({ mcpUrl: 'http://mcp.test/' }, { post, stored: { clientId: 'hsc_s', clientSecret: 'ss' } });
  assert.equal(r.accessToken, 'at');
  assert.deepEqual(calls.map((c) => c.path), ['/oauth/token']);
  assert.equal(calls[0].body.client_id, 'hsc_s');
  assert.equal(calls[0].body.scope, 'tools:codebase');
});

await test('holoshell: dev fallback registers with a loopback redirect URI, never []', async () => {
  const { post, calls } = fakePost();
  await getMcpAccessToken({ mcpUrl: 'http://127.0.0.1:3000' }, { post, stored: null });
  assert.deepEqual(calls.map((c) => c.path), ['/oauth/register', '/oauth/token']);
  assert.deepEqual(calls[0].body.redirect_uris, [DEV_LOOPBACK_REDIRECT_URI]);
  assert.deepEqual(calls[0].body.grant_types, ['client_credentials']);
  assert.equal(calls[1].body.client_id, 'hsc_dev');
});

await test('holoshell stored-client names', () => {
  assert.deepEqual(HOLOSHELL_STORED_CLIENT, {
    idVar: 'MCP_CLIENT_ID_HOLOSHELL',
    secretVar: 'MCP_CLIENT_SECRET_HOLOSHELL',
    credentialTarget: 'holoscript/mcp-client/holoshell-absorb',
  });
});

console.log(`\n${passed} passed`);