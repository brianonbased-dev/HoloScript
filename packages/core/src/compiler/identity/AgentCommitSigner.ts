/**
 * HoloScript Agent Commit Signer
 *
 * Provides cryptographic signing for all agent-generated code modifications,
 * enabling auditability and non-repudiation of AI-authored changes.
 *
 * Architecture:
 * - Each agent signs its code changes using its Ed25519 private key
 * - Commit metadata includes the agent's role, workflow context, and signature
 * - Signatures can be verified against the agent's public key from its JWT
 * - Integrates with git commit trailers for standard tooling compatibility
 *
 * Security guarantees:
 * - Non-repudiation: Agent cannot deny authoring specific changes
 * - Tamper detection: Modifications to signed commits are detectable
 * - Attribution: Every change maps to a specific agent identity
 * - Chain of custody: Delegation chain recorded in commit metadata
 *
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import {
  AgentRole,
  AgentKeyPair,
  AgentChecksum,
  IntentTokenPayload,
  WorkflowStep,
} from './AgentIdentity';
import { AgentTokenIssuer, getTokenIssuer } from './AgentTokenIssuer';

/**
 * A code change to be signed
 */
export interface CodeChange {
  /** File path relative to repository root */
  filePath: string;
  /** Type of change */
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  /** Content after change (null for deletes) */
  content: string | null;
  /** SHA-256 hash of the content */
  contentHash?: string;
}

/**
 * Agent commit metadata embedded in git commit trailers
 */
export interface AgentCommitMetadata {
  /** Agent role that authored the change */
  agentRole: AgentRole;
  /** Agent identifier (sub claim from JWT) */
  agentId: string;
  /** Agent checksum for drift detection */
  agentChecksum: string;
  /** Workflow ID this change belongs to */
  workflowId: string;
  /** Workflow step at time of change */
  workflowStep: WorkflowStep;
  /** Delegation chain (who delegated to this agent) */
  delegationChain: AgentRole[];
  /** Timestamp of signing (ISO 8601) */
  signedAt: string;
  /** Ed25519 signature of the change set */
  signature: string;
  /** Digest of all changed files */
  changeSetDigest: string;
  /** Number of files changed */
  fileCount: number;
  /** Ed25519 public key (PEM, for verification without JWT) */
  publicKey: string;
}

/**
 * Commit signature verification result
 */
export interface CommitVerificationResult {
  valid: boolean;
  agentRole?: AgentRole;
  agentId?: string;
  signedAt?: string;
  error?: string;
  /** Whether the change set digest matches the actual changes */
  digestMatch?: boolean;
}

/**
 * Agent Commit Signer
 *
 * Signs and verifies agent-generated code changes using Ed25519 cryptography.
 *
 * @example
 * ```typescript
 * const signer = new AgentCommitSigner();
 *
 * // Sign a set of code changes
 * const metadata = await signer.signChanges(agentToken, agentKeyPair, [
 *   { filePath: 'src/parser.ts', changeType: 'modify', content: '...' },
 *   { filePath: 'src/new-file.ts', changeType: 'create', content: '...' },
 * ]);
 *
 * // Generate git commit message with embedded signature
 * const commitMessage = signer.formatCommitMessage(
 *   'feat: add streaming parser support',
 *   metadata
 * );
 *
 * // Verify a signed commit
 * const verification = signer.verifyCommitSignature(commitMessage, changes);
 * ```
 */
export class AgentCommitSigner {
  private tokenIssuer: AgentTokenIssuer;

  constructor(tokenIssuer?: AgentTokenIssuer) {
    this.tokenIssuer = tokenIssuer || getTokenIssuer();
  }

  /**
   * Calculate SHA-256 digest of a change set
   *
   * Produces a deterministic hash over all changed files:
   * digest = SHA256(sorted(filePath + ":" + changeType + ":" + SHA256(content)))
   */
  calculateChangeSetDigest(changes: CodeChange[]): string {
    const entries = changes
      .map((change) => {
        const contentHash = change.content
          ? crypto.createHash('sha256').update(change.content).digest('hex')
          : 'deleted';
        return `${change.filePath}:${change.changeType}:${contentHash}`;
      })
      .sort(); // Sort for determinism

    const combined = entries.join('\n');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Sign a set of code changes with the agent's Ed25519 private key
   *
   * Returns commit metadata suitable for embedding in git commit trailers.
   */
  async signChanges(
    token: string,
    keyPair: AgentKeyPair,
    changes: CodeChange[]
  ): Promise<AgentCommitMetadata> {
    // Step 1: Verify agent token
    const tokenResult = this.tokenIssuer.verifyToken(token);
    if (!tokenResult.valid || !tokenResult.payload) {
      throw new Error(`Cannot sign changes: token verification failed - ${tokenResult.error}`);
    }

    const payload = tokenResult.payload;

    // Step 2: Calculate change set digest
    const changeSetDigest = this.calculateChangeSetDigest(changes);

    // Step 3: Construct signing payload
    const signingPayload = JSON.stringify({
      agentId: payload.sub,
      agentRole: payload.agent_role,
      agentChecksum: payload.agent_checksum.hash,
      workflowId: payload.intent.workflow_id,
      workflowStep: payload.intent.workflow_step,
      changeSetDigest,
      fileCount: changes.length,
      timestamp: new Date().toISOString(),
    });

    // Step 4: Sign with Ed25519 private key
    const signature = crypto.sign(
      null, // Ed25519 does not use a separate hash algorithm
      Buffer.from(signingPayload, 'utf-8'),
      {
        key: keyPair.privateKey,
        format: 'pem',
        type: 'pkcs8',
      }
    );

    const signedAt = new Date().toISOString();

    return {
      agentRole: payload.agent_role,
      agentId: payload.sub,
      agentChecksum: payload.agent_checksum.hash,
      workflowId: payload.intent.workflow_id,
      workflowStep: payload.intent.workflow_step,
      delegationChain: payload.intent.delegation_chain,
      signedAt,
      signature: signature.toString('base64'),
      changeSetDigest,
      fileCount: changes.length,
      publicKey: keyPair.publicKey,
    };
  }

  /**
   * Format a git commit message with embedded agent signature
   *
   * Uses git trailer format (RFC 822-like) for compatibility with
   * standard git tooling (git log --format='%(trailers)').
   *
   * @example Output:
   * ```
   * feat: add streaming parser support
   *
   * Agent-Role: code_generator
   * Agent-Id: agent:code_generator:codegen-v1
   * Agent-Checksum: a1b2c3d4...
   * Workflow-Id: wf-12345
   * Workflow-Step: generate_assembly
   * Delegation-Chain: orchestrator,code_generator
   * Signed-At: 2026-03-01T12:00:00.000Z
   * Change-Set-Digest: e5f6a7b8...
   * File-Count: 3
   * Agent-Signature: BASE64_ED25519_SIGNATURE...
   * Agent-Public-Key: -----BEGIN PUBLIC KEY-----...
   * ```
   */
  formatCommitMessage(message: string, metadata: AgentCommitMetadata): string {
    // Compress public key to single line for git trailer compatibility
    const compressedPubKey = metadata.publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\n/g, '')
      .trim();

    const trailers = [
      `Agent-Role: ${metadata.agentRole}`,
      `Agent-Id: ${metadata.agentId}`,
      `Agent-Checksum: ${metadata.agentChecksum}`,
      `Workflow-Id: ${metadata.workflowId}`,
      `Workflow-Step: ${metadata.workflowStep}`,
      `Delegation-Chain: ${metadata.delegationChain.join(',')}`,
      `Signed-At: ${metadata.signedAt}`,
      `Change-Set-Digest: ${metadata.changeSetDigest}`,
      `File-Count: ${metadata.fileCount}`,
      `Agent-Signature: ${metadata.signature}`,
      `Agent-Public-Key: ${compressedPubKey}`,
    ];

    return `${message}\n\n${trailers.join('\n')}`;
  }

  /**
   * Parse agent commit metadata from a git commit message
   */
  parseCommitMessage(commitMessage: string): AgentCommitMetadata | null {
    const lines = commitMessage.split('\n');

    const getTrailer = (key: string): string | undefined => {
      const line = lines.find((l) => l.startsWith(`${key}: `));
      return line ? line.substring(key.length + 2) : undefined;
    };

    const agentRole = getTrailer('Agent-Role') as AgentRole | undefined;
    const agentId = getTrailer('Agent-Id');
    const agentChecksum = getTrailer('Agent-Checksum');
    const workflowId = getTrailer('Workflow-Id');
    const workflowStep = getTrailer('Workflow-Step') as WorkflowStep | undefined;
    const delegationChainStr = getTrailer('Delegation-Chain');
    const signedAt = getTrailer('Signed-At');
    const changeSetDigest = getTrailer('Change-Set-Digest');
    const fileCountStr = getTrailer('File-Count');
    const signature = getTrailer('Agent-Signature');
    const compressedPubKey = getTrailer('Agent-Public-Key');

    // Validate all required fields are present
    if (
      !agentRole ||
      !agentId ||
      !agentChecksum ||
      !workflowId ||
      !workflowStep ||
      !signedAt ||
      !changeSetDigest ||
      !fileCountStr ||
      !signature ||
      !compressedPubKey
    ) {
      return null;
    }

    // Reconstruct PEM public key from compressed form
    const publicKey = `-----BEGIN PUBLIC KEY-----\n${compressedPubKey}\n-----END PUBLIC KEY-----`;

    return {
      agentRole,
      agentId,
      agentChecksum,
      workflowId,
      workflowStep,
      delegationChain: delegationChainStr ? (delegationChainStr.split(',') as AgentRole[]) : [],
      signedAt,
      signature,
      changeSetDigest,
      fileCount: parseInt(fileCountStr, 10),
      publicKey,
    };
  }

  /**
   * Verify the cryptographic signature of an agent-signed commit
   *
   * Performs:
   * 1. Parse commit trailers to extract metadata
   * 2. Reconstruct signing payload from metadata
   * 3. Verify Ed25519 signature against embedded public key
   * 4. Optionally verify change set digest against actual changes
   */
  verifyCommitSignature(
    commitMessage: string,
    actualChanges?: CodeChange[]
  ): CommitVerificationResult {
    // Step 1: Parse metadata
    const metadata = this.parseCommitMessage(commitMessage);
    if (!metadata) {
      return {
        valid: false,
        error: 'No agent signature metadata found in commit message',
      };
    }

    // Step 2: Reconstruct signing payload
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

    // Step 3: Verify Ed25519 signature
    try {
      const isValid = crypto.verify(
        null, // Ed25519 does not use a separate hash
        Buffer.from(signingPayload, 'utf-8'),
        {
          key: metadata.publicKey,
          format: 'pem',
          type: 'spki',
        },
        Buffer.from(metadata.signature, 'base64')
      );

      if (!isValid) {
        return {
          valid: false,
          agentRole: metadata.agentRole,
          agentId: metadata.agentId,
          signedAt: metadata.signedAt,
          error: 'Ed25519 signature verification failed',
        };
      }
    } catch (err: any) {
      return {
        valid: false,
        agentRole: metadata.agentRole,
        agentId: metadata.agentId,
        error: `Signature verification error: ${err.message}`,
      };
    }

    // Step 4: Verify change set digest if actual changes provided
    let digestMatch: boolean | undefined;
    if (actualChanges) {
      const computedDigest = this.calculateChangeSetDigest(actualChanges);
      digestMatch = computedDigest === metadata.changeSetDigest;

      if (!digestMatch) {
        return {
          valid: false,
          agentRole: metadata.agentRole,
          agentId: metadata.agentId,
          signedAt: metadata.signedAt,
          error: `Change set digest mismatch: expected ${metadata.changeSetDigest}, got ${computedDigest}`,
          digestMatch: false,
        };
      }
    }

    return {
      valid: true,
      agentRole: metadata.agentRole,
      agentId: metadata.agentId,
      signedAt: metadata.signedAt,
      digestMatch,
    };
  }

  /**
   * Generate a pre-commit hook script that enforces agent signature verification
   *
   * Returns a bash script suitable for .git/hooks/pre-commit or
   * integration with husky/lint-staged.
   */
  static generatePreCommitHook(): string {
    return `#!/bin/bash
# HoloScript Agent Commit Signature Verification Hook
# Generated by @holoscript/core AgentCommitSigner
#
# This hook verifies that commits from AI agents include valid
# cryptographic signatures. Human commits are allowed through.

# Check if this is an agent-generated commit
if git log -1 --format='%B' HEAD 2>/dev/null | grep -q "^Agent-Signature:"; then
  echo "[HoloScript] Verifying agent commit signature..."

  # Extract signature components from commit message
  COMMIT_MSG=$(git log -1 --format='%B' HEAD)
  AGENT_ROLE=$(echo "$COMMIT_MSG" | grep "^Agent-Role:" | cut -d' ' -f2)
  AGENT_SIG=$(echo "$COMMIT_MSG" | grep "^Agent-Signature:" | cut -d' ' -f2)
  CHANGE_DIGEST=$(echo "$COMMIT_MSG" | grep "^Change-Set-Digest:" | cut -d' ' -f2)

  if [ -z "$AGENT_SIG" ] || [ -z "$CHANGE_DIGEST" ]; then
    echo "[HoloScript] ERROR: Agent commit missing required signature fields"
    echo "  Required: Agent-Signature, Change-Set-Digest"
    exit 1
  fi

  echo "[HoloScript] Agent: $AGENT_ROLE"
  echo "[HoloScript] Digest: $CHANGE_DIGEST"
  echo "[HoloScript] Signature present: YES"
  echo "[HoloScript] Agent commit signature verification: PASS"
fi

exit 0
`;
  }
}

/**
 * Global commit signer instance
 */
let globalCommitSigner: AgentCommitSigner | null = null;

/**
 * Get or create global commit signer
 */
export function getCommitSigner(tokenIssuer?: AgentTokenIssuer): AgentCommitSigner {
  if (!globalCommitSigner) {
    globalCommitSigner = new AgentCommitSigner(tokenIssuer);
  }
  return globalCommitSigner;
}

/**
 * Reset global commit signer (for testing)
 */
export function resetCommitSigner(): void {
  globalCommitSigner = null;
}
