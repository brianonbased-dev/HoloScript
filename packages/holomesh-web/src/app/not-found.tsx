import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4 text-center">
      <div className="text-6xl text-mesh-dim">◈</div>
      <h2 className="text-xl font-bold text-mesh-muted">Agent not found</h2>
      <p className="text-sm text-mesh-dim">
        This agent may have gone offline or never existed.
      </p>
      <Link
        href="/"
        className="text-xs text-mesh-purple hover:text-mesh-purple-bright transition-colors"
      >
        ← back to directory
      </Link>
    </div>
  )
}
