import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyRound, Pause, Play, RefreshCw } from 'lucide-react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { Color, Vector3 } from 'three';

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

interface ScenePetal {
  index: number;
  ring: 1 | 2 | 3;
  ringIndex: number;
  angle: number;
  radius: number;
  length: number;
  width: number;
  color: string;
  bloom: LotusBloomState;
  label: string;
}

interface PollenParticle {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  size: number;
  color: string;
}

const CLUSTER_LABELS: Record<LotusCluster, string> = {
  roots: 'Roots',
  p1: 'Simulation & Agents',
  p2: 'Animation',
  p3: 'Language',
  center: 'Center',
};

const FALLBACK_COLORS: Record<LotusBloomState, string> = {
  sealed: '#261033',
  budding: '#7c3aed',
  blooming: '#a855f7',
  full: '#d946ef',
  wilted: '#ef4444',
};

const GOLDEN_ANGLE = (137.50776 * Math.PI) / 180;
const GROWTH_SECONDS = 12.5;
const LOTUS_SEED = 0x0000dead;
const GrowthProgressContext = createContext<MutableRefObject<number> | null>(null);

function isTeamPetal(petal: LotusPetal): petal is LotusTeamPetal {
  return 'paper_id' in petal;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function phase(cycle: number, start: number, end: number) {
  return smoothstep((cycle - start) / Math.max(end - start, 0.0001));
}

function GrowthClock({
  paused,
  reducedMotion,
  restartKey,
  children,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
  children: ReactNode;
}) {
  const progressRef = useRef(reducedMotion ? 1 : 0);

  useEffect(() => {
    progressRef.current = reducedMotion ? 1 : 0;
  }, [reducedMotion, restartKey]);

  useFrame((_, delta) => {
    if (reducedMotion) {
      progressRef.current = 1;
      return;
    }
    if (!paused) progressRef.current = Math.min(1, progressRef.current + delta / GROWTH_SECONDS);
  });

  return <GrowthProgressContext.Provider value={progressRef}>{children}</GrowthProgressContext.Provider>;
}

function useGrowthProgressRef() {
  const progressRef = useContext(GrowthProgressContext);
  if (!progressRef) throw new Error('Lotus growth components must be rendered inside GrowthClock');
  return progressRef;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildSeedablePetals(): ScenePetal[] {
  const rings = [
    { ring: 1 as const, count: 8, radius: 1.08, length: 0.96, width: 0.3 },
    { ring: 2 as const, count: 13, radius: 1.86, length: 1.08, width: 0.28 },
    { ring: 3 as const, count: 21, radius: 2.55, length: 1, width: 0.23 },
  ];
  let index = 0;
  const petals: ScenePetal[] = [];
  for (const ring of rings) {
    for (let ringIndex = 0; ringIndex < ring.count; ringIndex += 1) {
      const angle = index * GOLDEN_ANGLE;
      const isRootPaper = index === 0;
      const bloom: LotusBloomState =
        ring.ring === 3 ? 'sealed' : isRootPaper ? 'full' : ring.ring === 1 ? 'budding' : 'sealed';
      petals.push({
        index,
        ring: ring.ring,
        ringIndex,
        angle,
        radius: ring.radius,
        length: ring.length,
        width: ring.width,
        color: isRootPaper ? '#fef3c7' : ring.ring === 1 ? '#f0abfc' : ring.ring === 2 ? '#d946ef' : '#8b5cf6',
        bloom,
        label: `P${ring.ring}.${ringIndex}`,
      });
      index += 1;
    }
  }
  return petals;
}

function buildPollen(): PollenParticle[] {
  const rand = seededRandom(LOTUS_SEED);
  return Array.from({ length: 180 }, (_, index) => ({
    angle: rand() * Math.PI * 2,
    radius: 0.4 + Math.sqrt(rand()) * 3.4,
    height: 0.75 + rand() * 2.7,
    speed: 0.12 + rand() * 0.34,
    size: 0.012 + rand() * 0.024,
    color: index % 7 === 0 ? '#fde68a' : '#f59e0b',
  }));
}

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

function GrowthPetal({ petal, paused, reducedMotion }: { petal: ScenePetal; paused: boolean; reducedMotion: boolean }) {
  const progressRef = useGrowthProgressRef();
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const baseColor = useMemo(() => new Color(petal.color), [petal.color]);
  const delay = 0.42 + petal.index * 0.006 + petal.ring * 0.035;

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;
    const cycle = progressRef.current;
    const grow = phase(cycle, delay, delay + 0.22);
    const breathe = reducedMotion || paused ? 0 : Math.sin(clock.elapsedTime * 1.1 + petal.index) * 0.025;
    const radial = petal.radius * (0.04 + grow * 0.96);
    const lift = -0.08 + grow * (1.28 + petal.ring * 0.08);
    const curl = (1 - grow) * 0.56 + Math.sin(clock.elapsedTime * 0.7 + petal.index) * 0.035 * grow;
    const opacityBase = petal.bloom === 'sealed' ? 0.62 : petal.bloom === 'full' ? 0.98 : 0.82;

    meshRef.current.position.set(Math.cos(petal.angle) * radial, lift, Math.sin(petal.angle) * radial);
    meshRef.current.rotation.set(0.72 - grow * 0.52, -petal.angle, curl);
    meshRef.current.scale.set(
      (petal.length + breathe) * grow,
      0.055 + grow * 0.018,
      (petal.width + breathe * 0.35) * grow
    );
    materialRef.current.opacity = opacityBase * grow;
    materialRef.current.emissiveIntensity = (petal.bloom === 'full' ? 1.2 : petal.bloom === 'sealed' ? 0.08 : 0.36) * grow;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <sphereGeometry args={[1, 36, 16]} />
      <meshStandardMaterial
        ref={materialRef}
        color={baseColor}
        emissive={baseColor}
        roughness={0.48}
        metalness={0.04}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

function SeedAndStalk({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  const progressRef = useGrowthProgressRef();
  const seedRef = useRef<Group>(null);
  const seedLeftRef = useRef<Mesh>(null);
  const seedRightRef = useRef<Mesh>(null);
  const stalkRef = useRef<Mesh>(null);
  const centerRef = useRef<Mesh>(null);
  const leafLeftRef = useRef<Mesh>(null);
  const leafRightRef = useRef<Mesh>(null);
  const lightColumnRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const cycle = progressRef.current;
    const sprout = phase(cycle, 0.1, 0.28);
    const stalk = phase(cycle, 0.18, 0.42);
    const center = phase(cycle, 0.34, 0.54);
    const seedOpen = phase(cycle, 0.04, 0.2);
    const genesis = phase(cycle, 0.78, 1) * 0.28;

    if (seedRef.current) {
      seedRef.current.position.y = -1.08 + seedOpen * 0.08;
      seedRef.current.scale.setScalar(1 - seedOpen * 0.22);
      seedRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.05;
    }
    if (seedLeftRef.current) {
      seedLeftRef.current.position.set(-0.08 - seedOpen * 0.14, 0, 0);
      seedLeftRef.current.rotation.set(0.24, 0.02, -0.25 - seedOpen * 0.42);
    }
    if (seedRightRef.current) {
      seedRightRef.current.position.set(0.08 + seedOpen * 0.14, 0, 0);
      seedRightRef.current.rotation.set(-0.18, -0.02, 0.25 + seedOpen * 0.42);
    }
    if (stalkRef.current) {
      stalkRef.current.position.y = -1.2 + stalk * 1.25;
      stalkRef.current.scale.set(1, 0.08 + stalk * 2.65, 1);
    }
    if (centerRef.current) {
      centerRef.current.position.y = -0.72 + center * 1.95;
      centerRef.current.scale.setScalar(0.05 + center * 0.58);
      centerRef.current.rotation.y = clock.elapsedTime * 0.3;
    }
    if (leafLeftRef.current) {
      leafLeftRef.current.position.set(-0.22 - sprout * 0.42, -0.52 + sprout * 0.42, 0.04);
      leafLeftRef.current.rotation.set(0.2, 0.15, 0.72 - sprout * 0.22);
      leafLeftRef.current.scale.set(0.36 * sprout, 0.055, 0.14 * sprout);
    }
    if (leafRightRef.current) {
      leafRightRef.current.position.set(0.22 + sprout * 0.42, -0.42 + sprout * 0.36, -0.04);
      leafRightRef.current.rotation.set(-0.12, -0.15, -0.72 + sprout * 0.22);
      leafRightRef.current.scale.set(0.34 * sprout, 0.055, 0.13 * sprout);
    }
    if (lightColumnRef.current) {
      lightColumnRef.current.scale.set(0.14 + genesis * 0.5, 1 + genesis * 4.5, 0.14 + genesis * 0.5);
      lightColumnRef.current.position.y = 1.8 + genesis * 2;
      const material = lightColumnRef.current.material;
      if (!Array.isArray(material)) material.opacity = genesis;
    }
  });

  return (
    <group>
      <group ref={seedRef}>
        <mesh ref={seedLeftRef} castShadow>
          <sphereGeometry args={[0.26, 32, 16]} />
          <meshStandardMaterial color="#9a5d24" emissive="#f59e0b" emissiveIntensity={0.18} roughness={0.75} metalness={0.02} />
        </mesh>
        <mesh ref={seedRightRef} castShadow>
          <sphereGeometry args={[0.26, 32, 16]} />
          <meshStandardMaterial color="#6f3f1d" emissive="#f97316" emissiveIntensity={0.14} roughness={0.8} metalness={0.02} />
        </mesh>
      </group>

      <mesh ref={stalkRef} castShadow>
        <cylinderGeometry args={[0.045, 0.085, 1, 24]} />
        <meshStandardMaterial color="#2f9b5f" emissive="#0c3b22" emissiveIntensity={0.2} roughness={0.52} />
      </mesh>

      <mesh ref={leafLeftRef} castShadow>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color="#2dd46f" emissive="#14532d" emissiveIntensity={0.18} roughness={0.58} />
      </mesh>
      <mesh ref={leafRightRef} castShadow>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color="#20b965" emissive="#14532d" emissiveIntensity={0.14} roughness={0.58} />
      </mesh>

      <mesh ref={centerRef} castShadow>
        <sphereGeometry args={[1, 40, 20]} />
        <meshStandardMaterial color="#fff7ed" emissive="#d946ef" emissiveIntensity={0.58} roughness={0.25} />
      </mesh>

      <mesh ref={lightColumnRef}>
        <cylinderGeometry args={[1, 1, 1, 48, 1, true]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PollenField({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  const progressRef = useGrowthProgressRef();
  const groupRef = useRef<Group>(null);
  const particles = useMemo(buildPollen, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pollen = phase(progressRef.current, 0.46, 0.82);
    groupRef.current.visible = pollen > 0.02;
    groupRef.current.scale.setScalar(0.18 + pollen * 0.82);
    if (!reducedMotion && !paused) groupRef.current.rotation.y = clock.elapsedTime * 0.045;
  });

  return (
    <group ref={groupRef} scale={0} visible={false}>
      {particles.map((particle, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(particle.angle) * particle.radius,
            particle.height + Math.sin(index * 0.7) * 0.16,
            Math.sin(particle.angle) * particle.radius,
          ]}
          scale={particle.size}
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={particle.color} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function LotusWorld({
  paused,
  reducedMotion,
  restartKey,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
}) {
  const rootRef = useRef<Group>(null);
  const petals = useMemo(buildSeedablePetals, []);

  useFrame(({ clock }) => {
    if (!rootRef.current || reducedMotion || paused) return;
    rootRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.14) * 0.08;
  });

  return (
    <>
      <color attach="background" args={['#05030a']} />
      <fog attach="fog" args={['#05030a', 6.5, 13]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[3.4, 5.8, 4.2]} intensity={1.8} castShadow />
      <pointLight position={[0, 1.2, 2.2]} color="#d946ef" intensity={1.8} distance={7} />
      <pointLight position={[-2.8, 0.8, -3]} color="#f59e0b" intensity={0.62} distance={7} />

      <GrowthClock paused={paused} reducedMotion={reducedMotion} restartKey={restartKey}>
        <group ref={rootRef} position={[0, 0, 0]} rotation={[0.12, 0, 0]}>
          <mesh position={[0, -1.34, 0]} receiveShadow>
            <cylinderGeometry args={[3.8, 4.4, 0.12, 96]} />
            <meshStandardMaterial color="#120717" emissive="#21062e" emissiveIntensity={0.22} roughness={0.92} />
          </mesh>
          <SeedAndStalk paused={paused} reducedMotion={reducedMotion} />
          {petals.map((petal) => (
            <GrowthPetal key={petal.index} petal={petal} paused={paused} reducedMotion={reducedMotion} />
          ))}
          <PollenField paused={paused} reducedMotion={reducedMotion} />
        </group>
      </GrowthClock>
    </>
  );
}

function ResponsiveLotusCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    const compact = size.width < 520;
    camera.position.set(0, compact ? 2.18 : 2.25, compact ? 11.2 : 8.7);
    camera.lookAt(new Vector3(0, compact ? 0.18 : 0.32, 0));
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  return null;
}

function LotusGrowthScene({
  paused,
  reducedMotion,
  restartKey,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
}) {
  return (
    <Canvas
      camera={{ position: [0, 2.25, 8.7], fov: 45 }}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onCreated={({ camera }) => camera.lookAt(new Vector3(0, 0.32, 0))}
    >
      <ResponsiveLotusCamera />
      <LotusWorld paused={paused} reducedMotion={reducedMotion} restartKey={restartKey} />
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
  const sectionRef = useRef<HTMLElement>(null);
  const hasEnteredViewRef = useRef(false);
  const [lotus, setLotus] = useState<LotusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sceneKey, setSceneKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

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
    <section ref={sectionRef} className="relative z-10 w-full overflow-hidden border-y border-white/10 bg-[#05050a] py-16 md:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(168,85,247,0.12),transparent_42%,rgba(245,158,11,0.06))]" />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-5 md:px-6 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="relative h-[520px] min-h-[420px] overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_0_70px_rgba(168,85,247,0.16)] md:h-[640px]">
          <LotusGrowthScene paused={paused} reducedMotion={reducedMotion} restartKey={sceneKey} />
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
            Lotus starts as a deterministic genesis seed, opens a stalk, and unfurls the 8/13/21 Fibonacci petal rings into a living 3D research artifact.
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
