/**
 * HoloScript MCP Agent Identity Tools
 *
 * Thin MCP wrapper around the compiler Agent Identity Framework. These tools
 * let autonomous agents issue, verify, and inspect workflow-bound identity
 * tokens without reimplementing the identity layer outside HoloScript.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  AgentPermission,
  AgentRole,
  WorkflowStep,
  generateAgentKeyPair,
  type AgentConfig,
  type IntentTokenPayload,
} from '../../core/src/compiler/identity/AgentIdentity';
import {
  AgentTokenIssuer,
  getTokenIssuer,
} from '../../core/src/compiler/identity/AgentTokenIssuer';

const TOOL_NAMES = [
  'issue_agent_token',
  'verify_agent_token',
  'check_permission',
  'get_delegation_chain',
] as const;

type AgentIdentityToolName = (typeof TOOL_NAMES)[number];

const agentRoles = Object.values(AgentRole);
const agentPermissions = Object.values(AgentPermission);
const workflowSteps = Object.values(WorkflowStep);

export const agentIdentityTools: Tool[] = [
  {
    name: 'issue_agent_token',
    description:
      'Issue a short-lived HoloScript compiler agent JWT with role permissions, workflow intent, and proof-of-possession public key binding.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        role: {
          type: 'string',
          enum: agentRoles,
          description: 'Compiler agent role receiving the token.',
        },
        name: {
          type: 'string',
          description: 'Stable agent instance name. Defaults to mcp-<role>.',
        },
        version: {
          type: 'string',
          description: 'Agent implementation version. Defaults to 1.0.0.',
        },
        workflowId: {
          type: 'string',
          description: 'Workflow/run identifier bound into the token intent.',
        },
        workflowStep: {
          type: 'string',
          enum: workflowSteps,
          description: 'Current compiler workflow step. Defaults to parse_tokens.',
        },
        initiatedBy: {
          type: 'string',
          enum: agentRoles,
          description: 'Agent role that initiated this delegation. Defaults to orchestrator.',
        },
        delegationChain: {
          type: 'array',
          items: { type: 'string', enum: agentRoles },
          description:
            'Prior delegation chain. The issued role is appended by the identity framework.',
        },
        scope: {
          type: 'string',
          description: 'Optional package/path scope restriction embedded in the token.',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tool/capability labels included in the agent checksum.',
        },
        configuration: {
          type: 'object',
          description: 'Optional JSON configuration included in the agent checksum.',
        },
        executionContext: {
          type: 'object',
          description: 'Optional workflow execution context embedded in the token intent.',
        },
        tokenExpiration: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
          description: 'Optional expiration accepted by jsonwebtoken, e.g. 15m, 24h, or seconds.',
        },
        returnPrivateKey: {
          type: 'boolean',
          description:
            'Return the generated Ed25519 private key for PoP signing. Defaults false; only request when the caller will sign HTTP requests immediately.',
        },
      },
      required: ['role'],
    },
  },
  {
    name: 'verify_agent_token',
    description:
      'Verify a HoloScript compiler agent token and return structured identity, permissions, and workflow claims.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'JWT token returned by issue_agent_token or another AgentTokenIssuer.',
        },
        includePayload: {
          type: 'boolean',
          description: 'Include decoded non-secret claims in the response. Defaults true.',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'check_permission',
    description:
      'Check whether a HoloScript compiler agent token carries a permission, optionally constrained to a workflow step.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Agent JWT to check.',
        },
        permission: {
          type: 'string',
          enum: agentPermissions,
          description: 'Required compiler permission.',
        },
        workflowStep: {
          type: 'string',
          enum: workflowSteps,
          description: 'Optional expected workflow step.',
        },
      },
      required: ['token', 'permission'],
    },
  },
  {
    name: 'get_delegation_chain',
    description:
      'Read the workflow delegation chain and intent metadata from a HoloScript compiler agent token.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: 'Agent JWT to inspect.',
        },
      },
      required: ['token'],
    },
  },
];

export function isAgentIdentityToolName(name: string): name is AgentIdentityToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export async function handleAgentIdentityTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!isAgentIdentityToolName(name)) {
    throw new Error(`Unknown agent identity tool: ${name}`);
  }

  switch (name) {
    case 'issue_agent_token':
      return issueAgentToken(args);
    case 'verify_agent_token':
      return verifyAgentToken(args);
    case 'check_permission':
      return checkPermission(args);
    case 'get_delegation_chain':
      return getDelegationChain(args);
  }
}

async function issueAgentToken(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const role = parseAgentRole(args.role, 'role');
  const name = optionalString(args.name) ?? `mcp-${role}`;
  const version = optionalString(args.version) ?? '1.0.0';
  const workflowId = optionalString(args.workflowId) ?? `mcp-${Date.now()}`;
  const workflowStep =
    parseWorkflowStep(args.workflowStep, 'workflowStep', WorkflowStep.PARSE_TOKENS) ??
    WorkflowStep.PARSE_TOKENS;
  const initiatedBy = parseAgentRole(args.initiatedBy, 'initiatedBy', AgentRole.ORCHESTRATOR);
  const delegationChain = parseRoleArray(args.delegationChain, 'delegationChain');
  const executionContext = optionalRecord(args.executionContext) ?? {};
  const configuration = optionalRecord(args.configuration);
  const tools = parseStringArray(args.tools, 'tools');
  const returnPrivateKey = args.returnPrivateKey === true;
  const tokenExpiration = parseTokenExpiration(args.tokenExpiration);

  const agentConfig: AgentConfig = {
    role,
    name,
    version,
    scope: optionalString(args.scope),
    tools,
    configuration,
  };

  const keyPair = await generateAgentKeyPair(role);
  const issuer = tokenExpiration
    ? new AgentTokenIssuer({ tokenExpiration })
    : getTokenIssuer();
  const token = await issuer.issueToken({
    agentConfig,
    workflowStep,
    workflowId,
    initiatedBy,
    delegationChain,
    executionContext,
    keyPair,
  });
  const verification = issuer.verifyToken(token);
  const payload = verification.payload;

  return {
    ok: true,
    token,
    tokenType: 'Bearer',
    agentRole: role,
    permissions: payload?.permissions ?? [],
    workflow: payload ? summarizeIntent(payload) : { workflowId, workflowStep },
    key: {
      kid: keyPair.kid,
      thumbprint: keyPair.thumbprint,
      publicKey: keyPair.publicKey,
      ...(returnPrivateKey ? { privateKey: keyPair.privateKey } : {}),
    },
    privateKeyReturned: returnPrivateKey,
    note: returnPrivateKey
      ? 'Private key returned because returnPrivateKey=true. Treat it as secret PoP signing material.'
      : 'Private key withheld. Call with returnPrivateKey=true only when the agent must sign PoP HTTP requests.',
    expiresAt: payload ? new Date(payload.exp * 1000).toISOString() : undefined,
  };
}

function verifyAgentToken(args: Record<string, unknown>): Record<string, unknown> {
  const token = requiredString(args.token, 'token');
  const includePayload = args.includePayload !== false;
  const result = getTokenIssuer().verifyToken(token);

  return {
    ok: true,
    valid: result.valid,
    error: result.error,
    errorCode: result.errorCode,
    payload: includePayload && result.payload ? summarizePayload(result.payload) : undefined,
  };
}

function checkPermission(args: Record<string, unknown>): Record<string, unknown> {
  const token = requiredString(args.token, 'token');
  const permission = parseAgentPermission(args.permission, 'permission');
  const workflowStep = parseWorkflowStep(args.workflowStep, 'workflowStep');
  const issuer = getTokenIssuer();
  const verification = issuer.verifyToken(token);

  if (!verification.valid || !verification.payload) {
    return {
      ok: true,
      valid: false,
      allowed: false,
      error: verification.error,
      errorCode: verification.errorCode,
    };
  }

  const allowed = workflowStep
    ? issuer.canPerformOperation(token, permission, workflowStep)
    : issuer.hasPermission(token, permission);

  return {
    ok: true,
    valid: true,
    allowed,
    permission,
    workflowStep,
    agentRole: verification.payload.agent_role,
    grantedPermissions: verification.payload.permissions,
    reason: allowed
      ? 'Token carries the requested permission and workflow constraint.'
      : 'Token is valid but does not satisfy the requested permission or workflow constraint.',
  };
}

function getDelegationChain(args: Record<string, unknown>): Record<string, unknown> {
  const token = requiredString(args.token, 'token');
  const verification = getTokenIssuer().verifyToken(token);

  if (!verification.valid || !verification.payload) {
    return {
      ok: true,
      valid: false,
      error: verification.error,
      errorCode: verification.errorCode,
      delegationChain: [],
    };
  }

  const intent = verification.payload.intent;
  return {
    ok: true,
    valid: true,
    subject: verification.payload.sub,
    agentRole: verification.payload.agent_role,
    workflowId: intent.workflow_id,
    workflowStep: intent.workflow_step,
    initiatedBy: intent.initiated_by,
    executedBy: intent.executed_by,
    delegationChain: intent.delegation_chain,
    executionContext: intent.execution_context ?? {},
  };
}

function summarizePayload(payload: IntentTokenPayload): Record<string, unknown> {
  return {
    issuer: payload.iss,
    subject: payload.sub,
    audience: payload.aud,
    jwtId: payload.jti,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    agentRole: payload.agent_role,
    checksum: payload.agent_checksum,
    permissions: payload.permissions,
    scope: payload.scope,
    intent: summarizeIntent(payload),
    confirmation: payload.cnf,
    publicKey: payload.publicKey,
  };
}

function summarizeIntent(payload: IntentTokenPayload): Record<string, unknown> {
  return {
    workflowId: payload.intent.workflow_id,
    workflowStep: payload.intent.workflow_step,
    executedBy: payload.intent.executed_by,
    initiatedBy: payload.intent.initiated_by,
    delegationChain: payload.intent.delegation_chain,
    executionContext: payload.intent.execution_context ?? {},
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

function parseStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value;
}

function parseRoleArray(value: unknown, field: string): AgentRole[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of agent roles.`);
  }
  return value.map((item, index) => parseAgentRole(item, `${field}[${index}]`));
}

function parseAgentRole(value: unknown, field: string, fallback?: AgentRole): AgentRole {
  if (value === undefined || value === null || value === '') {
    if (fallback) return fallback;
    throw new Error(`${field} is required.`);
  }
  if (typeof value === 'string' && agentRoles.includes(value as AgentRole)) {
    return value as AgentRole;
  }
  throw new Error(`${field} must be one of: ${agentRoles.join(', ')}.`);
}

function parseAgentPermission(value: unknown, field: string): AgentPermission {
  if (typeof value === 'string' && agentPermissions.includes(value as AgentPermission)) {
    return value as AgentPermission;
  }
  throw new Error(`${field} must be one of: ${agentPermissions.join(', ')}.`);
}

function parseWorkflowStep(
  value: unknown,
  field: string,
  fallback?: WorkflowStep
): WorkflowStep | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && workflowSteps.includes(value as WorkflowStep)) {
    return value as WorkflowStep;
  }
  throw new Error(`${field} must be one of: ${workflowSteps.join(', ')}.`);
}

function parseTokenExpiration(value: unknown): string | number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  throw new Error('tokenExpiration must be a string or finite number.');
}
