import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleCodebaseTool, registerAbsorbJobForTests, resetCodebaseToolStateForTests } from './codebase-tools';

/**
 * H3 (Mapping 08:42, CoS 08:45): a job keeps its original owner. A second caller on the
 * same root gets 409 and learns nothing about the existing job (no jobId / rootDir).
 */
const A = { ownerId: 'gh-user-a', serverKeysAllowed: false };
const B = { ownerId: 'gh-user-b', serverKeysAllowed: false };

let root = '';
beforeEach(() => {
  resetCodebaseToolStateForTests(false);
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'h3-')));
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
});
afterEach(() => resetCodebaseToolStateForTests(false));

function expectBusyNoLeak(out: Record<string, unknown>, jobId: string) {
  expect(out).toMatchObject({ status: 409, error: 'absorb_workspace_busy', callerScoped: true });
  expect(JSON.stringify(out)).not.toContain(jobId);
  expect(JSON.stringify(out)).not.toContain(path.basename(root));
}

describe('holo_absorb_repo: two owners, same root', () => {
  it("B on A's active root gets 409, learns nothing, and A keeps ownership", async () => {
    registerAbsorbJobForTests('absorb-owner-a', A.ownerId, root);
    const out = (await handleCodebaseTool('holo_absorb_repo', { rootDir: root }, B)) as any;
    expectBusyNoLeak(out, 'absorb-owner-a');
    expect(await handleCodebaseTool('holo_get_absorb_status', { jobId: 'absorb-owner-a' }, B)).toMatchObject({ status: 403 });
    const forA = (await handleCodebaseTool('holo_get_absorb_status', { jobId: 'absorb-owner-a' }, A)) as any;
    expect(forA.status).not.toBe(403);
    expect(forA.jobId).toBe('absorb-owner-a');
  });

  it('a caller on an operator (ownerless) active root gets 409 and never claims it', async () => {
    registerAbsorbJobForTests('absorb-operator-1', null, root);
    const out = (await handleCodebaseTool('holo_absorb_repo', { rootDir: root }, B)) as any;
    expectBusyNoLeak(out, 'absorb-operator-1');
    expect(await handleCodebaseTool('holo_cancel_absorb', { jobId: 'absorb-operator-1' }, B)).toMatchObject({ status: 403 });
    expect(await handleCodebaseTool('holo_get_absorb_status', { jobId: 'absorb-operator-1' }, B)).toMatchObject({ status: 403 });
  });

  it('a fresh root: the caller owns the job its own call created', async () => {
    const out = (await handleCodebaseTool('holo_absorb_repo', { rootDir: root }, A)) as any;
    expect(typeof out.jobId).toBe('string');
    const forB = (await handleCodebaseTool('holo_get_absorb_status', { jobId: out.jobId }, B)) as any;
    expect(forB).toMatchObject({ status: 403 });
    await handleCodebaseTool('holo_cancel_absorb', { jobId: out.jobId });
  });
});
