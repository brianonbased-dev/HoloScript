import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { KeyRound, RefreshCw } from 'lucide-react';
import type { Mesh } from 'three';

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

const CLUSTER_LABELS: Record<LotusCluster, string> = {
  roots: 'Roots',
  p1: 'Simulation & Agents',
  p2: 'Animation',
  p3: 'Language',
  center: 'Center',
};

const FALLBACK_COLORS: Record<LotusBloomState, string> = {
  sealed: '#64748b',
  budding: '#f59e0b',
  blooming: '#38bdf8',
  full: '#34d399',
  wilted: '#ef4444',
};

function isTeamPetal(petal: LotusPetal): petal is LotusTeamPetal {
  return 'paper_id' in petal;
}

function PetalMesh({
  petal,
  total,
}: {
  petal: LotusPetal;
  total: number;
}) {
  const meshRef = useRef<Mesh>(null);
  const angle = (Math.PI * 2 * petal.index) / Math.max(total, 1);
  const clusterRadius: Record<LotusCluster, number> = {
    roots: 0.95,
    p1: 2.1,
    p2: 1.55,
    p3: 1.15,
    center: 0,
  };
  const radius = clusterRadius[petal.cluster] + (petal.cluster === 'p1' ? (petal.index % 2) * 0.18 : 0);
  const color = petal.color || FALLBACK_COLORS[petal.state];

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = Math.sin(clock.elapsedTime * 1.2 + petal.index) * 0.025;
    meshRef.current.scale.set(0.54 + pulse, 1.16 + pulse, 1);
  });

  if (petal.cluster === 'center') {
    return (
      <mesh ref={meshRef} position={[0, 0, 0.08]}>
        <circleGeometry args={[0.55, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
    );
  }

  return (
    <mesh
      ref={meshRef}
      position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
      rotation={[0, 0, angle - Math.PI / 2]}
    >
      <circleGeometry args={[0.5, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.76} />
    </mesh>
  );
}

function LotusCanvas({ petals }: { petals: LotusPetal[] }) {
  return (
    <Canvas camera={{ position: [0, 0, 6.8], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={['#05050a']} />
      <group>
        {petals.map((petal) => (
          <PetalMesh key={`${petal.cluster}-${petal.index}`} petal={petal} total={petals.length} />
        ))}
      </group>
    </Canvas>
  );
}

async function fetchLotus(signal: AbortSignal): Promise<LotusResponse> {
  const bearer = window.localStorage.getItem('holomesh_bearer')?.trim();
  const res = await fetch('/api/lotus', {
    signal,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
  });
  if (!res.ok) throw new Error(`Lotus API returned ${res.status}`);
  return res.json() as Promise<LotusResponse>;
}

export default function LotusProgram() {
  const [lotus, setLotus] = useState<LotusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchLotus(controller.signal)
      .then((data) => {
        setLotus(data);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Lotus API unavailable');
      });
    return () => controller.abort();
  }, [refreshKey]);

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
    <section className="relative z-10 w-full border-y border-white/10 bg-[#05050a]/90 py-20">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="h-[380px] min-h-[320px] overflow-hidden rounded-lg border border-white/10 bg-black/40 shadow-[0_0_50px_rgba(52,211,153,0.10)]">
          {lotus ? (
            <LotusCanvas petals={lotus.petals} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              {error ?? 'Loading Lotus'}
            </div>
          )}
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
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
              onClick={() => setRefreshKey((value) => value + 1)}
              title="Refresh Lotus data"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <h2 className="mb-5 text-3xl font-bold text-white md:text-4xl">
            The papers bloom from the same proof root.
          </h2>
          <p className="mb-8 max-w-2xl text-lg leading-relaxed text-gray-300">
            Lotus tracks the research program as a living artifact: roots, petals, stalk, and center all compile back to provenance-bearing HoloScript evidence.
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
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width: lotus
                    ? `${Math.round((lotus.readiness.fullPetals / Math.max(lotus.readiness.totalPetals, 1)) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            {featured && (
              <p className="mt-4 text-sm leading-relaxed text-gray-300">
                {featured.label} is {featured.state}: {featured.reason}
              </p>
            )}
            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
