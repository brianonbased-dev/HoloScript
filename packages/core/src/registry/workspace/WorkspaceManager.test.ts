/**
 * Tests for WorkspaceManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager, createWorkspaceManager, ROLE_PERMISSIONS } from './WorkspaceManager';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  const ownerId = 'user-owner-123';
  const memberId = 'user-member-456';

  beforeEach(() => {
    manager = createWorkspaceManager();
  });

  describe('createWorkspace', () => {
    it('should create a workspace', () => {
      const workspace = manager.createWorkspace(ownerId, {
        name: 'my-team',
        displayName: 'My Team',
        description: 'A test workspace',
      });

      expect(workspace.name).toBe('my-team');
      expect(workspace.displayName).toBe('My Team');
      expect(workspace.ownerId).toBe(ownerId);
      expect(workspace.members).toHaveLength(1);
      expect(workspace.members[0].role).toBe('owner');
    });

    it('should reject invalid workspace names', () => {
      expect(() => manager.createWorkspace(ownerId, { name: 'Invalid Name' })).toThrow(
        'Invalid workspace name'
      );

      expect(() => manager.createWorkspace(ownerId, { name: 'ab' })).toThrow(
        'Invalid workspace name'
      );

      expect(() => manager.createWorkspace(ownerId, { name: '-invalid' })).toThrow(
        'Invalid workspace name'
      );
    });

    it('should reject duplicate workspace names', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      expect(() => manager.createWorkspace(ownerId, { name: 'my-team' })).toThrow('already exists');
    });

    it('should record creation activity', () => {
      const workspace = manager.createWorkspace(ownerId, { name: 'my-team' });

      expect(workspace.activity).toHaveLength(1);
      expect(workspace.activity[0].type).toBe('workspace:created');
      expect(workspace.activity[0].actor).toBe(ownerId);
    });
  });

  describe('getWorkspace', () => {
    it('should return workspace by name', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      const workspace = manager.getWorkspace('my-team');
      expect(workspace).toBeDefined();
      expect(workspace?.name).toBe('my-team');
    });

    it('should return undefined for non-existent workspace', () => {
      expect(manager.getWorkspace('non-existent')).toBeUndefined();
    });
  });

  describe('getUserWorkspaces', () => {
    it('should return all workspaces for a user', () => {
      manager.createWorkspace(ownerId, { name: 'team-one' });
      manager.createWorkspace(ownerId, { name: 'team-two' });

      const workspaces = manager.getUserWorkspaces(ownerId);
      expect(workspaces).toHaveLength(2);
    });

    it('should return empty array for user with no workspaces', () => {
      const workspaces = manager.getUserWorkspaces('unknown-user');
      expect(workspaces).toHaveLength(0);
    });
  });

  describe('inviteMember', () => {
    it('should invite a member with specified role', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      const member = manager.inviteMember('my-team', ownerId, memberId, 'alice', 'developer');

      expect(member.userId).toBe(memberId);
      expect(member.username).toBe('alice');
      expect(member.role).toBe('developer');
      expect(member.invitedBy).toBe(ownerId);
    });

    it('should default to developer role', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      const member = manager.inviteMember('my-team', ownerId, memberId, 'alice');

      expect(member.role).toBe('developer');
    });

    it('should not allow inviting as owner', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      expect(() => manager.inviteMember('my-team', ownerId, memberId, 'alice', 'owner')).toThrow(
        'Cannot invite as owner'
      );
    });

    it('should not allow duplicate members', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');

      expect(() => manager.inviteMember('my-team', ownerId, memberId, 'alice')).toThrow(
        'already a member'
      );
    });

    it('should add member to user workspaces', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');

      const workspaces = manager.getUserWorkspaces(memberId);
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].name).toBe('my-team');
    });
  });

  describe('removeMember', () => {
    it('should remove a member', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');

      manager.removeMember('my-team', ownerId, memberId);

      const workspace = manager.getWorkspace('my-team')!;
      expect(workspace.members).toHaveLength(1);
      expect(workspace.members[0].userId).toBe(ownerId);
    });

    it('should not allow removing the owner', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      expect(() => manager.removeMember('my-team', ownerId, ownerId)).toThrow(
        'Cannot remove the workspace owner'
      );
    });

    it('should remove from user workspaces', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');
      manager.removeMember('my-team', ownerId, memberId);

      const workspaces = manager.getUserWorkspaces(memberId);
      expect(workspaces).toHaveLength(0);
    });
  });

  describe('changeMemberRole', () => {
    it('should change member role', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice', 'developer');

      manager.changeMemberRole('my-team', ownerId, memberId, 'admin');

      const workspace = manager.getWorkspace('my-team')!;
      const member = workspace.members.find((m) => m.userId === memberId);
      expect(member?.role).toBe('admin');
    });

    it('should not allow promoting to owner', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');

      expect(() => manager.changeMemberRole('my-team', ownerId, memberId, 'owner')).toThrow(
        'Cannot promote to owner'
      );
    });

    it('should not allow changing owner role', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      expect(() => manager.changeMemberRole('my-team', ownerId, ownerId, 'admin')).toThrow(
        "Cannot change the owner's role"
      );
    });
  });

  describe('updateSettings', () => {
    it('should update workspace settings', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      manager.updateSettings('my-team', ownerId, {
        formatter: { tabWidth: 4 },
      });

      const workspace = manager.getWorkspace('my-team')!;
      expect(workspace.settings.formatter?.tabWidth).toBe(4);
    });

    it('should record settings update activity', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.updateSettings('my-team', ownerId, {
        formatter: { tabWidth: 4 },
      });

      const workspace = manager.getWorkspace('my-team')!;
      const activity = workspace.activity.find((a) => a.type === 'settings:updated');
      expect(activity).toBeDefined();
    });
  });

  describe('secrets', () => {
    it('should add a secret', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      manager.addSecret('my-team', ownerId, 'API_KEY', 'secret-value-123');

      const secrets = manager.listSecrets('my-team', ownerId);
      expect(secrets).toContain('API_KEY');
    });

    it('should retrieve secret value', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.addSecret('my-team', ownerId, 'API_KEY', 'secret-value-123');

      const value = manager.getSecretValue('my-team', ownerId, 'API_KEY');
      expect(value).toBe('secret-value-123');
    });

    it('should update existing secret', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.addSecret('my-team', ownerId, 'API_KEY', 'old-value');
      manager.addSecret('my-team', ownerId, 'API_KEY', 'new-value');

      const value = manager.getSecretValue('my-team', ownerId, 'API_KEY');
      expect(value).toBe('new-value');

      const secrets = manager.listSecrets('my-team', ownerId);
      expect(secrets.filter((s) => s === 'API_KEY')).toHaveLength(1);
    });

    it('should remove a secret', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.addSecret('my-team', ownerId, 'API_KEY', 'secret-value');
      manager.removeSecret('my-team', ownerId, 'API_KEY');

      const secrets = manager.listSecrets('my-team', ownerId);
      expect(secrets).not.toContain('API_KEY');
    });
  });

  describe('permissions', () => {
    it('should check permissions correctly', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice', 'viewer');

      expect(manager.hasPermission('my-team', ownerId, 'workspace:delete')).toBe(true);
      expect(manager.hasPermission('my-team', ownerId, 'members:manage')).toBe(true);

      expect(manager.hasPermission('my-team', memberId, 'workspace:delete')).toBe(false);
      expect(manager.hasPermission('my-team', memberId, 'members:manage')).toBe(false);
      expect(manager.hasPermission('my-team', memberId, 'packages:read')).toBe(true);
    });

    it('should deny non-members', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });

      expect(manager.hasPermission('my-team', 'unknown-user', 'packages:read')).toBe(false);
    });
  });

  describe('activity', () => {
    it('should track all activities', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');
      manager.updateSettings('my-team', ownerId, { formatter: { tabWidth: 2 } });
      manager.addSecret('my-team', ownerId, 'KEY', 'value');

      const activity = manager.getActivity('my-team', ownerId);

      expect(activity.length).toBeGreaterThanOrEqual(4);
      const types = activity.map((a) => a.type);
      expect(types).toContain('workspace:created');
      expect(types).toContain('member:joined');
      expect(types).toContain('settings:updated');
      expect(types).toContain('secret:added');
    });

    it('should return activities in reverse chronological order', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');

      const activity = manager.getActivity('my-team', ownerId);

      // Most recent first
      expect(activity[0].type).toBe('member:joined');
      expect(activity[1].type).toBe('workspace:created');
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete a workspace', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice');

      manager.deleteWorkspace('my-team', ownerId);

      expect(manager.getWorkspace('my-team')).toBeUndefined();
      expect(manager.getUserWorkspaces(ownerId)).toHaveLength(0);
      expect(manager.getUserWorkspaces(memberId)).toHaveLength(0);
    });

    it('should only allow owner to delete', () => {
      manager.createWorkspace(ownerId, { name: 'my-team' });
      manager.inviteMember('my-team', ownerId, memberId, 'alice', 'admin');

      expect(() => manager.deleteWorkspace('my-team', memberId)).toThrow('Permission denied');
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('should have correct permissions for each role', () => {
      expect(ROLE_PERMISSIONS.owner).toContain('workspace:delete');
      expect(ROLE_PERMISSIONS.owner).toContain('billing:manage');

      expect(ROLE_PERMISSIONS.admin).not.toContain('workspace:delete');
      expect(ROLE_PERMISSIONS.admin).toContain('members:manage');

      expect(ROLE_PERMISSIONS.developer).not.toContain('members:manage');
      expect(ROLE_PERMISSIONS.developer).toContain('packages:publish');

      expect(ROLE_PERMISSIONS.viewer).not.toContain('packages:publish');
      expect(ROLE_PERMISSIONS.viewer).toContain('packages:read');
    });
  });
});
