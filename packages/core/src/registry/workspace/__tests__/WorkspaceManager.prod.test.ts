/**
 * WorkspaceManager — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager, createWorkspaceManager, ROLE_PERMISSIONS } from '../WorkspaceManager';

function setup() {
  const mgr = new WorkspaceManager();
  const ws = mgr.createWorkspace('alice', { name: 'team-alpha', displayName: 'Team Alpha' });
  return { mgr, ws };
}

// ─── ROLE_PERMISSIONS ─────────────────────────────────────────────────────────
describe('ROLE_PERMISSIONS', () => {
  it('owner has workspace:delete', () => expect(ROLE_PERMISSIONS.owner).toContain('workspace:delete'));
  it('owner has billing:manage', () => expect(ROLE_PERMISSIONS.owner).toContain('billing:manage'));
  it('admin has packages:publish but not billing:manage', () => {
    expect(ROLE_PERMISSIONS.admin).toContain('packages:publish');
    expect(ROLE_PERMISSIONS.admin).not.toContain('billing:manage');
  });
  it('developer cannot manage members', () => expect(ROLE_PERMISSIONS.developer).not.toContain('members:manage'));
  it('viewer can only read packages', () => expect(ROLE_PERMISSIONS.viewer).toEqual(['packages:read']));
});

// ─── createWorkspace ──────────────────────────────────────────────────────────
describe('WorkspaceManager — createWorkspace', () => {
  let mgr: WorkspaceManager;
  beforeEach(() => { mgr = new WorkspaceManager(); });

  it('returns workspace with correct name', () => {
    expect(mgr.createWorkspace('alice', { name: 'my-team' }).name).toBe('my-team');
  });
  it('owner is first member with role=owner', () => {
    const ws = mgr.createWorkspace('u1', { name: 'ws-a' });
    expect(ws.members[0].role).toBe('owner');
    expect(ws.members[0].userId).toBe('u1');
  });
  it('initial activity has workspace:created event', () => {
    const ws = mgr.createWorkspace('u1', { name: 'ws-b' });
    expect(ws.activity[0].type).toBe('workspace:created');
  });
  it('throws on invalid name (uppercase letters)', () => {
    expect(() => mgr.createWorkspace('u1', { name: 'MyTeam' })).toThrow();
  });
  it('throws on name too short (< 3 chars)', () => {
    expect(() => mgr.createWorkspace('u1', { name: 'ab' })).toThrow();
  });
  it('throws on duplicate workspace name', () => {
    mgr.createWorkspace('u1', { name: 'dup-ws' });
    expect(() => mgr.createWorkspace('u1', { name: 'dup-ws' })).toThrow(/already exists/);
  });
  it('createWorkspaceManager() factory works', () => {
    expect(createWorkspaceManager()).toBeInstanceOf(WorkspaceManager);
  });
});

// ─── getWorkspace / getUserWorkspaces ─────────────────────────────────────────
describe('WorkspaceManager — read access', () => {
  it('getWorkspace returns workspace by name', () => {
    const { mgr, ws } = setup();
    expect(mgr.getWorkspace('team-alpha')).toBe(ws);
  });
  it('getWorkspace returns undefined for unknown', () => {
    const { mgr } = setup();
    expect(mgr.getWorkspace('no-such')).toBeUndefined();
  });
  it('getUserWorkspaces includes owner workspace', () => {
    const { mgr } = setup();
    expect(mgr.getUserWorkspaces('alice').map(w => w.name)).toContain('team-alpha');
  });
  it('getUserWorkspaces returns [] for unknown user', () => {
    const { mgr } = setup();
    expect(mgr.getUserWorkspaces('nobody')).toHaveLength(0);
  });
});

// ─── updateSettings ───────────────────────────────────────────────────────────
describe('WorkspaceManager — updateSettings', () => {
  it('owner can update settings', () => {
    const { mgr } = setup();
    const ws = mgr.updateSettings('team-alpha', 'alice', { formatter: { tabWidth: 4 } });
    expect(ws.settings.formatter?.tabWidth).toBe(4);
  });
  it('merges settings across calls', () => {
    const { mgr } = setup();
    mgr.updateSettings('team-alpha', 'alice', { formatter: { tabWidth: 2 } });
    mgr.updateSettings('team-alpha', 'alice', { compiler: { strictMode: true } });
    const ws = mgr.getWorkspace('team-alpha')!;
    expect(ws.settings.formatter?.tabWidth).toBe(2);
    expect(ws.settings.compiler?.strictMode).toBe(true);
  });
  it('non-member cannot update settings', () => {
    const { mgr } = setup();
    expect(() => mgr.updateSettings('team-alpha', 'mallory', {})).toThrow('not a member');
  });
});

// ─── Member management ────────────────────────────────────────────────────────
describe('WorkspaceManager — inviteMember', () => {
  it('owner can invite a developer', () => {
    const { mgr } = setup();
    const m = mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob123', 'developer');
    expect(m.role).toBe('developer');
    expect(m.invitedBy).toBe('alice');
  });
  it('cannot invite as owner', () => {
    const { mgr } = setup();
    expect(() => mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob', 'owner')).toThrow(/owner/);
  });
  it('cannot invite duplicate member', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob');
    expect(() => mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob')).toThrow(/already a member/);
  });
  it('developer cannot invite members', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob', 'developer');
    expect(() => mgr.inviteMember('team-alpha', 'bob', 'carol', 'carol')).toThrow(/Permission denied/);
  });
});

describe('WorkspaceManager — removeMember', () => {
  it('removes a member', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob');
    mgr.removeMember('team-alpha', 'alice', 'bob');
    expect(mgr.getWorkspace('team-alpha')!.members.some(m => m.userId === 'bob')).toBe(false);
  });
  it('cannot remove owner', () => {
    const { mgr } = setup();
    expect(() => mgr.removeMember('team-alpha', 'alice', 'alice')).toThrow(/owner/);
  });
});

describe('WorkspaceManager — changeMemberRole', () => {
  it('changes role from developer to admin', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob', 'developer');
    mgr.changeMemberRole('team-alpha', 'alice', 'bob', 'admin');
    expect(mgr.getWorkspace('team-alpha')!.members.find(m => m.userId === 'bob')?.role).toBe('admin');
  });
  it("cannot promote to owner", () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob', 'developer');
    expect(() => mgr.changeMemberRole('team-alpha', 'alice', 'bob', 'owner')).toThrow(/owner/);
  });
});

// ─── Secrets ──────────────────────────────────────────────────────────────────
describe('WorkspaceManager — secrets', () => {
  it('addSecret and getSecretValue round-trips plaintext', () => {
    const { mgr } = setup();
    mgr.addSecret('team-alpha', 'alice', 'API_KEY', 'my-secret');
    expect(mgr.getSecretValue('team-alpha', 'alice', 'API_KEY')).toBe('my-secret');
  });
  it('overwriting a secret updates the value', () => {
    const { mgr } = setup();
    mgr.addSecret('team-alpha', 'alice', 'TOKEN', 'v1');
    mgr.addSecret('team-alpha', 'alice', 'TOKEN', 'v2');
    expect(mgr.getSecretValue('team-alpha', 'alice', 'TOKEN')).toBe('v2');
  });
  it('getSecretValue returns undefined for unknown secret', () => {
    const { mgr } = setup();
    expect(mgr.getSecretValue('team-alpha', 'alice', 'NOSECRET')).toBeUndefined();
  });
  it('listSecrets returns names not values', () => {
    const { mgr } = setup();
    mgr.addSecret('team-alpha', 'alice', 'DB_PASS', 'p@ss');
    const names = mgr.listSecrets('team-alpha', 'alice');
    expect(names).toContain('DB_PASS');
    expect(names).not.toContain('p@ss');
  });
  it('removeSecret removes the secret', () => {
    const { mgr } = setup();
    mgr.addSecret('team-alpha', 'alice', 'TEMP', 'xyz');
    mgr.removeSecret('team-alpha', 'alice', 'TEMP');
    expect(mgr.listSecrets('team-alpha', 'alice')).not.toContain('TEMP');
  });
  it('removeSecret throws for unknown secret', () => {
    const { mgr } = setup();
    expect(() => mgr.removeSecret('team-alpha', 'alice', 'GHOST')).toThrow(/not found/);
  });
  it('viewer cannot access secrets', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'viewer', 'v', 'viewer');
    mgr.addSecret('team-alpha', 'alice', 'K', 'v');
    expect(() => mgr.getSecretValue('team-alpha', 'viewer', 'K')).toThrow(/Permission denied/);
  });
});

// ─── Activity ─────────────────────────────────────────────────────────────────
describe('WorkspaceManager — getActivity', () => {
  it('returns entries newest-first', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob');
    const activity = mgr.getActivity('team-alpha', 'alice');
    expect(activity[0].type).toBe('member:joined');
  });
  it('limit caps returned entries', () => {
    const { mgr } = setup();
    for (let i = 0; i < 10; i++) mgr.updateSettings('team-alpha', 'alice', { formatter: { tabWidth: i } });
    expect(mgr.getActivity('team-alpha', 'alice', 3).length).toBeLessThanOrEqual(3);
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────
describe('WorkspaceManager — hasPermission', () => {
  it('owner has workspace:delete', () => {
    const { mgr } = setup();
    expect(mgr.hasPermission('team-alpha', 'alice', 'workspace:delete')).toBe(true);
  });
  it('unknown workspace returns false', () => {
    const { mgr } = setup();
    expect(mgr.hasPermission('no-ws', 'alice', 'packages:read')).toBe(false);
  });
  it('non-member returns false', () => {
    const { mgr } = setup();
    expect(mgr.hasPermission('team-alpha', 'nobody', 'packages:read')).toBe(false);
  });
});

// ─── deleteWorkspace ──────────────────────────────────────────────────────────
describe('WorkspaceManager — deleteWorkspace', () => {
  it('owner can delete workspace', () => {
    const { mgr } = setup();
    mgr.deleteWorkspace('team-alpha', 'alice');
    expect(mgr.getWorkspace('team-alpha')).toBeUndefined();
  });
  it('deletes from all member user-maps', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob');
    mgr.deleteWorkspace('team-alpha', 'alice');
    expect(mgr.getUserWorkspaces('bob')).toHaveLength(0);
  });
  it('non-owner cannot delete workspace', () => {
    const { mgr } = setup();
    mgr.inviteMember('team-alpha', 'alice', 'bob', 'bob', 'admin');
    expect(() => mgr.deleteWorkspace('team-alpha', 'bob')).toThrow(/Permission denied/);
  });
});
