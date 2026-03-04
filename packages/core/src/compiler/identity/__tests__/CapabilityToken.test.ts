/**
 * Tests for CapabilityToken interfaces and constants
 */

import { describe, it, expect } from 'vitest';
import {
  AgentPermission,
} from '../AgentIdentity';
import {
  HOLOSCRIPT_RESOURCE_SCHEME,
  HOLOSCRIPT_RESOURCE_ALL,
  CapabilityActions,
  PERMISSION_TO_ACTION,
  ACTION_TO_PERMISSION,
} from '../CapabilityToken';
import type {
  Capability,
  CapabilityTokenPayload,
  CapabilityTokenHeader,
  AttenuationChain,
  DelegationLink,
} from '../CapabilityToken';

describe('CapabilityToken', () => {
  describe('Constants', () => {
    it('should define the holoscript resource scheme', () => {
      expect(HOLOSCRIPT_RESOURCE_SCHEME).toBe('holoscript://');
    });

    it('should define the wildcard resource', () => {
      expect(HOLOSCRIPT_RESOURCE_ALL).toBe('holoscript://*');
    });

    it('should define capability action namespaces', () => {
      expect(CapabilityActions.AST_READ).toBe('ast/read');
      expect(CapabilityActions.AST_WRITE).toBe('ast/write');
      expect(CapabilityActions.CODE_WRITE).toBe('code/write');
      expect(CapabilityActions.EXECUTE_CODEGEN).toBe('execute/codegen');
      expect(CapabilityActions.ALL).toBe('*');
    });
  });

  describe('Permission <-> Action mapping', () => {
    it('should map every AgentPermission to a UCAN action', () => {
      for (const perm of Object.values(AgentPermission)) {
        expect(PERMISSION_TO_ACTION[perm]).toBeDefined();
        expect(typeof PERMISSION_TO_ACTION[perm]).toBe('string');
      }
    });

    it('should provide reverse mapping from actions to permissions', () => {
      for (const perm of Object.values(AgentPermission)) {
        const action = PERMISSION_TO_ACTION[perm];
        expect(ACTION_TO_PERMISSION[action]).toBe(perm);
      }
    });

    it('should map specific permissions correctly', () => {
      expect(PERMISSION_TO_ACTION[AgentPermission.READ_SOURCE]).toBe('source/read');
      expect(PERMISSION_TO_ACTION[AgentPermission.WRITE_AST]).toBe('ast/write');
      expect(PERMISSION_TO_ACTION[AgentPermission.TRANSFORM_IR]).toBe('ir/transform');
      expect(PERMISSION_TO_ACTION[AgentPermission.EXECUTE_EXPORT]).toBe('execute/export');
    });
  });

  describe('Interface shapes', () => {
    it('should allow constructing a valid Capability', () => {
      const cap: Capability = {
        with: 'holoscript://packages/core/ast',
        can: 'ast/write',
      };
      expect(cap.with).toBe('holoscript://packages/core/ast');
      expect(cap.can).toBe('ast/write');
    });

    it('should allow constructing a Capability with caveats', () => {
      const cap: Capability = {
        with: 'holoscript://packages/core/ast',
        can: 'ast/write',
        nb: { maxDepth: 5, readOnly: false },
      };
      expect(cap.nb).toBeDefined();
      expect(cap.nb!.maxDepth).toBe(5);
    });

    it('should allow constructing a valid CapabilityTokenPayload', () => {
      const payload: CapabilityTokenPayload = {
        iss: 'did:key:z6Mktest',
        aud: 'did:key:z6Mkaud',
        att: [{ with: 'holoscript://*', can: '*' }],
        prf: [],
        exp: Math.floor(Date.now() / 1000) + 3600,
        nnc: 'unique-nonce-1',
      };

      expect(payload.iss).toBe('did:key:z6Mktest');
      expect(payload.att).toHaveLength(1);
      expect(payload.prf).toHaveLength(0);
    });

    it('should allow constructing a valid CapabilityTokenHeader', () => {
      const header: CapabilityTokenHeader = {
        alg: 'EdDSA',
        typ: 'JWT',
        ucv: '0.10.0',
      };

      expect(header.alg).toBe('EdDSA');
      expect(header.ucv).toBe('0.10.0');
    });

    it('should allow constructing an AttenuationChain', () => {
      const link1: DelegationLink = {
        tokenId: 'nonce-1',
        issuer: 'agent:orchestrator',
        audience: 'agent:syntax_analyzer',
        capabilities: [{ with: 'holoscript://*', can: '*' }],
        issuedAt: 1000000,
        expiresAt: 2000000,
      };

      const link2: DelegationLink = {
        tokenId: 'nonce-2',
        issuer: 'agent:syntax_analyzer',
        audience: 'agent:ast_optimizer',
        capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        issuedAt: 1000000,
        expiresAt: 1500000,
      };

      const chain: AttenuationChain = {
        links: [link1, link2],
        rootAuthority: 'agent:orchestrator',
        verified: true,
        verifiedAt: new Date().toISOString(),
      };

      expect(chain.links).toHaveLength(2);
      expect(chain.rootAuthority).toBe('agent:orchestrator');
      expect(chain.verified).toBe(true);
    });
  });
});
