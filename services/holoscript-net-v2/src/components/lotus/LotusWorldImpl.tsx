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
import { OrbitControls, Environment, SoftShadows } from '@react-three/drei';
import {
  EffectComposer,
  Bloom,
  Vignette,
  DepthOfField,
  ToneMapping,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
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
 * The heavy 3D implementation. Imported lazily by the `LotusWorld` shell
 * (next/dynamic, ssr:false) so three / drei / postprocessing land in a separate
 * code-split chunk instead of the /lotus page bundle.
 */
export function LotusWorldImpl() {
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
        {/* ── Cinematic lighting rig ──
            Image-based light from a real HDRI (drei "sunset" preset) gives soft
            reflections + warm ambient; a soft KEY from upper-front, a strong warm
            RIM/BACK light low behind the flower to make the translucent petals glow
            (transmission + the subsurface shader read it), and a cool sky FILL. */}
        <Environment preset="sunset" environmentIntensity={0.65} />
        <SoftShadows size={26} samples={16} focus={0.85} />
        <hemisphereLight args={['#cfe6ff', '#1a3326', 0.35]} />
        {/* Key light — soft warm sun from upper front-left. */}
        <directionalLight
          position={[5, 11, 7]}
          intensity={2.3}
          color="#fff3e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-far={40}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        {/* Backlight / rim — low and BEHIND the flower, the lever that makes petals
            translucently glow (the #1 read in the reference photos). */}
        <spotLight
          position={[-2.5, 2.2, -6]}
          angle={0.9}
          penumbra={0.8}
          intensity={42}
          distance={26}
          color="#ffd0e8"
          target-position={[0, 1.4, 0]}
        />
        {/* Cool sky fill — opens the shadows without flattening. */}
        <directionalLight position={[-6, 7, 3]} intensity={0.55} color="#bcd6ff" />
        {/* Warm bounce from below (water + pads reflecting up into the cup). */}
        <pointLight position={[0, 0.4, 1.6]} intensity={2.2} distance={6} color="#ff9ec6" />

        {/* Orbit controls for the desktop look-around mode (disabled in fly/VR).
            Gentle auto-orbit shows off the petals' translucency as the rim light
            sweeps across them; it pauses the moment the user grabs the flower. */}
        {mode === 'orbit' && !inXR && (
          <OrbitControls
            target={cam.target}
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.45}
            enableDamping
            dampingFactor={0.08}
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

        {/* ── Post-processing: tasteful cinematic grade ──
            Bloom blooms the luminous petal centers + emissive seed-pod/stamens; a
            shallow DOF keeps the flower crisp and melts the pond into bokeh (the
            reference look); a soft vignette focuses the eye; ACES tone-map last.
            DISABLED in WebXR (the composer can't drive an XR swapchain) — the scene
            falls back to the renderer's own ACES tone mapping there. */}
        {!inXR && (
          <EffectComposer multisampling={4}>
            <DepthOfField
              focusDistance={0.012}
              focalLength={0.045}
              bokehScale={3.2}
              height={480}
            />
            <Bloom
              intensity={0.85}
              luminanceThreshold={0.62}
              luminanceSmoothing={0.22}
              mipmapBlur
              radius={0.72}
            />
            <Vignette eskil={false} offset={0.28} darkness={0.62} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
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

export default LotusWorldImpl;
