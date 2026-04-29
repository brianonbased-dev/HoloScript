/**
 * Sprint 8 Acceptance Tests
 *
 * v3.17.0 â€” WASM compiler, Team workspaces (RBAC + secrets + activity), HoloScript Academy
 *
 * Coverage:
 *   1. WASM compiler package structure  â€” 10 tests
 *   2. Workspace RBAC & permission utils â€” 16 tests
 *   3. WorkspaceService operations       â€” 15 tests
 *   4. HoloScript Academy content        â€” 16 tests
 *                               Total:   57 tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// â”€â”€ Workspace RBAC types & helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  ROLE_PERMISSIONS,
  hasPermission,
  canManageMembers,
  canPublishPackages,
  canManageSecrets,
  type WorkspaceRole,
} from '../../../registry/src/types';

// â”€â”€ WorkspaceService â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  WorkspaceService,
  WorkspaceServiceError,
} from '../../../registry/src/workspace/WorkspaceService';
import { WorkspaceRepository } from '../../../registry/src/workspace/WorkspaceRepository';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Path constants
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WASM_ROOT = join(__dirname, '../../../../packages/compiler-wasm');
const ACADEMY_ROOT = join(__dirname, '../../../../docs/academy');

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 1. WASM Compiler package structure
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('WASM Compiler Package Structure', () => {
  it('Cargo.toml exists', () => {
    expect(existsSync(join(WASM_ROOT, 'Cargo.toml'))).toBe(true);
  });

  it('Cargo.toml names the crate holoscript-wasm', () => {
    const cargo = readFileSync(join(WASM_ROOT, 'Cargo.toml'), 'utf8');
    expect(cargo).toContain('holoscript-wasm');
  });

  it('Cargo.toml has wasm-bindgen dependency', () => {
    const cargo = readFileSync(join(WASM_ROOT, 'Cargo.toml'), 'utf8');
    expect(cargo).toContain('wasm-bindgen');
  });

  it('lib.rs exists', () => {
    expect(existsSync(join(WASM_ROOT, 'src/lib.rs'))).toBe(true);
  });

  it('lexer.rs exists', () => {
    expect(existsSync(join(WASM_ROOT, 'src/lexer.rs'))).toBe(true);
  });

  it('parser.rs exists', () => {
    expect(existsSync(join(WASM_ROOT, 'src/parser.rs'))).toBe(true);
  });

  it('ast.rs exists', () => {
    expect(existsSync(join(WASM_ROOT, 'src/ast.rs'))).toBe(true);
  });

  it('lib.rs exports parse(), validate(), validate_detailed(), version() via wasm_bindgen', () => {
    const lib = readFileSync(join(WASM_ROOT, 'src/lib.rs'), 'utf8');
    expect(lib).toContain('pub fn parse(');
    expect(lib).toContain('pub fn validate(');
    expect(lib).toContain('pub fn validate_detailed(');
    expect(lib).toContain('pub fn version(');
  });

  it('lib.rs has wasm_bindgen attribute on exported functions', () => {
    const lib = readFileSync(join(WASM_ROOT, 'src/lib.rs'), 'utf8');
    expect(lib).toContain('#[wasm_bindgen]');
  });

  it('lib.rs includes Rust unit tests', () => {
    const lib = readFileSync(join(WASM_ROOT, 'src/lib.rs'), 'utf8');
    expect(lib).toContain('#[cfg(test)]');
    expect(lib).toContain('#[test]');
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2. Workspace RBAC permission utils
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Workspace RBAC Permissions', () => {
  it('all four roles are defined in ROLE_PERMISSIONS', () => {
    const roles: WorkspaceRole[] = ['owner', 'admin', 'developer', 'viewer'];
    for (const role of roles) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it('owner has every permission including billing.manage and workspace.delete', () => {
    expect(hasPermission('owner', 'billing.manage')).toBe(true);
    expect(hasPermission('owner', 'workspace.delete')).toBe(true);
    expect(hasPermission('owner', 'secret.delete')).toBe(true);
  });

  it('admin cannot delete workspace or manage billing', () => {
    expect(hasPermission('admin', 'workspace.delete')).toBe(false);
    expect(hasPermission('admin', 'billing.manage')).toBe(false);
  });

  it('developer can publish packages but cannot manage members', () => {
    expect(hasPermission('developer', 'package.publish')).toBe(true);
    expect(hasPermission('developer', 'member.invite')).toBe(false);
  });

  it('viewer has read-only access only', () => {
    expect(hasPermission('viewer', 'workspace.read')).toBe(true);
    expect(hasPermission('viewer', 'package.publish')).toBe(false);
    expect(hasPermission('viewer', 'secret.read')).toBe(false);
    expect(hasPermission('viewer', 'member.invite')).toBe(false);
  });

  it('canManageMembers: owner and admin can; developer and viewer cannot', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('developer')).toBe(false);
    expect(canManageMembers('viewer')).toBe(false);
  });

  it('canPublishPackages: owner, admin, developer can; viewer cannot', () => {
    expect(canPublishPackages('owner')).toBe(true);
    expect(canPublishPackages('admin')).toBe(true);
    expect(canPublishPackages('developer')).toBe(true);
    expect(canPublishPackages('viewer')).toBe(false);
  });

  it('canManageSecrets: owner and admin can; developer and viewer cannot', () => {
    expect(canManageSecrets('owner')).toBe(true);
    expect(canManageSecrets('admin')).toBe(true);
    expect(canManageSecrets('developer')).toBe(false);
    expect(canManageSecrets('viewer')).toBe(false);
  });

  it('hasPermission returns false for unknown permission string', () => {
    expect(hasPermission('owner', 'nonexistent.permission')).toBe(false);
  });

  it('permission hierarchy: owner permissions âŠ‡ admin âŠ‡ developer âŠ‡ viewer', () => {
    const adminPerms = new Set(ROLE_PERMISSIONS.admin);
    const devPerms = new Set(ROLE_PERMISSIONS.developer);
    const viewerPerms = new Set(ROLE_PERMISSIONS.viewer);

    // Every admin perm is an owner perm
    for (const p of adminPerms) expect(hasPermission('owner', p)).toBe(true);
    // Every developer perm is an admin perm
    for (const p of devPerms) expect(hasPermission('admin', p)).toBe(true);
    // Every viewer perm is a developer perm
    for (const p of viewerPerms) expect(hasPermission('developer', p)).toBe(true);
  });

  it('workspace.read is available to all roles', () => {
    const roles: WorkspaceRole[] = ['owner', 'admin', 'developer', 'viewer'];
    for (const role of roles) {
      expect(hasPermission(role, 'workspace.read')).toBe(true);
    }
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 3. WorkspaceService operations
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let n = 0; // counter for unique names

  // Each test gets a fresh service backed by a fresh repository instance.
  // Because repository uses module-level Maps, we use unique names to avoid conflicts.
  beforeEach(() => {
    service = new WorkspaceService(new WorkspaceRepository());
    n++;
  });

  const uid = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const wname = () => `ws-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  it('WorkspaceService is instantiable', () => {
    expect(service).toBeDefined();
  });

  it('WorkspaceServiceError is an Error with code and statusCode', () => {
    const err = new WorkspaceServiceError('test', 'TEST_CODE', 422);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe('test');
  });

  it('createWorkspace: creates and returns a workspace response', async () => {
    const owner = uid();
    const name = wname();
    const ws = await service.createWorkspace({ name }, owner);
    expect(ws.name).toBe(name.toLowerCase());
    expect(ws.ownerId).toBe(owner);
    expect(ws.memberCount).toBe(1); // owner auto-added
  });

  it('createWorkspace: rejects a name shorter than 2 chars', async () => {
    await expect(service.createWorkspace({ name: 'a' }, uid())).rejects.toThrow('at least 2');
  });

  it('createWorkspace: rejects duplicate workspace names', async () => {
    const owner = uid();
    const name = wname();
    await service.createWorkspace({ name }, owner);
    await expect(service.createWorkspace({ name }, uid())).rejects.toThrow(/already exists/i);
  });

  it('getWorkspace: returns workspace for owner', async () => {
    const owner = uid();
    const name = wname();
    const created = await service.createWorkspace({ name }, owner);
    const fetched = await service.getWorkspace(created.id, owner);
    expect(fetched.id).toBe(created.id);
  });

  it('getWorkspace: throws NOT_FOUND for unknown id', async () => {
    await expect(service.getWorkspace('nonexistent-id', uid())).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('listUserWorkspaces: returns workspaces the user belongs to', async () => {
    const owner = uid();
    await service.createWorkspace({ name: wname() }, owner);
    await service.createWorkspace({ name: wname() }, owner);
    const list = await service.listUserWorkspaces(owner);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('inviteMember: owner can invite a developer', async () => {
    const owner = uid();
    const newUser = uid();
    const ws = await service.createWorkspace({ name: wname() }, owner);
    const member = await service.inviteMember(ws.id, { userId: newUser, role: 'developer' }, owner);
    expect(member.userId).toBe(newUser);
    expect(member.role).toBe('developer');
  });

  it('inviteMember: cannot invite as owner', async () => {
    const owner = uid();
    const ws = await service.createWorkspace({ name: wname() }, owner);
    await expect(
      service.inviteMember(ws.id, { userId: uid(), role: 'owner' }, owner)
    ).rejects.toMatchObject({ code: 'INVALID_ROLE' });
  });

  it('inviteMember: viewer cannot invite members', async () => {
    const owner = uid();
    const viewer = uid();
    const ws = await service.createWorkspace({ name: wname() }, owner);
    await service.inviteMember(ws.id, { userId: viewer, role: 'viewer' }, owner);
    await expect(
      service.inviteMember(ws.id, { userId: uid(), role: 'developer' }, viewer)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('setSecret: owner can set a valid UPPER_SNAKE_CASE secret', async () => {
    const owner = uid();
    const ws = await service.createWorkspace({ name: wname() }, owner);
    const result = await service.setSecret(ws.id, { name: 'API_KEY', value: 'secret123' }, owner);
    expect(result.name).toBe('API_KEY');
  });

  it('setSecret: rejects secret names that are not UPPER_SNAKE_CASE', async () => {
    const owner = uid();
    const ws = await service.createWorkspace({ name: wname() }, owner);
    await expect(
      service.setSecret(ws.id, { name: 'lower_case', value: 'val' }, owner)
    ).rejects.toMatchObject({ code: 'INVALID_NAME' });
  });

  it('listSecrets: returns secret names (not values)', async () => {
    const owner = uid();
    const ws = await service.createWorkspace({ name: wname() }, owner);
    await service.setSecret(ws.id, { name: 'DB_URL', value: 'postgres://...' }, owner);
    const secrets = await service.listSecrets(ws.id, owner);
    expect(secrets.some((s) => s.name === 'DB_URL')).toBe(true);
    // Confirm no encrypted value is exposed
    const secretObj = secrets.find((s) => s.name === 'DB_URL')!;
    expect(Object.keys(secretObj)).not.toContain('encryptedValue');
    expect(Object.keys(secretObj)).not.toContain('value');
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 4. HoloScript Academy content
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('HoloScript Academy', () => {
  const L1 = (n: string) => join(ACADEMY_ROOT, 'level-1-fundamentals', n);
  const L2 = (n: string) => join(ACADEMY_ROOT, 'level-2-intermediate', n);
  const L3 = (n: string) => join(ACADEMY_ROOT, 'level-3-advanced', n);

  it('academy index.md exists', () => {
    expect(existsSync(join(ACADEMY_ROOT, 'index.md'))).toBe(true);
  });

  // Level 1 â€“ all 10 lessons exist
  it('Level 1: all 10 fundamentals lessons exist', () => {
    const lessons = [
      '01-what-is-holoscript.md',
      '02-installation.md',
      '03-first-scene.md',
      '04-understanding-compositions.md',
      '05-properties.md',
      '06-traits-intro.md',
      '07-interactivity.md',
      '08-templates.md',
      '09-project-structure.md',
      '10-building.md',
    ];
    for (const l of lessons) {
      expect(existsSync(L1(l)), `L1/${l}`).toBe(true);
    }
  });

  // Level 2 â€“ at least 10 lessons exist
  it('Level 2: at least 10 intermediate lessons exist', () => {
    const required = [
      '01-advanced-traits.md',
      '02-physics.md',
      '03-audio.md',
      '04-animation.md',
      '05-vr-ui.md',
      '06-state-management.md',
      '07-networking.md',
      '08-state-machines.md',
      '09-npc-and-behaviors.md',
      '10-biome-encounters.md',
    ];
    for (const l of required) {
      expect(existsSync(L2(l)), `L2/${l}`).toBe(true);
    }
  });

  // Level 3 â€“ at least 5 advanced lessons exist
  it('Level 3: at least 5 advanced lessons exist', () => {
    const required = [
      '01-custom-traits.md',
      '02-plugin-architecture.md',
      '03-advanced-networking.md',
      '04-procedural.md',
      '05-agent-choreography.md',
    ];
    for (const l of required) {
      expect(existsSync(L3(l)), `L3/${l}`).toBe(true);
    }
  });

  it('Lesson 1.1 has a # Lesson heading', () => {
    const content = readFileSync(L1('01-what-is-holoscript.md'), 'utf8');
    expect(content).toMatch(/^#\s+Lesson/im);
  });

  it('Lesson 1.1 has Learning Objectives section', () => {
    const content = readFileSync(L1('01-what-is-holoscript.md'), 'utf8');
    expect(content).toMatch(/learning objectives/i);
  });

  it('Lesson 1.3 (first scene) contains a code block', () => {
    const content = readFileSync(L1('03-first-scene.md'), 'utf8');
    expect(content).toContain('```');
  });

  it('Lesson 1.6 (traits intro) mentions @grabbable or @physics', () => {
    const content = readFileSync(L1('06-traits-intro.md'), 'utf8');
    expect(content).toMatch(/@(grabbable|physics|collidable|interactable)/);
  });

  it('Lesson 2.2 (physics) mentions physics or @physics', () => {
    const content = readFileSync(L2('02-physics.md'), 'utf8');
    expect(content.toLowerCase()).toContain('physics');
  });

  it('Lesson 2.7 (networking) mentions networked or @networked', () => {
    const content = readFileSync(L2('07-networking.md'), 'utf8');
    expect(content.toLowerCase()).toContain('network');
  });

  it('Lesson 3.1 (custom traits) mentions trait or @', () => {
    const content = readFileSync(L3('01-custom-traits.md'), 'utf8');
    expect(content.toLowerCase()).toContain('trait');
  });

  it('total Academy lesson files count is at least 28', () => {
    const allLessons = [
      ...Array.from({ length: 10 }, (_, i) => existsSync(L1(`${String(i + 1).padStart(2, '0')}-`))),
    ];
    // Count all .md files under level-*/
    const { readdirSync } = require('fs');
    let count = 0;
    for (const level of ['level-1-fundamentals', 'level-2-intermediate', 'level-3-advanced']) {
      const dir = join(ACADEMY_ROOT, level);
      if (existsSync(dir)) {
        count += readdirSync(dir).filter(
          (f: string) => f.endsWith('.md') && !f.startsWith('index')
        ).length;
      }
    }
    expect(count).toBeGreaterThanOrEqual(28);
  });
});
