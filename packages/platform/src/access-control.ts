/**
 * Access Control
 *
 * Sprint 6: Private packages – org scopes + per-package ACL
 * Internal types use AC suffix to avoid name conflicts with PackageRegistry exports.
 */

// Internal types (not exported — conflict with PackageRegistry.ts names)
type OrgRoleAC = 'owner' | 'admin' | 'member';
type PackageAccessAC = 'read' | 'write' | 'admin';
type PackageVisibilityAC = 'public' | 'private';

interface OrganizationAC {
  id: string;
  name: string;
  displayName?: string;
  createdAt: Date;
}

interface OrgMembershipAC {
  orgId: string;
  userId: string;
  role: OrgRoleAC;
  joinedAt: Date;
}

interface PackagePermissionAC {
  packageName: string;
  userId: string;
  access: PackageAccessAC;
  grantedAt: Date;
  grantedBy: string;
}

interface PackageVisibilityRecordAC {
  packageName: string;
  visibility: PackageVisibilityAC;
  orgScope?: string;
}

export class AccessControl {
  private orgs: Map<string, OrganizationAC> = new Map();
  private memberships: Map<string, OrgMembershipAC[]> = new Map();
  private packagePermissions: Map<string, PackagePermissionAC[]> = new Map();
  private packageVisibility: Map<string, PackageVisibilityRecordAC> = new Map();

  createOrg(name: string, ownerId: string, displayName?: string): OrganizationAC {
    if (this.orgs.has(name)) throw new Error(`Organization "${name}" already exists`);
    const org: OrganizationAC = { id: name, name, displayName: displayName ?? name, createdAt: new Date() };
    this.orgs.set(name, org);
    this.addMember(name, ownerId, 'owner');
    return org;
  }

  getOrg(name: string): OrganizationAC | undefined {
    return this.orgs.get(name);
  }

  listOrgs(): OrganizationAC[] {
    return Array.from(this.orgs.values());
  }

  addMember(orgId: string, userId: string, role: OrgRoleAC = 'member'): OrgMembershipAC {
    const members = this.memberships.get(orgId) ?? [];
    const existing = members.find((m) => m.userId === userId);
    if (existing) { existing.role = role; return existing; }
    const membership: OrgMembershipAC = { orgId, userId, role, joinedAt: new Date() };
    members.push(membership);
    this.memberships.set(orgId, members);
    return membership;
  }

  removeMember(orgId: string, userId: string): boolean {
    const members = this.memberships.get(orgId);
    if (!members) return false;
    const idx = members.findIndex((m) => m.userId === userId);
    if (idx === -1) return false;
    members.splice(idx, 1);
    return true;
  }

  getMembers(orgId: string): OrgMembershipAC[] {
    return this.memberships.get(orgId) ?? [];
  }

  getMembership(orgId: string, userId: string): OrgMembershipAC | undefined {
    return this.memberships.get(orgId)?.find((m) => m.userId === userId);
  }

  isMember(orgId: string, userId: string): boolean {
    return !!this.getMembership(orgId, userId);
  }

  hasOrgRole(orgId: string, userId: string, role: OrgRoleAC): boolean {
    const membership = this.getMembership(orgId, userId);
    if (!membership) return false;
    const hierarchy: OrgRoleAC[] = ['member', 'admin', 'owner'];
    return hierarchy.indexOf(membership.role) >= hierarchy.indexOf(role);
  }

  setVisibility(packageName: string, visibility: PackageVisibilityAC, orgScope?: string): void {
    this.packageVisibility.set(packageName, { packageName, visibility, orgScope });
  }

  getVisibility(packageName: string): PackageVisibilityRecordAC {
    return this.packageVisibility.get(packageName) ?? { packageName, visibility: 'public' };
  }

  isPublic(packageName: string): boolean {
    return this.getVisibility(packageName).visibility === 'public';
  }

  grantAccess(packageName: string, userId: string, access: PackageAccessAC, grantedBy: string): PackagePermissionAC {
    const perms = this.packagePermissions.get(packageName) ?? [];
    const existing = perms.find((p) => p.userId === userId);
    if (existing) { existing.access = access; return existing; }
    const perm: PackagePermissionAC = { packageName, userId, access, grantedAt: new Date(), grantedBy };
    perms.push(perm);
    this.packagePermissions.set(packageName, perms);
    return perm;
  }

  revokeAccess(packageName: string, userId: string): boolean {
    const perms = this.packagePermissions.get(packageName);
    if (!perms) return false;
    const idx = perms.findIndex((p) => p.userId === userId);
    if (idx === -1) return false;
    perms.splice(idx, 1);
    return true;
  }

  getPermissions(packageName: string): PackagePermissionAC[] {
    return this.packagePermissions.get(packageName) ?? [];
  }

  getUserAccess(packageName: string, userId: string): PackageAccessAC | null {
    const perm = this.packagePermissions.get(packageName)?.find((p) => p.userId === userId);
    return perm?.access ?? null;
  }

  canAccess(packageName: string, userId: string, required: PackageAccessAC): boolean {
    const vis = this.getVisibility(packageName);
    if (vis.visibility === 'public' && required === 'read') return true;
    if (vis.orgScope) {
      if (required === 'read' && this.isMember(vis.orgScope, userId)) return true;
      if (required === 'write' && this.hasOrgRole(vis.orgScope, userId, 'admin')) return true;
      if (required === 'admin' && this.hasOrgRole(vis.orgScope, userId, 'owner')) return true;
    }
    const userAccess = this.getUserAccess(packageName, userId);
    if (!userAccess) return false;
    const hierarchy: PackageAccessAC[] = ['read', 'write', 'admin'];
    return hierarchy.indexOf(userAccess) >= hierarchy.indexOf(required);
  }

  visiblePackages(allPackageNames: string[], userId: string): string[] {
    return allPackageNames.filter((name) => this.canAccess(name, userId, 'read'));
  }

  clear(): void {
    this.orgs.clear();
    this.memberships.clear();
    this.packagePermissions.clear();
    this.packageVisibility.clear();
  }
}

export function createAccessControl(): AccessControl {
  return new AccessControl();
}