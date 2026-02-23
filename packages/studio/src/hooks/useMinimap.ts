'use client';

/**
 * useMinimap — parses HoloScript code into a list of 2D top-down positions
 * for rendering the minimap overlay.
 */

import { useMemo } from 'react';
import { useSceneStore } from '@/lib/store';

export interface MinimapObject {
  name: string;
  x: number;   // world X
  z: number;   // world Z (depth)
  w: number;   // scale X
  h: number;   // scale Z
  color: string;
  type: 'scene' | 'object' | 'light';
}

function parseObjects(code: string): MinimapObject[] {
  const objectRe = /object\s+"([^"]+)"\s*\{([\s\S]*?)\}/g;
  const results: MinimapObject[] = [];
  let m: RegExpExecArray | null;

  while ((m = objectRe.exec(code)) !== null) {
    const name = m[1];
    const body = m[2];

    const posM = body.match(/@transform\s*\([^)]*position:\s*\[([^\]]+)\]/);
    const scaM = body.match(/@transform\s*\([^)]*scale:\s*\[([^\]]+)\]/);
    const colM = body.match(/@material\s*\([^)]*color:\s*"([^"]+)"/);
    const isLight = /@(pointLight|directionalLight|spotLight)/.test(body);

    const parseArr = (s?: string): [number, number, number] => {
      if (!s) return [0, 0, 0];
      const p = s.split(',').map((v) => parseFloat(v.trim()) || 0);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
    };

    const [x, , z] = parseArr(posM?.[1]);
    const [sx, , sz] = parseArr(scaM?.[1]);

    results.push({
      name,
      x: x ?? 0,
      z: z ?? 0,
      w: Math.max(0.2, (sx ?? 1) * 0.8),
      h: Math.max(0.2, (sz ?? 1) * 0.8),
      color: colM?.[1] ?? (isLight ? '#ffee44' : '#6688cc'),
      type: isLight ? 'light' : 'object',
    });
  }

  return results;
}

export function useMinimap() {
  const code = useSceneStore((s) => s.code) ?? '';
  const objects = useMemo(() => parseObjects(code), [code]);

  // Compute bounds for auto-scaling
  const bounds = useMemo(() => {
    if (objects.length === 0) return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const xs = objects.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2]);
    const zs = objects.flatMap((o) => [o.z - o.h / 2, o.z + o.h / 2]);
    const pad = 3;
    return {
      minX: Math.min(...xs) - pad,
      maxX: Math.max(...xs) + pad,
      minZ: Math.min(...zs) - pad,
      maxZ: Math.max(...zs) + pad,
    };
  }, [objects]);

  return { objects, bounds };
}
