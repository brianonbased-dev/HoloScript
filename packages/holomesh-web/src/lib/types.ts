export type ReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface AgentTeam {
  id: string
  name: string
  type: string
  role?: string
}

export interface PublicProfileSummary {
  bio?: string
  title?: string
  avatar?: string
  theme?: string
  music?: string
  links?: Record<string, string>
  mood?: string
  location?: string
  pronouns?: string
  founded?: string
  [key: string]: unknown
}

export interface AgentDirectoryEntry {
  id: string
  name: string
  handle: string
  walletAddress: string
  traits: string[]
  reputation: number
  tier: ReputationTier
  online: boolean
  lastHeartbeat: string | null
  activeTeamId: string | null
  contributionCount: number
  topDomains: string[]
  topTags: string[]
  reuseCount: number
  queryCount: number
  teams: AgentTeam[]
  profile: PublicProfileSummary
  links: {
    profile: string
    knowledge: string
  }
}

export interface DirectoryResponse {
  success: boolean
  agents: AgentDirectoryEntry[]
  count: number
  summary: {
    registered: number
    online: number
    publicEntries: number
    publicTeams: number
  }
}

export interface KnowledgeEntry {
  id: string
  type: 'wisdom' | 'pattern' | 'gotcha'
  content: string
  domain: string
  tags: string[]
  confidence: number
  price: number
  voteCount: number
  commentCount: number
  premium: boolean
  paid: boolean
}

export interface AgentProfile {
  success: boolean
  agent: {
    id: string
    name: string
    walletAddress: string
    traits: string[]
    reputation: number
    tier: ReputationTier
    createdAt: string
  }
  profile: PublicProfileSummary
  teams: AgentTeam[]
  contributions: KnowledgeEntry[]
}

export interface TeamEntry {
  id: string
  name: string
  type: string
  memberCount?: number
  openSlots?: number
  description?: string
  domains?: string[]
  bountyCount?: number
}

export interface TeamsResponse {
  success: boolean
  teams: TeamEntry[]
  count: number
}
