/**
 * VRBrittney — Brittney's floating voice bubble in VR
 *
 * Provides a compact text-input panel anchored to the right
 * controller, allowing the user to type commands to Brittney
 * while in immersive mode. Brittney's responses appear as
 * a floating speech bubble above the controller.
 */

'use client';

import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { streamBrittney, buildSceneContext } from '@/lib/brittney';
import type { BrittneyMessage, ToolCallPayload } from '@/lib/brittney';
import { executeTool } from '@/lib/brittney';
import { useSceneGraphStore, useEditorStore } from '@/lib/store';

// ─── Speech bubble ────────────────────────────────────────────────────────────

function BrittneySpeechBubble({ text, isThinking }: { text: string; isThinking: boolean }) {
  return (
    <div
      style={{
        maxWidth: 280,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 16,
        padding: '10px 14px',
        color: '#fff',
        fontSize: 13,
        fontFamily: 'Inter, sans-serif',
        lineHeight: 1.5,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
      }}
    >
      {isThinking ? (
        <span style={{ opacity: 0.7, fontStyle: 'italic' }}>Thinking…</span>
      ) : (
        text || 'Hi! I\'m Brittney. What would you like to build?'
      )}
      {/* Bubble tail */}
      <div style={{
        position: 'absolute',
        bottom: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '8px solid rgba(99,102,241,0.9)',
      }} />
    </div>
  );
}

// ─── Text input panel ─────────────────────────────────────────────────────────

function BrittneyInputPanel({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSend(value.trim());
      setValue('');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: 6,
        background: 'rgba(10,10,18,0.9)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: 6,
        backdropFilter: 'blur(12px)',
        pointerEvents: 'auto',
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask Brittney…"
        disabled={disabled}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          color: '#e2e2e8',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        style={{
          background: 'rgba(99,102,241,0.8)',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          fontSize: 11,
          padding: '4px 10px',
          cursor: 'pointer',
          opacity: disabled || !value.trim() ? 0.4 : 1,
        }}
      >
        Send
      </button>
    </form>
  );
}

// ─── Main VRBrittney component ────────────────────────────────────────────────

export function VRBrittney() {
  const brittRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();

  const [lastResponse, setLastResponse] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<BrittneyMessage[]>([]);

  const nodes = useSceneGraphStore((s) => s.nodes);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);
  const addNode = useSceneGraphStore((s) => s.addNode);

  // Float right of center, slightly down
  useFrame(() => {
    if (!brittRef.current) return;

    camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, camera.up).normalize();

    const target = camera.position
      .clone()
      .addScaledVector(_dir, 1.0)
      .addScaledVector(_right, 0.4)
      .addScaledVector(camera.up, -0.3);

    brittRef.current.position.lerp(target, 0.08);
    brittRef.current.quaternion.slerp(camera.quaternion, 0.08);
  });

  const handleSend = async (text: string) => {
    setIsThinking(true);
    const newHistory: BrittneyMessage[] = [...history, { role: 'user', content: text }];
    setHistory(newHistory);

    const sceneContext = buildSceneContext(nodes, selectedId);
    const storeActions = { nodes, addTrait, removeTrait, setTraitProperty, addNode };

    let accumulated = '';
    try {
      for await (const event of streamBrittney(newHistory, sceneContext)) {
        if (event.type === 'text') {
          accumulated += event.payload as string;
          setLastResponse(accumulated);
        } else if (event.type === 'tool_call') {
          const tc = event.payload as ToolCallPayload;
          executeTool(tc.name, tc.arguments, storeActions);
        } else if (event.type === 'done') {
          break;
        }
      }
    } catch (err) {
      accumulated = `Error: ${String(err)}`;
      setLastResponse(accumulated);
    }

    setHistory((h) => [...h, { role: 'assistant', content: accumulated }]);
    setIsThinking(false);
  };

  return (
    <group ref={brittRef}>
      {/* Speech bubble — above input */}
      <Html
        position={[0, 0.08, 0]}
        transform
        occlude={false}
        scale={0.002}
        center
        zIndexRange={[20, 21]}
      >
        <BrittneySpeechBubble text={lastResponse} isThinking={isThinking} />
      </Html>

      {/* Input panel — below */}
      <Html
        position={[0, -0.01, 0]}
        transform
        occlude={false}
        scale={0.002}
        center
        zIndexRange={[20, 21]}
        style={{ width: 300 }}
      >
        <BrittneyInputPanel onSend={handleSend} disabled={isThinking} />
      </Html>
    </group>
  );
}
