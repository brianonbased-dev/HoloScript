/**
 * Type definitions for HoloScript Registry and Team Workspaces
 */

// ============================================================================
// Workspace Types
// ============================================================================

export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
  visibility: 'public' | 'private';
  formatter: FormatterSettings;
  linter: LinterSettings;
  packages: Record<string, string>;
}

export interface FormatterSettings {
  tabWidth: number;
  useTabs: boolean;
  printWidth: number;
  trailingComma: boolean;
}

export interface LinterSettings {
  rules: Record<string, 'off' | 'warn' | 'error'>;
  extends?: string[];
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
  invitedBy: string;
}

export interface WorkspaceSecret {
  id: string;
  workspaceId: string;
  name: string;
  encryptedValue: string;
  createdAt: Date;
  createdBy: string;
  lastUsedAt?: Date;
}

export interface WorkspaceActivity {
  id: string;
  workspaceId: string;
  userId: string;
  action: ActivityAction;
  details: Record<string, unknown>;
  createdAt: Date;
}

export type ActivityAction =
  | 'workspace.created'
  | 'workspace.updated'
  | 'member.invited'
  | 'member.removed'
  | 'member.role_changed'
  | 'package.published'
  | 'package.deprecated'
  | 'secret.created'
  | 'secret.deleted'
  | 'settings.updated';

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface UserSession {
  userId: string;
  token: string;
  expiresAt: Date;
}

// ============================================================================
// Package Types
// ============================================================================

export interface Package {
  name: string;
  version: string;
  description?: string;
  author: string;
  license?: string;
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
  downloads: number;
  tags: string[];
}

export interface PackageVersion {
  packageName: string;
  version: string;
  tarballUrl: string;
  shasum: string;
  size: number;
  publishedAt: Date;
  publishedBy: string;
  dependencies: Record<string, string>;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateWorkspaceRequest {
  name: string;
  displayName?: string;
  description?: string;
  visibility?: 'public' | 'private';
}

export interface UpdateWorkspaceRequest {
  displayName?: string;
  description?: string;
  settings?: Partial<WorkspaceSettings>;
}

export interface InviteMemberRequest {
  userId: string;
  role: WorkspaceRole;
}

export interface SetSecretRequest {
  name: string;
  value: string;
}

export interface WorkspaceResponse extends Workspace {
  members: WorkspaceMember[];
  packageCount: number;
  memberCount: number;
}

export interface ActivityFeedResponse {
  activities: WorkspaceActivity[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Permission Utilities
// ============================================================================

export const ROLE_PERMISSIONS: Record<WorkspaceRole, string[]> = {
  owner: [
    'workspace.read',
    'workspace.update',
    'workspace.delete',
    'member.read',
    'member.invite',
    'member.remove',
    'member.update_role',
    'package.read',
    'package.publish',
    'package.deprecate',
    'secret.read',
    'secret.create',
    'secret.delete',
    'settings.read',
    'settings.update',
    'billing.manage',
  ],
  admin: [
    'workspace.read',
    'workspace.update',
    'member.read',
    'member.invite',
    'member.remove',
    'member.update_role',
    'package.read',
    'package.publish',
    'package.deprecate',
    'secret.read',
    'secret.create',
    'settings.read',
    'settings.update',
  ],
  developer: [
    'workspace.read',
    'member.read',
    'package.read',
    'package.publish',
    'secret.read',
    'settings.read',
  ],
  viewer: ['workspace.read', 'member.read', 'package.read', 'settings.read'],
};

export function hasPermission(role: WorkspaceRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return hasPermission(role, 'member.invite');
}

export function canPublishPackages(role: WorkspaceRole): boolean {
  return hasPermission(role, 'package.publish');
}

export function canManageSecrets(role: WorkspaceRole): boolean {
  return hasPermission(role, 'secret.create');
}
