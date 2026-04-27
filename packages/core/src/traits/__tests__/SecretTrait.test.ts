/**
 * SecretTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { secretHandler } from '../SecretTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_secrets: 100, auto_expire: true };

describe('SecretTrait', () => {
  it('has name "secret"', () => {
    expect(secretHandler.name).toBe('secret');
  });

  it('secret:store emits secret:stored', () => {
    const node = makeNode();
    secretHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    secretHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'secret:store', secretId: 's1', value: 'myvalue',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('secret:stored', { secretId: 's1' });
  });

  it('secret:retrieve emits secret:result', () => {
    const node = makeNode();
    secretHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    secretHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'secret:store', secretId: 's1', value: 'myvalue',
    } as never);
    node.emit.mockClear();
    secretHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'secret:retrieve', secretId: 's1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('secret:result', expect.objectContaining({ secretId: 's1', value: 'myvalue' }));
  });
});
