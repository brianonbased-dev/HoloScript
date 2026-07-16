import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentPermission,
  AgentRole,
  WorkflowStep,
} from '../../../core/src/compiler/identity/AgentIdentity';
import {
  agentIdentityTools,
  handleAgentIdentityTool,
  isAgentIdentityToolName,
  resetAgentIdentityTools,
} from '../agent-identity-tools';

interface IssuedToken {
  ok: boolean;
  token: string;
  tokenFormat: string;
  key: { publicKey: string; privateKey?: string; thumbprint: string };
  workflow: { workflowId: string; workflowStep: string; delegationChain: string[] };
  privateKeyReturned: boolean;
  pqEnvelope: {
    algorithm: string;
    classicalSignature: string;
    pqSignature?: string;
    kid: string;
    signedAt: string;
    publicKeys: { classical?: string; pq?: string };
  };
}

interface VerifyResult {
  ok: boolean;
  valid: boolean;
  tokenFormat: string;
  cached: boolean;
  error?: string;
  errorCode?: string;
  envelopeChecked: boolean;
  envelopeValid?: boolean;
  payload?: {
    agentRole: string;
    permissions: string[];
    intent: { workflowId: string; workflowStep: string; delegationChain: string[] };
  };
  receipt: { tokenSha256: string; path?: string };
}

function readReceipts(receiptPath: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(receiptPath)) return [];
  return fs
    .readFileSync(receiptPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Craft a legacy jsonwebtoken-style HS256 JWT without the jsonwebtoken package. */
function craftLegacyHs256Jwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'holoscript-orchestrator',
      sub: 'agent:code_generator:legacy',
      aud: 'holoscript-compiler',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', 'dev-secret-change-in-production')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('agent identity MCP tools (sovereign capability path)', () => {
  let receiptDir: string;
  let receiptPath: string;

  beforeEach(() => {
    receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-identity-receipts-'));
    receiptPath = path.join(receiptDir, 'verify-receipts.ndjson');
    process.env.AGENT_IDENTITY_RECEIPT_PATH = receiptPath;
  });

  afterEach(() => {
    resetAgentIdentityTools();
    delete process.env.AGENT_IDENTITY_RECEIPT_PATH;
    fs.rmSync(receiptDir, { recursive: true, force: true });
  });

  it('registers the archived agent identity operations', () => {
    expect(agentIdentityTools.map((tool) => tool.name).sort()).toEqual([
      'check_permission',
      'get_delegation_chain',
      'issue_agent_token',
      'verify_agent_token',
    ]);
    expect(isAgentIdentityToolName('issue_agent_token')).toBe(true);
    expect(isAgentIdentityToolName('compile_to_unity')).toBe(false);
  });

  it('issues and verifies a capability-token round-trip without returning the private key by default', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.CODE_GENERATOR,
      name: 'codex-codegen',
      version: '1.2.3',
      workflowId: 'wf-agent-identity-test',
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      initiatedBy: AgentRole.ORCHESTRATOR,
      executionContext: { taskId: 'task_1782806017302_qxq0' },
    })) as IssuedToken;

    // Capability token: three-part EdDSA structure, no jsonwebtoken involved.
    expect(issued.token.split('.')).toHaveLength(3);
    expect(issued.tokenFormat).toBe('ucan-capability@0.10.0');
    const header = JSON.parse(
      Buffer.from(issued.token.split('.')[0], 'base64url').toString('utf8')
    ) as { alg: string; ucv: string };
    expect(header.alg).toBe('EdDSA');
    expect(header.ucv).toBe('0.10.0');

    expect(issued.privateKeyReturned).toBe(false);
    expect(issued.key.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(issued.key.privateKey).toBeUndefined();
    expect(issued.workflow.workflowId).toBe('wf-agent-identity-test');
    expect(issued.workflow.workflowStep).toBe(WorkflowStep.GENERATE_ASSEMBLY);
    expect(issued.workflow.delegationChain).toContain(AgentRole.CODE_GENERATOR);

    // ML-DSA-65 dual-signature envelope is emitted additively.
    expect(issued.pqEnvelope.classicalSignature.length).toBeGreaterThan(0);
    expect(issued.pqEnvelope.algorithm).toBe('hybrid-ed25519-ml-dsa-65');
    expect(typeof issued.pqEnvelope.pqSignature).toBe('string');
    expect(issued.pqEnvelope.publicKeys.classical).toContain('BEGIN PUBLIC KEY');

    const verified = (await handleAgentIdentityTool('verify_agent_token', {
      token: issued.token,
    })) as VerifyResult;

    expect(verified.valid).toBe(true);
    expect(verified.tokenFormat).toBe('ucan-capability');
    expect(verified.payload?.agentRole).toBe(AgentRole.CODE_GENERATOR);
    expect(verified.payload?.permissions).toContain(AgentPermission.WRITE_CODE);
    expect(verified.payload?.intent.workflowId).toBe('wf-agent-identity-test');
    expect(verified.payload?.intent.workflowStep).toBe(WorkflowStep.GENERATE_ASSEMBLY);

    // Byte-identical re-presentation stays valid (served from presentation cache).
    const reVerified = (await handleAgentIdentityTool('verify_agent_token', {
      token: issued.token,
    })) as VerifyResult;
    expect(reVerified.valid).toBe(true);
    expect(reVerified.cached).toBe(true);
  });

  it('verifies the ML-DSA-65 dual-signature envelope and fails closed on a bad envelope', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.CODE_GENERATOR,
      workflowId: 'wf-envelope-test',
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    })) as IssuedToken;

    const withEnvelope = (await handleAgentIdentityTool('verify_agent_token', {
      token: issued.token,
      pqEnvelope: {
        classicalSignature: issued.pqEnvelope.classicalSignature,
        pqSignature: issued.pqEnvelope.pqSignature,
        kid: issued.pqEnvelope.kid,
        signedAt: issued.pqEnvelope.signedAt,
      },
    })) as VerifyResult;

    expect(withEnvelope.valid).toBe(true);
    expect(withEnvelope.envelopeChecked).toBe(true);
    expect(withEnvelope.envelopeValid).toBe(true);

    const withBadEnvelope = (await handleAgentIdentityTool('verify_agent_token', {
      token: issued.token,
      pqEnvelope: { classicalSignature: Buffer.from('garbage-signature').toString('base64') },
    })) as VerifyResult;

    expect(withBadEnvelope.valid).toBe(false);
    expect(withBadEnvelope.envelopeChecked).toBe(true);
    expect(withBadEnvelope.envelopeValid).toBe(false);
    expect(withBadEnvelope.errorCode).toBe('ENVELOPE_INVALID');
  });

  it('rejects legacy jsonwebtoken/HS256-envelope tokens with an explicit reason (fail closed, no throw)', async () => {
    const legacyToken = craftLegacyHs256Jwt();

    const result = (await handleAgentIdentityTool('verify_agent_token', {
      token: legacyToken,
    })) as VerifyResult;

    expect(result.ok).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.tokenFormat).toBe('legacy-jwt');
    expect(result.errorCode).toBe('LEGACY_JWT_REJECTED');
    expect(result.error).toContain('no longer accepted');
    expect(result.error).toContain('issue_agent_token');

    // Rejection is receipted too.
    const receipts = readReceipts(receiptPath);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].valid).toBe(false);
    expect(receipts[0].tokenFormat).toBe('legacy-jwt');
    expect(receipts[0].errorCode).toBe('LEGACY_JWT_REJECTED');
  });

  it('rejects malformed and tampered tokens without throwing', async () => {
    const malformed = (await handleAgentIdentityTool('verify_agent_token', {
      token: 'not-a-token',
    })) as VerifyResult;
    expect(malformed.valid).toBe(false);
    expect(malformed.errorCode).toBe('MALFORMED_TOKEN');

    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.SYNTAX_ANALYZER,
    })) as IssuedToken;
    const [headerB64, payloadB64, signatureB64] = issued.token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      aud: string;
    };
    payload.aud = 'attacker-audience';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = `${headerB64}.${tamperedPayloadB64}.${signatureB64}`;

    const result = (await handleAgentIdentityTool('verify_agent_token', {
      token: tampered,
    })) as VerifyResult;
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
  });

  it('emits an NDJSON verification receipt per verify call', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.CODE_GENERATOR,
      workflowId: 'wf-receipt-test',
    })) as IssuedToken;

    const verified = (await handleAgentIdentityTool('verify_agent_token', {
      token: issued.token,
    })) as VerifyResult;
    expect(verified.valid).toBe(true);
    expect(verified.receipt.path).toBe(receiptPath);

    let receipts = readReceipts(receiptPath);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].receipt).toBe('agent-token-verify.v1');
    expect(receipts[0].tool).toBe('verify_agent_token');
    expect(receipts[0].valid).toBe(true);
    expect(receipts[0].cached).toBe(false);
    expect(receipts[0].tokenFormat).toBe('ucan-capability');
    expect(receipts[0].tokenSha256).toBe(
      crypto.createHash('sha256').update(issued.token, 'utf8').digest('hex')
    );
    expect(receipts[0].workflowId).toBe('wf-receipt-test');
    expect(receipts[0].envelopeChecked).toBe(false);

    // The raw token must never be logged into the receipt line.
    const rawLine = fs.readFileSync(receiptPath, 'utf8');
    expect(rawLine).not.toContain(issued.token);

    // Every verify call appends — including inspection tools.
    await handleAgentIdentityTool('check_permission', {
      token: issued.token,
      permission: AgentPermission.WRITE_CODE,
    });
    receipts = readReceipts(receiptPath);
    expect(receipts).toHaveLength(2);
    expect(receipts[1].tool).toBe('check_permission');
  });

  it('returns PoP private signing material only when explicitly requested', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.SYNTAX_ANALYZER,
      returnPrivateKey: true,
    })) as IssuedToken;

    expect(issued.privateKeyReturned).toBe(true);
    expect(issued.key.privateKey).toContain('PRIVATE KEY');
    expect(issued.key.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('checks permissions and optional workflow-step constraints against capabilities', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.CODE_GENERATOR,
      workflowId: 'wf-permission-test',
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    })) as IssuedToken;

    const allowed = (await handleAgentIdentityTool('check_permission', {
      token: issued.token,
      permission: AgentPermission.WRITE_CODE,
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    })) as { valid: boolean; allowed: boolean };

    const denied = (await handleAgentIdentityTool('check_permission', {
      token: issued.token,
      permission: AgentPermission.WRITE_OUTPUT,
    })) as { valid: boolean; allowed: boolean };

    const legacyDenied = (await handleAgentIdentityTool('check_permission', {
      token: craftLegacyHs256Jwt(),
      permission: AgentPermission.WRITE_CODE,
    })) as { valid: boolean; allowed: boolean; errorCode?: string };

    expect(allowed.valid).toBe(true);
    expect(allowed.allowed).toBe(true);
    expect(denied.valid).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(legacyDenied.valid).toBe(false);
    expect(legacyDenied.allowed).toBe(false);
    expect(legacyDenied.errorCode).toBe('LEGACY_JWT_REJECTED');
  });

  it('surfaces the delegation chain from token intent facts', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.EXPORTER,
      workflowId: 'wf-delegation-test',
      workflowStep: WorkflowStep.SERIALIZE,
      initiatedBy: AgentRole.ORCHESTRATOR,
      delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.CODE_GENERATOR],
    })) as IssuedToken;

    const chain = (await handleAgentIdentityTool('get_delegation_chain', {
      token: issued.token,
    })) as {
      valid: boolean;
      workflowId: string;
      workflowStep: string;
      initiatedBy: string;
      executedBy: string;
      delegationChain: string[];
    };

    expect(chain.valid).toBe(true);
    expect(chain.workflowId).toBe('wf-delegation-test');
    expect(chain.workflowStep).toBe(WorkflowStep.SERIALIZE);
    expect(chain.initiatedBy).toBe(AgentRole.ORCHESTRATOR);
    expect(chain.executedBy).toBe(AgentRole.EXPORTER);
    expect(chain.delegationChain).toEqual([
      AgentRole.ORCHESTRATOR,
      AgentRole.CODE_GENERATOR,
      AgentRole.EXPORTER,
    ]);
  });
});
