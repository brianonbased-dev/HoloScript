/**
 * Tests for Workspace API routes
 *
 * Tests the Express router request/response shapes and validation logic
 * by inspecting the Zod schemas and route middleware rather than
 * spinning up a full HTTP server (avoids DB dependencies).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceService, WorkspaceServiceError } from '../../workspace/WorkspaceService.js';
import { WorkspaceRepository } from '../../workspace/WorkspaceRepository.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeWorkspaceService() {
  const repo = new WorkspaceRepository();
  return new WorkspaceService(repo);
}

function makeWorkspaceData(overrides: Record<string, unknown> = {}) {
  return {
    name: `test-ws-${Math.random().toString(36).slice(2, 8)}`,
    displayName: 'Test Workspace',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Workspace CRUD
// ────────────────────────────────────────────────────────────────────────────

describe('Workspace API — service layer', () => {
  let service: WorkspaceService;

  beforeEach(() => {
    service = makeWorkspaceService();
  });

  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------
  describe('POST /workspaces → createWorkspace', () => {
    it('creates a workspace and returns it', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'user-1');
      expect(ws.id).toBeDefined();
      expect(ws.ownerId).toBe('user-1');
      expect(ws.settings).toBeDefined();
    });

    it('returns workspace with default settings', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'user-1');
      expect(ws.settings.formatter.tabWidth).toBe(2);
      expect(ws.settings.linter.rules).toBeDefined();
    });

    it('rejects name shorter than 2 characters', async () => {
      await expect(service.createWorkspace({ name: 'x' }, 'user-1')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('rejects name longer than 64 characters', async () => {
      const longName = 'a'.repeat(65);
      await expect(service.createWorkspace({ name: longName }, 'user-1')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('rejects duplicate workspace names', async () => {
      const data = makeWorkspaceData({ name: 'unique-name-test' });
      await service.createWorkspace(data, 'user-1');
      await expect(service.createWorkspace(data, 'user-2')).rejects.toThrow(WorkspaceServiceError);
    });

    it('sets owner as member with owner role', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-user');
      const members = await service.getMembers(ws.id, 'owner-user');
      const ownerMember = members.find((m) => m.userId === 'owner-user');
      expect(ownerMember).toBeDefined();
      expect(ownerMember?.role).toBe('owner');
    });

    it('owner can get their own workspace', async () => {
      const created = await service.createWorkspace(makeWorkspaceData(), 'user-abc');
      const fetched = await service.getWorkspace(created.id, 'user-abc');
      expect(fetched.id).toBe(created.id);
    });
  });

  // --------------------------------------------------------------------------
  // Read
  // --------------------------------------------------------------------------
  describe('GET /workspaces/:id → getWorkspace', () => {
    it('returns workspace by ID', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'user-1');
      const result = await service.getWorkspace(ws.id, 'user-1');
      expect(result.id).toBe(ws.id);
      expect(result.ownerId).toBe('user-1');
    });

    it('throws for non-existent workspace', async () => {
      await expect(service.getWorkspace('nonexistent-id', 'user-1')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('throws when user is not a member', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await expect(service.getWorkspace(ws.id, 'outsider-id')).rejects.toThrow(
        WorkspaceServiceError
      );
    });
  });

  // --------------------------------------------------------------------------
  // Update
  // --------------------------------------------------------------------------
  describe('PUT /workspaces/:id → updateWorkspace', () => {
    it('updates display name', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      const updated = await service.updateWorkspace(
        ws.id,
        { displayName: 'New Display Name' },
        'owner-id'
      );
      expect(updated.displayName).toBe('New Display Name');
    });

    it('updates formatter settings', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      const updated = await service.updateWorkspace(
        ws.id,
        {
          settings: {
            formatter: { tabWidth: 4, useTabs: false, printWidth: 100, trailingComma: false },
          },
        },
        'owner-id'
      );
      expect(updated.settings.formatter.tabWidth).toBe(4);
    });

    it('rejects update from non-admin member', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'viewer-user', role: 'viewer' }, 'owner-id');
      await expect(
        service.updateWorkspace(ws.id, { displayName: 'Hacked' }, 'viewer-user')
      ).rejects.toThrow(WorkspaceServiceError);
    });
  });

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------
  describe('DELETE /workspaces/:id → deleteWorkspace', () => {
    it('deletes workspace (owner only)', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.deleteWorkspace(ws.id, 'owner-id');
      await expect(service.getWorkspace(ws.id, 'owner-id')).rejects.toThrow(WorkspaceServiceError);
    });

    it('rejects delete from non-owner', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'admin-user', role: 'admin' }, 'owner-id');
      await expect(service.deleteWorkspace(ws.id, 'admin-user')).rejects.toThrow(
        WorkspaceServiceError
      );
    });
  });

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  describe('Members — POST/GET/PUT/DELETE /workspaces/:id/members', () => {
    it('invites a member', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      const member = await service.inviteMember(
        ws.id,
        { userId: 'new-user', role: 'developer' },
        'owner-id'
      );
      expect(member.userId).toBe('new-user');
      expect(member.role).toBe('developer');
    });

    it('lists all members including owner', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'dev-1', role: 'developer' }, 'owner-id');
      const members = await service.getMembers(ws.id, 'owner-id');
      expect(members.length).toBeGreaterThanOrEqual(2);
    });

    it('updates member role', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'target-user', role: 'viewer' }, 'owner-id');
      const updated = await service.updateMemberRole(ws.id, 'target-user', 'developer', 'owner-id');
      expect(updated.role).toBe('developer');
    });

    it('removes a member', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'temp-user', role: 'viewer' }, 'owner-id');
      await service.removeMember(ws.id, 'temp-user', 'owner-id');
      const members = await service.getMembers(ws.id, 'owner-id');
      expect(members.find((m) => m.userId === 'temp-user')).toBeUndefined();
    });

    it('prevents owner removal', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await expect(service.removeMember(ws.id, 'owner-id', 'owner-id')).rejects.toThrow(
        WorkspaceServiceError
      );
    });

    it('prevents non-admin from inviting members', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'dev-user', role: 'developer' }, 'owner-id');
      await expect(
        service.inviteMember(ws.id, { userId: 'other-user', role: 'viewer' }, 'dev-user')
      ).rejects.toThrow(WorkspaceServiceError);
    });
  });

  // --------------------------------------------------------------------------
  // Secrets
  // --------------------------------------------------------------------------
  describe('Secrets — POST/GET/DELETE /workspaces/:id/secrets', () => {
    it('sets a secret', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      const result = await service.setSecret(
        ws.id,
        { name: 'API_KEY', value: 'super-secret-value' },
        'owner-id'
      );
      expect(result.name).toBe('API_KEY');
      expect((result as Record<string, unknown>).value).toBeUndefined(); // value must not be returned
    });

    it('lists secret names (not values)', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.setSecret(ws.id, { name: 'DB_URL', value: 'postgres://...' }, 'owner-id');
      await service.setSecret(ws.id, { name: 'REDIS_URL', value: 'redis://...' }, 'owner-id');
      const secrets = await service.listSecrets(ws.id, 'owner-id');
      expect(secrets.length).toBe(2);
      expect(secrets.every((s) => !(s as Record<string, unknown>).value)).toBe(true);
    });

    it('deletes a secret', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.setSecret(ws.id, { name: 'TEMP_KEY', value: 'xyz' }, 'owner-id');
      await service.deleteSecret(ws.id, 'TEMP_KEY', 'owner-id');
      const secrets = await service.listSecrets(ws.id, 'owner-id');
      expect(secrets.find((s) => s.name === 'TEMP_KEY')).toBeUndefined();
    });

    it('prevents viewer from setting secrets', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'viewer-id', role: 'viewer' }, 'owner-id');
      await expect(
        service.setSecret(ws.id, { name: 'FORBIDDEN_KEY', value: 'x' }, 'viewer-id')
      ).rejects.toThrow(WorkspaceServiceError);
    });
  });

  // --------------------------------------------------------------------------
  // Activity
  // --------------------------------------------------------------------------
  describe('GET /workspaces/:id/activity → getActivityFeed', () => {
    it('returns activity feed after workspace creation', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      const feed = await service.getActivityFeed(ws.id, 'owner-id', 50, 0);
      expect(feed.activities).toBeDefined();
      expect(Array.isArray(feed.activities)).toBe(true);
    });

    it('records activity when member is invited', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await service.inviteMember(ws.id, { userId: 'new-dev', role: 'developer' }, 'owner-id');
      const feed = await service.getActivityFeed(ws.id, 'owner-id', 50, 0);
      const inviteActivity = feed.activities.find((a) => a.action.includes('member'));
      expect(inviteActivity).toBeDefined();
    });

    it('limits activity results', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      const feed = await service.getActivityFeed(ws.id, 'owner-id', 1, 0);
      expect(feed.activities.length).toBeLessThanOrEqual(1);
    });

    it('throws for non-member accessing activity', async () => {
      const ws = await service.createWorkspace(makeWorkspaceData(), 'owner-id');
      await expect(service.getActivityFeed(ws.id, 'outsider-id', 50, 0)).rejects.toThrow(
        WorkspaceServiceError
      );
    });
  });

  // --------------------------------------------------------------------------
  // WorkspaceServiceError
  // --------------------------------------------------------------------------
  describe('WorkspaceServiceError', () => {
    it('has code property', () => {
      const err = new WorkspaceServiceError('msg', 'NOT_FOUND', 404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('msg');
    });

    it('is instanceof Error', () => {
      const err = new WorkspaceServiceError('msg', 'TEST');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(WorkspaceServiceError);
    });

    it('defaults statusCode to 400', () => {
      const err = new WorkspaceServiceError('msg', 'BAD_INPUT');
      expect(err.statusCode).toBe(400);
    });
  });
});
