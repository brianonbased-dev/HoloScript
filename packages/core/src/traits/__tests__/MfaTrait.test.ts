/**
 * MfaTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { mfaHandler } from '../MfaTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __mfaState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { methods: ['totp', 'sms'] };

describe('MfaTrait', () => {
  it('has name "mfa"', () => {
    expect(mfaHandler.name).toBe('mfa');
  });

  it('defaultConfig methods includes totp', () => {
    expect(mfaHandler.defaultConfig?.methods).toContain('totp');
  });

  it('onAttach creates empty enrolled map', () => {
    const node = makeNode();
    mfaHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__mfaState as { enrolled: Map<string, unknown> };
    expect(state.enrolled.size).toBe(0);
  });

  it('mfa:enroll stores user and emits mfa:enrolled', () => {
    const node = makeNode();
    mfaHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mfaHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mfa:enroll', userId: 'user-1', method: 'totp',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('mfa:enrolled', { userId: 'user-1', method: 'totp' });
  });

  it('mfa:verify marks user verified and emits mfa:verified', () => {
    const node = makeNode();
    mfaHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mfaHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mfa:enroll', userId: 'user-2', method: 'sms',
    } as never);
    node.emit.mockClear();
    mfaHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mfa:verify', userId: 'user-2',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('mfa:verified', { userId: 'user-2', valid: true });
  });

  it('mfa:verify emits valid=false for unknown user', () => {
    const node = makeNode();
    mfaHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    mfaHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'mfa:verify', userId: 'nobody',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('mfa:verified', { userId: 'nobody', valid: false });
  });
});
