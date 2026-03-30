import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';

// In a real workflow, this would be the compiled output of FlatSemanticCompiler
// For the starter kit, we provide a placeholder until the user runs the CLI.
const SemanticScene = () => {
  return (
    <group>
      <Html position={[0, 0, 0]} transform center>
        <div
          style={{
            padding: '2rem',
            background: 'rgba(30, 41, 59, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            color: 'white',
            width: '300px',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#60a5fa' }}>
            HoloScript 2D Revolution
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            Compile your <code style={{ color: '#f472b6' }}>src/scene.holo</code> using the
            HoloScript CLI using:
            <br />
            <br />
            <code
              style={{
                background: '#0f172a',
                padding: '0.5rem',
                display: 'block',
                borderRadius: '4px',
              }}
            >
              npx holoscript compile src/scene.holo --target web-2d --projection flat-semantic
            </code>
          </p>
        </div>
      </Html>
    </group>
  );
};

export default function App() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
      }}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        <SemanticScene />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
