import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as state from './projectState';

describe('projectState: H2 single-write clear, N10 locked rollback', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-n7-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('N10: removeUnabsorbedAbsorbProject refuses a workspace with a completed absorb', () => {
    const remove = (state as Record<string, unknown>).removeUnabsorbedAbsorbProject as (
      id: string,
      owner: string
    ) => string;
    state.upsertDurableAbsorbProject({ id: 'ws-a', name: 'a', ownerId: 'u' });
    state.recordAbsorbJob({ projectId: 'ws-a', source: 'http', result: { status: 'complete' } });
    expect(remove('ws-a', 'u')).toBe('absorbed');
    expect(state.findDurableAbsorbProject({ projectId: 'ws-a' })).not.toBeNull();
    state.upsertDurableAbsorbProject({ id: 'ws-b', name: 'b', ownerId: 'u' });
    expect(remove('ws-b', 'other')).toBe('missing');
    expect(remove('ws-b', 'u')).toBe('removed');
    expect(state.findDurableAbsorbProject({ projectId: 'ws-b' })).toBeNull();
  });

  it('recordAbsorbJob compare-and-clears the pending id in the same write', () => {
    state.upsertDurableAbsorbProject({ id: 'ws-c', name: 'c', ownerId: 'u' });
    expect(state.claimPendingAbsorbImportId('ws-c', 'u', 'imp-cccc-1111')).toBe('imp-cccc-1111');
    state.recordAbsorbJob({
      projectId: 'ws-c',
      source: 'http',
      result: {},
      clearPendingImportId: { ownerId: 'u', importId: 'imp-other-2222' },
    } as Parameters<typeof state.recordAbsorbJob>[0]);
    expect(state.findDurableAbsorbProject({ projectId: 'ws-c' })?.metadata.pendingImportId).toBe(
      'imp-cccc-1111'
    );
    state.recordAbsorbJob({
      projectId: 'ws-c',
      source: 'http',
      result: {},
      clearPendingImportId: { ownerId: 'u', importId: 'imp-cccc-1111' },
    } as Parameters<typeof state.recordAbsorbJob>[0]);
    expect(
      state.findDurableAbsorbProject({ projectId: 'ws-c' })?.metadata.pendingImportId
    ).toBeNull();
  });
});
