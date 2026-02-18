/**
 * Access Control
 *
 * Sprint 6 Priority 2: Private packages – org scopes + per-package ACL
 *
 * Manages:
 *  - Organizations (create, lookup)
 *  - Org membership (owner / admin / member)
 *  - Package-level access grants (read / write / admin)
 *  - Visibility: public vs. private packages
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OrgRole = 'owner' | 'admin' | 'member';
export type PackageAccess = 'read' | 'write' | 'admin';
export type PackageVisibility = 'public' | 'private';

export interface Organization {
  id: string;
  name: string;
  displayName?: string;
  createdAt: Date;
}

export interface OrgMembership {
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: Date;
}

export interface PackagePermission {
  packageName: string;
  userId: string;
  access: PackageAccess;
  grantedAt: Date;
  grantedBy: string;
}

export interface PackageVisibilityRecord {
  packageName: string;
  visibility: PackageVisibility;
  orgScope?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AccessControl
// ─────────────────────────────────────────────────────────────────────────────

export class AccessControl {
  private orgs: Map<string, Organization> = new Map();
  private memberships: Map<string, OrgMembership[]> = new Map(); // key = orgId
  private packagePermissions: Map<string, PackagePermission[]> = new Map(); // key = packageName
  private packageVisibility: Map<string, PackageVisibilityRecord> = new Map();

  // ─── Organizations ────────────────────────────────────────────────────────

  createOrg(name: string, ownerId: string, displayName?: string): Organization {
    if (this.orgs.has(name)) throw new Error(`Organization "${name}" already exists`);
    const org: Organization = {
      id: name,
      name,
      displayName: displayName ?? name,
      createdAt: new Date(),
    };
    this.orgs.set(name, org);
    // Auto-add owner as member
    this.addMember(name, ownerId, 'owner');
    return org;
  }

  getOrg(name: string): Organization | undefined {
    return this.orgs.get(name);
  }

  listOrgs(): Organization[] {
    return Array.from(this.orgs.values());
  }

  // ─── Membership ───────────────────────────────────────────────────────────

  addMember(orgId: string, userId: string, role: OrgRole = 'member'): OrgMembership {
    const members = this.memberships.get(orgId) ?? [];
    const existing = members.find((m) => m.userId === userId);
    if (existing) {
      existing.role = role; // update role
      return existing;
    }
    const membership: OrgMembership = { orgId, userId, role, joinedAt: new Date() };
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

  getMembers(orgId: string): OrgMembership[] {
    return this.memberships.get(orgId) ?? [];
  }

  getMembership(orgId: string, userId: string): OrgMembership | undefined {
    return this.memberships.get(orgId)?.find((m) => m.userId === userId);
  }

  isMember(orgId: string, userId: string): boolean {
    return !!this.getMembership(orgId, userId);
  }

  hasOrgRole(orgId: string, userId: string, role: OrgRole): boolean {
    const membership = this.getMembership(orgId, userId);
    if (!membership) return false;
    const hierarchy: OrgRole[] = ['member', 'admin', 'owner'];
    return hierarchy.indexOf(membership.role) >= hierarchy.indexOf(role);
  }

  // ─── Package Permissions ──────────────────────────────────────────────────

  setVisibility(packageName: string, visibility: PackageVisibility, orgScope?: string): void {
    this.packageVisibility.set(packageName, { packageName, visibility, orgScope });
  }

  getVisibility(packageName: string): PackageVisibilityRecord {
    return (
      this.packageVisibility.get(packageName) ?? {
        packageName,
        visibility: 'public',
      }
    );
  }

  isPublic(packageName: string): boolean {
    return this.getVisibility(packageName).visibility === 'public';
  }

  grantAccess(
    packageName: string,
    userId: string,
    access: PackageAccess,
    grantedBy: string
  ): PackagePermission {
    const perms = this.packagePermissions.get(packageName) ?? [];
    const existing = perms.find((p) => p.userId === userId);
    if (existing) {
      existing.access = access;
      return existing;
    }
    const perm: PackagePermission = { packageName, userId, access, grantedAt: new Date(), grantedBy };
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

  getPermissions(packageName: string): PackagePermission[] {
    return this.packagePermissions.get(packageName) ?? [];
  }

  getUserAccess(packageName: string, userId: string): PackageAccess | null {
    const perm = this.packagePermissions.get(packageName)?.find((p) => p.userId === userId);
    return perm?.access ?? null;
  }

  /**
   * Check if a user can perform an operation on a package.
   * Public packages are readable by everyone.
   * Private packages require an explicit grant.
   */
  canAccess(packageName: string, userId: string, required: PackageAccess): boolean {
    const vis = this.getVisibility(packageName);

    // Public package: reads are free
    if (vis.visibility === 'public' && required === 'read') return true;

    // Check if user is an org member with sufficient rights
    if (vis.orgScope) {
      if (required === 'read' && this.isMember(vis.orgScope, userId)) return true;
      if (required === 'write' && this.hasOrgRole(vis.orgScope, userId, 'admin')) return true;
      if (required === 'admin' && this.hasOrgRole(vis.orgScope, userId, 'owner')) return true;
    }

    // Explicit package-level grant
    const userAccess = this.getUserAccess(packageName, userId);
    if (!userAccess) return false;
    const hierarchy: PackageAccess[] = ['read', 'write', 'admin'];
    return hierarchy.indexOf(userAccess) >= hierarchy.indexOf(required);
  }

  /**
   * List packages visible to a user (includes public + granted private).
   */
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
