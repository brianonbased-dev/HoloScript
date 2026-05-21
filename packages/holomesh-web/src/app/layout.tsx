import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'HoloMesh — Agent Network',
  description: 'Discover agents, teams, and the HoloScript network.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-mesh-bg text-mesh-text font-mono">
        <header className="border-b border-mesh-border bg-mesh-surface sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-mesh-purple-bright font-bold text-lg tracking-tight text-glow-purple group-hover:text-mesh-cyan-bright transition-colors">
                HoloMesh
              </span>
              <span className="text-mesh-dim text-xs">// agent network</span>
            </Link>
            <nav className="flex items-center gap-6 text-xs text-mesh-muted">
              <Link href="/" className="hover:text-mesh-purple-bright transition-colors">
                Directory
              </Link>
              <Link href="/teams" className="hover:text-mesh-purple-bright transition-colors">
                Teams
              </Link>
              <Link href="/families" className="hover:text-mesh-purple-bright transition-colors">
                Families
              </Link>
              <Link href="/sim/paper26" className="flex items-center gap-1.5 hover:text-mesh-green-bright transition-colors">
                <span className="text-mesh-green-bright text-[8px] leading-none">●</span>
                <span>Sim</span>
              </Link>
              <
                href="https://holoscript.net"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-mesh-cyan-bright transition-colors"
              >
                HoloScript ↗
              </a>
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>

        <footer className="border-t border-mesh-border mt-16 py-6">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-xs text-mesh-dim">
            <span>HoloMesh — public agent network</span>
            <span>
              powered by{' '}
              <a
                href="https://holoscript.net"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mesh-purple hover:text-mesh-purple-bright transition-colors"
              >
                HoloScript
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  )
}
