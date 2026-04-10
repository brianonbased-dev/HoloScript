/**
 * HoloScript Team Workspaces
 *
 * Collaborative workspaces for teams with shared configurations,
 * role-based access control, secrets management, and activity feeds.
 */

/**
 * Workspace member roles
 */
export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'viewer';

/**
 * Role permissions
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, string[]> = {
  owner: [
    'workspace:delete',
    'workspace:settings',
    'billing:manage',
    'members:manage',
    'packages:publish',
    'packages:read',
    'secrets:manage',
    'secrets:read',
  ],
  admin: [
    'workspace:settings',
    'members:manage',
    'packages:publish',
    'packages:read',
    'secrets:manage',
    'secrets:read',
  ],
  developer: ['packages:publish', 'packages:read', 'secrets:read'],
  viewer: ['packages:read'],
};

/**
 * Workspace member
 */
export interface WorkspaceMember {
  userId: string;
  username: string;
  email?: string;
  role: WorkspaceRole;
  joinedAt: string;
  invitedBy?: string;
}

/**
 * Workspace settings
 */
export interface WorkspaceSettings {
  formatter?: {
    tabWidth?: number;
    useTabs?: boolean;
    printWidth?: number;
  };
  linter?: {
    rules?: Record<string, 'off' | 'warn' | 'error'>;
  };
  compiler?: {
    target?: string;
    strictMode?: boolean;
  };
  packages?: Record<string, string>;
}

/**
 * Activity types
 */
export type ActivityType =
  | 'workspace:created'
  | 'workspace:updated'
  | 'member:joined'
  | 'member:left'
  | 'member:role_changed'
  | 'package:published'
  | 'settings:updated'
  | 'secret:added'
  | 'secret:removed';

/**
 * Activity entry
 */
export interface ActivityEntry {
  id: string;
  type: ActivityType;
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
}

/**
 * Encrypted secret
 */
export interface WorkspaceSecret {
  name: string;
  encryptedValue: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

/**
 * Workspace definition
 */
export interface Workspace {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  ownerId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  secrets: WorkspaceSecret[];
  activity: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Create workspace options
 */
export interface CreateWorkspaceOptions {
  name: string;
  displayName?: string;
  description?: string;
  settings?: WorkspaceSettings;
}

/**
 * Workspace Manager for team collaboration
 */
export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private userWorkspaces: Map<string, Set<string>> = new Map();

  /**
   * Create a new workspace
   */
  createWorkspace(ownerId: string, options: CreateWorkspaceOptions): Workspace {
    // Validate workspace name
    if (!this.isValidWorkspaceName(options.name)) {
      throw new Error('Invalid workspace name. Use lowercase letters, numbers, and hyphens only.');
    }

    // Check if workspace already exists
    if (this.workspaces.has(options.name)) {
      throw new Error(`Workspace "${options.name}" already exists`);
    }

    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: this.generateId(),
      name: options.name,
      displayName: options.displayName || options.name,
      description: options.description,
      ownerId,
      members: [
        {
          userId: ownerId,
          username: ownerId, // Will be resolved from user service
          role: 'owner',
          joinedAt: now,
        },
      ],
      settings: options.settings || {},
      secrets: [],
      activity: [
        {
          id: this.generateId(),
          type: 'workspace:created',
          actor: ownerId,
          timestamp: now,
          details: { name: options.name },
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(options.name, workspace);
    this.addUserWorkspace(ownerId, options.name);

    return workspace;
  }

  /**
   * Get a workspace by name
   */
  getWorkspace(name: string): Workspace | undefined {
    return this.workspaces.get(name);
  }

  /**
   * Get all workspaces for a user
   */
  getUserWorkspaces(userId: string): Workspace[] {
    const workspaceNames = this.userWorkspaces.get(userId);
    if (!workspaceNames) {
      return [];
    }

    return Array.from(workspaceNames)
      .map((name) => this.workspaces.get(name))
      .filter((w): w is Workspace => w !== undefined);
  }

  /**
   * Update workspace settings
   */
  updateSettings(
    workspaceName: string,
    actorId: string,
    settings: Partial<WorkspaceSettings>
  ): Workspace {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'workspace:settings');

    workspace.settings = {
      ...workspace.settings,
      ...settings,
    };
    workspace.updatedAt = new Date().toISOString();

    this.addActivity(workspace, {
      type: 'settings:updated',
      actor: actorId,
      details: { updated: Object.keys(settings) },
    });

    return workspace;
  }

  /**
   * Invite a member to the workspace
   */
  inviteMember(
    workspaceName: string,
    actorId: string,
    userId: string,
    username: string,
    role: WorkspaceRole = 'developer'
  ): WorkspaceMember {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'members:manage');

    // Check if already a member
    if (workspace.members.some((m) => m.userId === userId)) {
      throw new Error(`User "${username}" is already a member`);
    }

    // Cannot invite as owner
    if (role === 'owner') {
      throw new Error('Cannot invite as owner. Transfer ownership instead.');
    }

    const member: WorkspaceMember = {
      userId,
      username,
      role,
      joinedAt: new Date().toISOString(),
      invitedBy: actorId,
    };

    workspace.members.push(member);
    workspace.updatedAt = new Date().toISOString();
    this.addUserWorkspace(userId, workspaceName);

    this.addActivity(workspace, {
      type: 'member:joined',
      actor: actorId,
      details: { userId, username, role },
    });

    return member;
  }

  /**
   * Remove a member from the workspace
   */
  removeMember(workspaceName: string, actorId: string, userId: string): void {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'members:manage');

    // Cannot remove the owner
    if (userId === workspace.ownerId) {
      throw new Error('Cannot remove the workspace owner');
    }

    const memberIndex = workspace.members.findIndex((m) => m.userId === userId);
    if (memberIndex === -1) {
      throw new Error('User is not a member of this workspace');
    }

    const member = workspace.members[memberIndex];
    workspace.members.splice(memberIndex, 1);
    workspace.updatedAt = new Date().toISOString();
    this.removeUserWorkspace(userId, workspaceName);

    this.addActivity(workspace, {
      type: 'member:left',
      actor: actorId,
      details: { userId, username: member.username, removedBy: actorId },
    });
  }

  /**
   * Change a member's role
   */
  changeMemberRole(
    workspaceName: string,
    actorId: string,
    userId: string,
    newRole: WorkspaceRole
  ): void {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'members:manage');

    // Cannot change owner's role
    if (userId === workspace.ownerId) {
      throw new Error("Cannot change the owner's role. Transfer ownership instead.");
    }

    // Cannot promote to owner
    if (newRole === 'owner') {
      throw new Error('Cannot promote to owner. Transfer ownership instead.');
    }

    const member = workspace.members.find((m) => m.userId === userId);
    if (!member) {
      throw new Error('User is not a member of this workspace');
    }

    const oldRole = member.role;
    member.role = newRole;
    workspace.updatedAt = new Date().toISOString();

    this.addActivity(workspace, {
      type: 'member:role_changed',
      actor: actorId,
      details: { userId, username: member.username, oldRole, newRole },
    });
  }

  /**
   * Add a secret to the workspace
   */
  addSecret(workspaceName: string, actorId: string, name: string, value: string): void {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'secrets:manage');

    // Check if secret already exists
    const existingIndex = workspace.secrets.findIndex((s) => s.name === name);

    const encryptedValue = this.encryptSecret(value);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      // Update existing secret
      workspace.secrets[existingIndex] = {
        ...workspace.secrets[existingIndex],
        encryptedValue,
        updatedAt: now,
      };
    } else {
      // Add new secret
      workspace.secrets.push({
        name,
        encryptedValue,
        createdAt: now,
        createdBy: actorId,
      });
    }

    workspace.updatedAt = now;

    this.addActivity(workspace, {
      type: 'secret:added',
      actor: actorId,
      details: { name, isUpdate: existingIndex >= 0 },
    });
  }

  /**
   * Remove a secret from the workspace
   */
  removeSecret(workspaceName: string, actorId: string, name: string): void {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'secrets:manage');

    const index = workspace.secrets.findIndex((s) => s.name === name);
    if (index === -1) {
      throw new Error(`Secret "${name}" not found`);
    }

    workspace.secrets.splice(index, 1);
    workspace.updatedAt = new Date().toISOString();

    this.addActivity(workspace, {
      type: 'secret:removed',
      actor: actorId,
      details: { name },
    });
  }

  /**
   * Get secret value (decrypted)
   */
  getSecretValue(workspaceName: string, actorId: string, name: string): string | undefined {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'secrets:read');

    const secret = workspace.secrets.find((s) => s.name === name);
    if (!secret) {
      return undefined;
    }

    return this.decryptSecret(secret.encryptedValue);
  }

  /**
   * List secret names (not values)
   */
  listSecrets(workspaceName: string, actorId: string): string[] {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'secrets:read');

    return workspace.secrets.map((s) => s.name);
  }

  /**
   * Get activity feed
   */
  getActivity(workspaceName: string, actorId: string, limit: number = 50): ActivityEntry[] {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'packages:read');

    return workspace.activity.slice(-limit).reverse();
  }

  /**
   * Delete a workspace
   */
  deleteWorkspace(workspaceName: string, actorId: string): void {
    const workspace = this.getWorkspaceOrThrow(workspaceName);
    this.checkPermission(workspace, actorId, 'workspace:delete');

    // Remove from all user mappings
    for (const member of workspace.members) {
      this.removeUserWorkspace(member.userId, workspaceName);
    }

    this.workspaces.delete(workspaceName);
  }

  /**
   * Check if user has permission
   */
  hasPermission(workspaceName: string, userId: string, permission: string): boolean {
    const workspace = this.workspaces.get(workspaceName);
    if (!workspace) {
      return false;
    }

    const member = workspace.members.find((m) => m.userId === userId);
    if (!member) {
      return false;
    }

    return ROLE_PERMISSIONS[member.role].includes(permission);
  }

  // Private helpers

  private getWorkspaceOrThrow(name: string): Workspace {
    const workspace = this.workspaces.get(name);
    if (!workspace) {
      throw new Error(`Workspace "${name}" not found`);
    }
    return workspace;
  }

  private checkPermission(workspace: Workspace, userId: string, permission: string): void {
    const member = workspace.members.find((m) => m.userId === userId);
    if (!member) {
      throw new Error('You are not a member of this workspace');
    }

    if (!ROLE_PERMISSIONS[member.role].includes(permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }

  private addUserWorkspace(userId: string, workspaceName: string): void {
    if (!this.userWorkspaces.has(userId)) {
      this.userWorkspaces.set(userId, new Set());
    }
    this.userWorkspaces.get(userId)!.add(workspaceName);
  }

  private removeUserWorkspace(userId: string, workspaceName: string): void {
    this.userWorkspaces.get(userId)?.delete(workspaceName);
  }

  private addActivity(workspace: Workspace, entry: Omit<ActivityEntry, 'id' | 'timestamp'>): void {
    workspace.activity.push({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...entry,
    });

    // Keep only last 1000 activities
    if (workspace.activity.length > 1000) {
      workspace.activity = workspace.activity.slice(-1000);
    }
  }

  private isValidWorkspaceName(name: string): boolean {
    return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) && name.length >= 3 && name.length <= 64;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  // Simple encryption (in production, use proper encryption)
  private encryptSecret(value: string): string {
    return Buffer.from(value).toString('base64');
  }

  private decryptSecret(encryptedValue: string): string {
    return Buffer.from(encryptedValue, 'base64').toString('utf-8');
  }
}

/**
 * Create a workspace manager instance
 */
export function createWorkspaceManager(): WorkspaceManager {
  return new WorkspaceManager();
}

/**
 * Default workspace manager instance
 */
export const defaultWorkspaceManager = createWorkspaceManager();
