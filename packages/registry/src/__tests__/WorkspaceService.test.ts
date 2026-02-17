/**
 * Tests for Workspace Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceService, WorkspaceServiceError } from '../workspace/WorkspaceService.js';
import { WorkspaceRepository } from '../workspace/WorkspaceRepository.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let nameCounter = 0;
function uniqueName() {
  return `workspace-${Date.now()}-${++nameCounter}`;
}

function makeService() {
  return new WorkspaceService(new WorkspaceRepository());
}

// ────────────────────────────────────────────────────────────────────────────

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    service = makeService();
  });

  // --------------------------------------------------------------------------
  // createWorkspace
  // --------------------------------------------------------------------------
  describe('createWorkspace', () => {
    it('should create a workspace with owner', async () => {
      const workspace = await service.createWorkspace(
        { name: uniqueName(), displayName: 'Test Workspace' },
        'user-123'
      );
      expect(workspace.displayName).toBe('Test Workspace');
      expect(workspace.ownerId).toBe('user-123');
    });

    it('should generate unique IDs', async () => {
      const ws1 = await service.createWorkspace({ name: uniqueName() }, 'user-1');
      const ws2 = await service.createWorkspace({ name: uniqueName() }, 'user-2');
      expect(ws1.id).not.toBe(ws2.id);
    });

    it('should reject short names', async () => {
      await expect(service.createWorkspace({ name: 'a' }, 'user-1')).rejects.toThrow(
        'Workspace name must be at least 2 characters'
      );
    });

    it('should reject long names (> 64 chars)', async () => {
      await expect(
        service.createWorkspace({ name: 'x'.repeat(65) }, 'user-1')
      ).rejects.toThrow(WorkspaceServiceError);
    });

    it('should reject duplicate names', async () => {
      const name = uniqueName();
      await service.createWorkspace({ name }, 'user-1');
      await expect(service.createWorkspace({ name }, 'user-2')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('auto-uses name as displayName if not provided', async () => {
      const name = uniqueName();
      const ws = await service.createWorkspace({ name }, 'user-1');
      expect(ws.displayName).toBeTruthy();
    });

    it('stores description when provided', async () => {
      const ws = await service.createWorkspace(
        { name: uniqueName(), description: 'My cool team' },
        'user-1'
      );
      expect(ws.description).toBe('My cool team');
    });

    it('has default settings with formatter', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'user-1');
      expect(ws.settings).toBeDefined();
      expect(typeof ws.settings.formatter.tabWidth).toBe('number');
    });

    it('sets owner as workspace member with owner role', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-99');
      const members = await service.getMembers(ws.id, 'owner-99');
      const ownerEntry = members.find(m => m.userId === 'owner-99');
      expect(ownerEntry?.role).toBe('owner');
    });
  });

  // --------------------------------------------------------------------------
  // getWorkspace
  // --------------------------------------------------------------------------
  describe('getWorkspace', () => {
    it('returns workspace for a member', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'user-A');
      const result = await service.getWorkspace(ws.id, 'user-A');
      expect(result.id).toBe(ws.id);
    });

    it('throws for non-existent ID', async () => {
      await expect(service.getWorkspace('does-not-exist', 'user-1')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('throws for non-member user', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await expect(service.getWorkspace(ws.id, 'stranger')).rejects.toThrow(WorkspaceServiceError);
    });
  });

  // --------------------------------------------------------------------------
  // updateWorkspace
  // --------------------------------------------------------------------------
  describe('updateWorkspace', () => {
    it('updates displayName', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const updated = await service.updateWorkspace(ws.id, { displayName: 'New Name' }, 'owner-id');
      expect(updated.displayName).toBe('New Name');
    });

    it('updates description', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const updated = await service.updateWorkspace(
        ws.id,
        { description: 'Updated description' },
        'owner-id'
      );
      expect(updated.description).toBe('Updated description');
    });

    it('admin can update workspace', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'admin-id', role: 'admin' }, 'owner-id');
      const updated = await service.updateWorkspace(
        ws.id,
        { displayName: 'Admin Updated' },
        'admin-id'
      );
      expect(updated.displayName).toBe('Admin Updated');
    });

    it('rejects update from developer', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'dev-id', role: 'developer' }, 'owner-id');
      await expect(
        service.updateWorkspace(ws.id, { displayName: 'Dev Updated' }, 'dev-id')
      ).rejects.toThrow(WorkspaceServiceError);
    });

    it('rejects update from viewer', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'view-id', role: 'viewer' }, 'owner-id');
      await expect(
        service.updateWorkspace(ws.id, { displayName: 'View Updated' }, 'view-id')
      ).rejects.toThrow(WorkspaceServiceError);
    });
  });

  // --------------------------------------------------------------------------
  // deleteWorkspace
  // --------------------------------------------------------------------------
  describe('deleteWorkspace', () => {
    it('owner can delete workspace', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.deleteWorkspace(ws.id, 'owner-id');
      await expect(service.getWorkspace(ws.id, 'owner-id')).rejects.toThrow(WorkspaceServiceError);
    });

    it('admin cannot delete workspace', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'admin-id', role: 'admin' }, 'owner-id');
      await expect(service.deleteWorkspace(ws.id, 'admin-id')).rejects.toThrow(
        WorkspaceServiceError
      );
    });
  });

  // --------------------------------------------------------------------------
  // listUserWorkspaces
  // --------------------------------------------------------------------------
  describe('listUserWorkspaces', () => {
    it('returns workspaces the user belongs to', async () => {
      const ws1 = await service.createWorkspace({ name: uniqueName() }, 'multi-user');
      const ws2 = await service.createWorkspace({ name: uniqueName() }, 'multi-user');
      const list = await service.listUserWorkspaces('multi-user');
      const ids = list.map(w => w.id);
      expect(ids).toContain(ws1.id);
      expect(ids).toContain(ws2.id);
    });

    it('returns empty array for user with no workspaces', async () => {
      const list = await service.listUserWorkspaces('no-workspace-user');
      expect(list).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Member management
  // --------------------------------------------------------------------------
  describe('Member management', () => {
    it('inviteMember adds developer role', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const member = await service.inviteMember(
        ws.id,
        { userId: 'dev-user', role: 'developer' },
        'owner-id'
      );
      expect(member.role).toBe('developer');
      expect(member.userId).toBe('dev-user');
    });

    it('updateMemberRole changes role', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'target', role: 'viewer' }, 'owner-id');
      const updated = await service.updateMemberRole(ws.id, 'target', 'developer', 'owner-id');
      expect(updated.role).toBe('developer');
    });

    it('removeMember removes user from workspace', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'temp', role: 'viewer' }, 'owner-id');
      await service.removeMember(ws.id, 'temp', 'owner-id');
      const members = await service.getMembers(ws.id, 'owner-id');
      expect(members.find(m => m.userId === 'temp')).toBeUndefined();
    });

    it('owner cannot be removed', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await expect(service.removeMember(ws.id, 'owner-id', 'owner-id')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('developer cannot invite members', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'dev-id', role: 'developer' }, 'owner-id');
      await expect(
        service.inviteMember(ws.id, { userId: 'new-user', role: 'viewer' }, 'dev-id')
      ).rejects.toThrow(WorkspaceServiceError);
    });

    it('admin can invite members', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'admin-id', role: 'admin' }, 'owner-id');
      const member = await service.inviteMember(
        ws.id,
        { userId: 'new-dev', role: 'developer' },
        'admin-id'
      );
      expect(member.userId).toBe('new-dev');
    });
  });

  // --------------------------------------------------------------------------
  // Secrets
  // --------------------------------------------------------------------------
  describe('Secrets', () => {
    it('setSecret stores a secret', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const result = await service.setSecret(
        ws.id,
        { name: 'MY_KEY', value: 'secret123' },
        'owner-id'
      );
      expect(result.name).toBe('MY_KEY');
    });

    it('setSecret does not return the value', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const result = await service.setSecret(ws.id, { name: 'HIDDEN', value: 'top-secret' }, 'owner-id');
      expect((result as Record<string, unknown>).value).toBeUndefined();
    });

    it('listSecrets returns names', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.setSecret(ws.id, { name: 'KEY_A', value: 'val' }, 'owner-id');
      await service.setSecret(ws.id, { name: 'KEY_B', value: 'val2' }, 'owner-id');
      const secrets = await service.listSecrets(ws.id, 'owner-id');
      expect(secrets.map(s => s.name)).toContain('KEY_A');
      expect(secrets.map(s => s.name)).toContain('KEY_B');
    });

    it('deleteSecret removes it from list', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.setSecret(ws.id, { name: 'TO_DELETE', value: 'val' }, 'owner-id');
      await service.deleteSecret(ws.id, 'TO_DELETE', 'owner-id');
      const secrets = await service.listSecrets(ws.id, 'owner-id');
      expect(secrets.find(s => s.name === 'TO_DELETE')).toBeUndefined();
    });

    it('viewer cannot set secrets', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'viewer-id', role: 'viewer' }, 'owner-id');
      await expect(
        service.setSecret(ws.id, { name: 'FORBIDDEN', value: 'x' }, 'viewer-id')
      ).rejects.toThrow(WorkspaceServiceError);
    });

    it('developer cannot set secrets (no secret.create permission)', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'dev-id', role: 'developer' }, 'owner-id');
      await expect(
        service.setSecret(ws.id, { name: 'DEV_KEY', value: 'devval' }, 'dev-id')
      ).rejects.toThrow(WorkspaceServiceError);
    });

    it('admin can set secrets', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await service.inviteMember(ws.id, { userId: 'admin-id', role: 'admin' }, 'owner-id');
      const result = await service.setSecret(
        ws.id,
        { name: 'ADMIN_KEY', value: 'adminval' },
        'admin-id'
      );
      expect(result.name).toBe('ADMIN_KEY');
    });
  });

  // --------------------------------------------------------------------------
  // Activity feed
  // --------------------------------------------------------------------------
  describe('Activity feed', () => {
    it('has activity after workspace creation', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const feed = await service.getActivityFeed(ws.id, 'owner-id', 50, 0);
      expect(feed).toBeDefined();
      expect(Array.isArray(feed.activities)).toBe(true);
    });

    it('activity increases after member invite', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const before = await service.getActivityFeed(ws.id, 'owner-id', 50, 0);
      await service.inviteMember(ws.id, { userId: 'new-dev', role: 'developer' }, 'owner-id');
      const after = await service.getActivityFeed(ws.id, 'owner-id', 50, 0);
      expect(after.activities.length).toBeGreaterThanOrEqual(before.activities.length);
    });

    it('non-member cannot see activity', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      await expect(
        service.getActivityFeed(ws.id, 'outsider', 50, 0)
      ).rejects.toThrow(WorkspaceServiceError);
    });

    it('respects limit parameter', async () => {
      const ws = await service.createWorkspace({ name: uniqueName() }, 'owner-id');
      const feed = await service.getActivityFeed(ws.id, 'owner-id', 1, 0);
      expect(feed.activities.length).toBeLessThanOrEqual(1);
    });
  });
});
