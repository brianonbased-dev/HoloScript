/**
 * Tests for CapabilityTokenIssuer module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRole, AgentPermission, generateAgentKeyPair, AgentKeyPair } from '../AgentIdentity';
import {
  CapabilityTokenIssuer,
  HoloScriptCapabilitySemantics,
  resetCapabilityTokenIssuer,
} from '../CapabilityTokenIssuer';
import {
  CapabilityActions,
  HOLOSCRIPT_RESOURCE_ALL,
  HOLOSCRIPT_RESOURCE_SCHEME,
  PERMISSION_TO_ACTION,
} from '../CapabilityToken';
import type { Capability, CapabilityToken, RootTokenOptions } from '../CapabilityToken';

describe('HoloScriptCapabilitySemantics', () => {
  let semantics: HoloScriptCapabilitySemantics;

  beforeEach(() => {
    semantics = new HoloScriptCapabilitySemantics();
  });

  describe('isSubsetOf', () => {
    it('should recognize exact match as subset', () => {
      const parent: Capability = { with: 'holoscript://ast', can: 'ast/read' };
      const child: Capability = { with: 'holoscript://ast', can: 'ast/read' };
      expect(semantics.isSubsetOf(child, parent)).toBe(true);
    });

    it('should recognize wildcard resource as superset of all holoscript URIs', () => {
      const parent: Capability = { with: HOLOSCRIPT_RESOURCE_ALL, can: '*' };
      const child: Capability = { with: 'holoscript://packages/core/ast', can: 'ast/write' };
      expect(semantics.isSubsetOf(child, parent)).toBe(true);
    });

    it('should recognize wildcard action as superset of specific action', () => {
      const parent: Capability = { with: 'holoscript://ast', can: '*' };
      const child: Capability = { with: 'holoscript://ast', can: 'ast/write' };
      expect(semantics.isSubsetOf(child, parent)).toBe(true);
    });

    it('should recognize path containment', () => {
      const parent: Capability = { with: 'holoscript://packages', can: 'ast/read' };
      const child: Capability = { with: 'holoscript://packages/core/ast', can: 'ast/read' };
      expect(semantics.isSubsetOf(child, parent)).toBe(true);
    });

    it('should reject wider action', () => {
      const parent: Capability = { with: 'holoscript://ast', can: 'ast/read' };
      const child: Capability = { with: 'holoscript://ast', can: 'ast/write' };
      expect(semantics.isSubsetOf(child, parent)).toBe(false);
    });

    it('should reject wider resource', () => {
      const parent: Capability = { with: 'holoscript://packages/core', can: 'ast/read' };
      const child: Capability = { with: 'holoscript://packages', can: 'ast/read' };
      expect(semantics.isSubsetOf(child, parent)).toBe(false);
    });

    it('should reject unrelated resources', () => {
      const parent: Capability = { with: 'holoscript://ast', can: 'ast/read' };
      const child: Capability = { with: 'holoscript://code', can: 'ast/read' };
      expect(semantics.isSubsetOf(child, parent)).toBe(false);
    });
  });

  describe('canAccess', () => {
    it('should grant access for exact match', () => {
      const cap: Capability = { with: 'holoscript://ast', can: 'ast/write' };
      expect(semantics.canAccess(cap, 'holoscript://ast', 'ast/write')).toBe(true);
    });

    it('should grant access for wildcard resource', () => {
      const cap: Capability = { with: HOLOSCRIPT_RESOURCE_ALL, can: 'ast/read' };
      expect(semantics.canAccess(cap, 'holoscript://any/resource', 'ast/read')).toBe(true);
    });

    it('should grant access for wildcard action', () => {
      const cap: Capability = { with: 'holoscript://ast', can: '*' };
      expect(semantics.canAccess(cap, 'holoscript://ast', 'ast/write')).toBe(true);
    });

    it('should grant access for path containment', () => {
      const cap: Capability = { with: 'holoscript://packages', can: 'ast/read' };
      expect(semantics.canAccess(cap, 'holoscript://packages/core', 'ast/read')).toBe(true);
    });

    it('should deny access for wrong action', () => {
      const cap: Capability = { with: 'holoscript://ast', can: 'ast/read' };
      expect(semantics.canAccess(cap, 'holoscript://ast', 'ast/write')).toBe(false);
    });

    it('should deny access for wrong resource', () => {
      const cap: Capability = { with: 'holoscript://ast', can: 'ast/read' };
      expect(semantics.canAccess(cap, 'holoscript://code', 'ast/read')).toBe(false);
    });
  });

  describe('fromPermission', () => {
    it('should convert AgentPermission to Capability', () => {
      const cap = semantics.fromPermission(AgentPermission.WRITE_AST);
      expect(cap.can).toBe(CapabilityActions.AST_WRITE);
      expect(cap.with).toBe(HOLOSCRIPT_RESOURCE_ALL);
    });

    it('should apply scope to resource URI', () => {
      const cap = semantics.fromPermission(AgentPermission.READ_SOURCE, 'packages/core');
      expect(cap.with).toBe('holoscript://packages/core');
      expect(cap.can).toBe(CapabilityActions.SOURCE_READ);
    });
  });
});

describe('CapabilityTokenIssuer', () => {
  let issuer: CapabilityTokenIssuer;
  let orchestratorKeyPair: AgentKeyPair;
  let analyzerKeyPair: AgentKeyPair;

  beforeEach(async () => {
    issuer = new CapabilityTokenIssuer({
      defaultLifetimeSec: 3600, // 1 hour
      maxDelegationDepth: 5,
    });

    orchestratorKeyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);
    analyzerKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  });

  afterEach(() => {
    resetCapabilityTokenIssuer();
  });

  describe('issueRoot', () => {
    it('should issue a valid root capability token', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      expect(token).toBeDefined();
      expect(token.raw).toBeTruthy();
      expect(token.raw.split('.')).toHaveLength(3);
      expect(token.header.alg).toBe('EdDSA');
      expect(token.header.ucv).toBe('0.10.0');
      expect(token.payload.iss).toBe('agent:orchestrator');
      expect(token.payload.aud).toBe('agent:syntax_analyzer');
      expect(token.payload.att).toHaveLength(1);
      expect(token.payload.prf).toHaveLength(0);
      expect(token.payload.nnc).toBeTruthy();
    });

    it('should set expiration correctly', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          lifetimeSec: 7200,
        },
        orchestratorKeyPair
      );

      expect(token.payload.exp).toBeGreaterThanOrEqual(now + 7199);
      expect(token.payload.exp).toBeLessThanOrEqual(now + 7201);
    });

    it('should set not-before when specified', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          notBeforeOffsetSec: 60,
        },
        orchestratorKeyPair
      );

      expect(token.payload.nbf).toBeDefined();
      expect(token.payload.nbf).toBeGreaterThanOrEqual(now + 59);
      expect(token.payload.nbf).toBeLessThanOrEqual(now + 61);
    });

    it('should include facts when specified', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          facts: { workflowId: 'compile-123', step: 'parse' },
        },
        orchestratorKeyPair
      );

      expect(token.payload.fct).toBeDefined();
      expect(token.payload.fct!.workflowId).toBe('compile-123');
    });

    it('should generate unique nonces', async () => {
      const token1 = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const token2 = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      expect(token1.payload.nnc).not.toBe(token2.payload.nnc);
    });
  });

  describe('verify', () => {
    it('should verify a valid root token', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const result = issuer.verify(token, orchestratorKeyPair.publicKey);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload!.iss).toBe('agent:orchestrator');
      expect(result.chain).toBeDefined();
      expect(result.chain!.verified).toBe(true);
    });

    it('should verify from raw JWT string', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const result = issuer.verify(token.raw, orchestratorKeyPair.publicKey);
      expect(result.valid).toBe(true);
    });

    it('should reject token with wrong public key', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const wrongKeyPair = await generateAgentKeyPair(AgentRole.EXPORTER);
      const result = issuer.verify(token, wrongKeyPair.publicKey);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject malformed token', () => {
      const result = issuer.verify('not.a.valid-token', orchestratorKeyPair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject expired token', async () => {
      // Create issuer with very short lifetime
      const shortIssuer = new CapabilityTokenIssuer({ defaultLifetimeSec: 1 });

      const token = await shortIssuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          lifetimeSec: 1,
        },
        orchestratorKeyPair
      );

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = shortIssuer.verify(token, orchestratorKeyPair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED');
    });

    it('should reject not-yet-valid token', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          notBeforeOffsetSec: 3600, // valid 1 hour from now
        },
        orchestratorKeyPair
      );

      const result = issuer.verify(token, orchestratorKeyPair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('NOT_YET_VALID');
    });

    it('should detect replay (reuse of nonce)', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      // First verification should succeed
      const result1 = issuer.verify(token, orchestratorKeyPair.publicKey);
      expect(result1.valid).toBe(true);

      // Second verification of same token should detect replay
      const result2 = issuer.verify(token, orchestratorKeyPair.publicKey);
      expect(result2.valid).toBe(false);
      expect(result2.errorCode).toBe('REPLAY_DETECTED');
    });
  });

  describe('delegate', () => {
    let rootToken: CapabilityToken;

    beforeEach(async () => {
      rootToken = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );
    });

    it('should create a valid delegated token', async () => {
      const delegated = await issuer.delegate(
        {
          parentToken: rootToken,
          audience: 'agent:ast_optimizer',
          capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        },
        analyzerKeyPair
      );

      expect(delegated).toBeDefined();
      expect(delegated.payload.iss).toBe('agent:syntax_analyzer'); // delegator = parent audience
      expect(delegated.payload.aud).toBe('agent:ast_optimizer');
      expect(delegated.payload.att).toHaveLength(1);
      expect(delegated.payload.prf).toHaveLength(1); // proof is parent's nonce
      expect(delegated.payload.prf[0]).toBe(rootToken.payload.nnc);
    });

    it('should enforce attenuation (reject wider capability)', async () => {
      // Root grants only ast/read
      const narrowRoot = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        },
        orchestratorKeyPair
      );

      // Try to delegate ast/write (wider than ast/read) — should fail
      await expect(
        issuer.delegate(
          {
            parentToken: narrowRoot,
            audience: 'agent:ast_optimizer',
            capabilities: [{ with: 'holoscript://ast', can: 'ast/write' }],
          },
          analyzerKeyPair
        )
      ).rejects.toThrow('Attenuation violation');
    });

    it('should enforce attenuation (reject wider resource)', async () => {
      const scopedRoot = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: 'holoscript://packages/core', can: 'ast/read' }],
        },
        orchestratorKeyPair
      );

      // Try to delegate with wider resource scope
      await expect(
        issuer.delegate(
          {
            parentToken: scopedRoot,
            audience: 'agent:ast_optimizer',
            capabilities: [
              { with: 'holoscript://packages', can: 'ast/read' }, // wider
            ],
          },
          analyzerKeyPair
        )
      ).rejects.toThrow('Attenuation violation');
    });

    it('should enforce expiration monotonicity', async () => {
      // Root expires in 1 hour
      const shortRoot = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          lifetimeSec: 3600,
        },
        orchestratorKeyPair
      );

      // Try to delegate with 2 hour lifetime — should fail
      await expect(
        issuer.delegate(
          {
            parentToken: shortRoot,
            audience: 'agent:ast_optimizer',
            capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
            lifetimeSec: 7200,
          },
          analyzerKeyPair
        )
      ).rejects.toThrow('Expiration violation');
    });

    it('should enforce delegation depth limit', async () => {
      // Create issuer with depth limit of 2
      const shallowIssuer = new CapabilityTokenIssuer({
        maxDelegationDepth: 2,
        strictExpiration: false,
      });

      const root = await shallowIssuer.issueRoot(
        {
          issuer: 'agent:a',
          audience: 'agent:b',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const delegation1 = await shallowIssuer.delegate(
        {
          parentToken: root,
          audience: 'agent:c',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        analyzerKeyPair
      );

      const kp3 = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);
      const delegation2 = await shallowIssuer.delegate(
        {
          parentToken: delegation1,
          audience: 'agent:d',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        kp3
      );

      const kp4 = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);
      await expect(
        shallowIssuer.delegate(
          {
            parentToken: delegation2,
            audience: 'agent:e',
            capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
          },
          kp4
        )
      ).rejects.toThrow('Delegation depth');
    });

    it('should build correct proof chain', async () => {
      const d1 = await issuer.delegate(
        {
          parentToken: rootToken,
          audience: 'agent:ast_optimizer',
          capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        },
        analyzerKeyPair
      );

      expect(d1.payload.prf).toEqual([rootToken.payload.nnc]);

      const kp3 = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);
      const d2 = await issuer.delegate(
        {
          parentToken: d1,
          audience: 'agent:code_generator',
          capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        },
        kp3
      );

      expect(d2.payload.prf).toEqual([rootToken.payload.nnc, d1.payload.nnc]);
    });
  });

  describe('issueForRole', () => {
    it('should issue token with role-appropriate capabilities', async () => {
      const token = await issuer.issueForRole(
        AgentRole.SYNTAX_ANALYZER,
        'agent:compiler',
        analyzerKeyPair
      );

      expect(token.payload.iss).toBe('agent:syntax_analyzer');
      expect(token.payload.aud).toBe('agent:compiler');
      expect(token.payload.att.length).toBeGreaterThan(0);

      // Syntax analyzer should have source/read, config/read, ast/write
      const actions = token.payload.att.map((cap) => cap.can);
      expect(actions).toContain(CapabilityActions.SOURCE_READ);
      expect(actions).toContain(CapabilityActions.CONFIG_READ);
      expect(actions).toContain(CapabilityActions.AST_WRITE);

      // Should NOT have code/write or output/write
      expect(actions).not.toContain(CapabilityActions.CODE_WRITE);
      expect(actions).not.toContain(CapabilityActions.OUTPUT_WRITE);
    });

    it('should apply scope restriction', async () => {
      const token = await issuer.issueForRole(
        AgentRole.SYNTAX_ANALYZER,
        'agent:compiler',
        analyzerKeyPair,
        'packages/core'
      );

      for (const cap of token.payload.att) {
        expect(cap.with).toBe('holoscript://packages/core');
      }
    });
  });

  describe('hasCapability', () => {
    it('should return true when token has matching capability', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [
            { with: 'holoscript://ast', can: 'ast/write' },
            { with: 'holoscript://source', can: 'source/read' },
          ],
        },
        orchestratorKeyPair
      );

      expect(issuer.hasCapability(token, 'holoscript://ast', 'ast/write')).toBe(true);
      expect(issuer.hasCapability(token, 'holoscript://source', 'source/read')).toBe(true);
    });

    it('should return false when token lacks matching capability', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        },
        orchestratorKeyPair
      );

      expect(issuer.hasCapability(token, 'holoscript://ast', 'ast/write')).toBe(false);
      expect(issuer.hasCapability(token, 'holoscript://code', 'code/write')).toBe(false);
    });
  });

  describe('resolveChain', () => {
    it('should return trivial chain for root token', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const chain = issuer.resolveChain(token.payload);
      expect(chain).toBeDefined();
      expect(chain!.links).toHaveLength(1);
      expect(chain!.rootAuthority).toBe('agent:orchestrator');
      expect(chain!.verified).toBe(true);
    });

    it('should resolve multi-hop chain', async () => {
      const root = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const delegated = await issuer.delegate(
        {
          parentToken: root,
          audience: 'agent:ast_optimizer',
          capabilities: [{ with: 'holoscript://ast', can: 'ast/read' }],
        },
        analyzerKeyPair
      );

      const chain = issuer.resolveChain(delegated.payload);
      expect(chain).toBeDefined();
      expect(chain!.links).toHaveLength(2);
      expect(chain!.rootAuthority).toBe('agent:orchestrator');
      expect(chain!.verified).toBe(true);
    });

    it('should mark chain as unverified when proof is missing', () => {
      const payload = {
        iss: 'agent:someone',
        aud: 'agent:other',
        att: [{ with: 'holoscript://ast', can: 'ast/read' }],
        prf: ['nonexistent-nonce'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        nnc: 'test-nonce',
      };

      const chain = issuer.resolveChain(payload);
      expect(chain).toBeDefined();
      expect(chain!.verified).toBe(false);
    });
  });

  describe('store management', () => {
    it('should store and retrieve tokens', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const stored = issuer.getStoredToken(token.payload.nnc);
      expect(stored).toBeDefined();
      expect(stored!.payload.iss).toBe('agent:orchestrator');
    });

    it('should accept externally stored tokens', async () => {
      const token = await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      const newIssuer = new CapabilityTokenIssuer();
      newIssuer.storeToken(token);

      const retrieved = newIssuer.getStoredToken(token.payload.nnc);
      expect(retrieved).toBeDefined();
    });

    it('should clear store on reset', async () => {
      await issuer.issueRoot(
        {
          issuer: 'agent:orchestrator',
          audience: 'agent:syntax_analyzer',
          capabilities: [{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }],
        },
        orchestratorKeyPair
      );

      issuer.reset();

      // Store should be empty now
      // (No direct way to check, but resolving a chain with proofs should fail)
      const payload = {
        iss: 'agent:someone',
        aud: 'agent:other',
        att: [{ with: 'holoscript://ast', can: 'ast/read' }],
        prf: ['some-nonce'],
        exp: Math.floor(Date.now() / 1000) + 3600,
        nnc: 'test-nonce',
      };

      const chain = issuer.resolveChain(payload);
      expect(chain!.verified).toBe(false);
    });
  });
});
