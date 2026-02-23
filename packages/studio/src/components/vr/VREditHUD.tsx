/**
 * VREditHUD — Floating world-space UI panels for the VR editor
 *
 * Renders a Scene Graph list + selected object inspector as
 * 3D billboard panels anchored in front of the user's view.
 * Uses @react-three/drei's Html component for world-space DOM.
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneGraphStore, useEditorStore } from '@/lib/store';

// ─── Scene Graph List Panel ───────────────────────────────────────────────────

function SceneListPanel() {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);

  return (
    <div
      style={{
        width: 220,
        background: 'rgba(10,10,18,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: 12,
        backdropFilter: 'blur(12px)',
        color: '#e2e2e8',
        fontSize: 12,
        fontFamily: 'Inter, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
        Scene
      </div>
      {nodes.length === 0 && (
        <div style={{ opacity: 0.4, fontSize: 11 }}>Empty scene</div>
      )}
      {nodes.map((node) => (
        <div
          key={node.id}
          onClick={() => setSelectedId(node.id === selectedId ? null : node.id)}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            marginBottom: 2,
            background: node.id === selectedId ? 'rgba(99,102,241,0.3)' : 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ opacity: 0.5, fontSize: 10 }}>{node.type}</span>
          <span>{node.name}</span>
          {node.traits.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5, background: 'rgba(99,102,241,0.2)', padding: '1px 4px', borderRadius: 4 }}>
              {node.traits.length}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Inspector Panel ──────────────────────────────────────────────────────────

function InspectorPanel() {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const node = nodes.find((n) => n.id === selectedId);

  if (!node) {
    return (
      <div
        style={{
          width: 220,
          background: 'rgba(10,10,18,0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: 12,
          backdropFilter: 'blur(12px)',
          color: '#e2e2e8',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ opacity: 0.4, fontSize: 11 }}>Select an object to inspect</div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 220,
        background: 'rgba(10,10,18,0.92)',
        border: '1px solid rgba(99,102,241,0.4)',
        borderRadius: 12,
        padding: 12,
        backdropFilter: 'blur(12px)',
        color: '#e2e2e8',
        fontSize: 12,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{node.name}</div>
      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 8, display: 'flex', gap: 4 }}>
        <span style={{ background: 'rgba(99,102,241,0.2)', padding: '2px 6px', borderRadius: 4 }}>{node.type}</span>
      </div>

      {/* Position */}
      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Transform</div>
      {(['position', 'rotation', 'scale'] as const).map((prop) => (
        <div key={prop} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 48, opacity: 0.5, fontSize: 10 }}>{prop.slice(0, 3).toUpperCase()}</span>
          {node[prop].map((v, i) => (
            <span key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '2px 4px', textAlign: 'right', fontSize: 10 }}>
              {v.toFixed(2)}
            </span>
          ))}
        </div>
      ))}

      {/* Traits */}
      {node.traits.length > 0 && (
        <>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 8, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Traits</div>
          {node.traits.map((t) => (
            <div key={t.name} style={{ fontSize: 11, padding: '3px 6px', background: 'rgba(99,102,241,0.15)', borderRadius: 6, marginBottom: 3 }}>
              @{t.name}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── HUD anchor — follows camera with offset ──────────────────────────────────

export function VREditHUD() {
  const hudRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();

  useFrame(() => {
    if (!hudRef.current) return;

    // Position HUD 1.2m in front, 0.6m left, 0.3m down from eye level
    camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, camera.up).normalize();
    _up.copy(camera.up);

    const target = camera.position
      .clone()
      .addScaledVector(_dir, 1.2)
      .addScaledVector(_right, -0.6)
      .addScaledVector(_up, -0.15);

    hudRef.current.position.lerp(target, 0.1);
    hudRef.current.quaternion.slerp(camera.quaternion, 0.1);
  });

  return (
    <group ref={hudRef}>
      {/* Scene list — left */}
      <Html
        position={[-0.12, 0, 0]}
        transform
        occlude={false}
        style={{ pointerEvents: 'auto' }}
        scale={0.002}
        zIndexRange={[10, 11]}
      >
        <SceneListPanel />
      </Html>

      {/* Inspector — right */}
      <Html
        position={[0.12, 0, 0]}
        transform
        occlude={false}
        style={{ pointerEvents: 'auto' }}
        scale={0.002}
        zIndexRange={[10, 11]}
      >
        <InspectorPanel />
      </Html>
    </group>
  );
}
