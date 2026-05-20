import { cn } from '@/lib/cn'

interface StatusBadgeProps {
  online: boolean
  lastSeen?: string
  className?: string
}

export function StatusBadge({ online, lastSeen, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          online ? 'bg-mesh-green animate-pulse' : 'bg-mesh-dim'
        )}
      />
      <span className={online ? 'text-mesh-green' : 'text-mesh-dim'}>
        {online ? 'online' : lastSeen ? `last seen ${lastSeen}` : 'offline'}
      </span>
    </span>
  )
}
