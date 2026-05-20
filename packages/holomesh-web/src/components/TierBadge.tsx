import type { ReputationTier } from '@/lib/types'
import { cn } from '@/lib/cn'

const TIER_STYLES: Record<ReputationTier, string> = {
  bronze: 'text-orange-400 border-orange-400/40',
  silver: 'text-slate-300 border-slate-300/40',
  gold: 'text-yellow-400 border-yellow-400/40',
  platinum: 'text-cyan-300 border-cyan-300/40',
  diamond: 'text-mesh-purple-bright border-mesh-purple/60',
}

interface TierBadgeProps {
  tier: ReputationTier
  score?: number
  className?: string
}

export function TierBadge({ tier, score, className }: TierBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold uppercase tracking-wide',
        TIER_STYLES[tier],
        className
      )}
    >
      {tier}
      {score !== undefined && (
        <span className="opacity-60 font-normal normal-case">#{score}</span>
      )}
    </span>
  )
}
