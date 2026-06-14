'use client';

/**
 * LotusWorld — the /lotus flower-world for holoscript.net v2.
 *
 * Renders the THREE pre-worked lotus `.holo` scenes (switchable; default = pond),
 * compiled by HoloScript at build time (scripts/bake-lotus-scenes.ts) and drawn
 * here with ONLY three / @react-three/fiber / @react-three/drei — the runtime
 * bundle never imports @holoscript/core or r3f-renderer (Railway deploy contract).
 *
 *  • Scene switcher (pond / paper flower / baseline).
 *  • Locomotion: WebXR offset-reference-space (left=glide, right=snap-turn,
 *    point+trigger=teleport), desktop pointer-look + WASD fly, touch joystick.
 *  • Honest bloom overlay (F.037): the paper-flower's petals open/wilt from REAL
 *    live paper-audit health — 2 petals visibly wilt because the papers earn it.
 *
 * SSR-safe: client-only ('use client' + dynamic import {ssr:false} from the page).
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import type { BakedScene } from './bakedTypes';
import { LOTUS_SCENES } from './bakedTypes';
import { PondScene } from './PondScene';
import { PaperFlowerScene } from './PaperFlowerScene';
import { SymbolicScene } from './SymbolicScene';
import { VRLocomotion, DesktopTouchControls } from './locomotion';
import { TouchJoystick } from './TouchJoystick';
import { BloomLegend } from './BloomLegend';

type Mode = 'orbit' | 'fly';

function SceneBody({ scene }: { scene: BakedScene }) {
  if (scene.kind === 'pond') return <PondScene scene={scene} />;
  if (scene.kind === 'paper-flower') return <PaperFlowerScene scene={scene} />;
  return <SymbolicScene scene={scene} />;
}

/**
 * Named export so the HoloScript NextJSCompiler's slot import
 * (`import { LotusWorld } from '@/components/lotus/LotusWorld'`) resolves. Also
 * exported as default for direct/dynamic imports.
 */
export function LotusWorld() {
  // SSR-safety: the compiled page is `'use client'` but Next still does a server
  // render pass — <Canvas>/WebGL cannot run there. Mount the 3D only after the
  // client hydrates; until then show a neutral seedpod loader (never a fake bloom).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [sceneId, setSceneId] = useState<string>('pond');
  const [scene, setScene] = useState<BakedScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('orbit');
  const [xrSupported, setXrSupported] = useState(false);
  const [inXR, setInXR] = useState(false);

  const active = LOTUS_SCENES.find((s) => s.id === sceneId) ?? LOTUS_SCENES[0];

  // Load the baked scene JSON when the selection changes.
  useEffect(() => {
    let alive = true;
    setScene(null);
    setError(null);
    fetch(active.file)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: BakedScene) => {
        if (alive) setScene(data);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [active.file]);

  // Detect WebXR immersive-VR support.
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) return;
    xr.isSessionSupported('immersive-vr').then(
      (ok) => setXrSupported(ok),
      () => setXrSupported(false)
    );
  }, []);

  // Enter VR — start an immersive-vr session and hand it to the renderer. The
  // renderer is captured on Canvas onCreated.
  const rendererRef = useState<{ current: import('three').WebGLRenderer | null }>(() => ({
    current: null,
  }))[0];

  const enterVR = useCallback(async () => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    const renderer = rendererRef.current;
    if (!xr || !renderer) return;
    try {
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      await renderer.xr.setSession(session as XRSession);
      setInXR(true);
      session.addEventListener('end', () => setInXR(false));
    } catch (e) {
      setError(`Could not start VR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [rendererRef]);

  const cam = scene?.camera ?? { position: [0, 3, 7] as [number, number, number], target: [0, 0.5, 0] as [number, number, number] };

  if (!mounted) {
    return (
      <div
        className="relative flex w-full items-center justify-center"
        style={{ height: '70vh', minHeight: 460 }}
      >
        <p className="text-sm text-gray-400">loading the lotus world…</p>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: '70vh', minHeight: 460 }}>
      {/* ── Scene switcher ── */}
      <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2">
        {LOTUS_SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSceneId(s.id)}
            title={s.blurb}
            className={`rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur transition ${
              s.id === sceneId
                ? 'bg-fuchsia-500/80 text-white'
                : 'bg-white/10 text-gray-200 hover:bg-white/20'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Mode + Enter VR ── */}
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'orbit' ? 'fly' : 'orbit'))}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-gray-200 backdrop-blur hover:bg-white/20"
        >
          {mode === 'orbit' ? 'Orbit' : 'Fly (WASD / joystick)'}
        </button>
        {xrSupported && (
          <button
            type="button"
            onClick={enterVR}
            className="rounded-full bg-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-cyan-400"
          >
            {inXR ? 'In VR' : 'Enter VR'}
          </button>
        )}
      </div>

      {/* ── Honest bloom legend (paper flower only) ── */}
      {scene?.kind === 'paper-flower' && <BloomLegend scene={scene} />}

      {error && (
        <div className="absolute inset-x-0 top-1/2 z-20 text-center text-xs text-red-400">
          Failed to load the lotus world: {error}
        </div>
      )}

      <Canvas
        key={sceneId}
        camera={{ position: cam.position, fov: 45 }}
        dpr={[1, 1.75]}
        shadows
        gl={{ antialias: true, alpha: false }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          rendererRef.current = gl as import('three').WebGLRenderer;
        }}
      >
        {/* Lighting rig — matches the v1 LotusCompiledCanvas photoreal pass. */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 12, 7]}
          intensity={2.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={40}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        <directionalLight position={[-6, 8, -4]} intensity={0.9} color="#b8d4f0" />
        <directionalLight position={[0, -4, 6]} intensity={0.35} color="#7a4fb5" />
        <Environment preset="dawn" />
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.5}
          scale={28}
          blur={2.5}
          far={12}
          color="#1a0030"
        />

        {/* Orbit controls for the desktop look-around mode (disabled in fly/VR). */}
        {mode === 'orbit' && !inXR && (
          <OrbitControls
            target={cam.target}
            enablePan={false}
            minDistance={2}
            maxDistance={22}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2.05}
          />
        )}

        {/* Desktop/touch fly rig. */}
        <DesktopTouchControls target={cam.target} enabled={mode === 'fly' && !inXR} />

        {/* WebXR offset-reference-space locomotion (active in an XR session). */}
        <VRLocomotion />

        <Suspense fallback={<LoadingSeedpod />}>
          {scene && <SceneBody scene={scene} />}
        </Suspense>
      </Canvas>

      {/* Touch joystick + look pad (mobile). Always mounted in fly mode. */}
      {mode === 'fly' && !inXR && <TouchJoystick />}

      {!scene && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-sm text-gray-400">loading the lotus world…</p>
        </div>
      )}
    </div>
  );
}

/** A neutral seedpod loader — never a fake full-bloom image. */
function LoadingSeedpod() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 12]} />
      <meshStandardMaterial color="#3a5a40" roughness={0.8} />
    </mesh>
  );
}

export default LotusWorld;
