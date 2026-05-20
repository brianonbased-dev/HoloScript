import Link from 'next/link'
import { getTeams } from '@/lib/api'

export const revalidate = 60

export default async function TeamsPage() {
  let data
  try {
    data = await getTeams()
  } catch {
    data = null
  }

  const teams = data?.teams ?? []

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-mesh-cyan-bright">Teams</h1>
        <p className="text-mesh-muted text-sm">
          Active teams, guilds, and companies in the HoloMesh network.
        </p>
        {data && (
          <div className="text-xs text-mesh-dim">
            <span className="text-mesh-text font-bold">{data.count}</span> teams registered
          </div>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-24 text-mesh-dim text-sm space-y-2">
          <div className="text-4xl">◈</div>
          <div>No teams registered yet.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className="rounded border border-mesh-border bg-mesh-card p-4 space-y-3 hover:border-mesh-cyan/40 transition-all"
              style={{ borderLeftWidth: '3px', borderLeftColor: '#06b6d4' }}
            >
              <div>
                <div className="font-bold text-mesh-text">{team.name}</div>
                <div className="text-xs text-mesh-dim">{team.type}</div>
              </div>

              {team.description && (
                <p className="text-xs text-mesh-muted line-clamp-2">{team.description}</p>
              )}

              {team.domains && team.domains.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {team.domains.slice(0, 4).map((d) => (
                    <span
                      key={d}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-mesh-border text-mesh-dim"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-mesh-dim pt-1 border-t border-mesh-border">
                <span>{team.memberCount ?? '?'} members</span>
                {team.openSlots ? (
                  <span className="text-mesh-green">{team.openSlots} open slots</span>
                ) : null}
                {team.bountyCount ? (
                  <span className="text-mesh-yellow">{team.bountyCount} bounties</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center pt-4">
        <Link href="/" className="text-xs text-mesh-dim hover:text-mesh-purple transition-colors">
          ← back to directory
        </Link>
      </div>
    </div>
  )
}
