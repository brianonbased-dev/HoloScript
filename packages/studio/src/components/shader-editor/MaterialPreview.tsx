/**
 * Material Preview Component
 *
 * Real-time 3D material preview using Three.js / R3F.
 * Applies compiled ShaderMaterial (vertex + fragment GLSL) to the preview mesh
 * and animates the `uTime` uniform on every frame.
 */

'use client';

import React, { useRef, useState, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';
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
  const [webGLError, setWebGLError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { compiled, isCompiling } = useShaderCompilation();

  // Clear WebGL errors when a new shader is compiled
  useEffect(() => {
    setWebGLError(null);
  }, [compiled]);

  const handleScreenshot = () => {
    if (!canvasRef.current) return;
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
            aria-label="Preview mesh shape"
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
            aria-label="HDRI lighting preset"
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
            aria-label="Toggle wireframe"
          >
            {showWireframe ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          <button
            onClick={() => setSplitView(!splitView)}
            className={`p-1 rounded ${splitView ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Split View"
            aria-label="Toggle split view"
          >
            <Maximize2 size={16} />
          </button>

          <button
            onClick={handleScreenshot}
            className="p-1 text-gray-400 hover:text-white"
            title="Download Screenshot"
            aria-label="Download screenshot"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="flex-1 relative">
        {isCompiling && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
            <div className="text-white text-sm">Compiling shader…</div>
          </div>
        )}

        <StudioErrorBoundary label="Material Preview Canvas">
        <Canvas ref={canvasRef} gl={{ preserveDrawingBuffer: true }} className="w-full h-full">
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          <OrbitControls enableDamping dampingFactor={0.05} />

          <Suspense fallback={null}>
            <Environment preset={hdriPreset as 'studio'} />
          </Suspense>

          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />

          <PreviewMeshComponent
            type={previewMesh}
            compiled={compiled}
            showWireframe={showWireframe}
            onWebGLError={setWebGLError}
          />

          {splitView && (
            <PreviewMeshComponent
              type={previewMesh}
              compiled={null}
              showWireframe={showWireframe}
              position={[-2.5, 0, 0]}
            />
          )}
        </Canvas>
        </StudioErrorBoundary>

        {/* WebGL error overlay */}
        {webGLError && (
          <div className="absolute inset-x-0 bottom-0 z-20 mx-2 mb-2 rounded-lg border border-red-500/60 bg-red-950/90 p-3 backdrop-blur-sm">
            <div className="flex items-start gap-2">
              <span className="text-red-400 text-sm font-semibold shrink-0">⚠ GPU Error</span>
              <button
                onClick={() => setWebGLError(null)}
                className="ml-auto text-red-400 hover:text-white text-xs"
                aria-label="Dismiss GPU error"
              >
                ✕
              </button>
            </div>
            <pre className="mt-1 text-[10px] text-red-300 overflow-auto max-h-28 whitespace-pre-wrap">
              {webGLError}
            </pre>
          </div>
        )}
      </div>

      {/* Status bar */}
      {compiled && (
        <div className="px-3 py-1.5 border-t border-gray-700 bg-gray-800 text-xs text-gray-400">
          {compiled.errors.length > 0 ? (
            <span className="text-red-400">⚠ {compiled.errors[0]}</span>
          ) : webGLError ? (
            <span className="text-red-400">⚠ GPU shader compile error — see overlay</span>
          ) : compiled.warnings.length > 0 ? (
            <span className="text-yellow-400">⚠ {compiled.warnings[0]}</span>
          ) : (
            <span className="text-green-400">✓ Shader compiled successfully</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Preview Mesh ─────────────────────────────────────────────────────────────

interface ICompiledShader {
  vertexCode: string;
  fragmentCode: string;
  uniforms: Array<{ name: string; type: string; value?: unknown }>;
  errors: string[];
  warnings: string[];
}

interface PreviewMeshComponentProps {
  type: PreviewMesh;
  compiled: ICompiledShader | null;
  showWireframe: boolean;
  position?: [number, number, number];
  onWebGLError?: (err: string | null) => void;
}

function PreviewMeshComponent({
  type,
  compiled,
  showWireframe,
  position = [0, 0, 0],
  onWebGLError,
}: PreviewMeshComponentProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Build a real ShaderMaterial when the shader compiles successfully
  const shaderMaterial = useMemo<THREE.ShaderMaterial | null>(() => {
    if (!compiled || compiled.errors.length > 0 || !compiled.vertexCode || !compiled.fragmentCode) {
      return null;
    }

    // Build uniforms object
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
    };
    for (const u of compiled.uniforms) {
      if (u.name !== 'uTime') {
        uniforms[u.name] = { value: u.value ?? 0 };
      }
    }

    try {
      return new THREE.ShaderMaterial({
        vertexShader: compiled.vertexCode,
        fragmentShader: compiled.fragmentCode,
        uniforms,
        wireframe: showWireframe,
      });
    } catch {
      return null;
    }
  }, [compiled, showWireframe]);

  // Detect WebGL GPU shader compile errors via gl program info log
  const { gl } = useThree();
  useEffect(() => {
    if (!shaderMaterial || !onWebGLError) return;
    // Force compilation by accessing the program
    shaderMaterial.needsUpdate = true;
    // Check after next microtask (WebGL compiles async in some drivers)
    const id = setTimeout(() => {
      try {
        const glMat = shaderMaterial as unknown as { program?: { program?: WebGLProgram } };
        const prog = glMat.program?.program;
        if (prog) {
          const glCtx = gl.getContext() as WebGLRenderingContext;
          const linked = glCtx.getProgramParameter(prog, glCtx.LINK_STATUS);
          if (!linked) {
            const log = glCtx.getProgramInfoLog(prog);
            onWebGLError(log ?? 'GPU program link failed');
          } else {
            onWebGLError(null);
          }
        }
      } catch {
        // ignore — program may not be linked yet
      }
    }, 200);
    return () => clearTimeout(id);
  }, [shaderMaterial, gl, onWebGLError]);

  // Animate uTime uniform + slow rotation
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
    }
    if (shaderMaterial && shaderMaterial.uniforms['uTime']) {
      (shaderMaterial.uniforms['uTime'] as THREE.IUniform<number>).value = state.clock.elapsedTime;
    }
  });

  const geometry = useMemo(() => {
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

  return (
    <mesh ref={meshRef} position={position}>
      {geometry}
      {shaderMaterial ? (
        // Apply compiled shader
        <primitive object={shaderMaterial} attach="material" />
      ) : compiled && compiled.errors.length === 0 ? (
        // Compiled OK but no custom code yet — show accent purple
        <meshStandardMaterial
          color="#8b5cf6"
          metalness={0.5}
          roughness={0.5}
          wireframe={showWireframe}
        />
      ) : (
        // Default fallback
        <meshStandardMaterial
          color="#4b5563"
          metalness={0.3}
          roughness={0.7}
          wireframe={showWireframe}
        />
      )}
    </mesh>
  );
}
