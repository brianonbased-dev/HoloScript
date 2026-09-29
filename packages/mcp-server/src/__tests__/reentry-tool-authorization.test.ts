/**
 * A tool that dispatches other tools must run each of them as the REAL caller, with the caller's
 * scopes re-checked for the inner tool (task_1790204588326_myvj, continued after #398).
 *
 * Gate 2 runs once, at the HTTP layer, on the OUTER tool name. execute_workflow needs only
 * tools:write and batch_tool_call only tools:read, yet each runs tools the caller names.
 * claude3-x402's review of #398 fired an execute_workflow step naming holo_critic (tools:admin)
 * as a tools:write caller and reached its handler: nothing re-checked the step. A step naming
 * batch_tool_call was worse. It reached the core dispatcher's own batch case, which ran every
 * child with NO signing context, and handleTool turns a missing context into stdio-local
 * admin:* whenever HOLOSCRIPT_API_KEY is set, as it is on the hosted server.
 *
 * Two observables. get_dev_dashboard_state needs tools:admin and takes no path, so only the
 * scope check can stop it, and its real answer (a `dashboard`) either reaches the caller or
 * does not. holo_write_file writes a real file, but since #396 the host-path rule also refuses
 * a non-admin's absolute path, so for it the error text is what shows WHICH check refused.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORK = mkdtempSync(join(tmpdir(), 'reentry-authz-'));
afterAll(() => rmSync(WORK, { recursive: true, force: true }));

const { _handleSingleToolLogic, executeReentrantTool } = await import('../index');
const { handleTool } = await import('../handlers');
const { buildMeshToolManifest, clearMeshToolRegistry, publishMeshToolManifest } =
  await import('../holomesh/mesh-tool-registry');

// A client registered for ordinary work: it may read and write, never administer.
const READ_WRITE = {
  signedRequest: false,
  signingValid: true,
  signer: 'client',
  scopes: ['tools:read', 'tools:write'],
};
const ADMIN = {
  signedRequest: false,
  signingValid: true,
  signer: 'owner-agent',
  scopes: ['admin:*'],
};

// Model the hosted server, where a context-less call becomes stdio-local admin:*.
let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.HOLOSCRIPT_API_KEY;
  process.env.HOLOSCRIPT_API_KEY = 'test-hosted-key';
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.HOLOSCRIPT_API_KEY;
  else process.env.HOLOSCRIPT_API_KEY = savedKey;
});

type Envelope = { content?: Array<{ text?: string }>; isError?: boolean };

async function call(tool: string, args: Record<string, unknown>, ctx: unknown) {
  const res = (await _handleSingleToolLogic(tool, args, ctx as never)) as Envelope;
  return res.content?.[0]?.text ?? '';
}

function writeStep(target: string) {
  return { id: 's1', skillId: 'holo_write_file', inputs: { filePath: target, content: 'PLANTED' } };
}

function batchStep(target: string) {
  return {
    id: 's1',
    skillId: 'batch_tool_call',
    inputs: {
      calls: [{ name: 'holo_write_file', args: { filePath: target, content: 'PLANTED' } }],
    },
  };
}

const DASHBOARD = { name: 'get_dev_dashboard_state', args: { sections: ['api'] } };

/** True when get_dev_dashboard_state's own answer reached the caller. */
function dashboardLeaked(text: string): boolean {
  return /"dashboard"\s*:/.test(text);
}

describe('a re-entered tool runs as the real caller', () => {
  it('a read/write caller cannot run a tools:admin tool as a workflow step', async () => {
    const target = join(WORK, 'workflow-step.txt');
    const text = await call(
      'execute_workflow',
      { name: 'probe', steps: [writeStep(target)] },
      READ_WRITE
    );

    expect(existsSync(target)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });

  it('a read/write caller cannot reach it through a workflow step that is a batch', async () => {
    const target = join(WORK, 'workflow-batch-child.txt');
    const text = await call(
      'execute_workflow',
      { name: 'probe', steps: [batchStep(target)] },
      READ_WRITE
    );

    expect(existsSync(target)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });

  it("the core dispatcher's batch case re-checks each child with the caller's scopes", async () => {
    const target = join(WORK, 'core-batch-child.txt');
    const result = await handleTool(
      'batch_tool_call',
      { calls: [{ name: 'holo_write_file', args: { filePath: target, content: 'PLANTED' } }] },
      READ_WRITE as never
    );

    expect(existsSync(target)).toBe(false);
    expect(JSON.stringify(result)).toMatch(/authorization denied/i);
  });

  it('the canonical dispatcher refuses a tool the caller lacks the scope for, whoever calls it', async () => {
    const target = join(WORK, 'direct-dispatch.txt');
    const text = await call(
      'holo_write_file',
      { filePath: target, content: 'PLANTED' },
      READ_WRITE
    );

    expect(existsSync(target)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });
});

describe('the scope check alone stops a path-free admin tool on every way in', () => {
  it('a workflow step', async () => {
    const text = await call(
      'execute_workflow',
      { name: 'probe', steps: [{ id: 's1', skillId: DASHBOARD.name, inputs: DASHBOARD.args }] },
      READ_WRITE
    );
    expect(dashboardLeaked(text)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });

  it('a workflow step that is a batch', async () => {
    const text = await call(
      'execute_workflow',
      {
        name: 'probe',
        steps: [{ id: 's1', skillId: 'batch_tool_call', inputs: { calls: [DASHBOARD] } }],
      },
      READ_WRITE
    );
    expect(dashboardLeaked(text)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });

  it('a batch whose child is a workflow (the batch passes the caller on)', async () => {
    const text = await call(
      'batch_tool_call',
      {
        calls: [
          {
            name: 'execute_workflow',
            args: {
              name: 'probe',
              steps: [{ id: 's1', skillId: DASHBOARD.name, inputs: DASHBOARD.args }],
            },
          },
        ],
      },
      READ_WRITE
    );
    expect(dashboardLeaked(text)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });

  it('a direct call', async () => {
    const text = await call(DASHBOARD.name, DASHBOARD.args, READ_WRITE);
    expect(dashboardLeaked(text)).toBe(false);
    expect(text).toMatch(/authorization denied/i);
  });

  it('control: an admin caller gets the dashboard through the same workflow', async () => {
    const text = await call(
      'execute_workflow',
      { name: 'probe', steps: [{ id: 's1', skillId: DASHBOARD.name, inputs: DASHBOARD.args }] },
      ADMIN
    );
    expect(dashboardLeaked(text)).toBe(true);
  });
});

describe('get_tool_health probes the tools a caller names as that caller', () => {
  type Health = {
    tools?: Array<{ name?: string; tool?: string; status?: string; reason?: string }>;
  };
  function probeOf(result: unknown, tool: string) {
    const list = (result as Health).tools ?? [];
    return list.find((t) => (t.name ?? t.tool) === tool);
  }

  it('a read/write caller is told it may not run an admin tool, and the tool does not run', async () => {
    const result = await handleTool(
      'get_tool_health',
      { tools: [DASHBOARD.name] },
      READ_WRITE as never
    );
    const probe = probeOf(result, DASHBOARD.name);
    expect(probe?.status).toBe('unprobed');
    expect(probe?.reason).toMatch(/not permitted/i);
  });

  it('control: an admin caller gets it probed', async () => {
    const result = await handleTool('get_tool_health', { tools: [DASHBOARD.name] }, ADMIN as never);
    expect(probeOf(result, DASHBOARD.name)?.status).toBe('live');
  });
});

describe('a tool that fails, fails on every way in', () => {
  // browser_execute answers a missing session with its own MCP error envelope, isError: true.
  const FAILING = { name: 'browser_execute', args: { sessionId: 'no-such-session', script: '1' } };

  it('the dispatcher keeps the handler envelope an error', async () => {
    const res = (await _handleSingleToolLogic(
      FAILING.name,
      FAILING.args,
      ADMIN as never
    )) as Envelope;
    expect(res.isError).toBe(true);
    expect(res.content?.[0]?.text ?? '').toContain('Session not found');
  });

  it('a re-entered call throws', async () => {
    await expect(executeReentrantTool(FAILING.name, FAILING.args, ADMIN as never)).rejects.toThrow(
      /Session not found/
    );
  });

  it('a workflow step reports failed, not completed', async () => {
    const text = await call(
      'execute_workflow',
      { name: 'probe', steps: [{ id: 's1', skillId: FAILING.name, inputs: FAILING.args }] },
      ADMIN
    );
    expect(text).not.toMatch(/"status"\s*:\s*"completed"/);
    expect(text).toContain('Session not found');
  });

  it('a mesh invoke does not report success', async () => {
    clearMeshToolRegistry();
    const manifest = publishMeshToolManifest(
      buildMeshToolManifest(
        {
          tool_name: FAILING.name,
          description: 'test manifest for a tool that fails',
          capability_tags: ['browser'],
          allow_transitive_invocation: true,
        },
        { agentId: 'agent_test_publisher', name: 'test-publisher' }
      )
    );
    const res = (await _handleSingleToolLogic(
      'holomesh_invoke_tool',
      { mesh_tool_id: manifest.id, args: FAILING.args, allow_high_risk: true },
      ADMIN as never
    )) as Envelope;
    const text = res.content?.[0]?.text ?? '';
    // Before: {"success": true, ..., "result": {..., "isError": true}}. Now the invoke answers
    // with the failure: {"error": "Tool invocation failed: ... Session not found ..."}.
    expect(text).not.toMatch(/"success"\s*:\s*true/);
    expect(res.isError === true || /"error"\s*:/.test(text)).toBe(true);
    expect(text).toContain('Session not found');
  });
});

describe('what must keep working', () => {
  it('an admin caller still runs it as a workflow step', async () => {
    const target = join(WORK, 'admin-step.txt');
    await call('execute_workflow', { name: 'probe', steps: [writeStep(target)] }, ADMIN);

    expect(readFileSync(target, 'utf8')).toContain('PLANTED');
  });

  it('an admin caller still runs it through a workflow step that is a batch', async () => {
    const target = join(WORK, 'admin-batch-child.txt');
    await call('execute_workflow', { name: 'probe', steps: [batchStep(target)] }, ADMIN);

    expect(readFileSync(target, 'utf8')).toContain('PLANTED');
  });

  it('genuine stdio (no context at all) keeps local trust', async () => {
    const target = join(WORK, 'stdio-step.txt');
    await call('execute_workflow', { name: 'probe', steps: [writeStep(target)] }, undefined);

    expect(readFileSync(target, 'utf8')).toContain('PLANTED');
  });

  it('a read/write caller still runs a step its own scopes cover', async () => {
    const text = await call(
      'execute_workflow',
      { name: 'probe', steps: [{ id: 's1', skillId: 'get_tool_manifest', inputs: { limit: 1 } }] },
      READ_WRITE
    );

    expect(text).not.toMatch(/authorization denied/i);
    expect(JSON.parse(text).steps[0].status).toBe('completed');
  });

  it('a signed call is dispatched with the scopes Gate 2 judged, not the ones captured before auth was upgraded', async () => {
    // /mcp unwraps a signed body, THEN upgrades auth (the anonymous free tier gets tools:read,
    // sovereign loopback tools:codebase). The context captured at unwrap has none of those.
    const captured = {
      signedRequest: true,
      signingValid: true,
      signer: `0x${'1'.repeat(40)}`,
      signingProtocol: 'classical',
      scopes: [] as string[],
    };
    const refused = await call('parse_holo', { code: 'composition "C" {}' }, captured);
    expect(refused).toMatch(/authorization denied/i);

    const withGate2Scopes = { ...captured, scopes: ['tools:read'] };
    const allowed = await call('parse_holo', { code: 'composition "C" {}' }, withGate2Scopes);
    expect(allowed).not.toMatch(/authorization denied/i);

    // And http-server.ts builds the dispatch context that way.
    const source = readFileSync(new URL('../http-server.ts', import.meta.url), 'utf8');
    const start = source.indexOf('async function securedToolExecutionInner(');
    const block = source.slice(start, source.indexOf('_handleSingleToolLogic(toolName', start));
    expect(block).toContain('mergeSigningContextScopes(options.signingCtx, auth)');
  });
});
