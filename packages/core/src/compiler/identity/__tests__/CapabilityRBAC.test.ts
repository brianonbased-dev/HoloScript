/**
 * Tests for CapabilityRBAC adapter (dual-mode access control)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  AgentConfig,
  AgentKeyPair,
  generateAgentKeyPair,
} from '../AgentIdentity';
import { AgentTokenIssuer, TokenRequest, resetTokenIssuer } from '../AgentTokenIssuer';
import { AgentRBAC, ResourceType, resetRBAC } from '../AgentRBAC';
import { CapabilityTokenIssuer, resetCapabilityTokenIssuer } from '../CapabilityTokenIssuer';
import { CapabilityRBAC, resetCapabilityRBAC } from '../CapabilityRBAC';
import type { CapabilityAccessRequest } from '../CapabilityRBAC';
import { HOLOSCRIPT_RESOURCE_ALL, CapabilityActions } from '../CapabilityToken';
import type { CapabilityToken } from '../CapabilityToken';

describe('CapabilityRBAC', () => {
  let tokenIssuer: AgentTokenIssuer;
  let capIssuer: CapabilityTokenIssuer;
  let rbac: AgentRBAC;
  let adapter: CapabilityRBAC;
  let orchestratorKeyPair: AgentKeyPair;
  let analyzerKeyPair: AgentKeyPair;

  beforeEach(async () => {
    // Set up legacy JWT infrastructure
    tokenIssuer = new AgentTokenIssuer({
      issuer: 'test-orchestrator',
      jwtSecret: 'test-secret-key',
      tokenExpiration: '1h',
      strictWorkflowValidation: false,
    });

    rbac = new AgentRBAC(tokenIssuer);

    // Set up capability infrastructure
    capIssuer = new CapabilityTokenIssuer({
      defaultLifetimeSec: 3600,
    });

    // Generate key pairs
    orchestratorKeyPair = await generateAgentKeyPair(AgentRole.ORCHESTRATOR);
    analyzerKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

    // Create adapter
    adapter = new CapabilityRBAC({
      rbac,
      capabilityIssuer: capIssuer,
      strategy: 'capability-first',
    });
  });

  afterEach(() => {
    resetTokenIssuer();
    resetCapabilityTokenIssuer();
    resetRBAC();
    resetCapabilityRBAC();
  });

  // -------------------------------------------------------------------------
  // Helper to create a JWT token
  // -------------------------------------------------------------------------
  async function createJwtToken(role: AgentRole, step: WorkflowStep): Promise<string> {
    const config: AgentConfig = {
      role,
      name: `${role}-v1`,
      version: '1.0.0',
    };
    const keyPair = await generateAgentKeyPair(role);
    const request: TokenRequest = {
      agentConfig: config,
      workflowStep: step,
      workflowId: `test-${Date.now()}`,
      initiatedBy: AgentRole.ORCHESTRATOR,
      keyPair,
    };
    return tokenIssuer.issueToken(request);
  }

  // -------------------------------------------------------------------------
  // Helper to create a UCAN capability token
  // -------------------------------------------------------------------------
  async function createCapabilityToken(
    capabilities: Array<{ with: string; can: string }>
  ): Promise<CapabilityToken> {
    return capIssuer.issueRoot(
      {
        issuer: 'agent:orchestrator',
        audience: 'agent:syntax_analyzer',
        capabilities,
      },
      orchestratorKeyPair
    );
  }

  // -----------------------------------------------------------------------
  // Dual-mode: JWT RBAC
  // -----------------------------------------------------------------------

  describe('JWT RBAC mode', () => {
    it('should accept valid JWT token for AST read', async () => {
      const jwtToken = await createJwtToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);

      const result = adapter.checkAccess({
        token: jwtToken,
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('rbac');
    });

    it('should reject JWT token lacking permission', async () => {
      const jwtToken = await createJwtToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.PARSE_TOKENS);

      const result = adapter.checkAccess({
        token: jwtToken,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
      });

      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('rbac');
    });
  });

  // -----------------------------------------------------------------------
  // Dual-mode: UCAN Capability
  // -----------------------------------------------------------------------

  describe('UCAN Capability mode', () => {
    it('should accept valid capability token for AST write', async () => {
      const capToken = await createCapabilityToken([
        { with: 'holoscript://ast', can: 'ast/write' },
      ]);

      const result = adapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.AST,
        operation: 'write',
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
      expect(result.matchedCapability).toBeDefined();
      expect(result.matchedCapability!.can).toBe('ast/write');
    });

    it('should accept wildcard capability', async () => {
      const capToken = await createCapabilityToken([{ with: HOLOSCRIPT_RESOURCE_ALL, can: '*' }]);

      const result = adapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.CODE,
        operation: 'write',
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
    });

    it('should reject capability token with wrong signature', async () => {
      const capToken = await createCapabilityToken([
        { with: 'holoscript://ast', can: 'ast/write' },
      ]);

      const wrongKeyPair = await generateAgentKeyPair(AgentRole.EXPORTER);

      const result = adapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        issuerPublicKey: wrongKeyPair.publicKey,
        resourceType: ResourceType.AST,
        operation: 'write',
      });

      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('capability');
    });

    it('should reject capability that does not cover the resource', async () => {
      const capToken = await createCapabilityToken([{ with: 'holoscript://ast', can: 'ast/read' }]);

      const result = adapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.CODE,
        operation: 'write',
      });

      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('capability');
    });

    it('should reject capability with wrong action', async () => {
      const capToken = await createCapabilityToken([{ with: 'holoscript://ast', can: 'ast/read' }]);

      const result = adapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.AST,
        operation: 'write',
      });

      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('capability');
    });
  });

  // -----------------------------------------------------------------------
  // Fallback behavior
  // -----------------------------------------------------------------------

  describe('Fallback behavior (capability-first)', () => {
    it('should fall back to JWT when no capability token is provided', async () => {
      const jwtToken = await createJwtToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);

      const result = adapter.checkAccess({
        token: jwtToken,
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('rbac');
    });

    it('should fall back to JWT when capability check fails', async () => {
      const jwtToken = await createJwtToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);

      // Provide a capability token for wrong resource
      const capToken = await createCapabilityToken([
        { with: 'holoscript://code', can: 'code/write' },
      ]);

      const result = adapter.checkAccess({
        token: jwtToken,
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      // Should fall back to JWT and succeed
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('rbac');
    });

    it('should return failure when both modes fail', async () => {
      const jwtToken = await createJwtToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.PARSE_TOKENS);

      // Capability for wrong resource
      const capToken = await createCapabilityToken([{ with: 'holoscript://ast', can: 'ast/read' }]);

      const result = adapter.checkAccess({
        token: jwtToken,
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
      });

      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Strategy configurations
  // -----------------------------------------------------------------------

  describe('Strategies', () => {
    it('rbac-first: should use JWT first', async () => {
      const rbacFirstAdapter = new CapabilityRBAC({
        rbac,
        capabilityIssuer: capIssuer,
        strategy: 'rbac-first',
      });

      const jwtToken = await createJwtToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);

      const result = rbacFirstAdapter.checkAccess({
        token: jwtToken,
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('rbac');
    });

    it('rbac-first: should fall back to capability when JWT fails', async () => {
      const rbacFirstAdapter = new CapabilityRBAC({
        rbac,
        capabilityIssuer: capIssuer,
        strategy: 'rbac-first',
      });

      // JWT token for wrong resource
      const jwtToken = await createJwtToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.PARSE_TOKENS);

      // Capability token for the actual resource
      const capToken = await createCapabilityToken([
        { with: 'holoscript://output', can: 'output/write' },
      ]);

      const result = rbacFirstAdapter.checkAccess({
        token: jwtToken,
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
    });

    it('capability-only: should reject when no capability token', async () => {
      const capOnlyAdapter = new CapabilityRBAC({
        rbac,
        capabilityIssuer: capIssuer,
        strategy: 'capability-only',
      });

      const jwtToken = await createJwtToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);

      const result = capOnlyAdapter.checkAccess({
        token: jwtToken,
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('capability');
    });

    it('rbac-only: should reject when no JWT token', async () => {
      const rbacOnlyAdapter = new CapabilityRBAC({
        rbac,
        capabilityIssuer: capIssuer,
        strategy: 'rbac-only',
      });

      const capToken = await createCapabilityToken([{ with: 'holoscript://ast', can: 'ast/read' }]);

      const result = rbacOnlyAdapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        issuerPublicKey: orchestratorKeyPair.publicKey,
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(false);
      expect(result.mode).toBe('rbac');
    });
  });

  // -----------------------------------------------------------------------
  // Convenience methods
  // -----------------------------------------------------------------------

  describe('Convenience methods', () => {
    it('canReadSource with JWT token', async () => {
      const jwtToken = await createJwtToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.PARSE_TOKENS);

      const result = adapter.canReadSource(jwtToken, 'packages/core/test.hs');
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('rbac');
    });

    it('canReadSource with capability token', async () => {
      const capToken = await createCapabilityToken([
        { with: 'holoscript://source', can: 'source/read' },
      ]);

      const result = adapter.canReadSource(
        { token: capToken, publicKey: orchestratorKeyPair.publicKey },
        'packages/core/test.hs'
      );

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
    });

    it('canModifyAST with capability token', async () => {
      const capToken = await createCapabilityToken([
        { with: 'holoscript://ast', can: 'ast/write' },
      ]);

      const result = adapter.canModifyAST({
        token: capToken,
        publicKey: orchestratorKeyPair.publicKey,
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
    });

    it('canGenerateCode with capability token', async () => {
      const capToken = await createCapabilityToken([
        { with: 'holoscript://code', can: 'code/write' },
      ]);

      const result = adapter.canGenerateCode({
        token: capToken,
        publicKey: orchestratorKeyPair.publicKey,
      });

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
    });

    it('canExport with capability token', async () => {
      const capToken = await createCapabilityToken([
        { with: 'holoscript://output', can: 'output/write' },
      ]);

      const result = adapter.canExport(
        { token: capToken, publicKey: orchestratorKeyPair.publicKey },
        'dist/unity'
      );

      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('capability');
    });
  });

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  describe('Accessors', () => {
    it('should expose underlying RBAC', () => {
      expect(adapter.getRBAC()).toBe(rbac);
    });

    it('should expose capability issuer', () => {
      expect(adapter.getCapabilityIssuer()).toBe(capIssuer);
    });

    it('should expose strategy', () => {
      expect(adapter.getStrategy()).toBe('capability-first');
    });
  });

  // -----------------------------------------------------------------------
  // Missing token scenarios
  // -----------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should return failure when no tokens provided', () => {
      const result = adapter.checkAccess({
        token: '',
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(false);
    });

    it('should handle missing issuer public key gracefully', async () => {
      const capToken = await createCapabilityToken([{ with: 'holoscript://ast', can: 'ast/read' }]);

      const result = adapter.checkAccess({
        token: '',
        capabilityToken: capToken,
        // issuerPublicKey intentionally omitted
        resourceType: ResourceType.AST,
        operation: 'read',
      });

      expect(result.allowed).toBe(false);
    });
  });
});
