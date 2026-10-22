import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as state from './projectState';

describe('N14: rollback refuses a workspace with a pending importId', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-n14-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('returns pending (409 at the route) and keeps the row', () => {
    state.upsertDurableAbsorbProject({ id: 'ws-p', name: 'p', ownerId: 'u' });
    state.claimPendingAbsorbImportId('ws-p', 'u', 'imp-pending-0001');
    expect(state.removeUnabsorbedAbsorbProject('ws-p', 'u')).toBe('pending');
    expect(state.findDurableAbsorbProject({ projectId: 'ws-p' })).not.toBeNull();
    state.clearPendingAbsorbImportId('ws-p', 'u', 'imp-pending-0001');
    expect(state.removeUnabsorbedAbsorbProject('ws-p', 'u')).toBe('removed');
  });
});
