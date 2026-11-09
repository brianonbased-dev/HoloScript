// Unit test for the 8477 DNS-rebinding guard. Run: node --test runtime/services/jetson-scope/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopbackHostOk, dashboardHandler } from './jetson-scope.mjs';

function fakeRes() {
  return {
    status: null, body: '',
    writeHead(code) { this.status = code; return this; },
    setHeader() {}, write(c) { if (c) this.body += c; },
    end(c) { if (c) this.body += c; },
  };
}
async function hit(host, url = '/icon.svg') {
  const res = fakeRes();
  await dashboardHandler({ headers: { host }, url, method: 'GET' }, res);
  return res;
}

test('loopbackHostOk accepts only loopback Host headers', () => {
  assert.equal(loopbackHostOk('127.0.0.1:8477'), true);
  assert.equal(loopbackHostOk('localhost:8477'), true);
  assert.equal(loopbackHostOk('evil.example:8477'), false);
  assert.equal(loopbackHostOk('127.0.0.1.evil.example:8477'), false);
  assert.equal(loopbackHostOk(undefined), false);
});

test('dashboardHandler returns 403 for a rebinding Host (evil.example:8477)', async () => {
  for (const url of ['/', '/api/state', '/icon.svg']) {
    const res = await hit('evil.example:8477', url);
    assert.equal(res.status, 403, url);
    assert.equal(res.body, 'forbidden');
  }
});

test('dashboardHandler serves loopback Hosts (127.0.0.1:8477, localhost:8477)', async () => {
  for (const host of ['127.0.0.1:8477', 'localhost:8477']) {
    const res = await hit(host);
    assert.equal(res.status, 200, host);
    assert.notEqual(res.body, 'forbidden');
  }
});