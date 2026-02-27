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
} from '../AgentIdentity';
import {
  AgentTokenIssuer,
  TokenRequest,
  resetTokenIssuer,
} from '../AgentTokenIssuer';

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
});
