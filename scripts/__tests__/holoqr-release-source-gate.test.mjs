import assert from 'node:assert/strict';
import test from 'node:test';
import { runHoloScriptSourceGate } from '../../apps/quest-universal-qr-scanner/scripts/build-release.mjs';

const quietLogger = { log() {}, error() {} };

test('HoloQR source gate compiles HoloScript before independently checking native output', () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  };

  const result = runHoloScriptSourceGate({
    spawn,
    nodePath: 'node-test',
    tsxCliPath: 'tsx-test',
    stdio: 'pipe',
    logger: quietLogger,
  });

  assert.deepEqual(result, { ok: true, status: 0 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'node-test');
  assert.equal(calls[0].args[0], 'tsx-test');
  assert.match(calls[0].args[1], /quest-universal-qr-scanner[\\/]generate-native\.mts$/);
  assert.equal(calls[1].command, 'node-test');
  assert.equal(calls[1].args[0], 'tsx-test');
  assert.match(calls[1].args[1], /check-quest-mr-emit-matches-reference\.mts$/);
});

test('HoloQR source gate fails closed when HoloScript compilation fails', () => {
  let calls = 0;
  const result = runHoloScriptSourceGate({
    spawn: () => {
      calls += 1;
      return { status: 7 };
    },
    nodePath: 'node-test',
    tsxCliPath: 'tsx-test',
    stdio: 'pipe',
    logger: quietLogger,
  });

  assert.deepEqual(result, { ok: false, status: 7 });
  assert.equal(calls, 1);
});

test('HoloQR source gate fails closed when native output verification fails', () => {
  let calls = 0;
  const result = runHoloScriptSourceGate({
    spawn: () => {
      calls += 1;
      return { status: calls === 1 ? 0 : 9 };
    },
    nodePath: 'node-test',
    tsxCliPath: 'tsx-test',
    stdio: 'pipe',
    logger: quietLogger,
  });

  assert.deepEqual(result, { ok: false, status: 9 });
  assert.equal(calls, 2);
});
