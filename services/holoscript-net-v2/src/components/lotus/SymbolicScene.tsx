'use client';

/**
 * SymbolicScene — the bloom-readability baseline (garden.refreshed): roots, stalks,
 * a glass center, and glow-coded petals. Compiled to generic mesh nodes by the
 * R3FCompiler and baked; rendered here as stock primitives with the REAL @glowing
 * emissive encoding so bloom-state is readable at a glance (the scene's purpose).
 *
 * The compiled nodes have no explicit petal layout (they're authored as a flat
 * node list), so the petals (objects whose baked name starts with "Petal:") are
 * arranged on a phyllotaxis fan here for legibility, driven by their baked emissive
 * intensity (= the .holo @glowing intensity). Roots/stalks/center keep their
 * authored positions.
 */
import { useMemo } from 'react';
import type { BakedScene, BakedPrimitive } from './bakedTypes';
import { Primitive } from './primitives';

const GOLDEN_ANGLE = (137.50776 * Math.PI) / 180;

export function SymbolicScene({ scene }: { scene: BakedScene }) {
  const { structural, petals } = useMemo(() => {
    const structural: BakedPrimitive[] = [];
    const petals: BakedPrimitive[] = [];
    for (const n of scene.nodes ?? []) {
      const name = n.name ?? '';
      // Skip pure-audio markers (PondAmbience / GenesisChime compile to cubes).
      if (/Ambience|Chime/i.test(name)) continue;
      if (/^Petal[: ]/i.test(name)) petals.push(n);
      else structural.push(n);
    }
    return { structural, petals };
  }, [scene.nodes]);

  return (
    <group>
      {/* Roots, stalks, center — keep their authored positions, drawn as soft spheres. */}
      {structural.map((n, i) => (
        <Primitive key={`st-${i}`} prim={symbolicShape(n)} />
      ))}
      {/* Petals fanned on the golden-angle spiral, glow = bloom-readability. */}
      <group position={[0, 5, 0]}>
        {petals.map((n, i) => {
          const angle = i * GOLDEN_ANGLE;
          const ring = i < 8 ? 0 : i < 21 ? 1 : 2;
          const radius = 2.0 + ring * 1.4;
          const prim: BakedPrimitive = {
            ...n,
            hsType: 'sphere',
            radius: 0.42 - ring * 0.06,
            position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
          };
          return <Primitive key={`pt-${i}`} prim={prim} />;
        })}
      </group>
    </group>
  );
}

/** Roots/stalks/center render as glowing spheres (the baseline's visual language). */
function symbolicShape(n: BakedPrimitive): BakedPrimitive {
  return {
    ...n,
    hsType: 'sphere',
    radius: 0.4,
  };
}
