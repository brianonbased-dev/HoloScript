/**
 * LotusCompiledCanvas — the proof-flower canvas compiled from `.holo`.
 *
 * This is the compiled replacement for the hand-authored `LotusGrowthScene` that
 * lived in `LotusProgram.tsx`. It fetches `public/scenes/lotus-pond.holo`, parses
 * and compiles it via `useScenePipeline` (HoloScript parser → R3FCompiler → R3FNode
 * tree), and renders it with the generic `R3FNodeRenderer` — which routes
 * `@botanical_lotus` nodes to `CompiledLotusMeshNode` (compiled material + petal
 * geometry + phyllotaxis placement, all from the `.holo` declaration) and
 * `Timeline` nodes to `TimelineDriver` (plays `developmentalTime 0→1` so the
 * bloom grows without a hand-authored clock).
 *
 * The `.holo` file IS the scene. Change the pond by editing
 * `public/scenes/lotus-pond.holo`; nothing here is lotus-specific.
 *
 * Closes I.007 dogfooding gap: LotusProgram.tsx (1399L hand-authored) is deleted;
 * the flagship proof-flower now compiles from `.holo` like any other HoloScript scene.
 *
 * Camera rig + lighting kept identical to the retired LotusGrowthScene so the
 * marketing section looks unchanged.
 */
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3 } from 'three';
import { useScenePipeline } from '../hooks/useScenePipeline';
import { R3FNodeRenderer } from './R3FNodeRenderer';

const SCENE_URL = '/scenes/lotus-pond.holo';

/** Drop-in for LotusGrowthScene. Accepts the same paused/reducedMotion/restartKey
 *  props so the surrounding section can still pause + replay the bloom. */
export function LotusCompiledCanvas({
  paused,
  reducedMotion,
  restartKey,
}: {
  paused: boolean;
  reducedMotion: boolean;
  restartKey: number;
}) {
  const [holo, setHolo] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(SCENE_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (alive) setHolo(text);
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  // restartKey reloads the scene on replay button press
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey]);

  const { r3fTree, errors } = useScenePipeline(holo, { formatHint: 'holo' });

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-red-400">Failed to load lotus scene: {loadError}</p>
      </div>
    );
  }

  return (
    <Canvas
      key={restartKey}
      camera={{ position: [0, 3.02, 6.65], fov: 42 }}
      dpr={[1, 1.5]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(new Vector3(0, 0.52, 0));
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      {/* Camera rig matching the retired LotusGrowthScene (auto-rotate paused when
          reducedMotion is on or the user has paused the animation). */}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={!paused && !reducedMotion}
        autoRotateSpeed={0.45}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
      />

      {/* Lighting rig — matches photoreal pass from LotusProgram.tsx */}
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[5, 12, 7]}
        intensity={2.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={40}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-6, 8, -4]} intensity={0.9} color="#b8d4f0" />
      <directionalLight position={[0, -4, 6]} intensity={0.35} color="#7a4fb5" />
      <Environment preset="dawn" />
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.55}
        scale={20}
        blur={2.5}
        far={10}
        color="#1a0030"
      />

      {/* Error overlay if the .holo failed to parse */}
      {errors.length > 0 && (
        <mesh position={[0, 2, 0]}>
          <planeGeometry args={[4, 0.5]} />
          <meshBasicMaterial color="#ff4040" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Compiled scene — the entire pond + bloom + timeline from `.holo` */}
      {r3fTree && <R3FNodeRenderer node={r3fTree} />}
    </Canvas>
  );
}
