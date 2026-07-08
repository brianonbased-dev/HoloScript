import type { MemoryEntryInput, MemorySection, MemoryType } from './sovereign-memory-store.js';

export const AGENT_MEMORY_PROFILE_SCHEMA = 'holoscript.memory.agent-profile.v1';
export const HOLOSCRIPT_AGENT_RUNTIME_PACKAGE = '@holoscript/holoscript-agent';

export type AgentMemoryFamily =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'holoscript'
  | 'edge'
  | 'other';

export interface AgentMemoryProfileInput {
  agentId: string;
  family?: AgentMemoryFamily;
  runtimePackage?: string;
  workspaceId?: string;
  nodeProfile?: string;
  mcpUrl?: string;
  memoryScope?: string;
  tags?: string[];
  capabilities?: string[];
}

export interface AgentMemoryProfile {
  schema: typeof AGENT_MEMORY_PROFILE_SCHEMA;
  agentId: string;
  family: AgentMemoryFamily;
  runtimePackage: string | null;
  workspaceId: string;
  node: {
    profile: string;
    mcpUrl: string | null;
    jetsonReferenceProfile: boolean;
    rule: string;
  };
  memoryScope: string;
  tags: string[];
  capabilities: string[];
}

function cleanString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter((item): item is string => Boolean(item));
}

export function buildAgentMemoryProfile(input: AgentMemoryProfileInput): AgentMemoryProfile {
  const agentId = cleanString(input.agentId);
  if (!agentId) throw new Error('agentId is required');
  const nodeProfile = cleanString(input.nodeProfile) || 'operator-supplied';
  const family = input.family || 'other';
  const runtimePackage = input.runtimePackage ?? (
    family === 'holoscript' || family === 'edge' ? HOLOSCRIPT_AGENT_RUNTIME_PACKAGE : null
  );
  const jetsonReferenceProfile = /jetson/iu.test(nodeProfile);
  return {
    schema: AGENT_MEMORY_PROFILE_SCHEMA,
    agentId,
    family,
    runtimePackage,
    workspaceId: cleanString(input.workspaceId) || 'default',
    node: {
      profile: nodeProfile,
      mcpUrl: cleanString(input.mcpUrl),
      jetsonReferenceProfile,
      rule: 'Node and storage details are caller-supplied profile data; Jetson is a reference profile, not a package default.',
    },
    memoryScope: cleanString(input.memoryScope) || 'agent-profile',
    tags: [...new Set(['agent-profile', family, ...cleanList(input.tags)])],
    capabilities: cleanList(input.capabilities),
  };
}

export function memoryEntryFromAgentProfile(
  profile: AgentMemoryProfile,
  {
    section = 'D',
    type = 'pattern',
    confidence = 0.8,
  }: {
    section?: MemorySection;
    type?: MemoryType;
    confidence?: number;
  } = {},
): MemoryEntryInput {
  return {
    authorAgent: profile.agentId,
    section,
    type,
    domain: profile.memoryScope,
    tags: profile.tags,
    confidence,
    provenanceHash: `${profile.schema}:${profile.agentId}:${profile.workspaceId}`,
    content: JSON.stringify(profile),
  };
}
