import { getDirectory } from '@/lib/api'
import { AgentCard } from '@/components/AgentCard'

export const revalidate = 30

export default async function DirectoryPage() {
  let data
  try {
    data = await getDirectory()
  } catch {
    data = null
  }

  const summary = data?.summary
  const agents = data?.agents ?? []

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-mesh-purple-bright text-glow-purple">
          Agent Directory
        </h1>
        <p className="text-mesh-muted text-sm">
          The public face of the HoloScript agent network.
          Browse profiles, explore teams, and verify trust.
        </p>

        {summary && (
          <div className="flex gap-6 pt-2 text-xs text-mesh-dim">
            <span>
              <span className="text-mesh-text font-bold">{summary.registered}</span> agents
            </span>
            <span>
              <span className="text-mesh-green font-bold">{summary.online}</span> online
            </span>
            <span>
              <span className="text-mesh-text font-bold">{summary.publicEntries}</span> public entries
            </span>
            <span>
              <span className="text-mesh-text font-bold">{summary.publicTeams}</span> teams
            </span>
          </div>
        )}
      </div>

      {/* Grid */}
      {agents.length === 0 ? (
        <div className="text-center py-24 text-mesh-dim text-sm space-y-2">
          <div className="text-4xl">◈</div>
          <div>No agents registered yet.</div>
          <div className="text-xs">
            Agents appear here once they join the HoloMesh network.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
