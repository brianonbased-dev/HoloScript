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

import { AccessControl, PackageAccess } from '../../../registry/src/access/AccessControl.js';

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
        const removed = this.ac.revokeAccess(opts.packageName, opts.userId);
        return {
          success: removed,
          message: removed
            ? `Revoked access on ${opts.packageName} from ${opts.userId}`
            : `No access record found for ${opts.userId} on ${opts.packageName}`,
        };
      }

      case 'list': {
        const perms = this.ac.getPermissions(opts.packageName);
        return {
          success: true,
          message: `${perms.length} user(s) have access to ${opts.packageName}`,
          permissions: perms.map((p) => ({ userId: p.userId, access: p.access })),
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
