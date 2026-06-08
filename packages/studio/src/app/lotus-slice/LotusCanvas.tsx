'use client';

/**
 * LotusCanvas — a generic `.holo` VIEWER for the I.007 pond.
 *
 * The scene is NOT in this file. It is authored in `public/scenes/lotus-pond.holo`
 * and fetched at runtime, then compiled to an R3F tree by R3FCompiler (via
 * useScenePipeline) and drawn by the generic <R3FNodeRenderer>. This component only
 * provides the VIEWER — the camera rig, lights, environment, and cinematic post — and
 * renders whatever `.holo` it is handed. To change the scene, edit the `.holo` file;
 * nothing here is lotus-specific.
 *
 * (Why client-only via dynamic import in page.tsx: on a statically-prerendered Next
 * page `react-use-measure` reports 0×0 and R3F never creates its GL root — the W.671
 * blank-canvas failure. Mounting client-only gives the container a real measured size.)
 */
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  Lightformer,
  ContactShadows,
} from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, Vignette, SMAA } from '@react-three/postprocessing';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { R3FNodeRenderer } from '@/components/scene/R3FNodeRenderer';

/** The scene lives here — a real .holo file, fetched and compiled at runtime. */
const SCENE_URL = '/scenes/lotus-pond.holo';

export default function LotusCanvas() {
  const [holo, setHolo] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(SCENE_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (alive) setHolo(text);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const { r3fTree, errors } = useScenePipeline(holo, { formatHint: 'holo' });

  return (
    <>
      {loadError && (
        <pre style={{ color: '#ff8080', fontSize: 12 }} data-testid="scene-load-error">
          Failed to load {SCENE_URL}: {loadError}
        </pre>
      )}
      {errors.length > 0 && (
        <pre style={{ color: '#ff8080', fontSize: 12 }} data-testid="compile-errors">
          {errors.map((e) => e.message).join('\n')}
        </pre>
      )}
      <div
        style={{
          width: 720,
          height: 720,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #222',
        }}
        data-testid="lotus-canvas"
      >
        <Canvas
          gl={{ preserveDrawingBuffer: true, alpha: false }}
          dpr={[1, 2]}
          style={{ width: '720px', height: '720px' }}
          resize={{ debounce: 0, scroll: false }}
        >
          <color attach="background" args={['#0a0a12']} />
          {/* Fog matched to the background so the water plane's far edge fades into it
              instead of forming a hard horizon seam. */}
          <fog attach="fog" args={['#0a0a12', 9, 26]} />
          <PerspectiveCamera makeDefault position={[0, 4.6, 9.5]} fov={46} />
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            target={[0, 2.1, 0]}
            autoRotate
            autoRotateSpeed={0.6}
          />

          {/* Geometry-based environment (no HDRI fetch → can't hang headless) so the
              petals' SSS and the water reflect a soft sky. */}
          <Environment resolution={256} background={false}>
            <Lightformer intensity={2.2} position={[0, 5, 3]} scale={[8, 8, 1]} color="#fff2f7" />
            <Lightformer intensity={1.1} position={[-4, 2, -2]} scale={[5, 5, 1]} color="#ffd6ea" />
            <Lightformer intensity={0.7} position={[4, 1, 2]} scale={[5, 5, 1]} color="#dfe9ff" />
            <Lightformer
              intensity={0.4}
              position={[0, -3, 0]}
              scale={[10, 10, 1]}
              color="#0a1a14"
            />
          </Environment>

          <hemisphereLight args={['#ffe6f0', '#0c1c16', 0.85]} />
          <ambientLight intensity={0.3} />
          <directionalLight position={[3, 5, 4]} intensity={1.0} />
          <directionalLight position={[-3, 5, 4]} intensity={1.0} color="#ffe0ee" />
          <pointLight position={[0, 3, 3]} intensity={2.0} distance={12} color="#fff0f6" />

          <ContactShadows
            position={[0, 0.04, 0]}
            scale={16}
            blur={2.6}
            far={6}
            opacity={0.55}
            color="#040d09"
            resolution={512}
          />

          {r3fTree ? <R3FNodeRenderer node={r3fTree} /> : null}

          {/* Cinematic post: hero bloom sharp, pond falls into bokeh, SSS glow lifted. */}
          <EffectComposer multisampling={0}>
            <DepthOfField target={[0, 2.4, 0]} focalLength={0.022} bokehScale={2.2} height={640} />
            <Bloom intensity={0.22} luminanceThreshold={0.82} luminanceSmoothing={0.2} mipmapBlur />
            <Vignette eskil={false} offset={0.3} darkness={0.62} />
            <SMAA />
          </EffectComposer>
        </Canvas>
      </div>
    </>
  );
}
