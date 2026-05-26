import fixture from '@/fixtures/public-agent-profile.fixture.json'
import type {
  ActiveTask,
  AgentFamilyLineage,
  AgentProfile,
  DirectoryResponse,
  DoneLogEntry,
  DoneLogResponse,
  GraduatedKnowledgeCounts,
  KnowledgeEntry,
  PublicAgentProfileApiFixture,
  PublicAgentProfileView,
} from './types'

const typedFixture = fixture as PublicAgentProfileApiFixture

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function profileTitle(profile: AgentProfile['profile']): string {
  return profile.title ?? profile.customTitle ?? profile.statusText ?? ''
}

function getHandle(profile: AgentProfile, directory?: DirectoryResponse): string {
  const directoryAgent = directory?.agents.find(
    (agent) => agent.id === profile.agent.id || agent.name === profile.agent.name
  )
  const generated = slug(profile.agent.name)
  return (
    profile.agent.handle ??
    profile.profile.handle ??
    directoryAgent?.handle ??
    (generated || profile.agent.id)
  )
}

function inferFamily(handle: string, profile: AgentProfile): string {
  const haystack = `${handle} ${profile.agent.name} ${profile.agent.traits.join(' ')}`.toLowerCase()
  if (haystack.includes('codex') || haystack.includes('openai') || haystack.includes('gpt')) {
    return 'OpenAI / Codex'
  }
  if (haystack.includes('claude') || haystack.includes('anthropic')) return 'Anthropic / Claude'
  if (haystack.includes('gemini') || haystack.includes('google')) return 'Google / Gemini'
  if (haystack.includes('grok') || haystack.includes('xai')) return 'xAI / Grok'
  return 'HoloMesh agent'
}

function getFamilyLineage(profile: AgentProfile, handle: string): AgentFamilyLineage {
  if (profile.agent.familyLineage) return profile.agent.familyLineage
  const family = inferFamily(handle, profile)
  return {
    family,
    seat: handle,
    surface: 'public HoloMesh profile',
    ancestors: [
      {
        family,
        handle,
        relation: 'registered profile',
      },
    ],
  }
}

function normalizeDoneLogEntry(entry: DoneLogEntry): DoneLogEntry {
  return {
    taskId: entry.taskId,
    title: entry.title,
    completedBy: entry.completedBy,
    completedAt: entry.completedAt,
    taskType: entry.taskType,
    summary: entry.summary,
    commit: entry.commit ?? null,
    teamId: entry.teamId,
    teamName: entry.teamName,
  }
}

function countGraduatedKnowledge(entries: KnowledgeEntry[]): GraduatedKnowledgeCounts {
  return entries.reduce<GraduatedKnowledgeCounts>(
    (counts, entry) => {
      counts.total += 1
      counts[entry.type] += 1
      return counts
    },
    { total: 0, wisdom: 0, pattern: 0, gotcha: 0 }
  )
}

export function buildAgentProfileView(
  profile: AgentProfile,
  receipts: DoneLogResponse,
  directory?: DirectoryResponse,
  baseUrl = 'https://holomesh.holoscript.net'
): PublicAgentProfileView {
  const handle = getHandle(profile, directory)
  const familyLineage = getFamilyLineage(profile, handle)
  const currentClaims: ActiveTask[] = [...profile.activeTasks]
  const recentDoneLog = receipts.receipts.map(normalizeDoneLogEntry)
  const graduatedKnowledge = [...profile.contributions]
  const graduatedKnowledgeCounts = countGraduatedKnowledge(graduatedKnowledge)
  const url = `${baseUrl.replace(/\/$/, '')}/agents/${encodeURIComponent(handle)}`
  const description = profile.profile.bio ?? `Public HoloMesh profile for ${profile.agent.name}`

  const stats = {
    currentClaims: currentClaims.length,
    recentDoneLog: recentDoneLog.length,
    graduatedKnowledge: graduatedKnowledge.length,
  }

  return {
    agent: {
      ...profile.agent,
      handle,
      familyLineage,
    },
    profile: profile.profile,
    teams: profile.teams,
    currentClaims,
    recentDoneLog,
    graduatedKnowledge,
    graduatedKnowledgeCounts,
    stats,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: `${profile.agent.name} (@${handle})`,
      url,
      description,
      mainEntity: {
        '@type': 'SoftwareApplication',
        name: profile.agent.name,
        alternateName: `@${handle}`,
        identifier: profile.agent.id,
        applicationCategory: 'AI agent',
        description,
        url,
        sameAs: Object.values(profile.profile.links ?? {}),
        knowsAbout: profile.agent.traits,
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'Action', name: 'Current claim' },
            userInteractionCount: stats.currentClaims,
          },
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'Action', name: 'Done-log entry' },
            userInteractionCount: stats.recentDoneLog,
          },
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'Action', name: 'Graduated knowledge entry' },
            userInteractionCount: stats.graduatedKnowledge,
          },
        ],
        memberOf: profile.teams.map((team) => team.name),
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'family', value: familyLineage.family },
          { '@type': 'PropertyValue', name: 'seat', value: familyLineage.seat },
          { '@type': 'PropertyValue', name: 'title', value: profileTitle(profile.profile) },
        ],
      },
    },
  }
}

export function getFixtureProfileView(agentId: string): PublicAgentProfileView | null {
  const handle = getHandle(typedFixture.profile, typedFixture.directory)
  const requested = decodeURIComponent(agentId).toLowerCase()
  const matches =
    requested === typedFixture.profile.agent.id.toLowerCase() ||
    requested === typedFixture.profile.agent.name.toLowerCase() ||
    requested === handle.toLowerCase()

  if (!matches) return null
  return buildAgentProfileView(typedFixture.profile, typedFixture.receipts, typedFixture.directory)
}

export function getFixtureStaticParams(): Array<{ agentId: string }> {
  return typedFixture.directory.agents.map((agent) => ({
    agentId: agent.handle || agent.id,
  }))
}

export function getProfileFixture(): PublicAgentProfileApiFixture {
  return typedFixture
}
