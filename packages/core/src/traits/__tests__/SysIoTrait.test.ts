/**
 * SysIoTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { sysIoHandler } from '../SysIoTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __sysState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });

describe('SysIoTrait', () => {
  it('has name "sys_io"', () => {
    expect(sysIoHandler.name).toBe('sys_io');
  });

  it('sysio:read emits sysio:data', () => {
    const node = makeNode();
    sysIoHandler.onAttach!(node as never, { allow_write: false }, makeCtx(node) as never);
    sysIoHandler.onEvent!(node as never, { allow_write: false }, makeCtx(node) as never, {
      type: 'sysio:read', path: '/etc/config',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sysio:data', { path: '/etc/config', readCount: 1 });
  });

  it('sysio:write denied when allow_write is false', () => {
    const node = makeNode();
    sysIoHandler.onAttach!(node as never, { allow_write: false }, makeCtx(node) as never);
    sysIoHandler.onEvent!(node as never, { allow_write: false }, makeCtx(node) as never, {
      type: 'sysio:write', path: '/tmp/out',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sysio:denied', expect.objectContaining({ reason: 'write_disabled' }));
  });
});
