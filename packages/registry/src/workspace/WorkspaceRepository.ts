/**
 * WorkspaceRepository - Data access layer for workspaces
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceSecret,
  WorkspaceActivity,
  WorkspaceSettings,
  WorkspaceRole,
  ActivityAction,
} from '../types.js';

// In-memory storage for development (replace with actual DB in production)
const workspaces = new Map<string, Workspace>();
const members = new Map<string, WorkspaceMember[]>();
const secrets = new Map<string, WorkspaceSecret[]>();
const activities = new Map<string, WorkspaceActivity[]>();

const DEFAULT_SETTINGS: WorkspaceSettings = {
  visibility: 'private',
  formatter: {
    tabWidth: 2,
    useTabs: false,
    printWidth: 100,
    trailingComma: true,
  },
  linter: {
    rules: {
      'no-unused': 'warn',
      'no-duplicate-traits': 'error',
      'require-geometry': 'warn',
    },
  },
  packages: {},
};

export class WorkspaceRepository {
  // ============================================================================
  // Workspace CRUD
  // ============================================================================

  async createWorkspace(
    name: string,
    ownerId: string,
    displayName?: string,
    description?: string,
    visibility: 'public' | 'private' = 'private'
  ): Promise<Workspace> {
    const id = uuidv4();
    const now = new Date();

    const workspace: Workspace = {
      id,
      name: this.normalizeWorkspaceName(name),
      displayName: displayName || name,
      description,
      ownerId,
      createdAt: now,
      updatedAt: now,
      settings: {
        ...DEFAULT_SETTINGS,
        visibility,
      },
    };

    workspaces.set(id, workspace);
    members.set(id, [
      {
        workspaceId: id,
        userId: ownerId,
        role: 'owner',
        joinedAt: now,
        invitedBy: ownerId,
      },
    ]);
    activities.set(id, []);
    secrets.set(id, []);

    await this.logActivity(id, ownerId, 'workspace.created', { name: workspace.name });

    return workspace;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return workspaces.get(id) || null;
  }

  async getWorkspaceByName(name: string): Promise<Workspace | null> {
    const normalized = this.normalizeWorkspaceName(name);
    for (const workspace of workspaces.values()) {
      if (workspace.name === normalized) {
        return workspace;
      }
    }
    return null;
  }

  async updateWorkspace(
    id: string,
    updates: {
      displayName?: string;
      description?: string;
      settings?: Partial<WorkspaceSettings>;
    }
  ): Promise<Workspace | null> {
    const workspace = workspaces.get(id);
    if (!workspace) return null;

    const updated: Workspace = {
      ...workspace,
      ...updates,
      settings: updates.settings
        ? { ...workspace.settings, ...updates.settings }
        : workspace.settings,
      updatedAt: new Date(),
    };

    workspaces.set(id, updated);
    return updated;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    if (!workspaces.has(id)) return false;

    workspaces.delete(id);
    members.delete(id);
    secrets.delete(id);
    activities.delete(id);

    return true;
  }

  async listWorkspacesForUser(userId: string): Promise<Workspace[]> {
    const result: Workspace[] = [];

    for (const [workspaceId, memberList] of members.entries()) {
      if (memberList.some((m) => m.userId === userId)) {
        const workspace = workspaces.get(workspaceId);
        if (workspace) result.push(workspace);
      }
    }

    return result;
  }

  // ============================================================================
  // Members
  // ============================================================================

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    invitedBy: string
  ): Promise<WorkspaceMember> {
    const member: WorkspaceMember = {
      workspaceId,
      userId,
      role,
      joinedAt: new Date(),
      invitedBy,
    };

    const memberList = members.get(workspaceId) || [];
    memberList.push(member);
    members.set(workspaceId, memberList);

    await this.logActivity(workspaceId, invitedBy, 'member.invited', {
      userId,
      role,
    });

    return member;
  }

  async removeMember(workspaceId: string, userId: string, removedBy: string): Promise<boolean> {
    const memberList = members.get(workspaceId);
    if (!memberList) return false;

    const index = memberList.findIndex((m) => m.userId === userId);
    if (index === -1) return false;

    memberList.splice(index, 1);
    members.set(workspaceId, memberList);

    await this.logActivity(workspaceId, removedBy, 'member.removed', { userId });

    return true;
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    newRole: WorkspaceRole,
    updatedBy: string
  ): Promise<WorkspaceMember | null> {
    const memberList = members.get(workspaceId);
    if (!memberList) return null;

    const member = memberList.find((m) => m.userId === userId);
    if (!member) return null;

    member.role = newRole;

    await this.logActivity(workspaceId, updatedBy, 'member.role_changed', {
      userId,
      newRole,
    });

    return member;
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const memberList = members.get(workspaceId);
    return memberList?.find((m) => m.userId === userId) || null;
  }

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return members.get(workspaceId) || [];
  }

  // ============================================================================
  // Secrets
  // ============================================================================

  async createSecret(
    workspaceId: string,
    name: string,
    encryptedValue: string,
    createdBy: string
  ): Promise<WorkspaceSecret> {
    const secret: WorkspaceSecret = {
      id: uuidv4(),
      workspaceId,
      name,
      encryptedValue,
      createdAt: new Date(),
      createdBy,
    };

    const secretList = secrets.get(workspaceId) || [];
    secretList.push(secret);
    secrets.set(workspaceId, secretList);

    await this.logActivity(workspaceId, createdBy, 'secret.created', { name });

    return secret;
  }

  async deleteSecret(workspaceId: string, secretId: string, deletedBy: string): Promise<boolean> {
    const secretList = secrets.get(workspaceId);
    if (!secretList) return false;

    const index = secretList.findIndex((s) => s.id === secretId);
    if (index === -1) return false;

    const secret = secretList[index];
    secretList.splice(index, 1);
    secrets.set(workspaceId, secretList);

    await this.logActivity(workspaceId, deletedBy, 'secret.deleted', {
      name: secret.name,
    });

    return true;
  }

  async getSecrets(workspaceId: string): Promise<WorkspaceSecret[]> {
    return secrets.get(workspaceId) || [];
  }

  async getSecretByName(workspaceId: string, name: string): Promise<WorkspaceSecret | null> {
    const secretList = secrets.get(workspaceId);
    return secretList?.find((s) => s.name === name) || null;
  }

  // ============================================================================
  // Activity
  // ============================================================================

  async logActivity(
    workspaceId: string,
    userId: string,
    action: ActivityAction,
    details: Record<string, unknown>
  ): Promise<WorkspaceActivity> {
    const activity: WorkspaceActivity = {
      id: uuidv4(),
      workspaceId,
      userId,
      action,
      details,
      createdAt: new Date(),
    };

    const activityList = activities.get(workspaceId) || [];
    activityList.unshift(activity); // Most recent first
    activities.set(workspaceId, activityList);

    return activity;
  }

  async getActivities(
    workspaceId: string,
    limit = 50,
    offset = 0
  ): Promise<{ activities: WorkspaceActivity[]; total: number }> {
    const activityList = activities.get(workspaceId) || [];
    return {
      activities: activityList.slice(offset, offset + limit),
      total: activityList.length,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private normalizeWorkspaceName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export const workspaceRepository = new WorkspaceRepository();
