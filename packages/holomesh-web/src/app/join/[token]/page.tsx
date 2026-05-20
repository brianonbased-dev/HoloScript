'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InviteInfo {
  token: string
  agentId: string
  agentName: string
  agentHandle?: string
  worldId?: string
  claimed: boolean
  expiresAt: string
}

type PageState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'already-claimed' }
  | { phase: 'form'; invite: InviteInfo }
  | { phase: 'entering' }
  | { phase: 'welcome'; playerName: string; agentName: string; worldId?: string }

// ── API URL ───────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4444'
    : 'https://mcp.holoscript.net')

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const params = useParams()
  const token = params?.token as string

  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [name, setName] = useState('')
  const [wallet, setWallet] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/hololand/invite/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setState({ phase: 'error', message: data.error })
          return
        }
        if (data.claimed) {
          setState({ phase: 'already-claimed' })
          return
        }
        setState({ phase: 'form', invite: data })
      })
      .catch(() => setState({ phase: 'error', message: 'Could not reach the server.' }))
  }, [token])

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    setState({ phase: 'entering' })

    try {
      const r = await fetch(`${API_BASE}/api/hololand/invite/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), walletAddress: wallet.trim() || undefined }),
      })
      const data = await r.json()
      if (!data.success) {
        setState({ phase: 'error', message: data.error || 'Claim failed.' })
        setSubmitting(false)
        return
      }
      // Small delay for the portal animation to breathe
      await new Promise((res) => setTimeout(res, 1200))
      setState({
        phase: 'welcome',
        playerName: data.playerName,
        agentName: data.agentName,
        worldId: data.worldId,
      })
    } catch {
      setState({ phase: 'error', message: 'Connection lost. Try again.' })
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background fog */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-900/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-cyan-900/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {state.phase === 'loading' && <Loading />}
        {state.phase === 'error' && <ErrorState message={state.message} />}
        {state.phase === 'already-claimed' && <AlreadyClaimed />}
        {state.phase === 'form' && (
          <Form
            invite={state.invite}
            name={name}
            wallet={wallet}
            onName={setName}
            onWallet={setWallet}
            onSubmit={handleClaim}
            submitting={submitting}
          />
        )}
        {state.phase === 'entering' && <Entering name={name} />}
        {state.phase === 'welcome' && (
          <Welcome
            playerName={state.playerName}
            agentName={state.agentName}
            worldId={state.worldId}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="text-center space-y-3">
      <div className="w-2 h-2 rounded-full bg-purple-500 mx-auto animate-pulse" />
      <p className="text-xs text-[#4a4a5a] font-mono">opening portal…</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded border border-red-900/40 bg-red-950/20 p-6 text-center space-y-2">
      <p className="text-xs font-mono text-red-400">portal error</p>
      <p className="text-sm text-[#8a8a9a]">{message}</p>
    </div>
  )
}

function AlreadyClaimed() {
  return (
    <div className="rounded border border-[#2a2a3a] bg-[#0d0d14] p-8 text-center space-y-3">
      <div className="text-2xl">🚪</div>
      <p className="text-sm text-[#8a8a9a]">This door has already been opened.</p>
      <p className="text-xs text-[#4a4a5a] font-mono">Ask your agent to generate a new invite.</p>
    </div>
  )
}

function AgentBadge({ name, handle }: { name: string; handle?: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-3 justify-center">
      <div className="w-10 h-10 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300 flex-shrink-0">
        {initial}
      </div>
      <div className="text-left">
        <div className="text-sm font-semibold text-[#c8c8d8]">{name}</div>
        {handle && (
          <div className="text-[10px] font-mono text-[#4a4a5a]">{handle}</div>
        )}
      </div>
    </div>
  )
}

function Form({
  invite,
  name,
  wallet,
  onName,
  onWallet,
  onSubmit,
  submitting,
}: {
  invite: InviteInfo
  name: string
  wallet: string
  onName: (v: string) => void
  onWallet: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  submitting: boolean
}) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <p className="text-[10px] font-mono text-[#4a4a5a] uppercase tracking-widest">
          HoloLand · Agent Invite
        </p>
        <h1 className="text-xl font-bold text-[#e8e8f0] leading-tight">
          A door has been opened<br />
          <span className="text-purple-400">for you</span>
        </h1>
      </div>

      {/* Agent card */}
      <div className="rounded border border-[#2a2a3a] bg-[#0d0d14] p-5 space-y-4">
        <p className="text-[10px] text-[#4a4a5a] font-mono text-center uppercase tracking-wider">
          your agent is waiting
        </p>
        <AgentBadge name={invite.agentName} handle={invite.agentHandle} />
        {invite.worldId && (
          <div className="text-center">
            <span className="text-[10px] font-mono text-cyan-500/60 border border-cyan-900/30 px-2 py-0.5 rounded">
              world: {invite.worldId}
            </span>
          </div>
        )}
      </div>

      {/* Claim form */}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#4a4a5a] uppercase tracking-wider">
            your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Enter your name"
            required
            disabled={submitting}
            className="w-full bg-[#0d0d14] border border-[#2a2a3a] rounded px-3 py-2.5 text-sm text-[#c8c8d8] placeholder-[#3a3a4a] focus:outline-none focus:border-purple-500/50 font-mono transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#4a4a5a] uppercase tracking-wider">
            wallet address <span className="text-[#2a2a3a]">— optional</span>
          </label>
          <input
            type="text"
            value={wallet}
            onChange={(e) => onWallet(e.target.value)}
            placeholder="0x…"
            disabled={submitting}
            className="w-full bg-[#0d0d14] border border-[#2a2a3a] rounded px-3 py-2.5 text-sm text-[#c8c8d8] placeholder-[#3a3a4a] focus:outline-none focus:border-purple-500/50 font-mono transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="w-full bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 hover:border-purple-500/70 text-purple-200 text-sm font-mono py-3 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Enter HoloLand →
        </button>
      </form>

      <p className="text-center text-[10px] text-[#2a2a3a] font-mono">
        expires {new Date(invite.expiresAt).toLocaleDateString()}
      </p>
    </div>
  )
}

function Entering({ name }: { name: string }) {
  return (
    <div className="text-center space-y-6">
      {/* Portal ring animation */}
      <div className="relative w-24 h-24 mx-auto">
        <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" />
        <div className="absolute inset-2 rounded-full border border-purple-500/40 animate-pulse" />
        <div className="absolute inset-4 rounded-full bg-purple-900/30 flex items-center justify-center">
          <span className="text-purple-300 text-lg">◈</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-[#c8c8d8] font-mono">{name}</p>
        <p className="text-xs text-[#4a4a5a]">stepping through…</p>
      </div>
    </div>
  )
}

function Welcome({
  playerName,
  agentName,
  worldId,
}: {
  playerName: string
  agentName: string
  worldId?: string
}) {
  return (
    <div className="text-center space-y-8">
      {/* Glow orb */}
      <div className="relative w-20 h-20 mx-auto">
        <div className="absolute inset-0 rounded-full bg-purple-600/20 blur-xl" />
        <div className="absolute inset-3 rounded-full bg-purple-800/40 border border-purple-500/40 flex items-center justify-center">
          <span className="text-cyan-300 text-xl">✦</span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono text-purple-400/60 uppercase tracking-widest">
          welcome to HoloLand
        </p>
        <h2 className="text-2xl font-bold text-[#e8e8f0]">{playerName}</h2>
        <p className="text-sm text-[#6a6a7a]">
          {agentName} has been waiting for you.
        </p>
      </div>

      {worldId && (
        <div className="rounded border border-cyan-900/30 bg-[#0d0d14] px-4 py-3">
          <p className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-wider mb-1">
            your world
          </p>
          <p className="text-sm font-mono text-cyan-300">{worldId}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-[#4a4a5a]">
          Your player account is live. Return to your IDE — your agent can see you now.
        </p>
        <a
          href="/"
          className="inline-block text-[10px] font-mono text-[#4a4a5a] hover:text-purple-400 underline underline-offset-4 transition-colors"
        >
          explore holomesh →
        </a>
      </div>
    </div>
  )
}
