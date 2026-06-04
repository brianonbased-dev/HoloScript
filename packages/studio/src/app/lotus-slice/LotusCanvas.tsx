'use client';

/**
 * LotusCanvas — the client-only R3F canvas for the I.007 render proof.
 *
 * Split out and dynamic-imported with `ssr: false` (see page.tsx) so the R3F
 * Canvas mounts ONLY after client layout. On a statically-prerendered Next page
 * `react-use-measure` reports 0×0 during prerender and R3F never creates its GL
 * root (the canvas stays at the default 300×150 and paints nothing) — the W.671
 * failure mode. Mounting client-only gives the container a real measured size.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { R3FNodeRenderer } from '@/components/scene/R3FNodeRenderer';

const LOTUS_SLICE_HOLO = `composition "LotusSlice" {
  object "petal" @botanical_lotus {
    mesh: "plane"
  }
}`;

export default function LotusCanvas() {
  const { r3fTree, errors } = useScenePipeline(LOTUS_SLICE_HOLO, { formatHint: 'holo' });

  return (
    <>
      {errors.length > 0 && (
        <pre style={{ color: '#ff8080', fontSize: 12 }} data-testid="compile-errors">
          {errors.map((e) => e.message).join('\n')}
        </pre>
      )}
      <div
        style={{ width: 720, height: 720, borderRadius: 8, overflow: 'hidden', border: '1px solid #222' }}
        data-testid="lotus-canvas"
      >
        <Canvas
          gl={{ preserveDrawingBuffer: true, alpha: false }}
          dpr={[1, 2]}
          style={{ width: '720px', height: '720px' }}
          resize={{ debounce: 0, scroll: false }}
        >
          <color attach="background" args={['#0a0a12']} />
          <PerspectiveCamera makeDefault position={[0, 4.6, 9.5]} fov={46} />
          <OrbitControls enableDamping dampingFactor={0.05} target={[0, 2.1, 0]} />

          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 4, 4]} intensity={1.6} />
          <directionalLight position={[-3, 2, 2]} intensity={0.8} color="#ffd0e8" />
          <pointLight position={[0, 2, 2]} intensity={3} distance={10} color="#fff0f6" />

          {r3fTree ? <R3FNodeRenderer node={r3fTree} /> : null}
        </Canvas>
      </div>
    </>
  );
}
