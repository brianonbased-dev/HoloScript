/**
 * Tests for AgentRBAC — role-based access control for compiler agents.
 *
 * AgentRBAC had no dedicated test (only indirect, ~60% line / 41% function
 * coverage via AgentRiskRegistry). It is a security boundary: every checkAccess
 * decision gates what an agent role may read, write, or execute. These tests
 * exercise the core decision pipeline — token verification, the resource→
 * permission matrix, workflow-step gating, and the convenience helpers — across
 * all roles, asserting both the granted and denied paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AgentRBAC,
  getRBAC,
  resetRBAC,
  ResourceType,
  type AccessDecision,
} from '../AgentRBAC';
import { AgentTokenIssuer, resetTokenIssuer, type TokenRequest } from '../AgentTokenIssuer';
import {
  AgentRole,
  WorkflowStep,
  AgentPermission,
  generateAgentKeyPair,
  type AgentConfig,
} from '../AgentIdentity';

let issueCounter = 0;

describe('AgentRBAC', () => {
  let tokenIssuer: AgentTokenIssuer;
  let rbac: AgentRBAC;

  beforeEach(() => {
    tokenIssuer = new AgentTokenIssuer({
      issuer: 'test',
      jwtSecret: 'test-secret-key',
      tokenExpiration: '1h',
      strictWorkflowValidation: false,
    });
    rbac = new AgentRBAC(tokenIssuer);
  });

  afterEach(() => {
    resetTokenIssuer();
    resetRBAC();
  });

  async function issueToken(role: AgentRole, step: WorkflowStep): Promise<string> {
    const agentConfig: AgentConfig = { role, name: `${role}-test`, version: '1.0.0' };
    const keyPair = await generateAgentKeyPair(role);
    const request: TokenRequest = {
      agentConfig,
      workflowStep: step,
      workflowId: `wf-${issueCounter++}`,
      initiatedBy: AgentRole.ORCHESTRATOR,
      keyPair,
    };
    return tokenIssuer.issueToken(request);
  }

  describe('token verification gate (step 1)', () => {
    it('denies access for an unverifiable token', () => {
      const decision = rbac.checkAccess({
        token: 'not.a.valid.token',
        resourceType: ResourceType.AST,
        operation: 'read',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/Token verification failed/);
    });

    it('denies every convenience helper for a bad token', () => {
      const bad = 'garbage';
      expect(rbac.canReadSource(bad, 'a.ts').allowed).toBe(false);
      expect(rbac.canModifyAST(bad).allowed).toBe(false);
      expect(rbac.canGenerateCode(bad).allowed).toBe(false);
      expect(rbac.canExport(bad, 'out/').allowed).toBe(false);
    });
  });

  describe('permission matrix (step 2)', () => {
    it('grants a syntax analyzer read access to source', async () => {
      const token = await issueToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.BUILD_AST);
      const decision = rbac.canReadSource(token, 'packages/core/src/index.ts');
      expect(decision.allowed).toBe(true);
      expect(decision.agentRole).toBe(AgentRole.SYNTAX_ANALYZER);
    });

    it('denies a syntax analyzer the ability to generate code (lacks WRITE_CODE)', async () => {
      const token = await issueToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.BUILD_AST);
      const decision = rbac.canGenerateCode(token);
      expect(decision.allowed).toBe(false);
      // Permission gate fires before the workflow-step gate.
      expect(decision.requiredPermission).toBe(AgentPermission.WRITE_CODE);
    });

    it('denies a code generator read access to source (lacks READ_SOURCE)', async () => {
      const token = await issueToken(AgentRole.CODE_GENERATOR, WorkflowStep.GENERATE_ASSEMBLY);
      const decision = rbac.canReadSource(token, 'x.ts');
      expect(decision.allowed).toBe(false);
      expect(decision.requiredPermission).toBe(AgentPermission.READ_SOURCE);
    });

    it('grants a code generator the ability to generate code at GENERATE_ASSEMBLY', async () => {
      const token = await issueToken(AgentRole.CODE_GENERATOR, WorkflowStep.GENERATE_ASSEMBLY);
      const decision = rbac.canGenerateCode(token);
      expect(decision.allowed).toBe(true);
    });

    it('grants an AST optimizer the ability to modify the AST', async () => {
      const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
      expect(rbac.canModifyAST(token).allowed).toBe(true);
    });

    it('grants an exporter the ability to export at SERIALIZE', async () => {
      const token = await issueToken(AgentRole.EXPORTER, WorkflowStep.SERIALIZE);
      expect(rbac.canExport(token, 'dist/app.js').allowed).toBe(true);
    });

    it('denies a syntax analyzer the ability to export (lacks WRITE_OUTPUT)', async () => {
      const token = await issueToken(AgentRole.SYNTAX_ANALYZER, WorkflowStep.BUILD_AST);
      const decision = rbac.canExport(token, 'dist/app.js');
      expect(decision.allowed).toBe(false);
      expect(decision.requiredPermission).toBe(AgentPermission.WRITE_OUTPUT);
    });

    it('grants the orchestrator every operation (holds all permissions)', async () => {
      const token = await issueToken(AgentRole.ORCHESTRATOR, WorkflowStep.GENERATE_ASSEMBLY);
      expect(rbac.canGenerateCode(token).allowed).toBe(true);
    });
  });

  describe('workflow-step gate (step 4)', () => {
    it('denies code generation when the agent is at the wrong step', async () => {
      // Has WRITE_CODE, but is at SELECT_INSTRUCTIONS, not the expected GENERATE_ASSEMBLY.
      const token = await issueToken(AgentRole.CODE_GENERATOR, WorkflowStep.SELECT_INSTRUCTIONS);
      const decision = rbac.canGenerateCode(token);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/Workflow step mismatch/);
    });

    it('enforces an explicit expectedWorkflowStep on checkAccess', async () => {
      const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.ANALYZE_AST);
      const decision: AccessDecision = rbac.checkAccess({
        token,
        resourceType: ResourceType.AST,
        operation: 'write',
        expectedWorkflowStep: WorkflowStep.APPLY_TRANSFORMS,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/Workflow step mismatch/);
    });
  });

  describe('introspection helpers', () => {
    it('extractRole returns the token role, or null for a bad token', async () => {
      const token = await issueToken(AgentRole.EXPORTER, WorkflowStep.SERIALIZE);
      expect(rbac.extractRole(token)).toBe(AgentRole.EXPORTER);
      expect(rbac.extractRole('nope')).toBeNull();
    });

    it('getWorkflowStep returns the token step, or null for a bad token', async () => {
      const token = await issueToken(AgentRole.AST_OPTIMIZER, WorkflowStep.APPLY_TRANSFORMS);
      expect(rbac.getWorkflowStep(token)).toBe(WorkflowStep.APPLY_TRANSFORMS);
      expect(rbac.getWorkflowStep('nope')).toBeNull();
    });
  });

  describe('global RBAC singleton', () => {
    it('returns a stable instance until reset', () => {
      resetRBAC();
      const a = getRBAC(tokenIssuer);
      const b = getRBAC();
      expect(a).toBe(b);
      resetRBAC();
      expect(getRBAC(tokenIssuer)).not.toBe(a);
      resetRBAC();
    });
  });
});
