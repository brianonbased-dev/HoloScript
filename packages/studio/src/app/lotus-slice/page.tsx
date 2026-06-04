'use client';

/**
 * /lotus-slice — I.007 render proof (browser-verified vertical slice).
 *
 * Compiles a minimal `@botanical_lotus` `.holo` through the real scene pipeline
 * (parser → R3FCompiler → R3FNode tree) and renders it. The lotus node carries a
 * material spec the compiler built from `.holo` data (props.__compiledMaterial);
 * R3FNodeRenderer routes it to CompiledTraitMesh, which constructs the petal
 * material — physical PBR + spliced vein/profile/subsurface shader chunks — with
 * NO hand-authored material setup. This is the page that proves "compile the lotus
 * renderer from `.holo`" produces real pixels.
 *
 * The R3F canvas lives in LotusCanvas, dynamic-imported with ssr:false so it mounts
 * only after client layout (avoids the W.671 static-prerender 0×0 measure bug).
 */
import dynamic from 'next/dynamic';

const LotusCanvas = dynamic(() => import('./LotusCanvas'), {
  ssr: false,
  loading: () => <div style={{ width: 720, height: 720 }} data-testid="lotus-loading" />,
});

export default function LotusSlicePage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0a0a12', color: '#eee', padding: 24 }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>I.007 — lotus petal compiled from .holo</h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        Material built by R3FCompiler from <code>@botanical_lotus</code> → CompiledTraitMesh.
        No hand-authored material.
      </p>
      <LotusCanvas />
    </main>
  );
}
