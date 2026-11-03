import { describe, expect, it } from 'vitest';
import { isLoopbackAddress, isTrustedLoopbackMcpPeer, resolveMcpBindHost } from '../http-bind-host';

describe('resolveMcpBindHost', () => {
  it('preserves the public deployment default', () => {
    expect(resolveMcpBindHost({})).toBe('0.0.0.0');
  });

  it('accepts an explicit sovereign loopback binding', () => {
    expect(resolveMcpBindHost({ MCP_BIND_HOST: ' 127.0.0.1 ' })).toBe('127.0.0.1');
  });

  it.each(['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', 'localhost'])(
    'recognizes loopback address %s',
    (address) => {
      expect(isLoopbackAddress(address)).toBe(true);
    }
  );

  it('admits trusted MCP only when both binding and peer are loopback', () => {
    expect(
      isTrustedLoopbackMcpPeer({
        enabled: true,
        bindHost: '127.0.0.1',
        remoteAddress: '::ffff:127.0.0.1',
      })
    ).toBe(true);
    expect(
      isTrustedLoopbackMcpPeer({
        enabled: true,
        bindHost: '0.0.0.0',
        remoteAddress: '127.0.0.1',
      })
    ).toBe(false);
    expect(
      isTrustedLoopbackMcpPeer({
        enabled: true,
        bindHost: '127.0.0.1',
        remoteAddress: '192.168.0.42',
      })
    ).toBe(false);
    expect(
      isTrustedLoopbackMcpPeer({
        enabled: false,
        bindHost: '127.0.0.1',
        remoteAddress: '127.0.0.1',
      })
    ).toBe(false);
  });
});

describe('isLoopbackAddress coverage', () => {
  it.each([
    'localhost',
    '::1',
    '[::1]',
    '127.0.0.1',
    '127.255.255.254',
    '127.1',
    '127.0.1',
    '::ffff:127.0.0.1',
  ])('treats %s as loopback', (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each([
    '127.0.0.1.evil.com',
    '1270.0.0.1',
    '128.0.0.1',
    '127.256.0.1',
    '127',
    '',
    '0.0.0.0',
    '::',
    undefined,
  ])('does not treat %s as loopback', (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });

  it('never treats an unset MCP_BIND_HOST as loopback', () => {
    expect(resolveMcpBindHost({})).toBe('0.0.0.0');
    expect(isLoopbackAddress(resolveMcpBindHost({}))).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});
