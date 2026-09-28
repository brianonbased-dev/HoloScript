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
 * The observable is a real file written by holo_write_file (tools:admin), not an error string.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORK = mkdtempSync(join(tmpdir(), 'reentry-authz-'));
afterAll(() => rmSync(WORK, { recursive: true, force: true }));

const { _handleSingleToolLogic } = await import('../index');
const { handleTool } = await import('../handlers');

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
});
