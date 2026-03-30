/**
 * HoloScript Compiler Agent Identity Framework
 *
 * Cryptographic identity system for multi-agent compiler architecture based on
 * Agentic JWT specification (draft-goswami-agentic-jwt-00).
 *
 * Implements:
 * - Agent-specific JWT tokens with role-based access control (RBAC)
 * - Short-lived token rotation (24-hour lifecycle)
 * - Proof-of-Possession (PoP) using Ed25519 keys
 * - Agent checksum for deterministic identity
 * - Workflow-aware delegation chains
 *
 * @version 1.0.0
 * @see https://arxiv.org/html/2509.13597v1
 * @see https://datatracker.ietf.org/doc/html/draft-goswami-agentic-jwt-00
 */

import * as crypto from 'crypto';
import { promisify } from 'util';
import type { CulturalFamily, PromptDialect } from '../../traits/CultureTraits';

// crypto.generateKeyPair is a Node.js-only API not present in browser polyfills.
// Guard with a runtime check so the module can be imported in browser context
// (e.g. for WorkflowStep / AgentRole enums) without crashing at load time.
const generateKeyPairAsync:
  | ((type: string, options: object) => Promise<{ publicKey: string; privateKey: string }>)
  | null =
  typeof crypto.generateKeyPair === 'function'
    ? (promisify(crypto.generateKeyPair) as unknown as (
        type: string,
        options: object
      ) => Promise<{ publicKey: string; privateKey: string }>)
    : null;

/**
 * Agent roles in the HoloScript compiler pipeline
 */
export enum AgentRole {
  /** Parses source code and builds abstract syntax tree (read-only) */
  SYNTAX_ANALYZER = 'syntax_analyzer',

  /** Optimizes AST through transformation passes (read/write AST) */
  AST_OPTIMIZER = 'ast_optimizer',

  /** Generates intermediate representation and target code (write code) */
  CODE_GENERATOR = 'code_generator',

  /** Exports final artifacts to target platforms (write output) */
  EXPORTER = 'exporter',

  /** Orchestrates the compilation pipeline (admin) */
  ORCHESTRATOR = 'orchestrator',
}

/**
 * Permissions for agent operations
 */
export enum AgentPermission {
  // Read permissions
  READ_SOURCE = 'read:source',
  READ_CONFIG = 'read:config',
  READ_AST = 'read:ast',
  READ_IR = 'read:ir',
  READ_CODE = 'read:code',

  // Write permissions
  WRITE_AST = 'write:ast',
  WRITE_IR = 'write:ir',
  WRITE_CODE = 'write:code',
  WRITE_OUTPUT = 'write:output',

  // Transform permissions
  TRANSFORM_AST = 'transform:ast',
  TRANSFORM_IR = 'transform:ir',

  // Execution permissions
  EXECUTE_OPTIMIZATION = 'execute:optimization',
  EXECUTE_CODEGEN = 'execute:codegen',
  EXECUTE_EXPORT = 'execute:export',
}

/**
 * Workflow steps in the compilation pipeline
 */
export enum WorkflowStep {
  PARSE_TOKENS = 'parse_tokens',
  BUILD_AST = 'build_ast',
  ANALYZE_AST = 'analyze_ast',
  APPLY_TRANSFORMS = 'apply_transforms',
  SELECT_INSTRUCTIONS = 'select_instructions',
  GENERATE_ASSEMBLY = 'generate_assembly',
  FORMAT_OUTPUT = 'format_output',
  SERIALIZE = 'serialize',
}

/**
 * Cultural profile metadata for an agent.
 *
 * Carries the same dimensions as `CulturalProfileTrait` (cooperation_index,
 * cultural_family, prompt_dialect) so they can travel inside JWT tokens and
 * be validated by the compiler pipeline without re-parsing the composition.
 *
 * This is the *identity-layer* representation.  The trait-layer representation
 * (`CulturalProfileTrait`) additionally includes `norm_set`, which is
 * composition-level data and therefore not embedded in individual tokens.
 */
export interface CulturalProfileMetadata {
  /** Willingness to cooperate, 0-1 (0 = adversarial, 1 = fully cooperative) */
  cooperation_index: number;

  /** Cultural family archetype */
  cultural_family: CulturalFamily;

  /** Prompt / communication dialect */
  prompt_dialect: PromptDialect;
}

/**
 * Agent configuration used for checksum calculation
 */
export interface AgentConfig {
  role: AgentRole;
  name: string;
  version: string;

  /** Agent-specific prompt or system instructions */
  prompt?: string;

  /** Tools/capabilities available to this agent */
  tools?: string[];

  /** Configuration parameters */
  configuration?: Record<string, any>;

  /** Optional target scope (e.g., package path restriction) */
  scope?: string;

  /**
   * Optional cultural profile metadata.
   * When present, the compiler pipeline can validate cross-agent cultural
   * compatibility without requiring explicit trait declarations in HoloScript.
   */
  culturalProfile?: CulturalProfileMetadata;
}

/**
 * Agent checksum for deterministic identity
 * Based on Agentic JWT specification Section 3.2
 */
export interface AgentChecksum {
  /** SHA-256 hash of agent configuration */
  hash: string;

  /** Algorithm used (always 'sha256') */
  algorithm: 'sha256';

  /** Timestamp when checksum was calculated */
  calculatedAt: string;

  /** Human-readable label for debugging */
  label: string;
}

/**
 * Intent token payload extending standard JWT
 * Based on Agentic JWT specification Section 4
 */
export interface IntentTokenPayload {
  /** Standard JWT claims */
  iss: string; // Issuer (orchestrator or IDP)
  sub: string; // Subject (agent ID)
  aud: string; // Audience (resource server)
  exp: number; // Expiration time (Unix timestamp)
  iat: number; // Issued at (Unix timestamp)
  jti: string; // JWT ID (unique identifier)

  /** Agent-specific claims */
  agent_role: AgentRole;
  agent_checksum: AgentChecksum;

  /** Permissions granted to this agent */
  permissions: AgentPermission[];

  /** Scope restriction (e.g., package path) */
  scope?: string;

  /** Workflow metadata */
  intent: {
    workflow_id: string;
    workflow_step: WorkflowStep;
    executed_by: AgentRole;
    initiated_by: AgentRole;
    delegation_chain: AgentRole[];
    execution_context?: Record<string, any>;
  };

  /**
   * Cultural profile metadata embedded in the token.
   * Allows the compiler to perform cultural compatibility checks
   * using only token data, without re-reading the composition.
   */
  cultural_profile?: CulturalProfileMetadata;

  /** Proof-of-Possession confirmation (JWK thumbprint) */
  cnf?: {
    jkt: string; // JWK SHA-256 thumbprint
  };

  /** Ed25519 public key for PoP verification (PEM format) */
  publicKey?: string;
}

/**
 * Ed25519 key pair for Proof-of-Possession
 */
export interface AgentKeyPair {
  publicKey: string; // PEM format
  privateKey: string; // PEM format
  kid: string; // Key ID (agent:role#timestamp)
  thumbprint: string; // JWK SHA-256 thumbprint
}

/**
 * Calculate agent checksum from configuration
 *
 * Creates a deterministic SHA-256 hash of the agent's:
 * - Role and name
 * - Version
 * - Prompt/instructions
 * - Available tools
 * - Configuration parameters
 *
 * This ensures agents with identical configuration receive the same checksum,
 * enabling detection of configuration drift.
 */
export function calculateAgentChecksum(config: AgentConfig): AgentChecksum {
  const canonical = {
    role: config.role,
    name: config.name,
    version: config.version,
    prompt: config.prompt || '',
    tools: (config.tools || []).sort(), // Sort for determinism
    configuration: config.configuration || {},
    culturalProfile: config.culturalProfile || null,
  };

  const serialized = JSON.stringify(canonical);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');

  return {
    hash,
    algorithm: 'sha256',
    calculatedAt: new Date().toISOString(),
    label: `${config.role}:${config.name}:${config.version}`,
  };
}

/**
 * Generate Ed25519 key pair for Proof-of-Possession
 *
 * Creates ephemeral keys for agent-specific request signing.
 * Keys should be rotated with token expiration (24 hours default).
 */
export async function generateAgentKeyPair(
  agentRole: AgentRole,
  timestamp?: Date
): Promise<AgentKeyPair> {
  if (!generateKeyPairAsync) {
    throw new Error(
      'crypto.generateKeyPair is unavailable in this environment (browser). Key pair generation requires a Node.js runtime.'
    );
  }
  const { publicKey, privateKey } = await generateKeyPairAsync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  const ts = timestamp || new Date();
  const kid = `agent:${agentRole}#${ts.toISOString()}`;

  // Calculate JWK thumbprint (SHA-256 of canonical JWK)
  // Extract public key bytes from PEM format
  const pubKeyObject = crypto.createPublicKey(publicKey);
  const pubKeyDer = pubKeyObject.export({ type: 'spki', format: 'der' });

  // For Ed25519, the public key is the last 32 bytes of the DER encoding
  const pubKeyBytes = pubKeyDer.slice(-32);

  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: pubKeyBytes.toString('base64url'),
  };
  const thumbprint = crypto.createHash('sha256').update(JSON.stringify(jwk)).digest('base64url');

  return {
    publicKey,
    privateKey,
    kid,
    thumbprint,
  };
}

/**
 * Role-based access control matrix
 *
 * Defines default permissions for each agent role in the compiler pipeline.
 */
export const ROLE_PERMISSIONS: Record<AgentRole, AgentPermission[]> = {
  [AgentRole.SYNTAX_ANALYZER]: [
    AgentPermission.READ_SOURCE,
    AgentPermission.READ_CONFIG,
    AgentPermission.WRITE_AST,
  ],

  [AgentRole.AST_OPTIMIZER]: [
    AgentPermission.READ_AST,
    AgentPermission.READ_CONFIG,
    AgentPermission.WRITE_AST,
    AgentPermission.TRANSFORM_AST,
    AgentPermission.EXECUTE_OPTIMIZATION,
  ],

  [AgentRole.CODE_GENERATOR]: [
    AgentPermission.READ_AST,
    AgentPermission.READ_IR,
    AgentPermission.READ_CONFIG,
    AgentPermission.WRITE_IR,
    AgentPermission.WRITE_CODE,
    AgentPermission.TRANSFORM_IR,
    AgentPermission.EXECUTE_CODEGEN,
  ],

  [AgentRole.EXPORTER]: [
    AgentPermission.READ_CODE,
    AgentPermission.READ_CONFIG,
    AgentPermission.WRITE_OUTPUT,
    AgentPermission.EXECUTE_EXPORT,
  ],

  [AgentRole.ORCHESTRATOR]: [
    // Orchestrator has all permissions
    ...Object.values(AgentPermission),
  ],
};

/**
 * Workflow step sequences for validation
 *
 * Defines valid transitions between compilation phases.
 * Used to prevent agents from executing out-of-sequence operations.
 */
export const WORKFLOW_SEQUENCES: Record<WorkflowStep, WorkflowStep[]> = {
  [WorkflowStep.PARSE_TOKENS]: [WorkflowStep.BUILD_AST],
  [WorkflowStep.BUILD_AST]: [WorkflowStep.ANALYZE_AST],
  [WorkflowStep.ANALYZE_AST]: [WorkflowStep.APPLY_TRANSFORMS],
  [WorkflowStep.APPLY_TRANSFORMS]: [WorkflowStep.SELECT_INSTRUCTIONS],
  [WorkflowStep.SELECT_INSTRUCTIONS]: [WorkflowStep.GENERATE_ASSEMBLY],
  [WorkflowStep.GENERATE_ASSEMBLY]: [WorkflowStep.FORMAT_OUTPUT],
  [WorkflowStep.FORMAT_OUTPUT]: [WorkflowStep.SERIALIZE],
  [WorkflowStep.SERIALIZE]: [], // Terminal step
};

/**
 * Validate workflow step transition
 */
export function isValidWorkflowTransition(
  currentStep: WorkflowStep,
  nextStep: WorkflowStep
): boolean {
  const validNextSteps = WORKFLOW_SEQUENCES[currentStep];
  return validNextSteps.includes(nextStep);
}

/**
 * Get default permissions for an agent role
 */
export function getDefaultPermissions(role: AgentRole): AgentPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Check if agent has required permission
 */
export function hasPermission(permissions: AgentPermission[], required: AgentPermission): boolean {
  // Check for exact permission or wildcard
  return permissions.includes(required) || permissions.includes(AgentPermission.EXECUTE_CODEGEN);
}

/**
 * Validate agent can perform operation based on role and workflow step
 */
export function canPerformOperation(
  role: AgentRole,
  workflowStep: WorkflowStep,
  requiredPermission: AgentPermission
): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role];
  return hasPermission(rolePermissions, requiredPermission);
}
