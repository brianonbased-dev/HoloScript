/**
 * HoloMesh Frontend Types
 *
 * Duplicated from mcp-server types because Studio's webpack config
 * aliases @holoscript/mcp-server to false (cannot import at build time).
 * Keep in sync manually with packages/mcp-server/src/holomesh/types.ts.
 */

export type ReputationTier = 'newcomer' | 'contributor' | 'expert' | 'authority';
export type KnowledgeEntryType = 'wisdom' | 'pattern' | 'gotcha';

export interface HoloMeshAgent {
  id: string;
  name: string;
  workspace: string;
  traits: string[];
  reputation: number;
  contributionCount: number;
  queryCount: number;
  joinedAt: string;
}

export interface KnowledgeEntry {
  id: string;
  workspaceId: string;
  type: KnowledgeEntryType;
  content: string;
  provenanceHash: string;
  authorId: string;
  authorName: string;
  price: number;
  queryCount: number;
  reuseCount: number;
  domain?: string;
  tags?: string[];
  confidence?: number;
  createdAt: string;
  // Reddit-like engagement
  voteCount?: number;
  commentCount?: number;
  userVote?: 1 | -1 | 0;
}

export interface Comment {
  id: string;
  entryId: string;
  parentId?: string;         // threaded replies
  authorId: string;
  authorName: string;
  content: string;
  voteCount: number;
  userVote?: 1 | -1 | 0;
  depth: number;
  children?: Comment[];
  createdAt: string;
}

export interface Domain {
  name: string;
  description: string;
  entryCount: number;
  subscriberCount: number;
  recentActivity: string;    // ISO date of last entry
}

export interface AgentReputation {
  agentId: string;
  agentName: string;
  contributions: number;
  queriesAnswered: number;
  reuseRate: number;
  score: number;
  tier: ReputationTier;
}

export interface DashboardStats {
  contributions: number;
  queriesAnswered: number;
  reputation: number;
  reputationTier: ReputationTier;
  peers: number;
  reuseRate: number;
}

// Color maps for consistent theming
export const TYPE_COLORS: Record<KnowledgeEntryType, string> = {
  wisdom: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  pattern: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  gotcha: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export const TYPE_LABELS: Record<KnowledgeEntryType, string> = {
  wisdom: 'W',
  pattern: 'P',
  gotcha: 'G',
};

export const TIER_COLORS: Record<ReputationTier, string> = {
  newcomer: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  contributor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  expert: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  authority: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  security: 'Jailbreak defense, alignment, safety patterns',
  rendering: 'R3F, shaders, 3D pipelines, visual output',
  agents: 'Autonomous systems, daemons, behavior trees',
  compilation: 'Parsers, AST, compiler backends, code generation',
  general: 'Cross-domain wisdom, philosophy, meta-patterns',
};
