/**
 * Material Preview Component
 *
 * Real-time 3D material preview using WebGPU/Three.js
 */

'use client';

import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import { useShaderCompilation } from '../../hooks/useShaderCompilation';
import { Download, Eye, EyeOff, Maximize2 } from 'lucide-react';
import * as THREE from 'three';

type PreviewMesh = 'sphere' | 'cube' | 'plane' | 'torus';
type HDRIPreset = 'studio' | 'sunset' | 'forest' | 'night' | 'warehouse';

export function MaterialPreview() {
  const [previewMesh, setPreviewMesh] = useState<PreviewMesh>('sphere');
  const [hdriPreset, setHdriPreset] = useState<HDRIPreset>('studio');
  const [showWireframe, setShowWireframe] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { compiled, isCompiling } = useShaderCompilation();

  const handleScreenshot = () => {
    if (!canvasRef.current) return;

    // Create download link
    const link = document.createElement('a');
    link.download = 'shader-preview.png';
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="material-preview bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">Preview:</span>
          <select
            className="px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600"
            value={previewMesh}
            onChange={(e) => setPreviewMesh(e.target.value as PreviewMesh)}
          >
            <option value="sphere">Sphere</option>
            <option value="cube">Cube</option>
            <option value="plane">Plane</option>
            <option value="torus">Torus</option>
          </select>

          <select
            className="px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 ml-2"
            value={hdriPreset}
            onChange={(e) => setHdriPreset(e.target.value as HDRIPreset)}
          >
            <option value="studio">Studio</option>
            <option value="sunset">Sunset</option>
            <option value="forest">Forest</option>
            <option value="night">Night</option>
            <option value="warehouse">Warehouse</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWireframe(!showWireframe)}
            className={`p-1 rounded ${showWireframe ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Toggle Wireframe"
          >
            {showWireframe ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          <button
            onClick={() => setSplitView(!splitView)}
            className={`p-1 rounded ${splitView ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Split View"
          >
            <Maximize2 size={16} />
          </button>

          <button
            onClick={handleScreenshot}
            className="p-1 text-gray-400 hover:text-white"
            title="Download Screenshot"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="flex-1 relative">
        {isCompiling && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
            <div className="text-white text-sm">Compiling shader...</div>
          </div>
        )}

        <Canvas
          ref={canvasRef}
          gl={{ preserveDrawingBuffer: true }}
          className="w-full h-full"
        >
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          <OrbitControls enableDamping dampingFactor={0.05} />

          <Suspense fallback={null}>
            <Environment preset={hdriPreset as any} />
          </Suspense>

          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />

          <PreviewMeshComponent
            type={previewMesh}
            compiledShader={compiled}
            showWireframe={showWireframe}
          />

          {splitView && (
            <PreviewMeshComponent
              type={previewMesh}
              compiledShader={null}
              showWireframe={showWireframe}
              position={[-2, 0, 0]}
            />
          )}
        </Canvas>
      </div>

      {/* Status */}
      {compiled && (
        <div className="px-3 py-2 border-t border-gray-700 bg-gray-800 text-xs text-gray-400">
          {compiled.errors.length > 0 ? (
            <span className="text-red-500">Compilation failed: {compiled.errors[0]}</span>
          ) : (
            <span className="text-green-500">Shader compiled successfully</span>
          )}
        </div>
      )}
    </div>
  );
}

interface PreviewMeshComponentProps {
  type: PreviewMesh;
  compiledShader: any;
  showWireframe: boolean;
  position?: [number, number, number];
}

function PreviewMeshComponent({
  type,
  compiledShader,
  showWireframe,
  position = [0, 0, 0],
}: PreviewMeshComponentProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  // Create geometry based on type
  const geometry = React.useMemo(() => {
    switch (type) {
      case 'sphere':
        return <sphereGeometry args={[1, 64, 64]} />;
      case 'cube':
        return <boxGeometry args={[1.5, 1.5, 1.5]} />;
      case 'plane':
        return <planeGeometry args={[2, 2, 32, 32]} />;
      case 'torus':
        return <torusGeometry args={[1, 0.4, 32, 64]} />;
      default:
        return <sphereGeometry args={[1, 64, 64]} />;
    }
  }, [type]);

  // Use default material if shader compilation failed
  const material = React.useMemo(() => {
    if (compiledShader && compiledShader.errors.length === 0) {
      // TODO: Apply custom shader material
      return (
        <meshStandardMaterial
          color="#8b5cf6"
          metalness={0.5}
          roughness={0.5}
          wireframe={showWireframe}
        />
      );
    }

    return (
      <meshStandardMaterial
        color="#4b5563"
        metalness={0.3}
        roughness={0.7}
        wireframe={showWireframe}
      />
    );
  }, [compiledShader, showWireframe]);

  return (
    <mesh ref={meshRef} position={position}>
      {geometry}
      {material}
    </mesh>
  );
}
