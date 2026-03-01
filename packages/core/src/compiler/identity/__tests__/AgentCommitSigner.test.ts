/**
 * Tests for AgentCommitSigner
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import {
  AgentCommitSigner,
  resetCommitSigner,
  type CodeChange,
  type AgentCommitMetadata,
} from '../AgentCommitSigner';
import { AgentRole, WorkflowStep } from '../AgentIdentity';

describe('AgentCommitSigner', () => {
  let signer: AgentCommitSigner;

  beforeEach(() => {
    resetCommitSigner();
    // Create signer without token issuer dependency for unit tests
    signer = new AgentCommitSigner();
  });

  afterEach(() => {
    resetCommitSigner();
  });

  describe('calculateChangeSetDigest', () => {
    it('should produce deterministic digest for same changes', () => {
      const changes: CodeChange[] = [
        { filePath: 'src/a.ts', changeType: 'modify', content: 'const x = 1;' },
        { filePath: 'src/b.ts', changeType: 'create', content: 'export {}' },
      ];

      const digest1 = signer.calculateChangeSetDigest(changes);
      const digest2 = signer.calculateChangeSetDigest(changes);

      expect(digest1).toBe(digest2);
    });

    it('should produce same digest regardless of change order', () => {
      const changes1: CodeChange[] = [
        { filePath: 'src/a.ts', changeType: 'modify', content: 'const x = 1;' },
        { filePath: 'src/b.ts', changeType: 'create', content: 'export {}' },
      ];

      const changes2: CodeChange[] = [
        { filePath: 'src/b.ts', changeType: 'create', content: 'export {}' },
        { filePath: 'src/a.ts', changeType: 'modify', content: 'const x = 1;' },
      ];

      expect(signer.calculateChangeSetDigest(changes1))
        .toBe(signer.calculateChangeSetDigest(changes2));
    });

    it('should produce different digest for different content', () => {
      const changes1: CodeChange[] = [
        { filePath: 'src/a.ts', changeType: 'modify', content: 'version 1' },
      ];

      const changes2: CodeChange[] = [
        { filePath: 'src/a.ts', changeType: 'modify', content: 'version 2' },
      ];

      expect(signer.calculateChangeSetDigest(changes1))
        .not.toBe(signer.calculateChangeSetDigest(changes2));
    });

    it('should handle delete operations (null content)', () => {
      const changes: CodeChange[] = [
        { filePath: 'src/old.ts', changeType: 'delete', content: null },
      ];

      const digest = signer.calculateChangeSetDigest(changes);
      expect(digest).toBeTruthy();
      expect(digest.length).toBe(64); // SHA-256 hex string
    });

    it('should produce 64-char hex string (SHA-256)', () => {
      const changes: CodeChange[] = [
        { filePath: 'src/file.ts', changeType: 'create', content: 'content' },
      ];

      const digest = signer.calculateChangeSetDigest(changes);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('formatCommitMessage', () => {
    const mockMetadata: AgentCommitMetadata = {
      agentRole: AgentRole.CODE_GENERATOR,
      agentId: 'agent:code_generator:codegen-v1',
      agentChecksum: 'abc123def456',
      workflowId: 'wf-test-001',
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.CODE_GENERATOR],
      signedAt: '2026-03-01T12:00:00.000Z',
      signature: 'AAAA==',
      changeSetDigest: 'digest123',
      fileCount: 3,
      publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----',
    };

    it('should include commit message and all trailers', () => {
      const result = signer.formatCommitMessage('feat: add parser', mockMetadata);

      expect(result).toContain('feat: add parser');
      expect(result).toContain('Agent-Role: code_generator');
      expect(result).toContain('Agent-Id: agent:code_generator:codegen-v1');
      expect(result).toContain('Agent-Checksum: abc123def456');
      expect(result).toContain('Workflow-Id: wf-test-001');
      expect(result).toContain('Workflow-Step: generate_assembly');
      expect(result).toContain('Delegation-Chain: orchestrator,code_generator');
      expect(result).toContain('Signed-At: 2026-03-01T12:00:00.000Z');
      expect(result).toContain('Change-Set-Digest: digest123');
      expect(result).toContain('File-Count: 3');
      expect(result).toContain('Agent-Signature: AAAA==');
      expect(result).toContain('Agent-Public-Key:');
    });

    it('should separate message from trailers with blank line', () => {
      const result = signer.formatCommitMessage('fix: bug', mockMetadata);
      const parts = result.split('\n\n');
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe('fix: bug');
    });
  });

  describe('parseCommitMessage', () => {
    it('should round-trip format -> parse', () => {
      const metadata: AgentCommitMetadata = {
        agentRole: AgentRole.EXPORTER,
        agentId: 'agent:exporter:export-v1',
        agentChecksum: 'checksum456',
        workflowId: 'wf-export-001',
        workflowStep: WorkflowStep.SERIALIZE,
        delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.EXPORTER],
        signedAt: '2026-03-01T15:00:00.000Z',
        signature: 'BBBB==',
        changeSetDigest: 'digest789',
        fileCount: 1,
        publicKey: '-----BEGIN PUBLIC KEY-----\nTestKey123\n-----END PUBLIC KEY-----',
      };

      const formatted = signer.formatCommitMessage('chore: export', metadata);
      const parsed = signer.parseCommitMessage(formatted);

      expect(parsed).not.toBeNull();
      expect(parsed!.agentRole).toBe(AgentRole.EXPORTER);
      expect(parsed!.agentId).toBe('agent:exporter:export-v1');
      expect(parsed!.workflowId).toBe('wf-export-001');
      expect(parsed!.workflowStep).toBe(WorkflowStep.SERIALIZE);
      expect(parsed!.fileCount).toBe(1);
      expect(parsed!.signature).toBe('BBBB==');
      expect(parsed!.changeSetDigest).toBe('digest789');
    });

    it('should return null for non-agent commits', () => {
      const result = signer.parseCommitMessage('feat: human commit\n\nNo agent trailers here.');
      expect(result).toBeNull();
    });
  });

  describe('generatePreCommitHook', () => {
    it('should generate valid bash script', () => {
      const hook = AgentCommitSigner.generatePreCommitHook();

      expect(hook).toContain('#!/bin/bash');
      expect(hook).toContain('Agent-Signature');
      expect(hook).toContain('exit 0');
    });
  });

  describe('verifyCommitSignature (end-to-end with real keys)', () => {
    it('should verify valid Ed25519 signature', () => {
      // Generate a real Ed25519 key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const metadata: AgentCommitMetadata = {
        agentRole: AgentRole.CODE_GENERATOR,
        agentId: 'agent:code_generator:test',
        agentChecksum: 'test-checksum',
        workflowId: 'wf-test',
        workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
        delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.CODE_GENERATOR],
        signedAt: new Date().toISOString(),
        signature: '', // Will be set below
        changeSetDigest: 'test-digest',
        fileCount: 1,
        publicKey,
      };

      // Create the signing payload (same structure as signChanges)
      const signingPayload = JSON.stringify({
        agentId: metadata.agentId,
        agentRole: metadata.agentRole,
        agentChecksum: metadata.agentChecksum,
        workflowId: metadata.workflowId,
        workflowStep: metadata.workflowStep,
        changeSetDigest: metadata.changeSetDigest,
        fileCount: metadata.fileCount,
        timestamp: metadata.signedAt,
      });

      // Sign with Ed25519
      const signature = crypto.sign(
        null,
        Buffer.from(signingPayload, 'utf-8'),
        { key: privateKey, format: 'pem', type: 'pkcs8' }
      );
      metadata.signature = signature.toString('base64');

      // Format commit message
      const commitMessage = signer.formatCommitMessage('feat: test commit', metadata);

      // Verify
      const result = signer.verifyCommitSignature(commitMessage);
      expect(result.valid).toBe(true);
      expect(result.agentRole).toBe(AgentRole.CODE_GENERATOR);
      expect(result.agentId).toBe('agent:code_generator:test');
    });

    it('should reject tampered signature', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const metadata: AgentCommitMetadata = {
        agentRole: AgentRole.CODE_GENERATOR,
        agentId: 'agent:code_generator:test',
        agentChecksum: 'test-checksum',
        workflowId: 'wf-test',
        workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
        delegationChain: [AgentRole.ORCHESTRATOR],
        signedAt: new Date().toISOString(),
        signature: '',
        changeSetDigest: 'original-digest',
        fileCount: 1,
        publicKey,
      };

      const signingPayload = JSON.stringify({
        agentId: metadata.agentId,
        agentRole: metadata.agentRole,
        agentChecksum: metadata.agentChecksum,
        workflowId: metadata.workflowId,
        workflowStep: metadata.workflowStep,
        changeSetDigest: metadata.changeSetDigest,
        fileCount: metadata.fileCount,
        timestamp: metadata.signedAt,
      });

      const signature = crypto.sign(
        null,
        Buffer.from(signingPayload, 'utf-8'),
        { key: privateKey, format: 'pem', type: 'pkcs8' }
      );
      metadata.signature = signature.toString('base64');

      // Tamper with the digest AFTER signing
      let commitMessage = signer.formatCommitMessage('feat: tampered', metadata);
      commitMessage = commitMessage.replace(
        'Change-Set-Digest: original-digest',
        'Change-Set-Digest: tampered-digest'
      );

      const result = signer.verifyCommitSignature(commitMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature verification failed');
    });

    it('should verify change set digest against actual changes', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const changes: CodeChange[] = [
        { filePath: 'src/file.ts', changeType: 'modify', content: 'const x = 42;' },
      ];
      const realDigest = signer.calculateChangeSetDigest(changes);

      const metadata: AgentCommitMetadata = {
        agentRole: AgentRole.AST_OPTIMIZER,
        agentId: 'agent:ast_optimizer:opt-v1',
        agentChecksum: 'opt-checksum',
        workflowId: 'wf-opt',
        workflowStep: WorkflowStep.APPLY_TRANSFORMS,
        delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.AST_OPTIMIZER],
        signedAt: new Date().toISOString(),
        signature: '',
        changeSetDigest: realDigest,
        fileCount: 1,
        publicKey,
      };

      const signingPayload = JSON.stringify({
        agentId: metadata.agentId,
        agentRole: metadata.agentRole,
        agentChecksum: metadata.agentChecksum,
        workflowId: metadata.workflowId,
        workflowStep: metadata.workflowStep,
        changeSetDigest: metadata.changeSetDigest,
        fileCount: metadata.fileCount,
        timestamp: metadata.signedAt,
      });

      const signature = crypto.sign(
        null,
        Buffer.from(signingPayload, 'utf-8'),
        { key: privateKey, format: 'pem', type: 'pkcs8' }
      );
      metadata.signature = signature.toString('base64');

      const commitMessage = signer.formatCommitMessage('refactor: optimize AST', metadata);

      // Verify with correct changes
      const resultCorrect = signer.verifyCommitSignature(commitMessage, changes);
      expect(resultCorrect.valid).toBe(true);
      expect(resultCorrect.digestMatch).toBe(true);

      // Verify with different changes (tampered)
      const tamperedChanges: CodeChange[] = [
        { filePath: 'src/file.ts', changeType: 'modify', content: 'const x = 9999;' },
      ];
      const resultTampered = signer.verifyCommitSignature(commitMessage, tamperedChanges);
      expect(resultTampered.valid).toBe(false);
      expect(resultTampered.digestMatch).toBe(false);
      expect(resultTampered.error).toContain('digest mismatch');
    });
  });
});
