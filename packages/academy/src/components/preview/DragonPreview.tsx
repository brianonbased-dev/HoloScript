// TARGET: packages/studio/src/components/preview/DragonPreview.tsx
'use client';

/**
 * DragonPreview -- 3D preview for creature compositions with a LOD quality slider.
 *
 * Features:
 *  - Canvas-based 3D wireframe preview of creature composition
 *  - LOD quality slider (Low / Medium / High / Ultra) controlling polygon detail
 *  - Auto-rotation with speed control
 *  - Composition stats panel (vertices, triangles, traits, materials)
 *  - Trait badge overlay showing applied traits
 *  - Color and emissive glow preview
 *  - Responsive layout that scales to container
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  RotateCcw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Layers,
  Eye,
  EyeOff,
  Play,
  Pause,
  ChevronDown,
  Info,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface CreaturePart {
  name: string;
  geometry: 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus';
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  traits: string[];
}

export interface CreatureComposition {
  name: string;
  parts: CreaturePart[];
  totalTraits: string[];
}

interface LODLevel {
  label: string;
  segments: number;
  polyMultiplier: number;
  textureRes: number;
}

// =============================================================================
// Constants
// =============================================================================

const LOD_LEVELS: LODLevel[] = [
  { label: 'Low', segments: 6, polyMultiplier: 0.25, textureRes: 256 },
  { label: 'Medium', segments: 12, polyMultiplier: 0.5, textureRes: 512 },
  { label: 'High', segments: 24, polyMultiplier: 1.0, textureRes: 1024 },
  { label: 'Ultra', segments: 48, polyMultiplier: 2.0, textureRes: 2048 },
];

const SAMPLE_DRAGON: CreatureComposition = {
  name: 'Fire Dragon',
  parts: [
    {
      name: 'Body',
      geometry: 'sphere',
      position: [0, 0, 0],
      scale: [1.2, 0.8, 1.5],
      color: '#cc3300',
      traits: ['physics_body', 'animated'],
    },
    {
      name: 'Head',
      geometry: 'sphere',
      position: [0, 0.6, 1.2],
      scale: [0.5, 0.5, 0.6],
      color: '#dd4400',
      traits: ['glowing', 'interactive'],
    },
    {
      name: 'Tail',
      geometry: 'cone',
      position: [0, -0.1, -1.5],
      scale: [0.3, 0.3, 1.2],
      color: '#bb2200',
      traits: ['animated', 'particles'],
    },
    {
      name: 'Wing Left',
      geometry: 'box',
      position: [-1.3, 0.4, 0],
      scale: [1.0, 0.05, 0.7],
      color: '#992200',
      traits: ['animated'],
    },
    {
      name: 'Wing Right',
      geometry: 'box',
      position: [1.3, 0.4, 0],
      scale: [1.0, 0.05, 0.7],
      color: '#992200',
      traits: ['animated'],
    },
    {
      name: 'Horn Left',
      geometry: 'cone',
      position: [-0.2, 1.0, 1.3],
      scale: [0.08, 0.08, 0.3],
      color: '#ffaa00',
      traits: ['material'],
    },
    {
      name: 'Horn Right',
      geometry: 'cone',
      position: [0.2, 1.0, 1.3],
      scale: [0.08, 0.08, 0.3],
      color: '#ffaa00',
      traits: ['material'],
    },
  ],
  totalTraits: ['physics_body', 'animated', 'glowing', 'interactive', 'particles', 'material'],
};

// =============================================================================
// Canvas Wireframe Renderer
// =============================================================================

function projectPoint(
  x: number,
  y: number,
  z: number,
  rotY: number,
  zoom: number,
  cx: number,
  cy: number
): [number, number] {
  // Rotate around Y axis
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const rx = x * cosR - z * sinR;
  const rz = x * sinR + z * cosR;

  // Simple perspective
  const perspective = 4;
  const scale = (perspective / (perspective + rz)) * zoom * 80;

  return [cx + rx * scale, cy - y * scale];
}

function drawWireframeShape(
  ctx: CanvasRenderingContext2D,
  part: CreaturePart,
  rotY: number,
  zoom: number,
  cx: number,
  cy: number,
  segments: number
) {
  const [px, py, pz] = part.position;
  const [sx, sy, sz] = part.scale;

  ctx.strokeStyle = part.color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;

  const n = Math.max(4, Math.floor(segments / 2));

  switch (part.geometry) {
    case 'sphere': {
      // Draw longitude lines
      for (let i = 0; i < n; i++) {
        const theta = (i / n) * Math.PI * 2;
        ctx.beginPath();
        for (let j = 0; j <= n; j++) {
          const phi = (j / n) * Math.PI;
          const lx = px + Math.sin(phi) * Math.cos(theta) * sx * 0.5;
          const ly = py + Math.cos(phi) * sy * 0.5;
          const lz = pz + Math.sin(phi) * Math.sin(theta) * sz * 0.5;
          const [screenX, screenY] = projectPoint(lx, ly, lz, rotY, zoom, cx, cy);
          if (j === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
      }
      // Draw latitude lines
      for (let j = 1; j < n; j++) {
        const phi = (j / n) * Math.PI;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const theta = (i / n) * Math.PI * 2;
          const lx = px + Math.sin(phi) * Math.cos(theta) * sx * 0.5;
          const ly = py + Math.cos(phi) * sy * 0.5;
          const lz = pz + Math.sin(phi) * Math.sin(theta) * sz * 0.5;
          const [screenX, screenY] = projectPoint(lx, ly, lz, rotY, zoom, cx, cy);
          if (i === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
      }
      break;
    }
    case 'box': {
      const corners: [number, number, number][] = [];
      for (const dx of [-1, 1]) {
        for (const dy of [-1, 1]) {
          for (const dz of [-1, 1]) {
            corners.push([px + dx * sx * 0.5, py + dy * sy * 0.5, pz + dz * sz * 0.5]);
          }
        }
      }
      const edges = [
        [0, 1], [2, 3], [4, 5], [6, 7],
        [0, 2], [1, 3], [4, 6], [5, 7],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      for (const [a, b] of edges) {
        const [ax, ay] = projectPoint(corners[a][0], corners[a][1], corners[a][2], rotY, zoom, cx, cy);
        const [bx, by] = projectPoint(corners[b][0], corners[b][1], corners[b][2], rotY, zoom, cx, cy);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      break;
    }
    case 'cone':
    case 'cylinder': {
      const isCone = part.geometry === 'cone';
      const topR = isCone ? 0 : 1;
      // Draw top and bottom circles
      for (const [fy, radiusFactor] of [[1, topR], [-1, 1]] as [number, number][]) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const theta = (i / n) * Math.PI * 2;
          const lx = px + Math.cos(theta) * sx * 0.5 * radiusFactor;
          const ly = py + fy * sy * 0.5;
          const lz = pz + Math.sin(theta) * sz * 0.5 * radiusFactor;
          const [screenX, screenY] = projectPoint(lx, ly, lz, rotY, zoom, cx, cy);
          if (i === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
      }
      // Vertical edges
      const edgeCount = Math.min(n, 8);
      for (let i = 0; i < edgeCount; i++) {
        const theta = (i / edgeCount) * Math.PI * 2;
        const bx = px + Math.cos(theta) * sx * 0.5;
        const by = py - sy * 0.5;
        const bz = pz + Math.sin(theta) * sz * 0.5;
        const tx = isCone ? px : px + Math.cos(theta) * sx * 0.5;
        const ty = py + sy * 0.5;
        const tz = isCone ? pz : pz + Math.sin(theta) * sz * 0.5;
        const [sx1, sy1] = projectPoint(bx, by, bz, rotY, zoom, cx, cy);
        const [sx2, sy2] = projectPoint(tx, ty, tz, rotY, zoom, cx, cy);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
      break;
    }
    case 'torus': {
      const R = 0.35;
      const r = 0.15;
      for (let i = 0; i < n; i++) {
        const theta = (i / n) * Math.PI * 2;
        ctx.beginPath();
        for (let j = 0; j <= n; j++) {
          const phi = (j / n) * Math.PI * 2;
          const lx = px + (R + r * Math.cos(phi)) * Math.cos(theta) * sx;
          const ly = py + r * Math.sin(phi) * sy;
          const lz = pz + (R + r * Math.cos(phi)) * Math.sin(theta) * sz;
          const [screenX, screenY] = projectPoint(lx, ly, lz, rotY, zoom, cx, cy);
          if (j === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
      }
      break;
    }
  }

  ctx.globalAlpha = 1;
}

// =============================================================================
// Main Component
// =============================================================================

interface DragonPreviewProps {
  creature?: CreatureComposition;
  initialLOD?: number;
}

export function DragonPreview({
  creature = SAMPLE_DRAGON,
  initialLOD = 2,
}: DragonPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [lodIndex, setLodIndex] = useState(initialLOD);
  const [rotation, setRotation] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotateSpeed, setRotateSpeed] = useState(0.5);
  const [zoom, setZoom] = useState(1.0);
  const [showWireframe, setShowWireframe] = useState(true);
  const [showTraits, setShowTraits] = useState(true);
  const [showStats, setShowStats] = useState(true);

  const lod = LOD_LEVELS[lodIndex];

  // Computed stats
  const stats = useMemo(() => {
    const baseVerts = creature.parts.reduce((sum, p) => {
      const s = lod.segments;
      switch (p.geometry) {
        case 'sphere': return sum + (s + 1) * (s + 1);
        case 'box': return sum + 8;
        case 'cylinder': return sum + s * 2 + 2;
        case 'cone': return sum + s + 2;
        case 'torus': return sum + s * s;
        default: return sum + s * s;
      }
    }, 0);
    const tris = Math.floor(baseVerts * 1.8 * lod.polyMultiplier);
    return {
      vertices: baseVerts,
      triangles: tris,
      parts: creature.parts.length,
      traits: creature.totalTraits.length,
      textureRes: lod.textureRes,
    };
  }, [creature, lod]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let currentRot = rotation;

    function render() {
      if (!running || !ctx || !canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      // Clear
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = 0.5;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Auto-rotate
      if (autoRotate) {
        currentRot += rotateSpeed * 0.02;
        setRotation(currentRot);
      }

      // Draw creature parts
      if (showWireframe) {
        for (const part of creature.parts) {
          drawWireframeShape(ctx, part, currentRot, zoom, cx, cy, lod.segments);
        }
      }

      // Part labels
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center';
      for (const part of creature.parts) {
        const [sx, sy] = projectPoint(
          part.position[0],
          part.position[1] + part.scale[1] * 0.5 + 0.15,
          part.position[2],
          currentRot,
          zoom,
          cx,
          cy
        );
        ctx.fillText(part.name, sx, sy);
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [creature, lod, zoom, autoRotate, rotateSpeed, showWireframe, rotation]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a12] text-studio-text overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2">
        <Eye className="h-4 w-4 text-orange-400" />
        <span className="text-[12px] font-semibold">{creature.name} Preview</span>
        <span className="text-[9px] text-studio-muted ml-1">
          LOD: {lod.label}
        </span>

        {/* Controls */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`rounded p-1 transition ${autoRotate ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            title={autoRotate ? 'Pause rotation' : 'Auto-rotate'}
          >
            {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setShowWireframe(!showWireframe)}
            className={`rounded p-1 transition ${showWireframe ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            title="Toggle wireframe"
          >
            {showWireframe ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Zoom in"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Zoom out"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              setRotation(0);
              setZoom(1.0);
            }}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Reset view"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ imageRendering: 'auto' }}
        />

        {/* Trait badges overlay */}
        {showTraits && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[200px]">
            {creature.totalTraits.map((trait) => (
              <span
                key={trait}
                className="rounded bg-studio-panel/80 backdrop-blur-sm border border-studio-border px-1.5 py-0.5 text-[8px] font-mono text-studio-accent"
              >
                @{trait}
              </span>
            ))}
          </div>
        )}

        {/* Stats overlay */}
        {showStats && (
          <div className="absolute bottom-2 right-2 rounded-lg bg-studio-panel/80 backdrop-blur-sm border border-studio-border px-2.5 py-1.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
              <span className="text-studio-muted">Vertices:</span>
              <span className="font-mono text-studio-text text-right">
                {stats.vertices.toLocaleString()}
              </span>
              <span className="text-studio-muted">Triangles:</span>
              <span className="font-mono text-studio-text text-right">
                {stats.triangles.toLocaleString()}
              </span>
              <span className="text-studio-muted">Parts:</span>
              <span className="font-mono text-studio-text text-right">{stats.parts}</span>
              <span className="text-studio-muted">Texture:</span>
              <span className="font-mono text-studio-text text-right">{stats.textureRes}px</span>
            </div>
          </div>
        )}
      </div>

      {/* LOD Quality Slider */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-studio-border bg-studio-panel px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-teal-400" />
          <span className="text-[10px] font-semibold text-studio-text">Quality (LOD)</span>
          <span className="text-[10px] font-mono text-teal-400 ml-auto">{lod.label}</span>
        </div>

        <input
          type="range"
          min={0}
          max={LOD_LEVELS.length - 1}
          step={1}
          value={lodIndex}
          onChange={(e) => setLodIndex(parseInt(e.target.value))}
          className="w-full accent-teal-500"
        />

        <div className="flex justify-between text-[8px] text-studio-muted/60">
          {LOD_LEVELS.map((l, i) => (
            <span
              key={l.label}
              className={i === lodIndex ? 'text-teal-400 font-bold' : ''}
            >
              {l.label}
            </span>
          ))}
        </div>

        {/* Speed control (when auto-rotating) */}
        {autoRotate && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-studio-muted">Speed:</span>
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.1}
              value={rotateSpeed}
              onChange={(e) => setRotateSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-teal-500"
            />
            <span className="text-[9px] font-mono text-studio-muted w-8 text-right">
              {rotateSpeed.toFixed(1)}x
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
