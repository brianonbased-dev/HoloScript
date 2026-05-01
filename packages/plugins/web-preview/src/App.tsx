import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stats } from '@react-three/drei';
import { RobotArm } from './components/RobotArm';
import { USDRobotArm } from './components/USDRobotArm';
import { UI } from './components/UI';

export default function App() {
  const [renderMode, setRenderMode] = useState<'demo' | 'usd' | 'holoscript'>('usd');

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [3, 3, 3], fov: 50 }}
        shadows
        style={{ background: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e)' }}
      >
        {/* Enhanced Lighting Setup */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        {/* Fill lights for better depth */}
        <pointLight position={[-5, 5, 5]} intensity={0.5} color="#4a90d9" />
        <pointLight position={[5, 2, -5]} intensity={0.3} color="#d9904a" />
        <hemisphereLight args={['#87ceeb', '#444444', 0.3]} />

        {/* Grid helper */}
        <Grid
          args={[10, 10]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#444444"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#666666"
          fadeDistance={25}
          fadeStrength={1}
          infiniteGrid={true}
        />

        {/* Robot - Switch between demo and USD */}
        {renderMode === 'demo' && <RobotArm />}
        {renderMode === 'usd' && <USDRobotArm />}

        {/* Controls */}
        <OrbitControls makeDefault />

        {/* Performance stats */}
        <Stats />
      </Canvas>

      {/* UI Overlay */}
      <UI renderMode={renderMode} setRenderMode={setRenderMode} />
    </div>
  );
}
