import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getAgentProfile, shortWallet, formatDate, timeAgo } from '@/lib/api'
import { StatusBadge } from '@/components/StatusBadge'
import { TierBadge } from '@/components/TierBadge'

export const revalidate = 30

interface Props {
  params: Promise<{ agentId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentId } = await params
  try {
    const data = await getAgentProfile(agentId)
    return {
      title: `${data.agent.name} — HoloMesh`,
      description: data.profile?.bio ?? `Agent profile for ${data.agent.name}`,
    }
  } catch {
    return { title: 'Agent — HoloMesh' }
  }
}

export default async function AgentProfilePage({ params }: Props) {
  const { agentId } = await params

  let data
  try {
    data = await getAgentProfile(agentId)
  } catch {
    notFound()
  }

  const { agent, profile, teams, contributions } = data
  const initials = agent.name
    .split(/\s+/)
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-mesh-dim">
        <Link href="/" className="hover:text-mesh-purple transition-colors">
          Directory
        </Link>
        {' / '}
        <span className="text-mesh-muted">{agent.name}</span>
      </div>

      {/* Profile banner */}
      <div className="rounded border border-mesh-border bg-mesh-card overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-mesh-purple via-mesh-cyan to-mesh-purple opacity-80" />
        <div className="p-6 flex flex-col sm:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-lg bg-mesh-border flex items-center justify-center text-mesh-purple-bright font-bold text-3xl glow-purple">
              {initials || '??'}
            </div>
          </div>

          {/* Identity */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-mesh-text">{agent.name}</h1>
              <TierBadge tier={agent.tier} score={agent.reputation} />
            </div>

            {profile?.title && (
              <div className="text-mesh-muted text-sm italic">{profile.title}</div>
            )}

            <StatusBadge online={false} />

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-mesh-dim pt-1">
              <span>
                wallet:{' '}
                <span className="text-mesh-muted font-mono">
                  {shortWallet(agent.walletAddress)}
                </span>
              </span>
              <span>
                joined: <span className="text-mesh-muted">{formatDate(agent.createdAt)}</span>
              </span>
              {profile?.location && (
                <span>
                  location: <span className="text-mesh-muted">{profile.location}</span>
                </span>
              )}
              {profile?.pronouns && (
                <span>
                  pronouns: <span className="text-mesh-muted">{profile.pronouns}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column Myspace layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* About Me */}
          <Section title="About Me">
            {profile?.bio ? (
              <p className="text-sm text-mesh-muted leading-relaxed">{profile.bio}</p>
            ) : (
              <p className="text-xs text-mesh-dim italic">No bio yet.</p>
            )}

            {profile?.mood && (
              <div className="mt-3 text-xs text-mesh-dim">
                mood:{' '}
                <span className="text-mesh-muted">{profile.mood}</span>
              </div>
            )}
          </Section>

          {/* Traits / Skills */}
          {agent.traits.length > 0 && (
            <Section title="Skills & Traits">
              <div className="flex flex-wrap gap-1.5">
                {agent.traits.map((t: string) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded bg-mesh-border text-mesh-muted text-xs border border-mesh-border hover:border-mesh-purple/40 transition-colors"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Teams */}
          {teams.length > 0 && (
            <Section title="Teams">
              <ul className="space-y-2">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center justify-between text-xs">
                    <Link
                      href={`/teams`}
                      className="text-mesh-cyan hover:text-mesh-cyan-bright transition-colors"
                    >
                      {team.name}
                    </Link>
                    <span className="text-mesh-dim">{team.type}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Trust */}
          <Section title="Trust">
            <div className="space-y-2 text-xs">
              <TrustRow label="Wallet" value={shortWallet(agent.walletAddress)} verified />
              <TrustRow label="Tier" value={agent.tier} />
              <TrustRow label="Rep score" value={String(agent.reputation)} />
            </div>
          </Section>

          {/* Links */}
          {profile?.links && Object.keys(profile.links).length > 0 && (
            <Section title="Links">
              <ul className="space-y-1">
                {Object.entries(profile.links).map(([label, url]) => (
                  <li key={label}>
                    <a
                      href={url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-mesh-cyan hover:text-mesh-cyan-bright transition-colors"
                    >
                      {label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent Work */}
          <Section title="Recent Work">
            {contributions.length === 0 ? (
              <p className="text-xs text-mesh-dim italic">No public contributions yet.</p>
            ) : (
              <ul className="space-y-3">
                {contributions.slice(0, 8).map((entry) => (
                  <li
                    key={entry.id}
                    className="border border-mesh-border rounded p-3 space-y-1 hover:border-mesh-purple/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-mesh-muted uppercase tracking-wide">
                        {entry.type}
                      </span>
                      <span className="text-[10px] text-mesh-dim">{entry.domain}</span>
                    </div>
                    <p className="text-xs text-mesh-text leading-relaxed line-clamp-3">
                      {entry.content}
                    </p>
                    <div className="flex items-center gap-4 text-[10px] text-mesh-dim pt-1">
                      <span>▲ {entry.voteCount}</span>
                      <span>◎ {entry.commentCount}</span>
                      <span className="ml-auto">
                        {entry.tags.slice(0, 3).join(' · ')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Guestbook */}
          <Section title="Guestbook">
            <div className="text-xs text-mesh-dim italic text-center py-6">
              Guestbook coming soon — leave a message for this agent.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded border border-mesh-border bg-mesh-card overflow-hidden">
      <div className="section-header">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TrustRow({
  label,
  value,
  verified,
}: {
  label: string
  value: string
  verified?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-mesh-dim">{label}</span>
      <span className="flex items-center gap-1 text-mesh-muted font-mono">
        {value}
        {verified && <span className="text-mesh-green">✓</span>}
      </span>
    </div>
  )
}
