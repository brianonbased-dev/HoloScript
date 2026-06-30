import { afterEach, describe, expect, it } from 'vitest';
import {
  AgentPermission,
  AgentRole,
  WorkflowStep,
} from '../../../core/src/compiler/identity/AgentIdentity';
import {
  resetKeystore,
} from '../../../core/src/compiler/identity/AgentKeystore';
import {
  resetTokenIssuer,
} from '../../../core/src/compiler/identity/AgentTokenIssuer';
import {
  agentIdentityTools,
  handleAgentIdentityTool,
  isAgentIdentityToolName,
} from '../agent-identity-tools';

describe('agent identity MCP tools', () => {
  afterEach(() => {
    resetTokenIssuer();
    resetKeystore();
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

  it('issues and verifies a workflow-bound token without returning the private key by default', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.CODE_GENERATOR,
      name: 'codex-codegen',
      version: '1.2.3',
      workflowId: 'wf-agent-identity-test',
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
      initiatedBy: AgentRole.ORCHESTRATOR,
      executionContext: { taskId: 'task_1782806017302_qxq0' },
    })) as {
      token: string;
      key: { publicKey: string; privateKey?: string; thumbprint: string };
      workflow: { workflowId: string; workflowStep: string; delegationChain: string[] };
      privateKeyReturned: boolean;
    };

    expect(issued.token).toMatch(/^ey/);
    expect(issued.privateKeyReturned).toBe(false);
    expect(issued.key.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(issued.key.privateKey).toBeUndefined();
    expect(issued.workflow.workflowId).toBe('wf-agent-identity-test');
    expect(issued.workflow.workflowStep).toBe(WorkflowStep.GENERATE_ASSEMBLY);
    expect(issued.workflow.delegationChain).toContain(AgentRole.CODE_GENERATOR);

    const verified = (await handleAgentIdentityTool('verify_agent_token', {
      token: issued.token,
    })) as {
      valid: boolean;
      payload: {
        agentRole: string;
        permissions: string[];
        intent: { workflowId: string; workflowStep: string };
      };
    };

    expect(verified.valid).toBe(true);
    expect(verified.payload.agentRole).toBe(AgentRole.CODE_GENERATOR);
    expect(verified.payload.permissions).toContain(AgentPermission.WRITE_CODE);
    expect(verified.payload.intent.workflowId).toBe('wf-agent-identity-test');
    expect(verified.payload.intent.workflowStep).toBe(WorkflowStep.GENERATE_ASSEMBLY);
  });

  it('returns PoP private signing material only when explicitly requested', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.SYNTAX_ANALYZER,
      returnPrivateKey: true,
    })) as {
      privateKeyReturned: boolean;
      key: { privateKey?: string; publicKey: string };
    };

    expect(issued.privateKeyReturned).toBe(true);
    expect(issued.key.privateKey).toContain('PRIVATE KEY');
    expect(issued.key.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('checks permissions and optional workflow-step constraints', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.CODE_GENERATOR,
      workflowId: 'wf-permission-test',
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    })) as { token: string };

    const allowed = (await handleAgentIdentityTool('check_permission', {
      token: issued.token,
      permission: AgentPermission.WRITE_CODE,
      workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    })) as { valid: boolean; allowed: boolean };

    const denied = (await handleAgentIdentityTool('check_permission', {
      token: issued.token,
      permission: AgentPermission.WRITE_OUTPUT,
    })) as { valid: boolean; allowed: boolean };

    expect(allowed.valid).toBe(true);
    expect(allowed.allowed).toBe(true);
    expect(denied.valid).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  it('surfaces the delegation chain from token intent claims', async () => {
    const issued = (await handleAgentIdentityTool('issue_agent_token', {
      role: AgentRole.EXPORTER,
      workflowId: 'wf-delegation-test',
      workflowStep: WorkflowStep.SERIALIZE,
      initiatedBy: AgentRole.ORCHESTRATOR,
      delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.CODE_GENERATOR],
    })) as { token: string };

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
