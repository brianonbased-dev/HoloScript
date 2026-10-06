/**
 * Who may read source code through the codebase tools on the MCP server
 * (claude6's review of #501/#513): the local stdio user, the loopback local
 * custody caller and admin scopes. A customer key with only tools:codebase,
 * or a call that lost its caller on the hosted server, may not.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { callerMayReadCode } from '../host-path-args';

const savedTransport = process.env.HOLOSCRIPT_MCP_TRANSPORT;
afterEach(() => {
  if (savedTransport === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
  else process.env.HOLOSCRIPT_MCP_TRANSPORT = savedTransport;
});

describe('callerMayReadCode', () => {
  it('refuses a customer key that holds only tools:codebase', () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    expect(callerMayReadCode({ scopes: ['tools:codebase'] })).toBe(false);
    expect(callerMayReadCode({ scopes: ['tools:codebase', 'tools:read'] })).toBe(false);
  });

  it('refuses a call with no caller on the hosted server', () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    expect(callerMayReadCode(undefined)).toBe(false);
    expect(callerMayReadCode(null)).toBe(false);
  });

  it('allows loopback local custody, admin scopes and the stdio user', () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    expect(callerMayReadCode({ scopes: ['tools:codebase'], localCustody: true })).toBe(true);
    expect(callerMayReadCode({ scopes: ['admin:*'] })).toBe(true);
    expect(callerMayReadCode({ scopes: ['tools:admin'] })).toBe(true);
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    expect(callerMayReadCode(undefined)).toBe(true);
  });
});
