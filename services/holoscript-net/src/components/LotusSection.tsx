/**
 * LotusSection — the marketing section for the proof flower.
 *
 * Identical layout and data panel to the retired LotusProgram.tsx, but the canvas
 * now renders the `.holo`-compiled scene via LotusCompiledCanvas instead of the
 * 1399-line hand-authored LotusGrowthScene. This is the I.007 dogfooding closure:
 * the flagship proof-flower now compiles from `.holo` like any other HoloScript scene.
 *
 * The data panel (petal counts, readiness bar, live /api/lotus feed) is preserved
 * exactly — it is orthogonal to the 3D renderer and only reads the live API response
 * for the right-column metadata display.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Pause, Play, RefreshCw } from 'lucide-react';
import { LotusCompiledCanvas } from './LotusCompiledCanvas';
import { LOTUS_SCENE } from './lotus.scene.generated';

// ── Types (retained from LotusProgram.tsx for the data panel) ────────────────
type LotusBloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';
type LotusCluster = 'roots' | 'p1' | 'p2' | 'p3' | 'center';

interface LotusPetalBase {
  index: number;
  cluster: LotusCluster;
  state: LotusBloomState;
  color: string;
}

interface LotusTeamPetal extends LotusPetalBase {
  paper_id: string;
  label: string;
  venue: string;
  reason: string;
  measured: {
    hasDraft: boolean;
    stubCount: number;
    benchmarkTodoCount: number;
    otsAnchored: boolean;
    baseAnchored: boolean;
  };
}

type LotusPetal = LotusPetalBase | LotusTeamPetal;

interface LotusResponse {
  mode: 'A' | 'B';
  petals: LotusPetal[];
  readiness: {
    fullPetals: number;
    totalPetals: number;
    ready?: boolean;
  };
  metadata: {
    snapshot_at: string;
    disclosure: 'public' | 'team';
  };
}

// ── Constants ────────────────────────────────────────────────────────────────
const CLUSTER_LABELS: Record<LotusCluster, string> = {
  roots: 'Roots',
  p1: 'Simulation & Agents',
  p2: 'Animation',
  p3: 'Language',
  center: 'Center',
};

/** Fallback response built from the compiled scene data when the live feed is down. */
const SCENE_FALLBACK_RESPONSE: LotusResponse = {
  mode: 'B',
  petals: LOTUS_SCENE.petals.map((p) => ({
    index: p.index,
    cluster: p.ring === 1 ? 'p1' : p.ring === 2 ? 'p2' : 'p3',
    state: p.bloom,
    color: p.color,
  })) as LotusPetal[],
  readiness: {
    fullPetals: LOTUS_SCENE.petals.filter((p) => p.bloom === 'full').length,
    totalPetals: LOTUS_SCENE.petals.length,
  },
  metadata: { snapshot_at: 'compiled:0x0000DEAD', disclosure: 'public' },
};

function isTeamPetal(petal: LotusPetal): petal is LotusTeamPetal {
  return 'paper_id' in petal;
}

// ── Hooks ────────────────────────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

async function fetchLotus(signal: AbortSignal): Promise<LotusResponse> {
  const bearer = window.localStorage.getItem('holomesh_bearer')?.trim();
  const res = await fetch('/api/lotus', {
    signal,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
  });
  if (!res.ok) throw new Error(`Lotus API returned ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Lotus API returned non-JSON (no live feed)');
  }
  return res.json() as Promise<LotusResponse>;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function LotusSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const hasEnteredViewRef = useRef(false);
  const [lotus, setLotus] = useState<LotusResponse>(SCENE_FALLBACK_RESPONSE);
  const [usingFallback, setUsingFallback] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sceneKey, setSceneKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetchLotus(controller.signal)
      .then((data) => {
        setLotus(data);
        setUsingFallback(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLotus(SCENE_FALLBACK_RESPONSE);
        setUsingFallback(true);
      });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasEnteredViewRef.current) return;
        hasEnteredViewRef.current = true;
        setSceneKey((value) => value + 1);
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const clusterCounts = useMemo(() => {
    const counts: Record<LotusCluster, number> = { roots: 0, p1: 0, p2: 0, p3: 0, center: 0 };
    for (const petal of lotus?.petals ?? []) counts[petal.cluster]++;
    return counts;
  }, [lotus]);

  const featured = lotus?.petals.find(isTeamPetal) ?? null;

  const handleTeamKey = () => {
    const existing = window.localStorage.getItem('holomesh_bearer') ?? '';
    const next = window.prompt('Team bearer token', existing);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed) window.localStorage.setItem('holomesh_bearer', trimmed);
    else window.localStorage.removeItem('holomesh_bearer');
    setRefreshKey((value) => value + 1);
  };

  return (
    <section
      ref={sectionRef}
      className="relative z-10 w-full overflow-hidden border-y border-white/10 bg-[#05050a] py-16 md:py-20"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(168,85,247,0.12),transparent_42%,rgba(245,158,11,0.06))]" />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-5 md:px-6 lg:grid-cols-[1.18fr_0.82fr]">
        {/* Left column: compiled lotus canvas */}
        <div className="relative h-[520px] min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_0_70px_rgba(168,85,247,0.16)] md:h-[640px]">
          <LotusCompiledCanvas paused={paused} reducedMotion={reducedMotion} restartKey={sceneKey} />
          <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-100 backdrop-blur-md">
            Seed 0x0000DEAD
          </div>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            title={paused ? 'Resume Lotus growth animation' : 'Pause Lotus growth animation'}
            className="absolute bottom-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-white/10"
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setSceneKey((value) => value + 1)}
            title="Replay Lotus seed growth animation"
            className="absolute bottom-4 left-4 inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-black/50 text-white backdrop-blur-md hover:bg-white/10"
          >
            <RefreshCw size={17} />
          </button>
        </div>

        {/* Right column: data panel (unchanged) */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-sm font-semibold text-violet-100">
              Lotus {lotus?.mode === 'A' ? 'Team' : 'Public'}
            </span>
            <button
              type="button"
              onClick={handleTeamKey}
              title="Set team bearer token"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            >
              <KeyRound size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setRefreshKey((value) => value + 1);
                setSceneKey((value) => value + 1);
              }}
              title="Refresh Lotus data"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <h2 className="mb-5 text-3xl font-bold leading-tight text-white md:text-4xl">
            The seed grows into the proof flower.
          </h2>
          <p className="mb-8 max-w-2xl text-lg leading-relaxed text-gray-300">
            Lotus starts as a deterministic genesis seed, opens a stalk, and unfurls the 8/13/21
            Fibonacci petal rings into a living 3D research artifact.
          </p>

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(CLUSTER_LABELS) as LotusCluster[]).map((cluster) => (
              <div key={cluster} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                <div className="text-2xl font-bold text-white">{clusterCounts[cluster]}</div>
                <div className="text-xs text-gray-400">{CLUSTER_LABELS[cluster]}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm text-gray-300">
              <span>Bloom readiness</span>
              <span>
                {lotus?.readiness.fullPetals ?? 0}/{lotus?.readiness.totalPetals ?? 0}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-fuchsia-400"
                style={{
                  width: lotus
                    ? `${Math.round((lotus.readiness.fullPetals / Math.max(lotus.readiness.totalPetals, 1)) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            {featured && (
              <p className="mt-4 text-sm leading-relaxed text-gray-300">
                {(featured as LotusTeamPetal).label} is {featured.state}:{' '}
                {(featured as LotusTeamPetal).reason}
              </p>
            )}
            {usingFallback && (
              <p className="mt-4 text-xs leading-relaxed text-gray-500">
                Showing the compiled{' '}
                <span className="font-mono">0x0000DEAD</span> snapshot — live feed unavailable.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
