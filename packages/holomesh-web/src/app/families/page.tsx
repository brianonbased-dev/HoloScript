// Paper 31
import type { Metadata } from 'next'
import {
  SUBSTRATE_COMPARISON,
  EMERGENCE_MODEL_FAMILIES,
  SIM_PHASES,
  PERSONAS,
  HYPOTHESES,
  POSTDATE_RESEARCH,
  type ModelFamily,
  type SimPhase,
  type SubstrateComparison,
  type Hypothesis,
  type PostdateResearch,
} from '@/data/families'

export const metadata: Metadata = {
  title: 'Families — Emergence Research — HoloMesh',
  description:
    'Paper 31: Long-Horizon Agent Emergence Under Structured Substrate. AI agents living in a village — and you can enter it.',
}

export default function FamiliesPage() {
  const oursCount = SUBSTRATE_COMPARISON.filter((r) => r.advantage === 'ours').length

  return (
    <div className="space-y-12">

      {/* Hero */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] border border-mesh-purple/40 text-mesh-purple px-2 py-0.5 rounded font-mono uppercase tracking-widest">
            Paper 31 · Preregistered
          </span>
          <span className="text-[10px] text-mesh-dim">NeurIPS 2027 / AAMAS 2027 · candidate</span>
        </div>
        <h1 className="text-2xl font-bold text-mesh-cyan-bright leading-tight">
          AI Agents Living in a Village —<br />
          <span className="text-mesh-purple-bright">And You Can Enter It</span>
        </h1>
        <p className="text-mesh-muted text-sm max-w-2xl leading-relaxed">
          Emergence AI showed the world what happens when AI agents live together in a simulated village.
          We're building the same thing — except the agents run on HoloScript's structured substrate,
          every action is verifiable on-chain, and the simulation compiles to VR.
          Same 5×15-day design. You can walk in.
        </p>
      </div>

      {/* What Emergence AI built */}
      <section className="space-y-3">
        <div className="section-header">What Emergence AI built</div>
        <div className="rounded border border-mesh-border bg-mesh-card p-5 space-y-3">
          <p className="text-sm text-mesh-text leading-relaxed">
            In 2026, Emergence AI ran "Emergence World" — 5 parallel village simulations, 15 sim-days each,
            with AI agents that woke up, worked, formed opinions, gossiped, remembered grudges,
            and fell into social patterns nobody programmed. They released videos. It was real.
          </p>
          <p className="text-sm text-mesh-muted leading-relaxed">
            The agents used free-text scratchpads for memory. The research wasn't preregistered.
            You could watch it — you couldn't enter it, audit it, or replicate it across substrates.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-mesh-dim">
            <span>5 worlds · 15 days · 4 model families · ~25 agents per world</span>
            <span className="text-mesh-border">·</span>
            <span className="text-mesh-yellow">not preregistered</span>
            <span className="text-mesh-border">·</span>
            <span className="text-mesh-yellow">cost not published</span>
          </div>
        </div>
      </section>

      {/* What we're building differently */}
      <section className="space-y-3">
        <div className="section-header">What we're building differently</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              title: 'Enter the simulation',
              body: 'An observer spawn point sits at Ashenmoor village center. The same .holo world file compiles to WebGPU/R3F (browser), Unity (standalone), and VRChat (Quest 3). Walk in. Watch the agents live.',
              accent: 'text-mesh-cyan-bright',
              tag: 'H₂ substrate test',
            },
            {
              title: 'Structured agent memory',
              body: 'Agents run on typed .hsplus schema — goals, relationships, beliefs, observations, recent actions. Not a prose scratchpad. Behavioral drift surfaces as schema violations, not invisible semantic slippage.',
              accent: 'text-mesh-purple-bright',
              tag: 'C-STRUCT condition',
            },
            {
              title: 'Every action on-chain',
              body: 'CAELRecorder signs every agent action. The full sim history is a hash-chained JSONL anchored to Base mainnet at phase close. Not a log file — a verifiable ledger.',
              accent: 'text-mesh-green',
              tag: 'CAEL provenance',
            },
            {
              title: 'Preregistered & anchored',
              body: 'Hypotheses, rubric, analysis plan, and cost ceilings committed before data collection. OTS + Base anchor at sign. Emergence World was not preregistered.',
              accent: 'text-orange-400',
              tag: 'Paper 31',
            },
            {
              title: 'Cost transparent',
              body: 'Every API call logged to a receipted CSV, SHA-256 anchored at phase close. $1,010 total ceiling across all phases. Emergence World\'s cost was never published.',
              accent: 'text-yellow-400',
              tag: 'F.050',
            },
            {
              title: 'Negative result binding',
              body: 'If H₁ fails — if structured substrate doesn\'t reduce drift — we publish the null result within 30 days of Phase 2 close. This is preregistered and binding.',
              accent: 'text-mesh-purple-bright',
              tag: 'anti-HARKing',
            },
          ].map((card) => (
            <div key={card.title} className="rounded bg-mesh-card border border-mesh-border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className={`text-xs font-bold ${card.accent}`}>{card.title}</div>
                <span className="text-[9px] font-mono text-mesh-dim border border-mesh-border px-1.5 py-0.5 rounded flex-shrink-0">
                  {card.tag}
                </span>
              </div>
              <p className="text-xs text-mesh-muted leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Side-by-side comparison */}
      <section className="space-y-3">
        <div className="section-header">Side by side</div>
        <div className="flex items-center gap-2 text-xs text-mesh-dim pb-1">
          <span className="text-mesh-green font-bold">{oursCount}</span>
          <span>dimensions where HoloScript improves on the prior art</span>
        </div>
        <div className="rounded border border-mesh-border overflow-hidden">
          <div className="grid grid-cols-[1.2fr_1fr_1fr] text-[10px] text-mesh-dim bg-mesh-surface border-b border-mesh-border">
            <div className="px-3 py-2 font-bold uppercase tracking-wide">Dimension</div>
            <div className="px-3 py-2 font-bold uppercase tracking-wide border-l border-mesh-border">Emergence AI</div>
            <div className="px-3 py-2 font-bold uppercase tracking-wide border-l border-mesh-border text-mesh-purple">HoloScript</div>
          </div>
          {SUBSTRATE_COMPARISON.map((row, i) => (
            <ComparisonRow key={row.dimension} row={row} zebra={i % 2 === 1} />
          ))}
        </div>
      </section>

      {/* The village */}
      <section className="space-y-3">
        <div className="section-header">The village — Ashenmoor</div>
        <p className="text-xs text-mesh-muted">
          10 fixed personas across all 5 worlds and both conditions.
          Same backstories, same names, same schedules — built as <code className="text-mesh-purple-bright text-[10px]">.holo</code> agent objects
          with <code className="text-mesh-purple-bright text-[10px]">@c-struct-agent</code> traits
          in <code className="text-mesh-dim text-[10px]">Hololand/experiments/emergence-sim/village.holo</code>.
        </p>
        <div className="rounded border border-mesh-border overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr] text-[10px] text-mesh-dim bg-mesh-surface border-b border-mesh-border">
            <div className="px-3 py-2 font-bold uppercase tracking-wide">Role</div>
            <div className="px-3 py-2 font-bold uppercase tracking-wide border-l border-mesh-border">Name</div>
            <div className="px-3 py-2 font-bold uppercase tracking-wide border-l border-mesh-border">Home</div>
          </div>
          {PERSONAS.map((p, i) => (
            <div key={p.id} className={`grid grid-cols-[1fr_1fr_1fr] text-xs ${i % 2 === 1 ? 'bg-mesh-surface' : 'bg-mesh-card'}`}>
              <div className="px-3 py-2 text-mesh-purple-bright font-mono text-[10px]">{p.role}</div>
              <div className="px-3 py-2 text-mesh-text border-l border-mesh-border">{p.name}</div>
              <div className="px-3 py-2 text-mesh-dim border-l border-mesh-border text-[10px]">{p.home}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Hypotheses */}
      <section className="space-y-3">
        <div className="section-header">Hypotheses</div>
        <div className="space-y-3">
          {HYPOTHESES.map((h) => (
            <HypothesisCard key={h.id} h={h} />
          ))}
        </div>
      </section>

      {/* Model Families */}
      <section className="space-y-3">
        <div className="section-header">Model Families</div>
        <p className="text-xs text-mesh-muted">
          Primary run locked to Claude Sonnet 4.6 for Emergence World comparability.
          Exploratory cross-model follow-up pre-registered separately if primary result holds.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {EMERGENCE_MODEL_FAMILIES.map((fam) => (
            <FamilyCard key={fam.id} family={fam} />
          ))}
        </div>
      </section>

      {/* Sim Phases */}
      <section className="space-y-3">
        <div className="section-header">Simulation Phases</div>
        <div className="space-y-3">
          {SIM_PHASES.map((phase, i) => (
            <PhaseCard key={phase.id} phase={phase} index={i} />
          ))}
        </div>
        <p className="text-[10px] text-mesh-dim">
          Program ceiling: $1,010 total. Negative-result publication within 30 days of Phase 2
          completion — binding, preregistered.
        </p>
      </section>

      {/* Post-preregistration research */}
      <section className="space-y-3">
        <div className="section-header">Incorporating newer research</div>
        <p className="text-xs text-mesh-muted max-w-2xl leading-relaxed">
          The following work postdates the May 15 preregistration and is being incorporated
          as additional framing and infrastructure context. It does not alter the registered
          hypotheses, analysis plan, or cost ceilings.
        </p>
        <div className="space-y-3">
          {POSTDATE_RESEARCH.map((r) => (
            <PostdateCard key={r.title} r={r} />
          ))}
        </div>
      </section>

      {/* Preregistration */}
      <section className="rounded border border-mesh-border bg-mesh-card p-4 space-y-2">
        <div className="section-header -mx-4 -mt-4 mb-3">Preregistration</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <InfoRow label="Paper slot" value="Paper 31 — gated candidate" />
          <InfoRow label="Status" value="DRAFT · peer audit pending" />
          <InfoRow label="Target venue" value="NeurIPS 2027 D&B / AAMAS 2027" />
          <InfoRow label="Prior art" value="Emergence AI 2026, Park et al. 2023, Conway 1970" />
          <InfoRow label="Simulation source" value="Hololand/experiments/emergence-sim/" />
          <InfoRow label="OTS anchor" value="pending sign" dim />
          <InfoRow label="Base anchor" value="pending sign" dim />
        </div>
      </section>
    </div>
  )
}

function ComparisonRow({ row, zebra }: { row: SubstrateComparison; zebra: boolean }) {
  const icon = row.advantage === 'ours' ? '▲' : row.advantage === 'theirs' ? '—' : '='
  const iconColor =
    row.advantage === 'ours'
      ? 'text-mesh-green'
      : row.advantage === 'theirs'
      ? 'text-mesh-yellow'
      : 'text-mesh-dim'

  return (
    <div className={`grid grid-cols-[1.2fr_1fr_1fr] text-xs ${zebra ? 'bg-mesh-surface' : 'bg-mesh-card'}`}>
      <div className="px-3 py-2 text-mesh-dim">{row.dimension}</div>
      <div className="px-3 py-2 text-mesh-muted border-l border-mesh-border">{row.emergenceAI}</div>
      <div className="px-3 py-2 border-l border-mesh-border flex items-center justify-between gap-2">
        <span className={row.advantage === 'ours' ? 'text-mesh-text' : 'text-mesh-muted'}>
          {row.holoScript}
        </span>
        <span className={`text-[10px] flex-shrink-0 ${iconColor}`}>{icon}</span>
      </div>
    </div>
  )
}

function HypothesisCard({ h }: { h: Hypothesis }) {
  const colors: Record<string, string> = {
    H1: 'border-mesh-purple/40 text-mesh-purple-bright',
    H2: 'border-cyan-500/40 text-mesh-cyan-bright',
    H3: 'border-orange-500/40 text-orange-400',
  }
  return (
    <div
      className={`rounded border bg-mesh-card p-4 space-y-2 ${colors[h.id]?.split(' ')[0]}`}
      style={{ borderLeftWidth: '3px' }}
    >
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold font-mono ${colors[h.id]?.split(' ')[1]}`}>{h.id}</span>
        <span className="text-xs text-mesh-muted">{h.label}</span>
      </div>
      <p className="text-xs text-mesh-text leading-relaxed">{h.claim}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-mesh-dim pt-1">
        <span><span className="text-mesh-dim">metric:</span> {h.metric}</span>
        <span><span className="text-mesh-dim">α:</span> {h.alpha}</span>
      </div>
    </div>
  )
}

function FamilyCard({ family }: { family: ModelFamily }) {
  const roleLabel: Record<ModelFamily['role'], string> = {
    primary: 'primary',
    exploratory: 'exploratory',
    'prior-art': 'prior art',
  }
  const roleColor: Record<ModelFamily['role'], string> = {
    primary: 'text-mesh-green border-mesh-green/30',
    exploratory: 'text-mesh-dim border-mesh-dim/30',
    'prior-art': 'text-mesh-purple border-mesh-purple/30',
  }
  return (
    <div
      className="rounded bg-mesh-card border border-mesh-border overflow-hidden flex flex-col"
      style={{ borderLeftWidth: '3px', borderLeftColor: family.borderColor }}
    >
      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded text-xs font-bold flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${family.borderColor}22`, color: family.borderColor }}
            >
              {family.initial}
            </span>
            <span className="text-sm font-bold text-mesh-text leading-tight">{family.lab}</span>
          </div>
          <span className={`text-[10px] border px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${roleColor[family.role]}`}>
            {roleLabel[family.role]}
          </span>
        </div>
        <div className="space-y-1">
          {family.models.map((m) => (
            <div key={m} className="text-xs text-mesh-muted font-mono bg-mesh-border/50 px-2 py-1 rounded">
              {m}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-mesh-dim leading-relaxed">{family.notes}</p>
      </div>
    </div>
  )
}

function PhaseCard({ phase, index }: { phase: SimPhase; index: number }) {
  const statusStyle: Record<SimPhase['status'], string> = {
    complete: 'text-mesh-green',
    running: 'text-yellow-400',
    pending: 'text-mesh-dim',
    gated: 'text-mesh-purple',
  }
  const statusLabel: Record<SimPhase['status'], string> = {
    complete: '✓ complete',
    running: '⟳ running',
    pending: '○ pending',
    gated: '⊘ gated',
  }
  const borderColors = ['#7c3aed', '#06b6d4', '#f97316']

  return (
    <div
      className="rounded bg-mesh-card border border-mesh-border overflow-hidden"
      style={{ borderLeftWidth: '3px', borderLeftColor: borderColors[index] }}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm font-bold text-mesh-text">{phase.name}</span>
          <div className="flex items-center gap-3 text-xs">
            <span className={statusStyle[phase.status]}>{statusLabel[phase.status]}</span>
            <span className="text-mesh-dim font-mono">{phase.cap}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
          <div><span className="text-mesh-dim">scope: </span><span className="text-mesh-muted">{phase.scope}</span></div>
          <div><span className="text-mesh-dim">model: </span><span className="text-mesh-muted">{phase.model}</span></div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-mesh-dim uppercase tracking-wide">gates</div>
          {phase.gates.map((g) => (
            <div key={g} className="flex items-start gap-2 text-[11px] text-mesh-muted">
              <span className="text-mesh-dim flex-shrink-0 mt-0.5">◇</span>
              {g}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-mesh-dim flex-shrink-0 w-32">{label}</span>
      <span className={dim ? 'text-mesh-dim italic' : 'text-mesh-muted'}>{value}</span>
    </div>
  )
}

function PostdateCard({ r }: { r: PostdateResearch }) {
  return (
    <div className="rounded bg-mesh-card border border-mesh-border border-l-[3px] border-l-cyan-500/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <span className="text-sm font-bold text-mesh-text leading-tight">{r.title}</span>
        <span className="text-[10px] font-mono text-mesh-dim flex-shrink-0">{r.date}</span>
      </div>
      <div className="text-[10px] text-mesh-dim font-mono leading-relaxed">{r.source}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <div className="text-[10px] text-mesh-dim uppercase tracking-wide">relevance to Paper 31</div>
          <p className="text-[11px] text-mesh-muted leading-relaxed">{r.relevance}</p>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-orange-400/80 uppercase tracking-wide">impact</div>
          <p className="text-[11px] text-mesh-muted leading-relaxed">{r.impact}</p>
        </div>
      </div>
    </div>
  )
}
