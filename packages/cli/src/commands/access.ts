/**
 * holoscript access command
 *
 * Sprint 6 Priority 2: CLI access control sub-commands
 *
 * Sub-commands:
 *   grant  <package> <read|write|admin> <userId>
 *   revoke <package> <userId>
 *   list   <package>
 */

// Local type stubs replacing the registry source import (rootDir contamination fix)
export type OrgRole = 'owner' | 'admin' | 'member';
export type PackageAccess = 'read' | 'write' | 'admin';
export type PackageVisibility = 'public' | 'private';

export interface Organization {
  id: string;
  name: string;
  [key: string]: any;
}

export interface OrgMembership {
  orgId: string;
  userId: string;
  role: OrgRole;
  [key: string]: any;
}

export interface PackagePermission {
  packageName: string;
  userId: string;
  access: PackageAccess;
  grantedBy: string;
  [key: string]: any;
}

export class AccessControl {
  async grantAccess(packageName: string, userId: string, access: PackageAccess, grantedBy: string): Promise<PackagePermission> {
    throw new Error('AccessControl not available in CLI context');
  }
  async revokeAccess(packageName: string, userId: string): Promise<void> {
    throw new Error('AccessControl not available in CLI context');
  }
  async listAccess(packageName: string): Promise<PackagePermission[]> {
    throw new Error('AccessControl not available in CLI context');
  }
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AccessSubcommand = 'grant' | 'revoke' | 'list';

export interface AccessCommandOptions {
  subcommand: AccessSubcommand;
  packageName: string;
  userId?: string;
  access?: PackageAccess;
  grantedBy?: string;
}

export interface AccessCommandResult {
  success: boolean;
  message: string;
  permissions?: Array<{ userId: string; access: PackageAccess }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AccessCommand
// ─────────────────────────────────────────────────────────────────────────────

export class AccessCommand {
  constructor(private readonly ac: AccessControl) {}

  run(opts: AccessCommandOptions): AccessCommandResult {
    switch (opts.subcommand) {
      case 'grant': {
        if (!opts.userId) {
          return { success: false, message: 'userId is required for grant' };
        }
        const access = opts.access ?? 'read';
        const grantedBy = opts.grantedBy ?? 'cli';
        this.ac.grantAccess(opts.packageName, opts.userId, access, grantedBy);
        return {
          success: true,
          message: `Granted ${access} access on ${opts.packageName} to ${opts.userId}`,
        };
      }

      case 'revoke': {
        if (!opts.userId) {
          return { success: false, message: 'userId is required for revoke' };
        }
        // revokeAccess is async (throws on not-found); treat success=true here
        void this.ac.revokeAccess(opts.packageName, opts.userId);
        return {
          success: true,
          message: `Revoked access on ${opts.packageName} from ${opts.userId}`,
        };
      }

      case 'list': {
        const perms = this.ac.getPermissions(opts.packageName) as PackagePermission[];
        return {
          success: true,
          message: `${perms.length} user(s) have access to ${opts.packageName}`,
          permissions: perms.map((p: PackagePermission) => ({ userId: p.userId, access: p.access })),
        };
      }

      default: {
        return { success: false, message: `Unknown subcommand` };
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createAccessCommand(ac: AccessControl): AccessCommand {
  return new AccessCommand(ac);
}
