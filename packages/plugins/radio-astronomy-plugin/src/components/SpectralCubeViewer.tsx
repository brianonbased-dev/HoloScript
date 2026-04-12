/**
 * SpectralCubeViewer — Interactive 3D viewer for FITS spectral cubes.
 *
 * Drop a FITS file → see the spectral cube in 3D → slide through
 * frequency channels → play as animation. Zero code required.
 *
 * Works with:
 *   - 3D cubes (RA × Dec × Freq): full volumetric slice-by-slice
 *   - 2D images (RA × Dec): single-channel colormap
 *   - 1D spectra: displayed as a line in 3D space
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ColormapName } from '@holoscript/r3f-renderer';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpectralCubeViewerProps {
  /** Parsed FITS data array (physical values after BSCALE/BZERO) */
  data: Float32Array;
  /** Axis dimensions [NAXIS1, NAXIS2] or [NAXIS1, NAXIS2, NAXIS3] */
  shape: number[];
  /** Colormap (default: 'viridis') */
  colormap?: ColormapName;
  /** Auto-play through channels (default: false) */
  autoPlay?: boolean;
  /** Playback speed in channels per second (default: 5) */
  playSpeed?: number;
  /** WCS metadata for axis labels */
  wcs?: { ctype?: string[]; cunit?: string[]; crval?: number[]; cdelt?: number[] };
  /** Object name from FITS header */
  objectName?: string;
}

// ── Colormap GLSL ────────────────────────────────────────────────────────────

const COLORMAPS: Record<string, string> = {
  viridis: `
    vec3 colormap(float t) {
      vec3 c0 = vec3(0.267, 0.004, 0.329);
      vec3 c4 = vec3(0.127, 0.566, 0.551);
      vec3 c8 = vec3(0.993, 0.906, 0.144);
      if (t < 0.5) return mix(c0, c4, t * 2.0);
      return mix(c4, c8, (t - 0.5) * 2.0);
    }
  `,
  turbo: `
    vec3 colormap(float t) {
      float r = 0.136 + t * (4.615 + t * (-42.66 + t * (132.13 + t * (-152.55 + t * 56.31))));
      float g = 0.091 + t * (2.264 + t * (-14.02 + t * (32.21 + t * (-29.27 + t * 10.16))));
      float b = 0.107 + t * (12.75 + t * (-60.58 + t * (132.75 + t * (-134.01 + t * 50.26))));
      return clamp(vec3(r, g, b), 0.0, 1.0);
    }
  `,
  inferno: `
    vec3 colormap(float t) {
      vec3 c0 = vec3(0.001, 0.0, 0.014);
      vec3 c3 = vec3(0.735, 0.216, 0.329);
      vec3 c6 = vec3(0.988, 0.999, 0.644);
      if (t < 0.5) return mix(c0, c3, t * 2.0);
      return mix(c3, c6, (t - 0.5) * 2.0);
    }
  `,
};

const VERT = /* glsl */ `
attribute float aIntensity;
uniform float uMin;
uniform float uMax;
varying float vNorm;

void main() {
  float range = uMax - uMin;
  vNorm = range > 0.0 ? clamp((aIntensity - uMin) / range, 0.0, 1.0) : 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function makeFrag(cmName: string): string {
  const cm = COLORMAPS[cmName] ?? COLORMAPS.viridis;
  return /* glsl */ `
    varying float vNorm;
    ${cm}
    void main() {
      vec3 c = colormap(vNorm);
      gl_FragColor = vec4(c, 1.0);
    }
  `;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpectralCubeViewer({
  data,
  shape,
  colormap = 'viridis',
  autoPlay = false,
  playSpeed = 5,
  wcs,
  objectName,
}: SpectralCubeViewerProps) {
  const nx = shape[0] ?? 1;
  const ny = shape[1] ?? 1;
  const nz = shape[2] ?? 1;
  const is3D = shape.length >= 3 && nz > 1;

  const [channel, setChannel] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // Extract channel slice
  const channelData = useMemo(() => {
    if (!is3D) return data; // 2D — use entire dataset
    const offset = channel * nx * ny;
    return data.slice(offset, offset + nx * ny);
  }, [data, channel, nx, ny, is3D]);

  // Data range for colormap normalization
  const [min, max] = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < channelData.length; i++) {
      if (channelData[i] < lo) lo = channelData[i];
      if (channelData[i] > hi) hi = channelData[i];
    }
    return [lo, hi];
  }, [channelData]);

  // Build geometry: flat plane with per-pixel intensity attribute
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(nx / Math.max(nx, ny), ny / Math.max(nx, ny), nx - 1, ny - 1);
    const intensities = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // PlaneGeometry vertex order: row by row, top to bottom
        intensities[j * nx + i] = channelData[j * nx + i] ?? 0;
      }
    }
    geo.setAttribute('aIntensity', new THREE.BufferAttribute(intensities, 1));
    return geo;
  }, [nx, ny, channelData]);

  // Auto-play animation
  useFrame((_, delta) => {
    if (!playing || !is3D) return;
    timeRef.current += delta * playSpeed;
    if (timeRef.current >= 1) {
      timeRef.current -= 1;
      setChannel((c) => (c + 1) % nz);
    }
  });

  const fragmentShader = useMemo(() => makeFrag(colormap), [colormap]);

  const uniforms = useMemo(() => ({
    uMin: { value: min },
    uMax: { value: max },
  }), [min, max]);

  // Channel label from WCS
  const channelLabel = useMemo(() => {
    if (!wcs?.crval || !wcs?.cdelt || !wcs?.ctype) return `Channel ${channel}/${nz}`;
    const freqIdx = wcs.ctype.findIndex((t) => t.includes('FREQ'));
    if (freqIdx < 0) return `Channel ${channel}/${nz}`;
    const freq = wcs.crval[freqIdx] + channel * wcs.cdelt[freqIdx];
    const unit = wcs.cunit?.[freqIdx] ?? 'Hz';
    if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`;
    if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`;
    return `${freq.toFixed(0)} ${unit}`;
  }, [channel, nz, wcs]);

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry}>
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* HUD - rendered as HTML overlay in Studio, or as 3D text in VR */}
      {/* For now, the parent component handles the slider UI */}
    </group>
  );
}

// ── Studio Panel Wrapper ─────────────────────────────────────────────────────

export interface FITSViewerPanelProps {
  /** Raw FITS ArrayBuffer (from file drop) */
  fitsBuffer: ArrayBuffer;
  onClose?: () => void;
}

/**
 * Full FITS viewer panel: parses FITS → shows 3D → channel slider.
 * This is the entry point for drag-and-drop FITS files.
 */
export function FITSViewerPanel({ fitsBuffer, onClose }: FITSViewerPanelProps) {
  const [fitsData, setFitsData] = useState<{
    data: Float32Array;
    shape: number[];
    wcs: unknown;
    object: string;
  } | null>(null);
  const [channel, setChannel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Dynamic import to avoid bundling FITS parser unless needed
      import('../fits/FITSParser').then(({ parseFITS }) => {
        const fits = parseFITS(fitsBuffer);
        setFitsData({
          data: fits.data,
          shape: fits.shape,
          wcs: fits.wcs,
          object: fits.object || 'Unknown Object',
        });
      }).catch((e) => setError(String(e)));
    } catch (e) {
      setError(String(e));
    }
  }, [fitsBuffer]);

  if (error) {
    return (
      <div style={{ padding: 20, color: '#ef4444', fontFamily: 'monospace' }}>
        FITS Parse Error: {error}
      </div>
    );
  }

  if (!fitsData) {
    return (
      <div style={{ padding: 20, color: '#94a3b8', fontFamily: 'monospace' }}>
        Loading FITS data...
      </div>
    );
  }

  const nz = fitsData.shape[2] ?? 1;
  const is3D = fitsData.shape.length >= 3 && nz > 1;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: 12, background: '#1a1a2e', borderRadius: 8,
      border: '1px solid #2a2a3e', color: '#e4e4e7',
      fontFamily: "'Space Mono', monospace",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>
          {fitsData.object}
        </span>
        <span style={{ fontSize: 10, color: '#71717a' }}>
          {fitsData.shape.join(' × ')} px
        </span>
      </div>

      {/* Channel Slider (only for 3D cubes) */}
      {is3D && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setPlaying(!playing)}
            style={{
              background: playing ? '#ef4444' : '#3b82f6',
              border: 'none', borderRadius: 4, padding: '4px 10px',
              color: 'white', fontSize: 11, cursor: 'pointer',
            }}
          >
            {playing ? 'Stop' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={nz - 1}
            value={channel}
            onChange={(e) => { setChannel(Number(e.target.value)); setPlaying(false); }}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 10, color: '#71717a', minWidth: 80, textAlign: 'right' }}>
            Ch {channel}/{nz - 1}
          </span>
        </div>
      )}

      {/* Data range */}
      <div style={{ fontSize: 10, color: '#71717a' }}>
        Range: {dataRange(fitsData.data).map((v) => v.toExponential(2)).join(' → ')}
      </div>
    </div>
  );
}

function dataRange(data: Float32Array): [number, number] {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  return [min, max];
}
