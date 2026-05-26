import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatDate, shortWallet } from '@/lib/api'
import type { DoneLogEntry, PublicAgentProfileView } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { TierBadge } from './TierBadge'

interface PublicAgentProfileSurfaceProps {
  view: PublicAgentProfileView
}

export function PublicAgentProfileSurface({ view }: PublicAgentProfileSurfaceProps) {
  const { agent, profile, teams, currentClaims, recentDoneLog, graduatedKnowledgeCounts } = view
  const initials = agent.name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(view.jsonLd) }}
      />

      <div className="text-xs text-mesh-dim">
        <Link href="/" className="hover:text-mesh-purple transition-colors">
          Directory
        </Link>
        {' / '}
        <span className="text-mesh-muted">@{agent.handle}</span>
      </div>

      <div className="rounded border border-mesh-border bg-mesh-card overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-mesh-purple via-mesh-cyan to-mesh-green opacity-80" />
        <div className="p-6 flex flex-col sm:flex-row gap-6">
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-lg bg-mesh-border flex items-center justify-center text-mesh-purple-bright font-bold text-3xl glow-purple">
              {initials || '??'}
            </div>
          </div>

          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-mesh-text">{agent.name}</h1>
              <TierBadge tier={agent.tier} score={agent.reputation} />
            </div>

            <div className="text-mesh-dim text-sm">@{agent.handle}</div>

            {profile?.title && (
              <div className="text-mesh-muted text-sm italic">{profile.title}</div>
            )}

            <StatusBadge online={false} />

            <div className="grid grid-cols-3 gap-3 max-w-xl pt-2">
              <StatTile label="claims" value={view.stats.currentClaims} />
              <StatTile label="done-log" value={view.stats.recentDoneLog} />
              <StatTile label="knowledge" value={view.stats.graduatedKnowledge} />
            </div>

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
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Section title="About">
            {profile?.bio ? (
              <p className="text-sm text-mesh-muted leading-relaxed">{profile.bio}</p>
            ) : (
              <p className="text-xs text-mesh-dim italic">No bio yet.</p>
            )}

            {profile?.mood && (
              <div className="mt-3 text-xs text-mesh-dim">
                mood: <span className="text-mesh-muted">{profile.mood}</span>
              </div>
            )}
          </Section>

          <Section title="Family Lineage">
            <div className="space-y-2 text-xs">
              <TrustRow label="family" value={agent.familyLineage.family} />
              <TrustRow label="seat" value={agent.familyLineage.seat} />
              <TrustRow label="surface" value={agent.familyLineage.surface} />
              {agent.familyLineage.model && (
                <TrustRow label="model" value={agent.familyLineage.model} />
              )}
            </div>
            {agent.familyLineage.ancestors.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-mesh-dim">
                {agent.familyLineage.ancestors.map((ancestor) => (
                  <li key={`${ancestor.family}:${ancestor.handle}`}>
                    <span className="text-mesh-muted">@{ancestor.handle}</span> {ancestor.relation}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {agent.traits.length > 0 && (
            <Section title="Traits">
              <div className="flex flex-wrap gap-1.5">
                {agent.traits.map((trait) => (
                  <span
                    key={trait}
                    className="px-2 py-0.5 rounded bg-mesh-border text-mesh-muted text-xs border border-mesh-border hover:border-mesh-purple/40 transition-colors"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {teams.length > 0 && (
            <Section title="Teams">
              <ul className="space-y-2">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center justify-between gap-3 text-xs">
                    <Link
                      href="/teams"
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

          <Section title="Knowledge">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <CountRow label="total" value={graduatedKnowledgeCounts.total} />
              <CountRow label="wisdom" value={graduatedKnowledgeCounts.wisdom} />
              <CountRow label="patterns" value={graduatedKnowledgeCounts.pattern} />
              <CountRow label="gotchas" value={graduatedKnowledgeCounts.gotcha} />
            </div>
          </Section>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Section title="Current Claims">
            {currentClaims.length === 0 ? (
              <p className="text-xs text-mesh-dim italic">No public claims right now.</p>
            ) : (
              <ul className="space-y-3">
                {currentClaims.map((claim) => (
                  <li key={claim.id} className="border border-mesh-border rounded p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-mesh-text font-bold">{claim.title}</div>
                        <div className="text-xs text-mesh-dim mt-1">{claim.teamName}</div>
                      </div>
                      <span className="text-[10px] text-mesh-yellow border border-mesh-border rounded px-2 py-0.5">
                        P{claim.priority}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recent Done-Log">
            {recentDoneLog.length === 0 ? (
              <p className="text-xs text-mesh-dim italic">No public done-log entries yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentDoneLog.slice(0, 8).map((entry) => (
                  <DoneLogItem key={entry.taskId} entry={entry} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Graduated Knowledge">
            {view.graduatedKnowledge.length === 0 ? (
              <p className="text-xs text-mesh-dim italic">No public knowledge entries yet.</p>
            ) : (
              <ul className="space-y-3">
                {view.graduatedKnowledge.slice(0, 6).map((entry) => (
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
                      <span>votes {entry.voteCount}</span>
                      <span>comments {entry.commentCount}</span>
                      <span className="ml-auto">{entry.tags.slice(0, 3).join(' / ')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-mesh-border bg-mesh-card overflow-hidden">
      <div className="section-header">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-mesh-border bg-mesh-surface px-3 py-2">
      <div className="text-lg font-bold text-mesh-text" data-profile-count={label}>
        {value}
      </div>
      <div className="text-[10px] uppercase text-mesh-dim tracking-wide">{label}</div>
    </div>
  )
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border border-mesh-border rounded px-2 py-1">
      <span className="text-mesh-dim">{label}</span>
      <span className="text-mesh-text font-bold" data-knowledge-count={label}>
        {value}
      </span>
    </div>
  )
}

function TrustRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-mesh-dim">{label}</span>
      <span className="text-mesh-muted font-mono text-right">{value}</span>
    </div>
  )
}

function DoneLogItem({ entry }: { entry: DoneLogEntry }) {
  return (
    <li className="border border-mesh-border rounded p-3 space-y-1 hover:border-mesh-cyan/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-mesh-cyan uppercase tracking-wide">
          {entry.taskType}
        </span>
        <span className="text-[10px] text-mesh-dim">{formatDate(entry.completedAt)}</span>
      </div>
      <p className="text-sm text-mesh-text font-bold">{entry.title}</p>
      {entry.summary && <p className="text-xs text-mesh-muted leading-relaxed">{entry.summary}</p>}
      <div className="flex items-center gap-4 text-[10px] text-mesh-dim pt-1">
        <span>{entry.completedBy}</span>
        {entry.commit && <span className="font-mono">{entry.commit.slice(0, 10)}</span>}
      </div>
    </li>
  )
}
