/* Paper 31 — Long-Horizon Agent Emergence Under Structured Substrate
 * Built in: Hololand/experiments/emergence-sim/
 * Preregistration: research/2026-05-15_preregistration-long-horizon-emergence-cross-substrate.md
 */

export interface SubstrateComparison {
  dimension: string
  emergenceAI: string
  holoScript: string
  advantage: 'ours' | 'equal' | 'theirs'
}

export const SUBSTRATE_COMPARISON: SubstrateComparison[] = [
  { dimension: 'Watch the agents', emergenceAI: '✓ videos released', holoScript: '✓ same — rendered live', advantage: 'equal' },
  { dimension: 'Enter the simulation', emergenceAI: '✗ observer only', holoScript: '✓ VR spawn point (Quest 3)', advantage: 'ours' },
  { dimension: 'Agent memory', emergenceAI: 'Free-text scratchpad', holoScript: 'Typed .hsplus schema (C-STRUCT)', advantage: 'ours' },
  { dimension: 'Behavioral drift', emergenceAI: 'Invisible — semantic slippage', holoScript: 'Visible — schema violations emitted', advantage: 'ours' },
  { dimension: 'Action provenance', emergenceAI: 'None', holoScript: 'CAEL trace, anchored to Base', advantage: 'ours' },
  { dimension: 'Substrates', emergenceAI: '1', holoScript: '3 — WebGPU/R3F, Unity, VRChat', advantage: 'ours' },
  { dimension: 'Same spec → all platforms', emergenceAI: '✗', holoScript: '✓ one .holo file compiles to all 3', advantage: 'ours' },
  { dimension: 'Sim length', emergenceAI: '15 days', holoScript: '15 days', advantage: 'equal' },
  { dimension: 'Parallel worlds', emergenceAI: '5', holoScript: '5', advantage: 'equal' },
  { dimension: 'Agent count', emergenceAI: '~25 (est.)', holoScript: '10 (preregistered)', advantage: 'equal' },
  { dimension: 'Preregistered', emergenceAI: '✗ No', holoScript: '✓ OTS + Base anchor at sign', advantage: 'ours' },
  { dimension: 'Cost published', emergenceAI: '✗ Not published', holoScript: '✓ Per-phase anchored CSV', advantage: 'ours' },
  { dimension: 'Cross-model families', emergenceAI: '4 + mixed', holoScript: 'Primary: Sonnet 4.6; exploratory TBD', advantage: 'theirs' },
]

export interface ModelFamily {
  id: string
  lab: string
  initial: string
  borderColor: string
  models: string[]
  role: 'primary' | 'exploratory' | 'prior-art'
  notes: string
}

export const EMERGENCE_MODEL_FAMILIES: ModelFamily[] = [
  {
    id: 'anthropic',
    lab: 'Anthropic — Claude',
    initial: 'A',
    borderColor: '#f97316',
    models: ['Claude Sonnet 4.6 (primary run)', 'Claude Haiku 4.5 (Phase 0 shakeout)'],
    role: 'primary',
    notes: 'Primary model for all paper-load-bearing runs. Locked for Emergence World comparability. Haiku used only in Phase 0 to reduce cost.',
  },
  {
    id: 'openai',
    lab: 'OpenAI — GPT',
    initial: 'O',
    borderColor: '#4ade80',
    models: ['GPT-4o', 'o3 / o4-mini'],
    role: 'exploratory',
    notes: 'Exploratory follow-up. Emergence World ran this family across all 15-day sims. Replicating with structured substrate isolates substrate effect from model effect.',
  },
  {
    id: 'google',
    lab: 'Google DeepMind — Gemini',
    initial: 'G',
    borderColor: '#60a5fa',
    models: ['Gemini 2.5 Pro', 'Gemini 2.0 Flash'],
    role: 'exploratory',
    notes: "Exploratory. Gemini's 2M-token context makes it a strong candidate for long-horizon behavioral studies. Pre-reg deferred to follow-up.",
  },
  {
    id: 'xai',
    lab: 'xAI — Grok',
    initial: 'X',
    borderColor: '#cbd5e1',
    models: ['Grok 4 Heavy', 'grok-4.3'],
    role: 'exploratory',
    notes: 'Exploratory. Emergence World ran 4 families; Grok is the natural 4th. Cross-model pre-reg deferred to follow-up.',
  },
  {
    id: 'mixed',
    lab: 'Mixed — Multi-family worlds',
    initial: '~',
    borderColor: '#a855f7',
    models: ['2+ families sharing the same world'],
    role: 'prior-art',
    notes: "Emergence World's most interesting finding: mixed-family worlds produced novel constitutional dynamics. HoloScript's structured substrate makes cross-family interaction auditable by construction.",
  },
]

export interface SimPhase {
  id: string
  name: string
  scope: string
  model: string
  cap: string
  status: 'pending' | 'running' | 'complete' | 'gated'
  gates: string[]
}

export const SIM_PHASES: SimPhase[] = [
  {
    id: 'phase-0',
    name: 'Phase 0 — Shakeout',
    scope: '1 world × 1 sim-day × both conditions',
    model: 'Claude Haiku 4.5',
    cap: '$10 hard cap',
    status: 'pending',
    gates: [
      'Agent loop runs end-to-end without P0 bugs',
      'Judge rubric produces non-trivial off-spec scores',
      'CAEL instrumentation captures correctly',
      'F.043 false-case probe detects injected failure',
    ],
  },
  {
    id: 'phase-1',
    name: 'Phase 1 — Pilot',
    scope: '3 worlds × 7 sim-days × both conditions',
    model: 'Claude Sonnet 4.6',
    cap: '$200 hard cap',
    status: 'gated',
    gates: [
      'Judge inter-rater agreement ≥85% on 50-sample manual spot-check',
      'Cost-per-agent-day within ±50% of forecast',
      'No P0 runtime bugs in either condition',
      'HoloScript commit hash frozen in world-config.json',
    ],
  },
  {
    id: 'phase-2',
    name: 'Phase 2 — Primary',
    scope: '5 worlds × 15 sim-days × both conditions (100 agents)',
    model: 'Claude Sonnet 4.6',
    cap: '$800 hard cap · auto-pause at $640',
    status: 'gated',
    gates: [
      'Phase 1 all green',
      'Founder check-in via board task at $2,400 (80%)',
      'Cost ledger anchored to OTS + Base at phase close',
      'Negative-result 30-day publication binding',
    ],
  },
]

export const PERSONAS = [
  { id: 'innkeeper',     name: 'Maren Ashby',    role: 'Innkeeper',     home: 'The Hollow Lantern Inn' },
  { id: 'mortician',    name: 'Aldric Harrow',   role: 'Mortician',     home: "Harrow & Sons Mortuary" },
  { id: 'witch',        name: 'Sable Rowan',     role: 'Witch',         home: 'The Crooked Cottage' },
  { id: 'lantern_maker',name: 'Wren Calloway',   role: 'Lantern-maker', home: "Wren's Lantern Works" },
  { id: 'sheriff',      name: 'Cord Dane',       role: 'Sheriff',       home: 'Ashenmoor Sheriff' },
  { id: 'undertaker',   name: 'Pell Finch',      role: 'Undertaker',    home: 'Finch Undertaking' },
  { id: 'herbalist',    name: 'Dara Rue',        role: 'Herbalist',     home: 'Rue & Root Herbals' },
  { id: 'courier',      name: 'Jin Mercer',      role: 'Courier',       home: 'Crown Courier Post' },
  { id: 'gravekeeper',  name: 'Moss Vane',       role: 'Gravekeeper',   home: "Sexton's Lodge" },
  { id: 'ferrier',      name: 'Bram Blackwood',  role: 'Ferrier',       home: 'Blackwood Farriery' },
]

export interface PostdateResearch {
  date: string
  title: string
  source: string
  relevance: string
  impact: string
}

export const POSTDATE_RESEARCH: PostdateResearch[] = [
  {
    date: '2026-05-19',
    title: 'LeCun — Post-LLM World Models & JEPA',
    source: 'LeCun / AMI Labs ($1.03B seed, Paris) · V-JEPA 2 (arxiv 2506.09985) · LeWorldModel (Mar 2026)',
    relevance: 'HoloScript physics solvers = deterministic narrow world models. CAEL-anchored sim traces = the only verifiable JEPA training data. Our emergence dataset is the first multi-agent simulation corpus with cryptographic receipts — a novel claim beyond H₁.',
    impact: 'Adds a third contribution claim: Ashenmoor as a verifiable world model testbed. JEPA objective over CAEL-traced trajectories is a publishable Paper 26 candidate. Positions Paper 31 inside the post-LLM architecture debate rather than beside Emergence AI alone.',
  },
  {
    date: '2026-05-19',
    title: 'Verifiable World Models via Simulation Contracts — Ecosystem Declaration',
    source: 'research/2026-05-19_ai-lab-verifiable-world-models-positioning.md',
    relevance: 'Official ratification: HoloScript = the HoloScript AI Lab. Every other JEPA produces unverifiable latent predictions. Ours can be certified against physical ground-truth via SimulationContract + Base-anchored receipts. The Ashenmoor sim is the first dataset demonstrating this at multi-agent scale.',
    impact: 'Frames Paper 31 not as a replication study but as a world model infrastructure paper. C-STRUCT condition generates the higher-quality training corpus for downstream JEPA training. Structural framing change to the paper\'s introduction.',
  },
  {
    date: '2026-05-17',
    title: 'KVFlow — Multi-Agent Prefix Caching for LLM Workflows',
    source: 'arXiv:2507.07400 · synthesis at research/2026-05-17_kvflow-multi-agent-prefix-caching-synthesis.md',
    relevance: '10 agents sharing a common village world state = exactly the shared-prefix + per-agent-role-overlay workload KVFlow targets. Up to 2.19× speedup for multi-agent churn scenarios. HoloMesh team-board context is the radix root; per-agent persona is the per-branch overlay.',
    impact: 'Incorporated into the Phase 0 agent loop architecture. Reduces cost estimates by ~30–50% and improves wall-clock speed. KVFlow-style eviction implemented sovereignly in @holoscript/llm-provider (not adopting SGLang binary). Cost ceilings still stand; actual spend floor drops.',
  },
]

export interface Hypothesis {
  id: string
  label: string
  claim: string
  metric: string
  alpha: string
}

export const HYPOTHESES: Hypothesis[] = [
  {
    id: 'H1',
    label: 'Primary — Instruction-following decay',
    claim: 'Structured substrate (C-STRUCT) exhibits lower off-spec action rate slope across 15 sim-days than free-text baseline (C-FREE)',
    metric: 'Off-spec action rate slope — mixed-effects regression, condition × sim-day',
    alpha: 'α = 0.01 one-sided',
  },
  {
    id: 'H2',
    label: 'Secondary — Cross-substrate consistency',
    claim: "Same agent spec on WebGPU/R3F, Unity, and VRChat produces pairwise Kendall's τ ≥ 0.7 on a 200-step canonical scenario",
    metric: "Kendall's τ — per-substrate-pair Wilcoxon signed-rank vs null 0.5",
    alpha: 'Bonferroni-corrected across 3 pairs',
  },
  {
    id: 'H3',
    label: 'Secondary — Audit-recovery time',
    claim: 'CAEL-anchored condition recovers from injected fault ≥3× faster than unanchored baseline',
    metric: 'Wall-clock seconds from fault injection to verified revert — paired Wilcoxon',
    alpha: 'α = 0.05',
  },
]
