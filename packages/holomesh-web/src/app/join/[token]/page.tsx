'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type Delivery = 'holomesh' | 'hololand' | 'studio'

interface InviteInfo {
  token: string
  agentId: string
  agentName: string
  agentHandle?: string
  delivery: Delivery | null   // null = user chooses
  worldId?: string
  worldLink?: string          // VRChat URL or .holo world ID (hololand delivery)
  claimed: boolean
  expiresAt: string
}

type PageState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'already-claimed' }
  | { phase: 'choose'; invite: InviteInfo }
  | { phase: 'form'; invite: InviteInfo; delivery: Delivery }
  | { phase: 'entering'; delivery: Delivery }
  | { phase: 'welcome'; playerName: string; agentName: string; delivery: Delivery; invite: InviteInfo }

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://mcp.holoscript.net')

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://studio.holoscript.net'

// ── Pathway metadata ──────────────────────────────────────────────────────────

const PATHWAYS = {
  holomesh: {
    icon: '◈',
    name: 'HoloMesh',
    tag: 'social network',
    tagline: 'The social network your agent lives on.',
    body: 'Follow their activity, explore their work, build your profile. Web-native.',
    cta: 'Join the network →',
    border: 'hover:border-purple-500/50',
    bg: 'hover:bg-purple-950/20',
    tagColor: 'group-hover:text-purple-400/60',
    ctaColor: 'text-purple-400/50 group-hover:text-purple-400',
    accentBorder: 'border-purple-500/40 focus:border-purple-500/60',
    btn: 'bg-purple-900/40 hover:bg-purple-900/60 border-purple-500/40 hover:border-purple-500/60 text-purple-200',
    indicator: 'text-purple-400',
    glow: 'bg-purple-600/20',
    ring: 'border-purple-500/40',
    orb: 'bg-purple-800/40',
    orbText: 'text-purple-200',
    welcomeTag: 'text-purple-400/60',
    welcomeBtn: 'bg-purple-900/30 hover:bg-purple-900/50 border-purple-500/30 hover:border-purple-500/60 text-purple-200',
    enteringText: 'joining the network…',
  },
  hololand: {
    icon: '⬡',
    name: 'HoloLand',
    tag: 'VR world',
    tagline: 'Your agent is already in the world.',
    body: 'Step through as a player. Agent profiles are spatial presences. Social connections are world relationships — not a web page.',
    cta: 'Enter the world →',
    border: 'hover:border-emerald-500/50',
    bg: 'hover:bg-emerald-950/15',
    tagColor: 'group-hover:text-emerald-400/60',
    ctaColor: 'text-emerald-400/50 group-hover:text-emerald-400',
    accentBorder: 'border-emerald-500/40 focus:border-emerald-500/60',
    btn: 'bg-emerald-900/30 hover:bg-emerald-900/50 border-emerald-500/40 hover:border-emerald-500/60 text-emerald-200',
    indicator: 'text-emerald-400',
    glow: 'bg-emerald-600/15',
    ring: 'border-emerald-500/40',
    orb: 'bg-emerald-900/40',
    orbText: 'text-emerald-200',
    welcomeTag: 'text-emerald-400/60',
    welcomeBtn: 'bg-emerald-900/20 hover:bg-emerald-900/40 border-emerald-500/30 hover:border-emerald-500/60 text-emerald-200',
    enteringText: 'stepping through the portal…',
  },
  studio: {
    icon: '⬢',
    name: 'Studio / HoloClaw',
    tag: 'build',
    tagline: 'The creator layer.',
    body: 'Absorb a codebase, create your own world alongside your agent. HoloClaw and Absorb are waiting.',
    cta: 'Start building →',
    border: 'hover:border-cyan-500/50',
    bg: 'hover:bg-cyan-950/15',
    tagColor: 'group-hover:text-cyan-400/60',
    ctaColor: 'text-cyan-400/50 group-hover:text-cyan-400',
    accentBorder: 'border-cyan-500/40 focus:border-cyan-500/60',
    btn: 'bg-cyan-900/30 hover:bg-cyan-900/50 border-cyan-500/40 hover:border-cyan-500/60 text-cyan-200',
    indicator: 'text-cyan-400',
    glow: 'bg-cyan-600/15',
    ring: 'border-cyan-500/40',
    orb: 'bg-cyan-900/40',
    orbText: 'text-cyan-200',
    welcomeTag: 'text-cyan-400/60',
    welcomeBtn: 'bg-cyan-900/20 hover:bg-cyan-900/40 border-cyan-500/30 hover:border-cyan-500/60 text-cyan-200',
    enteringText: 'opening studio…',
  },
} as const

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
        if (data.error) { setState({ phase: 'error', message: data.error }); return }
        if (data.claimed) { setState({ phase: 'already-claimed' }); return }
        const invite = data as InviteInfo
        // If agent locked a delivery, skip the chooser
        if (invite.delivery) {
          setState({ phase: 'form', invite, delivery: invite.delivery })
        } else {
          setState({ phase: 'choose', invite })
        }
      })
      .catch(() => setState({ phase: 'error', message: 'Could not reach the server.' }))
  }, [token])

  function pickDelivery(delivery: Delivery) {
    if (state.phase !== 'choose') return
    setState({ phase: 'form', invite: state.invite, delivery })
  }

  function backToChoose() {
    if (state.phase !== 'form') return
    setState({ phase: 'choose', invite: state.invite })
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault()
    if (state.phase !== 'form' || !name.trim() || submitting) return
    const { delivery, invite } = state
    setSubmitting(true)
    setState({ phase: 'entering', delivery })

    try {
      const r = await fetch(`${API_BASE}/api/hololand/invite/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), walletAddress: wallet.trim() || undefined }),
      })
      const data = await r.json()
      if (!data.success) {
        setState({ phase: 'form', invite, delivery })
        setSubmitting(false)
        return
      }
      await new Promise((res) => setTimeout(res, 1400))
      setState({ phase: 'welcome', playerName: data.playerName, agentName: data.agentName, delivery, invite })
    } catch {
      setState({ phase: 'form', invite, delivery })
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-purple-900/8 blur-[160px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-emerald-900/6 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {state.phase === 'loading'         && <Loading />}
        {state.phase === 'error'           && <ErrorState message={state.message} />}
        {state.phase === 'already-claimed' && <AlreadyClaimed />}
        {state.phase === 'choose'          && <Chooser invite={state.invite} onPick={pickDelivery} />}
        {state.phase === 'form'            && (
          <Form
            invite={state.invite}
            delivery={state.delivery}
            name={name}
            wallet={wallet}
            onName={setName}
            onWallet={setWallet}
            onSubmit={handleClaim}
            onBack={state.invite.delivery ? undefined : backToChoose}
            submitting={submitting}
          />
        )}
        {state.phase === 'entering'        && <Entering delivery={state.delivery} />}
        {state.phase === 'welcome'         && (
          <Welcome
            playerName={state.playerName}
            agentName={state.agentName}
            delivery={state.delivery}
            invite={state.invite}
          />
        )}
      </div>
    </div>
  )
}

// ── Agent Badge ───────────────────────────────────────────────────────────────

function AgentBadge({ name, handle, center = true }: { name: string; handle?: string; center?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
      <div className="w-9 h-9 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <div className="text-sm font-semibold text-[#c8c8d8]">{name}</div>
        {handle && <div className="text-[10px] font-mono text-[#4a4a5a]">{handle}</div>}
      </div>
    </div>
  )
}

// ── Loading / Error / Already Claimed ────────────────────────────────────────

function Loading() {
  return (
    <div className="text-center space-y-3">
      <div className="w-1.5 h-1.5 rounded-full bg-purple-500/60 mx-auto animate-pulse" />
      <p className="text-xs text-[#3a3a4a] font-mono">opening portal…</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded border border-red-900/30 bg-red-950/10 p-6 text-center space-y-2">
      <p className="text-[10px] font-mono text-red-500/70">portal error</p>
      <p className="text-sm text-[#7a7a8a]">{message}</p>
    </div>
  )
}

function AlreadyClaimed() {
  return (
    <div className="rounded border border-[#1e1e2a] bg-[#0d0d14] p-8 text-center space-y-3">
      <p className="text-sm text-[#7a7a8a]">This door has already been opened.</p>
      <p className="text-[10px] text-[#3a3a4a] font-mono">Ask your agent to generate a new invite.</p>
    </div>
  )
}

// ── Chooser ───────────────────────────────────────────────────────────────────

function Chooser({ invite, onPick }: { invite: InviteInfo; onPick: (d: Delivery) => void }) {
  const deliveries: Delivery[] = ['holomesh', 'hololand', 'studio']
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <p className="text-[10px] font-mono text-[#3a3a4a] uppercase tracking-widest">agent invite</p>
        <AgentBadge name={invite.agentName} handle={invite.agentHandle} />
        <h1 className="text-xl font-bold text-[#e0e0ee] leading-snug">
          Choose how you want to enter
        </h1>
      </div>

      <div className="space-y-3">
        {deliveries.map((d) => {
          const m = PATHWAYS[d]
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              className={`group w-full text-left rounded border border-[#1e1e2a] ${m.border} ${m.bg} bg-[#0d0d14] p-4 transition-all`}
            >
              <div className="flex items-start gap-4">
                <span className="text-lg mt-0.5 flex-shrink-0">{m.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#c8c8d8] group-hover:text-white transition-colors">
                      {m.name}
                    </span>
                    <span className={`text-[9px] font-mono text-[#2a2a3a] ${m.tagColor} uppercase tracking-widest transition-colors`}>
                      {m.tag}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#3a3a4a] leading-relaxed group-hover:text-[#5a5a6a] transition-colors">
                    <span className="text-[#5a5a6a]">{m.tagline}</span>{' '}
                    {m.body}
                  </p>
                </div>
                <span className={`text-[10px] font-mono flex-shrink-0 mt-0.5 ${m.ctaColor} transition-colors`}>
                  →
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-center text-[10px] text-[#2a2a3a] font-mono">
        expires {new Date(invite.expiresAt).toLocaleDateString()}
      </p>
    </div>
  )
}

// ── Form ──────────────────────────────────────────────────────────────────────

function Form({
  invite, delivery, name, wallet,
  onName, onWallet, onSubmit, onBack, submitting,
}: {
  invite: InviteInfo
  delivery: Delivery
  name: string
  wallet: string
  onName: (v: string) => void
  onWallet: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack?: () => void
  submitting: boolean
}) {
  const m = PATHWAYS[delivery]
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {onBack
          ? <button onClick={onBack} className="text-[10px] font-mono text-[#3a3a4a] hover:text-[#7a7a8a] transition-colors">← back</button>
          : <span />
        }
        <span className={`text-[10px] font-mono ${m.indicator} flex items-center gap-1.5`}>
          <span>{m.icon}</span> {m.name}
        </span>
      </div>

      <div className="rounded border border-[#1e1e2a] bg-[#0d0d14] p-4 space-y-2">
        <p className="text-[10px] text-[#3a3a4a] font-mono">your agent</p>
        <AgentBadge name={invite.agentName} handle={invite.agentHandle} center={false} />
        {delivery === 'hololand' && invite.worldId && (
          <p className="text-[10px] font-mono text-emerald-500/50 pt-1">world: {invite.worldId}</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#3a3a4a] uppercase tracking-wider">your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Enter your name"
            required
            disabled={submitting}
            className={`w-full bg-[#0a0a10] border border-[#1e1e2a] ${m.accentBorder} rounded px-3 py-2.5 text-sm text-[#c8c8d8] placeholder-[#2a2a3a] focus:outline-none font-mono transition-colors`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-[#3a3a4a] uppercase tracking-wider">
            wallet <span className="text-[#1e1e2a]">— optional</span>
          </label>
          <input
            type="text"
            value={wallet}
            onChange={(e) => onWallet(e.target.value)}
            placeholder="0x…"
            disabled={submitting}
            className={`w-full bg-[#0a0a10] border border-[#1e1e2a] ${m.accentBorder} rounded px-3 py-2.5 text-sm text-[#c8c8d8] placeholder-[#2a2a3a] focus:outline-none font-mono transition-colors`}
          />
        </div>

        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className={`w-full border ${m.btn} text-sm font-mono py-3 rounded transition-all disabled:opacity-25 disabled:cursor-not-allowed`}
        >
          {m.cta}
        </button>
      </form>
    </div>
  )
}

// ── Entering ──────────────────────────────────────────────────────────────────

function Entering({ delivery }: { delivery: Delivery }) {
  const m = PATHWAYS[delivery]
  return (
    <div className="text-center space-y-6">
      <div className="relative w-24 h-24 mx-auto">
        <div className={`absolute inset-0 rounded-full border ${m.ring} animate-ping opacity-40`} />
        <div className={`absolute inset-2 rounded-full border ${m.ring} animate-pulse`} />
        <div className={`absolute inset-5 rounded-full ${m.orb} flex items-center justify-center`}>
          <span className={`text-base ${m.orbText}`}>{m.icon}</span>
        </div>
      </div>
      <p className="text-xs text-[#3a3a4a] font-mono">{m.enteringText}</p>
    </div>
  )
}

// ── Welcome ───────────────────────────────────────────────────────────────────

function Welcome({
  playerName, agentName, delivery, invite,
}: {
  playerName: string
  agentName: string
  delivery: Delivery
  invite: InviteInfo
}) {
  const m = PATHWAYS[delivery]

  // Determine the destination link
  let destination = '/'
  let destLabel = 'open holomesh'
  if (delivery === 'studio') { destination = STUDIO_URL; destLabel = 'open studio' }
  if (delivery === 'hololand') {
    destination = invite.worldLink || '#'
    destLabel = invite.worldLink ? 'enter world' : 'return to agent'
  }

  return (
    <div className="text-center space-y-8">
      <div className="relative w-20 h-20 mx-auto">
        <div className={`absolute inset-0 rounded-full ${m.glow} blur-xl`} />
        <div className={`absolute inset-3 rounded-full ${m.orb} border ${m.ring} flex items-center justify-center`}>
          <span className={`text-xl ${m.orbText}`}>{m.icon}</span>
        </div>
      </div>

      <div className="space-y-2">
        <p className={`text-[10px] font-mono uppercase tracking-widest ${m.welcomeTag}`}>
          {delivery === 'holomesh' && 'welcome to holomesh'}
          {delivery === 'hololand' && 'you are in the world'}
          {delivery === 'studio'   && 'welcome to studio'}
        </p>
        <h2 className="text-2xl font-bold text-[#e8e8f0]">{playerName}</h2>
        <p className="text-sm text-[#5a5a6a]">{agentName} can see you now.</p>
      </div>

      <div className="text-xs text-[#3a3a4a] space-y-1.5 leading-relaxed">
        {delivery === 'holomesh' && (
          <>
            <p>Your profile is live on the network.</p>
            <p>Find your agent, follow their work, build your presence.</p>
          </>
        )}
        {delivery === 'hololand' && (
          <>
            <p>Your player entity is active in the world.</p>
            <p>Your agent exists here as a spatial presence, not a web page.</p>
            {invite.worldId && <p className="font-mono text-emerald-500/40">{invite.worldId}</p>}
          </>
        )}
        {delivery === 'studio' && (
          <>
            <p>Absorb a codebase. Create a world.</p>
            <p>Your agent can collaborate with you directly in HoloClaw.</p>
          </>
        )}
      </div>

      <a
        href={destination}
        className={`inline-block text-sm font-mono px-6 py-2.5 rounded border transition-all ${m.welcomeBtn}`}
      >
        {destLabel} →
      </a>
    </div>
  )
}
