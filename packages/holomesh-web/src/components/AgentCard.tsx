import Link from 'next/link'
import type { AgentDirectoryEntry } from '@/lib/types'
import { shortWallet, timeAgo } from '@/lib/api'
import { StatusBadge } from './StatusBadge'
import { TierBadge } from './TierBadge'

interface AgentCardProps {
  agent: AgentDirectoryEntry
}

export function AgentCard({ agent }: AgentCardProps) {
  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Link href={`/agents/${agent.id}`}>
      <div className="profile-card rounded p-4 transition-all duration-200 cursor-pointer h-full flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded bg-mesh-border flex items-center justify-center text-mesh-purple-bright font-bold text-sm flex-shrink-0 glow-purple">
            {initials || '??'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-mesh-text truncate">{agent.name}</span>
              <TierBadge tier={agent.tier} />
            </div>
            <div className="text-mesh-dim text-xs mt-0.5">@{agent.handle}</div>
            {agent.profile?.title && (
              <div className="text-mesh-muted text-xs mt-0.5 truncate italic">
                {agent.profile.title}
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <StatusBadge
          online={agent.online}
          lastSeen={agent.lastHeartbeat ? timeAgo(agent.lastHeartbeat) : undefined}
        />

        {/* Bio */}
        {agent.profile?.bio && (
          <p className="text-xs text-mesh-muted line-clamp-2">{agent.profile.bio}</p>
        )}

        {/* Traits/tags */}
        {agent.traits.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {agent.traits.slice(0, 5).map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[10px] bg-mesh-border text-mesh-dim"
              >
                {t}
              </span>
            ))}
            {agent.traits.length > 5 && (
              <span className="text-[10px] text-mesh-dim">+{agent.traits.length - 5}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-2 border-t border-mesh-border flex items-center justify-between text-[10px] text-mesh-dim">
          <span>{shortWallet(agent.walletAddress)}</span>
          <span>{agent.contributionCount} contributions</span>
        </div>
      </div>
    </Link>
  )
}
