/**
 * WebSurfaceRenderer — Renders an HTML iframe inside an R3F scene.
 *
 * Reads @web_surface trait params and projects a sandboxed iframe into
 * 3D space via @react-three/drei's Html component.
 *
 * @see docs/universal-ir-coverage.md (web-surface column)
 * @see @holoscript/web-preview-plugin — trait emission contract
 */

import { useRef, useMemo, useCallback } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export interface WebSurfaceRendererProps {
  /** URL to embed */
  url: string;
  /** Logical size in px [width, height]. Default: [1024, 768] */
  size?: [number, number];
  /** Position in 3D space */
  position?: [number, number, number];
  /** Rotation in radians */
  rotation?: [number, number, number];
  /** Scale (uniform or per-axis) */
  scale?: [number, number, number] | number;
  /** iframe sandbox tokens. Default: ['allow-scripts', 'allow-forms'] */
  sandbox?: string[];
  /** Whether to allow microphone access */
  allow_mic?: boolean;
  /** Whether to allow camera access */
  allow_camera?: boolean;
  /** Permitted postMessage origins */
  origin_whitelist?: string[];
  /** Whether the surface is selected (shows chrome border) */
  selected?: boolean;
  /** Called when the surface is clicked for selection */
  onSelect?: () => void;
}

const DEFAULT_SIZE: [number, number] = [1024, 768];
const DEFAULT_SANDBOX = ['allow-scripts', 'allow-forms'];

/**
 * Projects a sandboxed iframe into the 3D scene.
 *
 * The iframe is wrapped in a container that handles selection clicks.
 * When selected, a visible chrome border is drawn around the surface.
 * Pointer events on the iframe itself remain active so users can interact
 * with the embedded content; the wrapper captures selection.
 */
export function WebSurfaceRenderer({
  url,
  size = DEFAULT_SIZE,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  sandbox = DEFAULT_SANDBOX,
  allow_mic = false,
  allow_camera = false,
  origin_whitelist,
  selected = false,
  onSelect,
}: WebSurfaceRendererProps) {
  const groupRef = useRef<THREE.Group>(null);

  const [width, height] = size;

  const sandboxAttr = useMemo(() => sandbox.join(' '), [sandbox]);

  const allowAttr = useMemo(() => {
    const tokens: string[] = [];
    if (allow_mic) tokens.push('microphone');
    if (allow_camera) tokens.push('camera');
    return tokens.length > 0 ? tokens.join('; ') : undefined;
  }, [allow_mic, allow_camera]);

  const handleWrapperClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.();
    },
    [onSelect]
  );

  const scaleArray =
    typeof scale === 'number' ? ([scale, scale, scale] as [number, number, number]) : scale;

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scaleArray}>
      {/* Selection chrome border — rendered behind the iframe */}
      {selected && (
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[(width / 1000) * 1.02, (height / 1000) * 1.02]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} depthTest={false} />
        </mesh>
      )}

      <Html
        transform
        occlude="blending"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        zIndexRange={[10, 20]}
      >
        <div
          onClick={handleWrapperClick}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: selected
              ? '0 0 0 2px #3b82f6, 0 8px 32px rgba(0,0,0,0.4)'
              : '0 4px 16px rgba(0,0,0,0.3)',
            background: '#0a0a12',
          }}
        >
          <iframe
            src={url}
            sandbox={sandboxAttr}
            allow={allowAttr}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              borderRadius: '4px',
              background: '#fff',
            }}
            title="Web Surface"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {/* Transparent overlay to capture selection without blocking iframe interaction */}
          {onSelect && !selected && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                zIndex: 1,
              }}
              onClick={handleWrapperClick}
            />
          )}
        </div>
      </Html>
    </group>
  );
}
