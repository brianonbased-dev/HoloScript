'use client';

import { useMemo, Suspense, lazy } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, Environment, Text, Sparkles } from '@react-three/drei';
import {
  HoloScriptPlusParser,
  HoloCompositionParser,
  R3FCompiler,
  MATERIAL_PRESETS,
} from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';

// VR edit session — lazy loaded to avoid SSR issues
const VREditSession = lazy(() =>
  import('@/components/vr/VREditSession').then((m) => ({ default: m.VREditSession }))
);

// ─── Geometry mapper ────────────────────────────────────────────────────────

function getGeometry(hsType: string, size: number) {
  const s = size || 1;
  switch (hsType) {
    case 'sphere':
    case 'orb':
      return <sphereGeometry args={[s * 0.5, 32, 32]} />;
    case 'cube':
    case 'box':
      return <boxGeometry args={[s, s, s]} />;
    case 'cylinder':
      return <cylinderGeometry args={[s * 0.5, s * 0.5, s, 32]} />;
    case 'pyramid':
    case 'cone':
      return <coneGeometry args={[s * 0.5, s, 4]} />;
    case 'plane':
      return <planeGeometry args={[s, s]} />;
    case 'torus':
      return <torusGeometry args={[s * 0.5, s * 0.15, 16, 32]} />;
    case 'ring':
      return <ringGeometry args={[s * 0.3, s * 0.5, 32]} />;
    case 'capsule':
      return <capsuleGeometry args={[s * 0.3, s * 0.5, 4, 16]} />;
    default:
      return <boxGeometry args={[s, s, s]} />;
  }
}

// ─── Material mapper ────────────────────────────────────────────────────────

function getMaterialProps(node: R3FNode) {
  const props = node.props;
  const materialName = props.material || props.materialPreset;
  const preset = materialName
    ? (MATERIAL_PRESETS as Record<string, Record<string, any>>)[materialName]
    : undefined;

  const matProps: Record<string, any> = { ...(preset || {}) };

  if (props.color) matProps.color = props.color;
  if (props.emissive) matProps.emissive = props.emissive;
  if (props.emissiveIntensity !== undefined) matProps.emissiveIntensity = props.emissiveIntensity;
  if (props.opacity !== undefined) matProps.opacity = props.opacity;
  if (props.transparent !== undefined) matProps.transparent = props.transparent;
  if (props.metalness !== undefined) matProps.metalness = props.metalness;
  if (props.roughness !== undefined) matProps.roughness = props.roughness;
  if (props.wireframe !== undefined) matProps.wireframe = props.wireframe;
  if (props.materialProps) Object.assign(matProps, props.materialProps);
  if (!matProps.color) matProps.color = '#8888cc';

  return matProps;
}

// ─── Mesh node (inline, no store dependency) ────────────────────────────────

function EmbedMeshNode({
  node,
  selectedId,
  onSelect,
}: {
  node: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const { props } = node;
  const hsType = props.hsType || 'box';
  const size = props.size || 1;
  const position = props.position || [0, 0, 0];
  const rotation = props.rotation || [0, 0, 0];
  const scale = props.scale || [1, 1, 1];
  const isSelected = node.id === selectedId;
  const matProps = getMaterialProps(node);

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={typeof scale === 'number' ? [scale, scale, scale] : scale}
      onClick={(e: any) => {
        e.stopPropagation();
        onSelect?.(node.id || null);
      }}
    >
      {getGeometry(hsType, size)}
      <meshPhysicalMaterial
        {...matProps}
        emissive={matProps.emissive || undefined}
        color={matProps.color}
      />
      {isSelected && (
        <mesh>
          {getGeometry(hsType, size * 1.05)}
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </mesh>
  );
}

// ─── Recursive node renderer (inline, no store dependency) ──────────────────

function EmbedNodeRenderer({
  node,
  selectedId,
  onSelect,
}: {
  node: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const children = node.children?.map((child: R3FNode, i: number) => (
    <EmbedNodeRenderer
      key={child.id || `child-${i}`}
      node={child}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  ));

  const { props } = node;

  switch (node.type) {
    case 'mesh':
      return (
        <group>
          <EmbedMeshNode node={node} selectedId={selectedId} onSelect={onSelect} />
          {children}
        </group>
      );
    case 'group':
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
    case 'directionalLight':
      return (
        <directionalLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [5, 10, 5]}
          castShadow={props.shadows ?? false}
        />
      );
    case 'ambientLight':
      return <ambientLight color={props.color} intensity={props.intensity ?? 0.4} />;
    case 'pointLight':
      return (
        <pointLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 5, 0]}
          distance={props.distance}
          decay={props.decay ?? 2}
        />
      );
    case 'spotLight':
      return (
        <spotLight
          color={props.color}
          intensity={props.intensity ?? 1}
          position={props.position || [0, 10, 0]}
          angle={props.angle ?? 0.3}
          penumbra={props.penumbra ?? 0.5}
          castShadow={props.shadows ?? false}
        />
      );
    case 'hemisphereLight':
      return (
        <hemisphereLight
          color={props.color || '#ffffff'}
          groundColor={props.groundColor || '#444444'}
          intensity={props.intensity ?? 0.5}
        />
      );
    case 'Text':
      return (
        <Text
          position={props.position}
          rotation={props.rotation}
          fontSize={props.fontSize ?? 0.5}
          color={props.color || '#ffffff'}
          anchorX="center"
          anchorY="middle"
        >
          {props.text || props.content || ''}
        </Text>
      );
    case 'Sparkles':
      return (
        <Sparkles
          count={props.count ?? 50}
          size={props.size ?? 2}
          scale={props.scale ?? 5}
          color={props.color}
          speed={props.speed ?? 0.5}
        />
      );
    case 'Environment':
      return (
        <Environment preset={props.envPreset || 'studio'} background={props.background ?? false} />
      );
    case 'fog':
      return null;
    case 'EffectComposer':
      return <>{children}</>;
    default:
      return (
        <group position={props.position} rotation={props.rotation} scale={props.scale}>
          {children}
        </group>
      );
  }
}

// ─── Scene content ──────────────────────────────────────────────────────────

function SceneContent({
  r3fTree,
  selectedId,
  onSelect,
}: {
  r3fTree: R3FNode;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const hasLights = r3fTree.children?.some(
    (c: R3FNode) =>
      c.type === 'ambientLight' ||
      c.type === 'directionalLight' ||
      c.type === 'pointLight' ||
      c.type === 'spotLight' ||
      c.type === 'hemisphereLight'
  );
  const hasEnv = r3fTree.children?.some((c: R3FNode) => c.type === 'Environment');

  return (
    <group onClick={() => onSelect?.(null)}>
      {!hasLights && (
        <>
          <ambientLight intensity={0.4} color="#e8e0ff" />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
        </>
      )}
      {!hasEnv && <Environment preset="studio" background={false} />}
      <EmbedNodeRenderer node={r3fTree} selectedId={selectedId} onSelect={onSelect} />
    </group>
  );
}

// ─── Parse pipeline ─────────────────────────────────────────────────────────

function usePipeline(code: string) {
  return useMemo(() => {
    if (!code.trim()) return { r3fTree: null, errors: [] as Array<{ message: string }> };
    try {
      const compiler = new R3FCompiler();
      const trimmed = code.trimStart();
      if (trimmed.startsWith('composition')) {
        const parser = new HoloCompositionParser();
        const result = parser.parse(code);
        if (result.errors && result.errors.length > 0) {
          return {
            r3fTree: null,
            errors: result.errors.map((e: any) => ({
              message: typeof e === 'string' ? e : e.message || String(e),
            })),
          };
        }
        return { r3fTree: compiler.compileComposition(result.ast ?? result), errors: [] };
      }
      const parser = new HoloScriptPlusParser();
      const result = parser.parse(code);
      if (result.errors && result.errors.length > 0) {
        return {
          r3fTree: null,
          errors: result.errors.map((e: any) => ({
            message: typeof e === 'string' ? e : e.message || String(e),
          })),
        };
      }
      return { r3fTree: compiler.compile(result.ast ?? result), errors: [] };
    } catch (err) {
      return {
        r3fTree: null,
        errors: [{ message: err instanceof Error ? err.message : String(err) }],
      };
    }
  }, [code]);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface SceneViewerProps {
  /** HoloScript source code (.hsplus or .holo composition) */
  code: string;
  /** CSS class for the container div */
  className?: string;
  /** Inline styles for the container div */
  style?: React.CSSProperties;
  /** Show grid floor */
  showGrid?: boolean;
  /** Show background stars */
  showStars?: boolean;
  /** Show object count overlay */
  showObjectCount?: boolean;
  /** Background color */
  backgroundColor?: string;
  /** Currently selected object ID */
  selectedObjectId?: string | null;
  /** Callback when an object is clicked */
  onObjectSelect?: (id: string | null) => void;
  /** Callback when errors occur during parse/compile */
  onErrors?: (errors: Array<{ message: string }>) => void;
}

/**
 * Standalone HoloScript 3D viewer.
 * Takes HoloScript code as input, renders the compiled scene via React Three Fiber.
 * Zero external state dependencies — works anywhere React 18 + R3F 8 are available.
 */
export function SceneViewer({
  code,
  className,
  style,
  showGrid = true,
  showStars = true,
  showObjectCount = true,
  backgroundColor = '#0a0a12',
  selectedObjectId,
  onObjectSelect,
  onErrors,
}: SceneViewerProps) {
  const { r3fTree, errors } = usePipeline(code);

  // Report errors upstream
  if (onErrors && errors.length > 0) {
    onErrors(errors);
  }

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <Canvas
        camera={{ position: [3, 3, 5], fov: 60 }}
        shadows
        style={{ background: backgroundColor }}
        gl={{ antialias: true, toneMapping: 3 }}
      >
        <Suspense fallback={null}>
          {r3fTree ? (
            <SceneContent
              r3fTree={r3fTree}
              selectedId={selectedObjectId}
              onSelect={onObjectSelect}
            />
          ) : (
            <group>
              <ambientLight intensity={0.3} />
              <directionalLight position={[5, 10, 5]} intensity={0.8} />
              <Environment preset="studio" background={false} />
            </group>
          )}
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={1}
          maxDistance={50}
        />

        {showGrid && (
          <Grid
            args={[20, 20]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#2d2d3d"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#3d3d4d"
            fadeDistance={25}
            position={[0, -0.01, 0]}
          />
        )}

        {showStars && (
          <Stars radius={80} depth={50} count={2000} factor={3} saturation={0.1} fade speed={0.5} />
        )}

        {/* VR Edit Session — mounts inside Canvas so XR hooks work */}
        <Suspense fallback={null}>
          <VREditSession />
        </Suspense>
      </Canvas>

      {showObjectCount && r3fTree?.children && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: 'rgba(13,13,20,0.8)',
            color: '#888',
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 6,
            backdropFilter: 'blur(4px)',
          }}
        >
          {r3fTree.children.length} object{r3fTree.children.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
