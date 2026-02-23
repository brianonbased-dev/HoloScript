'use client';

/**
 * MinimapOverlay — translucent bird's-eye 2D minimap anchored to bottom-left of viewport.
 */

import { useCallback, useState, useRef } from 'react';
import { Map, X } from 'lucide-react';
import { useMinimap } from '@/hooks/useMinimap';

interface MinimapOverlayProps {
  active: boolean;
  onClose?: () => void;
}

const MINIMAP_W = 160;
const MINIMAP_H = 120;

export function MinimapOverlay({ active, onClose }: MinimapOverlayProps) {
  const { objects, bounds } = useMinimap();
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const worldToSvg = useCallback((wx: number, wz: number) => {
    const px = ((wx - bounds.minX) / (bounds.maxX - bounds.minX)) * MINIMAP_W;
    const py = ((wz - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * MINIMAP_H;
    return { px, py };
  }, [bounds]);

  const worldToSvgSize = useCallback((w: number, h: number) => ({
    sw: (w / (bounds.maxX - bounds.minX)) * MINIMAP_W,
    sh: (h / (bounds.maxZ - bounds.minZ)) * MINIMAP_H,
  }), [bounds]);

  if (!active) return null;

  return (
    <div
      className="absolute bottom-4 left-4 z-30 overflow-hidden rounded-xl border border-studio-border/60 bg-black/70 backdrop-blur-sm"
      style={{ width: MINIMAP_W + 2, userSelect: 'none' }}
    >
      {/* Mini header */}
      <div className="flex items-center gap-1.5 border-b border-studio-border/40 px-2 py-1">
        <Map className="h-2.5 w-2.5 text-studio-accent" />
        <span className="flex-1 text-[8px] font-semibold text-studio-muted">MINIMAP</span>
        {onClose && (
          <button onClick={onClose} className="text-studio-muted hover:text-studio-text">
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
        className="block"
      >
        {/* Grid lines */}
        {[...Array(5)].map((_, i) => (
          <g key={i}>
            <line x1={MINIMAP_W * i / 4} y1={0} x2={MINIMAP_W * i / 4} y2={MINIMAP_H} stroke="#ffffff08" strokeWidth={0.5} />
            <line x1={0} y1={MINIMAP_H * i / 4} x2={MINIMAP_W} y2={MINIMAP_H * i / 4} stroke="#ffffff08" strokeWidth={0.5} />
          </g>
        ))}

        {/* Origin cross */}
        {(() => {
          const { px, py } = worldToSvg(0, 0);
          return (
            <g opacity={0.3}>
              <line x1={px - 4} y1={py} x2={px + 4} y2={py} stroke="#ffffff" strokeWidth={0.5} />
              <line x1={px} y1={py - 4} x2={px} y2={py + 4} stroke="#ffffff" strokeWidth={0.5} />
            </g>
          );
        })()}

        {/* Objects */}
        {objects.map((o) => {
          const { px, py } = worldToSvg(o.x, o.z);
          const { sw, sh } = worldToSvgSize(o.w, o.h);
          const isHov = hovered === o.name;

          if (o.type === 'light') {
            return (
              <circle
                key={o.name}
                cx={px}
                cy={py}
                r={isHov ? 4 : 3}
                fill={o.color}
                opacity={isHov ? 1 : 0.7}
                onMouseEnter={() => setHovered(o.name)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer', filter: 'blur(0.5px)' }}
              />
            );
          }

          return (
            <g key={o.name}
              onMouseEnter={() => setHovered(o.name)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={px - sw / 2}
                y={py - sh / 2}
                width={Math.max(2, sw)}
                height={Math.max(2, sh)}
                fill={o.color}
                opacity={isHov ? 0.95 : 0.65}
                rx={0.5}
                stroke={isHov ? '#ffffff' : 'none'}
                strokeWidth={isHov ? 0.5 : 0}
              />
            </g>
          );
        })}

        {/* Camera / player marker */}
        {(() => {
          const { px, py } = worldToSvg(0, 4);
          return (
            <polygon
              points={`${px},${py - 4} ${px - 3},${py + 3} ${px + 3},${py + 3}`}
              fill="#ffffff"
              opacity={0.9}
            />
          );
        })()}
      </svg>

      {/* Hovered label */}
      {hovered && (
        <div className="border-t border-studio-border/40 px-2 py-0.5">
          <p className="truncate text-[8px] text-studio-text">{hovered}</p>
        </div>
      )}
    </div>
  );
}
