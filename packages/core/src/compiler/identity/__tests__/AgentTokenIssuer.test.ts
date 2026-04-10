/**
 * Tests for AgentTokenIssuer module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  AgentConfig,
  calculateAgentChecksum,
  generateAgentKeyPair,
  getDefaultPermissions,
} from '../AgentIdentity';
import { AgentTokenIssuer, TokenRequest, resetTokenIssuer } from '../AgentTokenIssuer';
import {
  PERMISSION_TO_ACTION,
  HOLOSCRIPT_RESOURCE_ALL,
  HOLOSCRIPT_RESOURCE_SCHEME,
  CapabilityActions,
} from '../CapabilityToken';
import type { Capability, CapabilityToken } from '../CapabilityToken';
import { resetCapabilityTokenIssuer } from '../CapabilityTokenIssuer';

describe('AgentTokenIssuer', () => {
  let issuer: AgentTokenIssuer;

  beforeEach(() => {
    issuer = new AgentTokenIssuer({
      issuer: 'test-orchestrator',
      jwtSecret: 'test-secret-key',
      tokenExpiration: '1h',
      strictWorkflowValidation: true,
    });
  });

  afterEach(() => {
    resetTokenIssuer();
    resetCapabilityTokenIssuer();
  });

  describe('issueToken', () => {
    it('should issue valid JWT token for agent', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.PARSE_TOKENS,
        workflowId: 'compile-123',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const token = await issuer.issueToken(request);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should include agent checksum in token', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.AST_OPTIMIZER,
        name: 'optimizer-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.ANALYZE_AST,
        workflowId: 'compile-456',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const token = await issuer.issueToken(request);
      const result = issuer.verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.agent_checksum).toBeDefined();
      expect(result.payload?.agent_checksum.algorithm).toBe('sha256');
    });

    it('should include PoP confirmation (JWK thumbprint)', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.CODE_GENERATOR,
        name: 'codegen-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
        workflowId: 'compile-789',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const token = await issuer.issueToken(request);
      const result = issuer.verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.cnf?.jkt).toBe(keyPair.thumbprint);
    });

    it('should build delegation chain', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.EXPORTER,
        name: 'exporter-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.EXPORTER);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.SERIALIZE,
        workflowId: 'compile-999',
        initiatedBy: AgentRole.ORCHESTRATOR,
        delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.CODE_GENERATOR],
        keyPair,
      };

      const token = await issuer.issueToken(request);
      const result = issuer.verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.intent.delegation_chain).toEqual([
        AgentRole.ORCHESTRATOR,
        AgentRole.CODE_GENERATOR,
        AgentRole.EXPORTER,
      ]);
    });

    it('should enforce workflow sequence validation', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      // First valid transition
      await issuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.PARSE_TOKENS,
        workflowId: 'compile-strict',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      // Second valid transition
      await issuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.BUILD_AST,
        workflowId: 'compile-strict',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      // Invalid transition (skip steps)
      await expect(
        issuer.issueToken({
          agentConfig,
          workflowStep: WorkflowStep.SERIALIZE,
          workflowId: 'compile-strict',
          initiatedBy: AgentRole.ORCHESTRATOR,
          keyPair,
        })
      ).rejects.toThrow('Invalid workflow transition');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const token = await issuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.PARSE_TOKENS,
        workflowId: 'verify-test',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      const result = issuer.verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.agent_role).toBe(AgentRole.SYNTAX_ANALYZER);
      expect(result.payload?.intent.workflow_step).toBe(WorkflowStep.PARSE_TOKENS);
    });

    it('should reject token with invalid signature', () => {
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid';
      const result = issuer.verifyToken(fakeToken);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject expired token', async () => {
      const shortLivedIssuer = new AgentTokenIssuer({
        issuer: 'test-orchestrator',
        jwtSecret: 'test-secret-key',
        tokenExpiration: '1s', // 1 second
      });

      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const token = await shortLivedIssuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.PARSE_TOKENS,
        workflowId: 'expire-test',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = shortLivedIssuer.verifyToken(token);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED');
    });
  });

  describe('hasPermission', () => {
    it('should return true for granted permission', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.AST_OPTIMIZER,
        name: 'optimizer-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);

      const token = await issuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.APPLY_TRANSFORMS,
        workflowId: 'perm-test',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      expect(issuer.hasPermission(token, AgentPermission.TRANSFORM_AST)).toBe(true);
    });

    it('should return false for denied permission', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const token = await issuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.BUILD_AST,
        workflowId: 'perm-deny-test',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      expect(issuer.hasPermission(token, AgentPermission.WRITE_OUTPUT)).toBe(false);
    });
  });

  describe('canPerformOperation', () => {
    it('should validate permission and workflow step', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.CODE_GENERATOR,
        name: 'codegen-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      const token = await issuer.issueToken({
        agentConfig,
        workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
        workflowId: 'op-test',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      });

      expect(
        issuer.canPerformOperation(
          token,
          AgentPermission.WRITE_CODE,
          WorkflowStep.GENERATE_ASSEMBLY
        )
      ).toBe(true);

      expect(
        issuer.canPerformOperation(
          token,
          AgentPermission.WRITE_CODE,
          WorkflowStep.SERIALIZE // Wrong step
        )
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // UCAN Capability Token Methods
  // -------------------------------------------------------------------------

  describe('issueCapabilityToken', () => {
    it('should issue a UCAN capability token for an agent role', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const capToken = await issuer.issueCapabilityToken({
        agentConfig,
        audience: 'holoscript-compiler',
        keyPair,
      });

      expect(capToken).toBeDefined();
      expect(capToken.header.alg).toBe('EdDSA');
      expect(capToken.header.typ).toBe('JWT');
      expect(capToken.header.ucv).toBe('0.10.0');
      expect(capToken.payload.iss).toBe('agent:syntax_analyzer:syntax-v1');
      expect(capToken.payload.aud).toBe('holoscript-compiler');
      expect(capToken.raw).toBeTruthy();
      expect(capToken.raw.split('.')).toHaveLength(3);
    });

    it('should map role permissions to UCAN capabilities', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const capToken = await issuer.issueCapabilityToken({
        agentConfig,
        audience: 'holoscript-compiler',
        keyPair,
      });

      const permissions = getDefaultPermissions(AgentRole.SYNTAX_ANALYZER);
      const expectedCapabilities = permissions.map((perm) => ({
        with: HOLOSCRIPT_RESOURCE_ALL,
        can: PERMISSION_TO_ACTION[perm],
      }));

      expect(capToken.payload.att).toHaveLength(expectedCapabilities.length);

      // Each permission should map to a capability action
      for (const perm of permissions) {
        const expectedAction = PERMISSION_TO_ACTION[perm];
        const found = capToken.payload.att.some((cap) => cap.can === expectedAction);
        expect(found).toBe(true);
      }
    });

    it('should apply scope restriction to capability resources', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.AST_OPTIMIZER,
        name: 'optimizer-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);

      const capToken = await issuer.issueCapabilityToken({
        agentConfig,
        audience: 'holoscript-compiler',
        keyPair,
        scope: 'packages/core/ast',
      });

      // All capabilities should use the scoped resource
      for (const cap of capToken.payload.att) {
        expect(cap.with).toBe(`${HOLOSCRIPT_RESOURCE_SCHEME}packages/core/ast`);
      }
    });

    it('should include agent metadata in facts', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.CODE_GENERATOR,
        name: 'codegen-v1',
        version: '2.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      const capToken = await issuer.issueCapabilityToken({
        agentConfig,
        audience: 'target-agent',
        keyPair,
        facts: { custom_key: 'custom_value' },
      });

      expect(capToken.payload.fct).toBeDefined();
      expect(capToken.payload.fct!.agent_role).toBe(AgentRole.CODE_GENERATOR);
      expect(capToken.payload.fct!.agent_version).toBe('2.0.0');
      expect(capToken.payload.fct!.custom_key).toBe('custom_value');
    });

    it('should support custom lifetime', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.EXPORTER,
        name: 'exporter-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.EXPORTER);

      const now = Math.floor(Date.now() / 1000);
      const capToken = await issuer.issueCapabilityToken({
        agentConfig,
        audience: 'holoscript-compiler',
        keyPair,
        lifetimeSec: 3600, // 1 hour
      });

      // Expiration should be roughly 1 hour from now
      expect(capToken.payload.exp).toBeGreaterThanOrEqual(now + 3599);
      expect(capToken.payload.exp).toBeLessThanOrEqual(now + 3601);
    });
  });

  describe('issueHybridToken', () => {
    it('should return both JWT and UCAN capability token', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.PARSE_TOKENS,
        workflowId: 'hybrid-test-1',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const hybrid = await issuer.issueHybridToken(request);

      // JWT part
      expect(hybrid.jwt).toBeTruthy();
      expect(typeof hybrid.jwt).toBe('string');
      expect(hybrid.jwt.split('.')).toHaveLength(3);

      // UCAN capability token part
      expect(hybrid.capabilityToken).toBeDefined();
      expect(hybrid.capabilityToken.header.alg).toBe('EdDSA');
      expect(hybrid.capabilityToken.payload.aud).toBe('holoscript-compiler');

      // Metadata
      expect(hybrid.agentRole).toBe(AgentRole.SYNTAX_ANALYZER);
      expect(hybrid.capabilities).toHaveLength(
        getDefaultPermissions(AgentRole.SYNTAX_ANALYZER).length
      );
      expect(hybrid.issuedAt).toBeGreaterThan(0);
    });

    it('should verify JWT part is valid through existing verifyToken', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.AST_OPTIMIZER,
        name: 'optimizer-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.ANALYZE_AST,
        workflowId: 'hybrid-test-2',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const hybrid = await issuer.issueHybridToken(request);

      // The JWT should be verifiable by the existing verifyToken method
      const jwtResult = issuer.verifyToken(hybrid.jwt);
      expect(jwtResult.valid).toBe(true);
      expect(jwtResult.payload?.agent_role).toBe(AgentRole.AST_OPTIMIZER);
    });

    it('should include workflow context in capability token facts', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.CODE_GENERATOR,
        name: 'codegen-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
        workflowId: 'hybrid-workflow-ctx',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const hybrid = await issuer.issueHybridToken(request);

      expect(hybrid.capabilityToken.payload.fct).toBeDefined();
      expect(hybrid.capabilityToken.payload.fct!.workflow_id).toBe('hybrid-workflow-ctx');
      expect(hybrid.capabilityToken.payload.fct!.workflow_step).toBe(
        WorkflowStep.GENERATE_ASSEMBLY
      );
      expect(hybrid.capabilityToken.payload.fct!.initiated_by).toBe(AgentRole.ORCHESTRATOR);
    });

    it('should support custom audience and scope for capability token', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.EXPORTER,
        name: 'exporter-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.EXPORTER);

      const request: TokenRequest = {
        agentConfig,
        workflowStep: WorkflowStep.SERIALIZE,
        workflowId: 'hybrid-custom-aud',
        initiatedBy: AgentRole.ORCHESTRATOR,
        keyPair,
      };

      const hybrid = await issuer.issueHybridToken(request, {
        audience: 'external-service',
        scope: 'packages/export/unity',
      });

      expect(hybrid.capabilityToken.payload.aud).toBe('external-service');

      // All capabilities should be scoped
      for (const cap of hybrid.capabilityToken.payload.att) {
        expect(cap.with).toBe(`${HOLOSCRIPT_RESOURCE_SCHEME}packages/export/unity`);
      }

      // Returned capabilities should also reflect the scope
      for (const cap of hybrid.capabilities) {
        expect(cap.with).toBe(`${HOLOSCRIPT_RESOURCE_SCHEME}packages/export/unity`);
      }
    });
  });

  describe('delegateCapability', () => {
    it('should create an attenuated delegation of a capability token', async () => {
      const orchestratorConfig: AgentConfig = {
        role: AgentRole.ORCHESTRATOR,
        name: 'orchestrator-v1',
        version: '1.0.0',
      };

      const orchestratorKeyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);
      const analyzerKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      // Issue a root capability token for the orchestrator (has all permissions)
      const rootToken = await issuer.issueCapabilityToken({
        agentConfig: orchestratorConfig,
        audience: 'agent:syntax_analyzer:syntax-v1',
        keyPair: orchestratorKeyPair,
      });

      // Delegate a subset of capabilities to the syntax analyzer
      const attenuatedCaps: Capability[] = [
        { with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.SOURCE_READ },
        { with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.AST_WRITE },
      ];

      const delegatedToken = await issuer.delegateCapability(
        rootToken,
        'agent:syntax_analyzer:syntax-v1',
        attenuatedCaps,
        analyzerKeyPair
      );

      expect(delegatedToken).toBeDefined();
      expect(delegatedToken.payload.iss).toBe('agent:syntax_analyzer:syntax-v1');
      expect(delegatedToken.payload.aud).toBe('agent:syntax_analyzer:syntax-v1');
      expect(delegatedToken.payload.att).toHaveLength(2);
      expect(delegatedToken.payload.prf.length).toBeGreaterThan(0); // has proof chain
    });

    it('should reject delegation that widens capabilities', async () => {
      const analyzerConfig: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const analyzerKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
      const targetKeyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      // Issue a token with limited capabilities (syntax analyzer = read_source, read_config, write_ast)
      const parentToken = await issuer.issueCapabilityToken({
        agentConfig: analyzerConfig,
        audience: 'agent:code_generator:codegen-v1',
        keyPair: analyzerKeyPair,
      });

      // Try to delegate a capability that the parent does not have
      const widenedCaps: Capability[] = [
        { with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.CODE_WRITE }, // not in syntax_analyzer
      ];

      await expect(
        issuer.delegateCapability(
          parentToken,
          'agent:code_generator:codegen-v1',
          widenedCaps,
          targetKeyPair
        )
      ).rejects.toThrow('Attenuation violation');
    });

    it('should require a key pair for delegation', async () => {
      const agentConfig: AgentConfig = {
        role: AgentRole.ORCHESTRATOR,
        name: 'orchestrator-v1',
        version: '1.0.0',
      };

      const keyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);

      const rootToken = await issuer.issueCapabilityToken({
        agentConfig,
        audience: 'target-agent',
        keyPair,
      });

      await expect(
        issuer.delegateCapability(
          rootToken,
          'target-agent',
          [{ with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.SOURCE_READ }],
          undefined // no key pair
        )
      ).rejects.toThrow('key pair is required');
    });

    it('should enforce expiration monotonicity on delegation', async () => {
      const orchestratorConfig: AgentConfig = {
        role: AgentRole.ORCHESTRATOR,
        name: 'orchestrator-v1',
        version: '1.0.0',
      };

      const orchestratorKeyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);
      const targetKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      // Issue a root token with a short lifetime (10 seconds)
      const rootToken = await issuer.issueCapabilityToken({
        agentConfig: orchestratorConfig,
        audience: 'agent:syntax_analyzer:syntax-v1',
        keyPair: orchestratorKeyPair,
        lifetimeSec: 10,
      });

      // Try to delegate with a longer lifetime than the parent
      await expect(
        issuer.delegateCapability(
          rootToken,
          'agent:syntax_analyzer:syntax-v1',
          [{ with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.SOURCE_READ }],
          targetKeyPair,
          86400 // 24 hours — exceeds parent's 10 seconds
        )
      ).rejects.toThrow('Expiration violation');
    });

    it('should support multi-level delegation chains', async () => {
      const orchestratorKeyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);
      const optimizerKeyPair = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);
      const analyzerKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      // Level 1: Orchestrator issues root token
      const rootToken = await issuer.issueCapabilityToken({
        agentConfig: {
          role: AgentRole.ORCHESTRATOR,
          name: 'orchestrator-v1',
          version: '1.0.0',
        },
        audience: 'agent:ast_optimizer:optimizer-v1',
        keyPair: orchestratorKeyPair,
      });

      // Level 2: Orchestrator delegates to optimizer (subset)
      const level2Token = await issuer.delegateCapability(
        rootToken,
        'agent:ast_optimizer:optimizer-v1',
        [
          { with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.AST_READ },
          { with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.AST_WRITE },
          { with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.AST_TRANSFORM },
        ],
        optimizerKeyPair
      );

      expect(level2Token.payload.prf).toHaveLength(1); // 1 parent proof

      // Level 3: Optimizer delegates to analyzer (further attenuated)
      const level3Token = await issuer.delegateCapability(
        level2Token,
        'agent:syntax_analyzer:syntax-v1',
        [{ with: HOLOSCRIPT_RESOURCE_ALL, can: CapabilityActions.AST_READ }],
        analyzerKeyPair
      );

      expect(level3Token.payload.prf).toHaveLength(2); // 2 parent proofs
      expect(level3Token.payload.att).toHaveLength(1); // only AST_READ
      expect(level3Token.payload.att[0].can).toBe(CapabilityActions.AST_READ);
    });
  });
});
