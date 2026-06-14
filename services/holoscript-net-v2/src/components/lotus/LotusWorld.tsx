'use client';

/**
 * LotusWorld — the /lotus flower-world entry point (CODE-SPLIT SHELL).
 *
 * The actual 3D world (three / @react-three/fiber / drei / postprocessing — the
 * heavy bundle) lives in `LotusWorldImpl`. This shell loads it via `next/dynamic`
 * with `ssr:false` so:
 *   • the WebGL <Canvas> never runs during Next's server render pass (SSR-safe), and
 *   • three + drei + postprocessing land in a SEPARATE code-split chunk instead of
 *     bloating the /lotus page's initial JS (lazy-loaded on the client only).
 *
 * The `LotusWorld` named export is the slot the HoloScript NextJSCompiler imports
 * (`import { LotusWorld } from '@/components/lotus/LotusWorld'`), so the contract
 * with the generated page is preserved.
 *
 * Honest bloom (F.037), real subsurface petal shader (I.007), and locomotion all
 * live in the impl — see LotusWorldImpl.tsx.
 */
import dynamic from 'next/dynamic';

const LotusWorldImpl = dynamic(
  () => import('./LotusWorldImpl').then((m) => m.LotusWorldImpl),
  {
    ssr: false,
    loading: () => (
      <div
        className="relative flex w-full items-center justify-center"
        style={{ height: '70vh', minHeight: 460 }}
      >
        <p className="text-sm text-gray-400">loading the lotus world…</p>
      </div>
    ),
  }
);

/** Named export consumed by the generated /lotus page slot. */
export function LotusWorld() {
  return <LotusWorldImpl />;
}

export default LotusWorld;
