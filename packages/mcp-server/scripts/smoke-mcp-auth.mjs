#!/usr/bin/env node

const baseUrl = (process.env.MCP_SMOKE_URL || 'https://mcp.holoscript.net').replace(/\/+$/, '');

async function postJson(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    // Keep null for non-JSON failure bodies.
  }
  return { response, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mcpBody = { jsonrpc: '2.0', method: 'tools/list', id: 1 };

const unauth = await postJson('/mcp', mcpBody);
assert(
  unauth.response.status === 401 && unauth.json?.message === 'Valid token required',
  `Expected unauthenticated /mcp to return 401 Valid token required, got ${unauth.response.status}`
);

const registration = await postJson('/oauth/register', {
  client_name: `mcp-auth-smoke-${Date.now()}`,
  redirect_uris: [],
  scope: 'tools:read',
  token_endpoint_auth_method: 'client_secret_post',
});
assert(registration.response.ok, `OAuth registration failed with ${registration.response.status}`);
assert(registration.json?.client_id, 'OAuth registration did not return client_id');
assert(registration.json?.client_secret, 'OAuth registration did not return client_secret');

const token = await postJson('/oauth/token', {
  grant_type: 'client_credentials',
  client_id: registration.json.client_id,
  client_secret: registration.json.client_secret,
  scope: 'tools:read',
});
assert(token.response.ok, `OAuth token exchange failed with ${token.response.status}`);
assert(token.json?.access_token, 'OAuth token exchange did not return access_token');

const authed = await postJson('/mcp', mcpBody, {
  Authorization: `Bearer ${token.json.access_token}`,
});
assert(authed.response.ok, `Authenticated /mcp tools/list failed with ${authed.response.status}`);
assert(Array.isArray(authed.json?.result?.tools), 'Authenticated /mcp did not return result.tools');
assert(authed.json.result.tools.length > 0, 'Authenticated /mcp returned an empty tools list');

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      unauthenticatedStatus: unauth.response.status,
      tokenType: token.json.token_type,
      scope: token.json.scope,
      toolCount: authed.json.result.tools.length,
    },
    null,
    2
  )
);
