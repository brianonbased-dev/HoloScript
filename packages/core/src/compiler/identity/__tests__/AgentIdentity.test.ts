/**
 * Tests for AgentIdentity module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  AgentConfig,
  calculateAgentChecksum,
  generateAgentKeyPair,
  getDefaultPermissions,
  hasPermission,
  canPerformOperation,
  isValidWorkflowTransition,
  ROLE_PERMISSIONS,
} from '../AgentIdentity';

describe('AgentIdentity', () => {
  describe('calculateAgentChecksum', () => {
    it('should generate deterministic checksum for same configuration', () => {
      const config: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
        prompt: 'Parse HoloScript source code',
        tools: ['lexer', 'parser'],
        configuration: { strictMode: true },
      };

      const checksum1 = calculateAgentChecksum(config);
      const checksum2 = calculateAgentChecksum(config);

      expect(checksum1.hash).toBe(checksum2.hash);
      expect(checksum1.algorithm).toBe('sha256');
      expect(checksum1.label).toBe('syntax_analyzer:syntax-v1:1.0.0');
    });

    it('should generate different checksums for different configurations', () => {
      const config1: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
      };

      const config2: AgentConfig = {
        role: AgentRole.AST_OPTIMIZER,
        name: 'optimizer-v1',
        version: '1.0.0',
      };

      const checksum1 = calculateAgentChecksum(config1);
      const checksum2 = calculateAgentChecksum(config2);

      expect(checksum1.hash).not.toBe(checksum2.hash);
    });

    it('should detect configuration drift', () => {
      const config1: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
        tools: ['lexer'],
      };

      const config2: AgentConfig = {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-v1',
        version: '1.0.0',
        tools: ['lexer', 'parser'], // Added tool
      };

      const checksum1 = calculateAgentChecksum(config1);
      const checksum2 = calculateAgentChecksum(config2);

      expect(checksum1.hash).not.toBe(checksum2.hash);
    });
  });

  describe('generateAgentKeyPair', () => {
    it('should generate Ed25519 key pair', async () => {
      const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(keyPair.kid).toContain('agent:code_generator#');
      expect(keyPair.thumbprint).toBeTruthy();
    });

    it('should generate unique key pairs', async () => {
      const keyPair1 = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);
      const keyPair2 = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

      expect(keyPair1.thumbprint).not.toBe(keyPair2.thumbprint);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('should define permissions for all agent roles', () => {
      expect(ROLE_PERMISSIONS[AgentRole.SYNTAX_ANALYZER]).toContain(AgentPermission.READ_SOURCE);
      expect(ROLE_PERMISSIONS[AgentRole.AST_OPTIMIZER]).toContain(AgentPermission.TRANSFORM_AST);
      expect(ROLE_PERMISSIONS[AgentRole.CODE_GENERATOR]).toContain(AgentPermission.WRITE_CODE);
      expect(ROLE_PERMISSIONS[AgentRole.EXPORTER]).toContain(AgentPermission.WRITE_OUTPUT);
    });

    it('should give orchestrator all permissions', () => {
      const orchestratorPerms = ROLE_PERMISSIONS[AgentRole.ORCHESTRATOR];
      const allPerms = Object.values(AgentPermission);

      expect(orchestratorPerms.length).toBe(allPerms.length);
    });

    it('should restrict syntax analyzer to read-only source', () => {
      const perms = ROLE_PERMISSIONS[AgentRole.SYNTAX_ANALYZER];

      expect(perms).toContain(AgentPermission.READ_SOURCE);
      expect(perms).not.toContain(AgentPermission.WRITE_CODE);
      expect(perms).not.toContain(AgentPermission.WRITE_OUTPUT);
    });
  });

  describe('getDefaultPermissions', () => {
    it('should return role-specific permissions', () => {
      const perms = getDefaultPermissions(AgentRole.AST_OPTIMIZER);

      expect(perms).toContain(AgentPermission.READ_AST);
      expect(perms).toContain(AgentPermission.TRANSFORM_AST);
    });

    it('should return new array (not reference)', () => {
      const perms1 = getDefaultPermissions(AgentRole.CODE_GENERATOR);
      const perms2 = getDefaultPermissions(AgentRole.CODE_GENERATOR);

      expect(perms1).not.toBe(perms2);
      expect(perms1).toEqual(perms2);
    });
  });

  describe('hasPermission', () => {
    it('should return true for exact permission match', () => {
      const perms = [AgentPermission.READ_SOURCE, AgentPermission.READ_CONFIG];

      expect(hasPermission(perms, AgentPermission.READ_SOURCE)).toBe(true);
    });

    it('should return false for missing permission', () => {
      const perms = [AgentPermission.READ_SOURCE];

      expect(hasPermission(perms, AgentPermission.WRITE_CODE)).toBe(false);
    });
  });

  describe('canPerformOperation', () => {
    it('should allow syntax analyzer to read source in BUILD_AST step', () => {
      const canPerform = canPerformOperation(
        AgentRole.SYNTAX_ANALYZER,
        WorkflowStep.BUILD_AST,
        AgentPermission.READ_SOURCE
      );

      expect(canPerform).toBe(true);
    });

    it('should deny exporter from transforming AST', () => {
      const canPerform = canPerformOperation(
        AgentRole.EXPORTER,
        WorkflowStep.SERIALIZE,
        AgentPermission.TRANSFORM_AST
      );

      expect(canPerform).toBe(false);
    });
  });

  describe('isValidWorkflowTransition', () => {
    it('should allow valid sequential transitions', () => {
      expect(isValidWorkflowTransition(WorkflowStep.PARSE_TOKENS, WorkflowStep.BUILD_AST)).toBe(true);
      expect(isValidWorkflowTransition(WorkflowStep.BUILD_AST, WorkflowStep.ANALYZE_AST)).toBe(true);
      expect(isValidWorkflowTransition(WorkflowStep.ANALYZE_AST, WorkflowStep.APPLY_TRANSFORMS)).toBe(true);
    });

    it('should deny invalid transitions', () => {
      expect(isValidWorkflowTransition(WorkflowStep.PARSE_TOKENS, WorkflowStep.SERIALIZE)).toBe(false);
      expect(isValidWorkflowTransition(WorkflowStep.BUILD_AST, WorkflowStep.GENERATE_ASSEMBLY)).toBe(false);
    });

    it('should deny transitions from terminal step', () => {
      expect(isValidWorkflowTransition(WorkflowStep.SERIALIZE, WorkflowStep.BUILD_AST)).toBe(false);
    });
  });
});
