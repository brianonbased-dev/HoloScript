/**
 * WorkspaceService - Business logic for team workspaces
 */

import crypto from 'crypto';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  InviteMemberRequest,
  SetSecretRequest,
  WorkspaceResponse,
  ActivityFeedResponse,
  WorkspaceSettings,
} from '../types.js';
import { WorkspaceRepository, workspaceRepository } from './WorkspaceRepository.js';

export class WorkspaceServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'WorkspaceServiceError';
  }
}

export class WorkspaceService {
  constructor(private repository: WorkspaceRepository = workspaceRepository) {}

  // ============================================================================
  // Workspace Operations
  // ============================================================================

  async createWorkspace(
    request: CreateWorkspaceRequest,
    userId: string
  ): Promise<WorkspaceResponse> {
    // Validate name
    if (!request.name || request.name.length < 2) {
      throw new WorkspaceServiceError(
        'Workspace name must be at least 2 characters',
        'INVALID_NAME'
      );
    }

    if (request.name.length > 64) {
      throw new WorkspaceServiceError(
        'Workspace name must be at most 64 characters',
        'INVALID_NAME'
      );
    }

    // Check for existing workspace
    const existing = await this.repository.getWorkspaceByName(request.name);
    if (existing) {
      throw new WorkspaceServiceError(
        `Workspace '${request.name}' already exists`,
        'WORKSPACE_EXISTS',
        409
      );
    }

    const workspace = await this.repository.createWorkspace(
      request.name,
      userId,
      request.displayName,
      request.description,
      request.visibility
    );

    return this.toWorkspaceResponse(workspace);
  }

  async getWorkspace(id: string, userId: string): Promise<WorkspaceResponse> {
    const workspace = await this.repository.getWorkspace(id);
    if (!workspace) {
      throw new WorkspaceServiceError('Workspace not found', 'NOT_FOUND', 404);
    }

    // Check access
    const member = await this.repository.getMember(id, userId);
    if (!member && workspace.settings.visibility !== 'public') {
      throw new WorkspaceServiceError('Access denied', 'FORBIDDEN', 403);
    }

    return this.toWorkspaceResponse(workspace);
  }

  async updateWorkspace(
    id: string,
    request: UpdateWorkspaceRequest,
    userId: string
  ): Promise<WorkspaceResponse> {
    await this.requirePermission(id, userId, 'workspace.update');

    const workspace = await this.repository.updateWorkspace(id, {
      displayName: request.displayName,
      description: request.description,
      settings: request.settings as Partial<WorkspaceSettings>,
    });

    if (!workspace) {
      throw new WorkspaceServiceError('Workspace not found', 'NOT_FOUND', 404);
    }

    await this.repository.logActivity(id, userId, 'settings.updated', {
      changes: Object.keys(request),
    });

    return this.toWorkspaceResponse(workspace);
  }

  async deleteWorkspace(id: string, userId: string): Promise<void> {
    await this.requirePermission(id, userId, 'workspace.delete');

    const deleted = await this.repository.deleteWorkspace(id);
    if (!deleted) {
      throw new WorkspaceServiceError('Workspace not found', 'NOT_FOUND', 404);
    }
  }

  async listUserWorkspaces(userId: string): Promise<WorkspaceResponse[]> {
    const workspaces = await this.repository.listWorkspacesForUser(userId);
    return Promise.all(workspaces.map((w) => this.toWorkspaceResponse(w)));
  }

  // ============================================================================
  // Member Operations
  // ============================================================================

  async inviteMember(
    workspaceId: string,
    request: InviteMemberRequest,
    invitedBy: string
  ): Promise<WorkspaceMember> {
    await this.requirePermission(workspaceId, invitedBy, 'member.invite');

    // Check if already a member
    const existing = await this.repository.getMember(workspaceId, request.userId);
    if (existing) {
      throw new WorkspaceServiceError('User is already a member', 'ALREADY_MEMBER', 409);
    }

    // Cannot invite as owner
    if (request.role === 'owner') {
      throw new WorkspaceServiceError('Cannot invite as owner', 'INVALID_ROLE', 400);
    }

    return this.repository.addMember(workspaceId, request.userId, request.role, invitedBy);
  }

  async removeMember(workspaceId: string, userId: string, removedBy: string): Promise<void> {
    await this.requirePermission(workspaceId, removedBy, 'member.remove');

    // Cannot remove owner
    const member = await this.repository.getMember(workspaceId, userId);
    if (member?.role === 'owner') {
      throw new WorkspaceServiceError('Cannot remove workspace owner', 'CANNOT_REMOVE_OWNER', 400);
    }

    const removed = await this.repository.removeMember(workspaceId, userId, removedBy);
    if (!removed) {
      throw new WorkspaceServiceError('Member not found', 'NOT_FOUND', 404);
    }
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    newRole: WorkspaceRole,
    updatedBy: string
  ): Promise<WorkspaceMember> {
    await this.requirePermission(workspaceId, updatedBy, 'member.update_role');

    // Cannot change owner role
    const member = await this.repository.getMember(workspaceId, userId);
    if (member?.role === 'owner') {
      throw new WorkspaceServiceError('Cannot change owner role', 'CANNOT_CHANGE_OWNER', 400);
    }

    if (newRole === 'owner') {
      throw new WorkspaceServiceError('Cannot promote to owner', 'INVALID_ROLE', 400);
    }

    const updated = await this.repository.updateMemberRole(workspaceId, userId, newRole, updatedBy);

    if (!updated) {
      throw new WorkspaceServiceError('Member not found', 'NOT_FOUND', 404);
    }

    return updated;
  }

  async getMembers(workspaceId: string, userId: string): Promise<WorkspaceMember[]> {
    await this.requirePermission(workspaceId, userId, 'member.read');
    return this.repository.getMembers(workspaceId);
  }

  // ============================================================================
  // Secrets Operations
  // ============================================================================

  async setSecret(
    workspaceId: string,
    request: SetSecretRequest,
    userId: string
  ): Promise<{ name: string }> {
    await this.requirePermission(workspaceId, userId, 'secret.create');

    // Validate name
    if (!/^[A-Z_][A-Z0-9_]*$/.test(request.name)) {
      throw new WorkspaceServiceError(
        'Secret name must be uppercase with underscores only',
        'INVALID_NAME'
      );
    }

    // Encrypt the value
    const encryptedValue = this.encryptSecret(request.value);

    // Check if secret exists - if so, update it
    const existing = await this.repository.getSecretByName(workspaceId, request.name);
    if (existing) {
      // Delete and recreate to update
      await this.repository.deleteSecret(workspaceId, existing.id, userId);
    }

    await this.repository.createSecret(workspaceId, request.name, encryptedValue, userId);

    return { name: request.name };
  }

  async deleteSecret(workspaceId: string, secretName: string, userId: string): Promise<void> {
    await this.requirePermission(workspaceId, userId, 'secret.delete');

    const secret = await this.repository.getSecretByName(workspaceId, secretName);
    if (!secret) {
      throw new WorkspaceServiceError('Secret not found', 'NOT_FOUND', 404);
    }

    await this.repository.deleteSecret(workspaceId, secret.id, userId);
  }

  async listSecrets(
    workspaceId: string,
    userId: string
  ): Promise<{ name: string; createdAt: Date }[]> {
    await this.requirePermission(workspaceId, userId, 'secret.read');

    const secrets = await this.repository.getSecrets(workspaceId);
    return secrets.map((s) => ({
      name: s.name,
      createdAt: s.createdAt,
    }));
  }

  async getSecretValue(workspaceId: string, secretName: string, userId: string): Promise<string> {
    await this.requirePermission(workspaceId, userId, 'secret.read');

    const secret = await this.repository.getSecretByName(workspaceId, secretName);
    if (!secret) {
      throw new WorkspaceServiceError('Secret not found', 'NOT_FOUND', 404);
    }

    return this.decryptSecret(secret.encryptedValue);
  }

  // ============================================================================
  // Activity Feed
  // ============================================================================

  async getActivityFeed(
    workspaceId: string,
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<ActivityFeedResponse> {
    await this.requirePermission(workspaceId, userId, 'workspace.read');

    const { activities, total } = await this.repository.getActivities(workspaceId, limit, offset);

    return {
      activities,
      total,
      hasMore: offset + activities.length < total,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async toWorkspaceResponse(workspace: Workspace): Promise<WorkspaceResponse> {
    const members = await this.repository.getMembers(workspace.id);
    const _secrets = await this.repository.getSecrets(workspace.id);

    return {
      ...workspace,
      members,
      packageCount: Object.keys(workspace.settings.packages).length,
      memberCount: members.length,
    };
  }

  private async requirePermission(
    workspaceId: string,
    userId: string,
    permission: string
  ): Promise<void> {
    const member = await this.repository.getMember(workspaceId, userId);
    if (!member) {
      throw new WorkspaceServiceError('Access denied', 'FORBIDDEN', 403);
    }

    const { hasPermission } = await import('../types.js');
    if (!hasPermission(member.role, permission)) {
      throw new WorkspaceServiceError(`Insufficient permissions: ${permission}`, 'FORBIDDEN', 403);
    }
  }

  // Simple encryption (in production, use proper key management)
  // SECURITY [HIGH] HARDCODED FALLBACK KEY: If HOLOSCRIPT_SECRET_KEY is unset in production,
  // all workspace secrets are encrypted with a known plaintext key anyone can read in this file.
  // Before deploying: (1) set HOLOSCRIPT_SECRET_KEY to a cryptographically random 32-byte value
  // from a secrets manager (e.g. AWS Secrets Manager, Vault); (2) replace the fallback below
  // with a startup assertion (throw new Error('HOLOSCRIPT_SECRET_KEY is required')) so the
  // service fails fast rather than silently degrading to the insecure default.
  // SECURITY [MEDIUM] WEAK KEY DERIVATION: Buffer.from(key.padEnd(32).slice(0,32)) derives an
  // AES key by padding with ASCII spaces — not a KDF. Replace with crypto.scryptSync or
  // pbkdf2Sync before using user-supplied or short keys.
  private encryptSecret(value: string): string {
    const key = process.env.HOLOSCRIPT_SECRET_KEY || 'default-dev-key-32chars!';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(key.padEnd(32).slice(0, 32)),
      iv
    );
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptSecret(encryptedValue: string): string {
    // SECURITY: same key concerns as encryptSecret above.
    const key = process.env.HOLOSCRIPT_SECRET_KEY || 'default-dev-key-32chars!';
    const [ivHex, encrypted] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(key.padEnd(32).slice(0, 32)),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const workspaceService = new WorkspaceService();
