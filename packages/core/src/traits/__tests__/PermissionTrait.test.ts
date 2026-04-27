/**
 * PermissionTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { permissionHandler } from '../PermissionTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __permState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_role: 'viewer' };

describe('PermissionTrait', () => {
  it('has name "permission"', () => {
    expect(permissionHandler.name).toBe('permission');
  });

  it('permission:grant emits permission:granted', () => {
    const node = makeNode();
    permissionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    permissionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'permission:grant', userId: 'u1', permission: 'edit',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('permission:granted', { userId: 'u1', permission: 'edit' });
  });

  it('permission:check emits allowed=true after grant', () => {
    const node = makeNode();
    permissionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    permissionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'permission:grant', userId: 'u1', permission: 'edit',
    } as never);
    node.emit.mockClear();
    permissionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'permission:check', userId: 'u1', permission: 'edit',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('permission:result', expect.objectContaining({ allowed: true }));
  });

  it('permission:check emits allowed=false without grant', () => {
    const node = makeNode();
    permissionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    permissionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'permission:check', userId: 'u2', permission: 'edit',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('permission:result', expect.objectContaining({ allowed: false }));
  });
});
