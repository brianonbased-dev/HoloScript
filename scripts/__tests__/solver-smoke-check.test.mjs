import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  SmokeFail,
  buildSolverRequest,
  runHostAdmission,
  runSolverSmoke,
} from '../holo-ci/solver-smoke-check.mjs';

const RECEIPT_HASH = `sha256:${'ab'.repeat(32)}`;
const SIGNER = `0x${'12'.repeat(20)}`;

function solverResponse(overrides = {}) {
  const inner = {
    success: true,
    caelTraceId: 'cael:test-solver-smoke',
    device: 'CPU-real',
    ...overrides,
  };
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: JSON.stringify(inner) }] },
      }),
  };
}

function paidOptions(overrides = {}) {
  return {
    endpoint: 'https://mcp.holoscript.net/mcp',
    timeoutMs: 5_000,
    taskId: 'task_solver',
    maxSpendUsd: '0.25',
    freeFirstReceipt: 'C:\\receipts\\free-first.json',
    admissionSurface: 'codex-hardware',
    ...overrides,
  };
}

function admission() {
  return {
    ok: true,
    receiptHash: RECEIPT_HASH,
    receiptPath: 'C:\\receipts\\admission.json',
    receiptId: 'solver-smoke-test',
    signerAddress: SIGNER,
  };
}

test('admission refusal cannot resolve the MCP key or fetch', async () => {
  let keyCalls = 0;
  let fetchCalls = 0;
  await assert.rejects(
    runSolverSmoke(paidOptions(), {
      admitImpl: async () => {
        throw new SmokeFail('host denied', 'fixture', 2);
      },
      resolveKeyImpl: () => {
        keyCalls += 1;
        return 'must-not-be-read';
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        return solverResponse();
      },
    }),
    /host denied/u
  );
  assert.equal(keyCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('every paid binding is required before spawning the host gate', () => {
  let spawnCalls = 0;
  assert.throws(
    () =>
      runHostAdmission(
        {
          endpoint: 'https://mcp.holoscript.net/mcp',
          requestHash: buildSolverRequest('https://mcp.holoscript.net/mcp').requestHash,
        },
        {
          spawnImpl: () => {
            spawnCalls += 1;
            return { status: 0, stdout: '{}' };
          },
        }
      ),
    /task-id.*max-spend-usd.*free-first-receipt.*admission-surface/u
  );
  assert.equal(spawnCalls, 0);
});

test('host admission receives only a secret-free environment', () => {
  const home = mkdtempSync(join(tmpdir(), 'solver-smoke-home-'));
  const scriptDir = join(home, '.ai-ecosystem', 'scripts');
  mkdirSync(scriptDir, { recursive: true });
  writeFileSync(join(scriptDir, 'solver-smoke-admission.mjs'), '// fixture\n', 'utf8');
  let spawnCalls = 0;
  const result = runHostAdmission(
    {
      ...paidOptions(),
      requestHash: buildSolverRequest('https://mcp.holoscript.net/mcp').requestHash,
    },
    {
      home,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        HOLOSCRIPT_MCP_API_KEY: 'must-not-cross-gate',
        HOLOMESH_API_KEY: 'must-not-cross-gate',
        HOLOMESH_WALLET_KEY: 'must-not-cross-gate',
      },
      spawnImpl: (_node, _args, init) => {
        spawnCalls += 1;
        assert.equal(init.env.HOLOSCRIPT_MCP_API_KEY, undefined);
        assert.equal(init.env.HOLOMESH_API_KEY, undefined);
        assert.equal(init.env.HOLOMESH_WALLET_KEY, undefined);
        assert.equal(init.env.HOLOMESH_AGENT_SURFACE, 'codex-hardware');
        return { status: 0, stdout: JSON.stringify(admission()), stderr: '' };
      },
    }
  );
  assert.equal(result.receiptHash, RECEIPT_HASH);
  assert.equal(spawnCalls, 1);
});

test('loopback zero-spend path skips admission and resolves auth only after loopback pinning', async () => {
  let admissionCalls = 0;
  let keyCalls = 0;
  let fetchCalls = 0;
  const result = await runSolverSmoke(
    {
      endpoint: 'http://127.0.0.1:7411/mcp',
      zeroSpendLocal: true,
      timeoutMs: 5_000,
    },
    {
      admitImpl: async () => {
        admissionCalls += 1;
        return admission();
      },
      resolveLocalKeyImpl: () => {
        keyCalls += 1;
        return 'local-auth-key';
      },
      fetchImpl: async (_endpoint, init) => {
        fetchCalls += 1;
        assert.equal(init.headers['x-mcp-api-key'], 'local-auth-key');
        assert.equal(init.headers['x-holoshell-admission-receipt'], undefined);
        return solverResponse();
      },
    }
  );
  assert.equal(result.zeroSpendLocal, true);
  assert.equal(admissionCalls, 0);
  assert.equal(keyCalls, 1);
  assert.equal(fetchCalls, 1);
});

test('zero-spend mode rejects non-loopback before sensitive work', async () => {
  let admissionCalls = 0;
  let keyCalls = 0;
  let fetchCalls = 0;
  await assert.rejects(
    runSolverSmoke(
      {
        endpoint: 'https://mcp.holoscript.net/mcp',
        zeroSpendLocal: true,
      },
      {
        admitImpl: async () => {
          admissionCalls += 1;
          return admission();
        },
        resolveKeyImpl: () => {
          keyCalls += 1;
          return 'must-not-be-read';
        },
        resolveLocalKeyImpl: () => {
          keyCalls += 1;
          return 'must-not-be-read';
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          return solverResponse();
        },
      }
    ),
    /restricted to loopback/u
  );
  assert.equal(admissionCalls, 0);
  assert.equal(keyCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('paid path orders admission before key and binds receipt headers', async () => {
  const order = [];
  const result = await runSolverSmoke(paidOptions(), {
    admitImpl: async () => {
      order.push('admit');
      return admission();
    },
    resolveKeyImpl: () => {
      order.push('key');
      return 'fixture-mcp-key';
    },
    fetchImpl: async (_endpoint, init) => {
      order.push('fetch');
      assert.equal(init.headers['x-mcp-api-key'], 'fixture-mcp-key');
      assert.equal(init.headers['x-holoshell-admission-receipt'], RECEIPT_HASH);
      assert.equal(init.headers['x-holoshell-admission-signer'], SIGNER);
      return solverResponse();
    },
  });

  assert.deepEqual(order, ['admit', 'key', 'fetch']);
  assert.equal(result.admission.receiptHash, RECEIPT_HASH);
  assert.match(result.requestHash, /^sha256:[a-f0-9]{64}$/u);
});

test('admitted launch without an MCP key fails before fetch', async () => {
  let fetchCalls = 0;
  await assert.rejects(
    runSolverSmoke(paidOptions(), {
      admitImpl: async () => admission(),
      resolveKeyImpl: () => null,
      fetchImpl: async () => {
        fetchCalls += 1;
        return solverResponse();
      },
    }),
    /no HOLOSCRIPT_MCP_API_KEY/u
  );
  assert.equal(fetchCalls, 0);
});
