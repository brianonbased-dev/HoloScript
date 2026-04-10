'use client';

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';
import { OrbitControls, Environment, Text, Float } from '@react-three/drei';

interface MoodBoardProps {
  agentId: string;
  agentName: string;
  themeColor: string;
}

function EmptyRoom({ agentName }: { agentName: string }) {
  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <Text
        fontSize={0.3}
        color="#4b5563"
        anchorX="center"
        anchorY="middle"
        font="/fonts/inter-medium.woff"
      >
        {`${agentName} hasn't decorated yet`}
      </Text>
    </Float>
  );
}

function SceneContent({ source }: { source: string }) {
  // Parse .holo source into basic primitives for mood board display
  // This is a simplified renderer — full compilation happens via MCP
  const objects = parseBasicScene(source);

  return (
    <>
      {objects.map((obj, i) => (
        <mesh key={i} position={obj.position as [number, number, number]}>
          {obj.type === 'sphere' ? (
            <sphereGeometry args={[obj.scale || 0.5, 32, 32]} />
          ) : obj.type === 'cylinder' ? (
            <cylinderGeometry args={[obj.scale || 0.5, obj.scale || 0.5, 1, 32]} />
          ) : (
            <boxGeometry args={[obj.scale || 1, obj.scale || 1, obj.scale || 1]} />
          )}
          <meshStandardMaterial color={obj.color || '#6366f1'} roughness={0.4} metalness={0.1} />
        </mesh>
      ))}
    </>
  );
}

interface BasicObject {
  type: string;
  position: number[];
  scale?: number;
  color?: string;
}

function parseBasicScene(source: string): BasicObject[] {
  const objects: BasicObject[] = [];
  const objectRegex = /object\s+(\w+)\s*\{([^}]*)\}/gi;
  let match;
  while ((match = objectRegex.exec(source)) !== null) {
    const body = match[2];
    const posMatch = body.match(/position:\s*\[([^\]]+)\]/);
    const colorMatch = body.match(/color:\s*["']([^"']+)["']/);
    const name = match[1].toLowerCase();
    const type = name.includes('sphere') ? 'sphere' : name.includes('cylinder') ? 'cylinder' : 'box';
    objects.push({
      type,
      position: posMatch ? posMatch[1].split(',').map(Number) : [0, 0, 0],
      color: colorMatch ? colorMatch[1] : '#6366f1',
    });
  }
  return objects;
}

export function MoodBoardViewport({ agentId, agentName, themeColor }: MoodBoardProps) {
  const [scene, setScene] = useState<{ hasScene: boolean; source?: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/holomesh/agent/${agentId}/scene`)
      .then((r) => r.json())
      .then((data) => setScene(data))
      .catch(() => setError(true));
  }, [agentId]);

  if (error) return null;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border-2"
      style={{
        aspectRatio: '16/9',
        borderColor: themeColor + '40',
        boxShadow: `0 0 40px ${themeColor}20, 0 0 80px ${themeColor}10`,
      }}
    >
      <StudioErrorBoundary label="MoodBoard Canvas">
      <Canvas
        camera={{ position: [3, 2, 5], fov: 50 }}
        style={{ background: 'linear-gradient(180deg, #0a0a12 0%, #1a1a2e 100%)' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <Environment preset="night" />
          {scene?.hasScene && scene.source ? (
            <SceneContent source={scene.source} />
          ) : (
            <EmptyRoom agentName={agentName} />
          )}
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={2}
          maxDistance={15}
          maxPolarAngle={Math.PI * 0.8}
          autoRotate
          autoRotateSpeed={0.5}
        />
      </Canvas>
      </StudioErrorBoundary>
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/50 text-[10px] text-white/40">
        drag to orbit
      </div>
    </div>
  );
}
