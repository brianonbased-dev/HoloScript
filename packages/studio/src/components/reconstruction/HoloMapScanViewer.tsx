'use client';

import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { HolomapPointCloudViewer } from '@holoscript/r3f-renderer';
import type { HoloMapScanRenderAsset } from '@/lib/holomap-scan-render';

interface HoloMapScanViewerProps {
  renderAsset: HoloMapScanRenderAsset;
}

function boundsCenter(bounds: HoloMapScanRenderAsset['bounds']): [number, number, number] {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

function CameraFocus({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
  }, [camera, target]);

  return null;
}

function BoundsBox({ bounds }: { bounds: HoloMapScanRenderAsset['bounds'] }) {
  const box = useMemo(() => {
    const [minX, minY, minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    return {
      center: boundsCenter(bounds),
      size: [
        Math.max(0.05, maxX - minX),
        Math.max(0.05, maxY - minY),
        Math.max(0.05, maxZ - minZ),
      ] as [number, number, number],
    };
  }, [bounds]);

  return (
    <mesh position={box.center}>
      <boxGeometry args={box.size} />
      <meshBasicMaterial color="#93c5fd" wireframe transparent opacity={0.32} />
    </mesh>
  );
}

function ScanAnchor({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
  );
}

export function HoloMapScanViewer({ renderAsset }: HoloMapScanViewerProps) {
  const target = useMemo(() => boundsCenter(renderAsset.bounds), [renderAsset.bounds]);
  const scanSpan = useMemo(() => {
    const [minX, minY, minZ] = renderAsset.bounds.min;
    const [maxX, maxY, maxZ] = renderAsset.bounds.max;
    return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.1);
  }, [renderAsset.bounds]);
  const cameraPosition = useMemo(
    () =>
      [target[0], target[1], target[2] + scanSpan * 2.3] as [number, number, number],
    [scanSpan, target]
  );
  const pointSize = useMemo(() => {
    return Math.max(0.018, scanSpan / 80);
  }, [scanSpan]);

  return (
    <div
      className="relative h-72 min-h-[18rem] overflow-hidden rounded-xl border border-studio-border bg-[#080b13]"
      style={{ background: '#080b13' }}
      data-testid="holomap-scan-viewer"
    >
      <Canvas
        camera={{ position: cameraPosition, fov: 55 }}
        gl={{
          antialias: true,
          toneMapping: 4,
          outputColorSpace: 'srgb',
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl }) => gl.setClearColor('#080b13', 1)}
      >
        <color attach="background" args={['#080b13']} />
        <CameraFocus target={target} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[3, 5, 4]} intensity={0.8} />
        <HolomapPointCloudViewer
          positionsB64={renderAsset.positionsB64}
          colorsB64={renderAsset.colorsB64}
          pointCount={renderAsset.pointCount}
          pointSize={pointSize}
        />
        <BoundsBox bounds={renderAsset.bounds} />
        <ScanAnchor position={target} />
        <Grid
          args={[8, 8]}
          cellSize={0.5}
          cellThickness={0.45}
          cellColor="#1f2937"
          sectionSize={2}
          sectionThickness={0.8}
          sectionColor="#334155"
          fadeDistance={12}
          position={[0, renderAsset.bounds.min[1] - 0.01, 0]}
        />
        <OrbitControls
          makeDefault
          target={target}
          enableDamping
          dampingFactor={0.1}
          minDistance={0.5}
          maxDistance={20}
        />
      </Canvas>

      <div className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
        HoloMap scan · {renderAsset.pointCount.toLocaleString()} points
      </div>
    </div>
  );
}
