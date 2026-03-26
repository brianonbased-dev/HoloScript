'use client';

import { Suspense, useMemo, Component, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import type { R3FNode } from '@holoscript/core';
import { R3FNodeRenderer } from './R3FNodeRenderer';

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PreviewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-900/50 p-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <svg className="h-6 w-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">Preview unavailable</p>
              <p className="mt-1 text-xs text-gray-500">
                {this.state.error?.message ?? 'An error occurred while rendering'}
              </p>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// ─── Scene Content ───────────────────────────────────────────────────────────

function PreviewSceneContent({ r3fTree }: { r3fTree: R3FNode }) {
  const hasLights = useMemo(() => {
    return r3fTree.children?.some(
      (c: any) =>
        c.type === 'ambientLight' ||
        c.type === 'directionalLight' ||
        c.type === 'pointLight',
    );
  }, [r3fTree]);

  return (
    <group>
      {!hasLights && (
        <>
          <ambientLight intensity={0.4} color="#e8e0ff" />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-3, 5, -3]} intensity={0.3} color="#8888ff" />
        </>
      )}
      <Environment preset="apartment" background={false} />
      <R3FNodeRenderer node={r3fTree} />
    </group>
  );
}

function EmptyPreviewScene() {
  return (
    <group>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <Environment preset="studio" background={false} />
      {/* Placeholder cube when nothing is compiled */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="#333344" wireframe transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// ─── Loading Indicator ───────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <group>
      <ambientLight intensity={0.2} />
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface MagicMomentPreviewProps {
  /** Compiled R3F scene tree from useScenePipeline */
  compiledScene: R3FNode | null;
  /** Whether orbit controls should auto-rotate */
  autoRotate?: boolean;
  /** Compilation errors to display as overlay */
  errors?: Array<{ message: string; line?: number }>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MagicMomentPreview -- Isolated R3F Canvas component safe for modal rendering.
 *
 * Features:
 * - OrbitControls (auto-rotate initially, user can grab)
 * - Grid floor
 * - Ambient + directional lighting
 * - Error boundary wrapper (compilation errors show friendly message)
 * - Soft gradient background
 */
export function MagicMomentPreview({
  compiledScene,
  autoRotate = true,
  errors = [],
  className = '',
}: MagicMomentPreviewProps) {
  const hasErrors = errors.length > 0;

  return (
    <PreviewErrorBoundary>
      <div className={`relative h-full w-full overflow-hidden rounded-xl ${className}`}>
        {/* R3F Canvas */}
        <Canvas
          camera={{ position: [3, 2.5, 4], fov: 50 }}
          shadows
          style={{
            background: 'linear-gradient(180deg, #0a0a1a 0%, #111127 50%, #0d0d1f 100%)',
          }}
          gl={{
            antialias: true,
            toneMapping: 4, // ACESFilmicToneMapping
            toneMappingExposure: 1.0,
            outputColorSpace: 'srgb',
          }}
        >
          <Suspense fallback={<LoadingFallback />}>
            {compiledScene ? (
              <PreviewSceneContent r3fTree={compiledScene} />
            ) : (
              <EmptyPreviewScene />
            )}
          </Suspense>

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
            minDistance={2}
            maxDistance={15}
            enablePan={false}
          />

          <Grid
            args={[20, 20]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#1a1a2e"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#252540"
            fadeDistance={15}
            position={[0, -0.01, 0]}
          />
        </Canvas>

        {/* Error overlay */}
        {hasErrors && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-red-950/80 to-transparent p-4 pt-8">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-red-300">
                  {errors.length === 1 ? 'Syntax error' : `${errors.length} errors`}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-red-400/70">
                  {errors[0]?.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Subtle vignette overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </PreviewErrorBoundary>
  );
}
