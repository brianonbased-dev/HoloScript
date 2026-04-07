/**
 * VRBrittney — Brittney's floating voice bubble in VR
 *
 * Provides a compact text-input panel anchored to the right
 * controller, allowing the user to type commands to Brittney
 * while in immersive mode. Brittney's responses appear as
 * a floating speech bubble above the controller.
 */

'use client';

import { useRef, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { streamBrittney, buildRichContext } from '@/lib/brittney';
import type { BrittneyMessage, ToolCallPayload } from '@/lib/brittney';
import { executeTool } from '@/lib/brittney';
import { useSceneGraphStore, useEditorStore, useSceneStore } from '@/lib/stores';
import { BrittneyAvatarMesh } from './BrittneyAvatarMesh';

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
        text || "Hi! I'm Brittney. What would you like to build?"
      )}
      {/* Bubble tail */}
      <div
        style={{
          position: 'absolute',
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid rgba(99,102,241,0.9)',
        }}
      />
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
  const [listening, setListening] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSend(value.trim());
      setValue('');
    }
  };

  const handleVoice = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    setListening(true);
    rec.onresult = (ev: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => {
      onSend(ev.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }, [onSend]);

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
      {/* Voice button */}
      <button
        type="button"
        onClick={handleVoice}
        disabled={disabled || listening}
        style={{
          background: listening ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.2)',
          border: 'none',
          borderRadius: 6,
          color: listening ? '#ef4444' : '#818cf8',
          cursor: 'pointer',
          fontSize: 14,
          padding: '2px 6px',
          transition: 'background 0.2s',
        }}
      >
        🎤
      </button>
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
  const selectedName = useEditorStore((s) => s.selectedObjectName);
  const code = useSceneStore((s) => s.code) ?? '';
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);
  const addNode = useSceneGraphStore((s) => s.addNode);

  const elapsedRef = useRef(0);
  const [isGazed, setIsGazed] = useState(false);
  const _toCamera = new THREE.Vector3();

  // Float right of center + gaze detection + thinking idle
  useFrame((_, delta) => {
    if (!brittRef.current) return;
    elapsedRef.current += delta;
    const t = elapsedRef.current;

    camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, camera.up).normalize();

    const target = camera.position
      .clone()
      .addScaledVector(_dir, 1.0)
      .addScaledVector(_right, 0.4)
      .addScaledVector(camera.up, -0.3);

    // Thinking idle: gentle Y-rotation + figure-8 bob
    if (isThinking) {
      brittRef.current.rotation.y = Math.sin(t * 1.2) * 0.18;
      target.x += Math.sin(t * 0.8) * 0.035;
      target.y += Math.cos(t * 1.6) * 0.02;
    } else {
      brittRef.current.rotation.y *= 0.9; // dampen back to 0
    }

    brittRef.current.position.lerp(target, 0.08);
    brittRef.current.quaternion.slerp(camera.quaternion, 0.08);

    // Gaze detection: dot(camera→Brittney direction, camera forward) > 0.7
    _toCamera.copy(brittRef.current.position).sub(camera.position).normalize();
    const dot = _dir.dot(_toCamera);
    setIsGazed(dot > 0.7);
  });

  const handleSend = async (text: string) => {
    setIsThinking(true);
    const newHistory: BrittneyMessage[] = [...history, { role: 'user', content: text }];
    setHistory(newHistory);

    const sceneContext = buildRichContext(code, nodes, selectedId, selectedName);
    const getCodeFn = () => useSceneStore.getState().code ?? '';
    const setCodeFn = useSceneStore.getState().setCode;
    const storeActions = {
      nodes,
      addTrait,
      removeTrait,
      setTraitProperty,
      addNode,
      getCode: getCodeFn,
      setCode: setCodeFn,
    };

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
      {/* Avatar mesh — positioned to the left of the speech UI.
           isSpeaking prop drives mouth/glow animation.
           isGazed prop triggers a subtle brightness/scale pulse. */}
      <BrittneyAvatarMesh isSpeaking={isThinking || isGazed} />

      {/* Speech bubble — above and slightly right */}
      <Html
        position={[0.1, 0.12, 0]}
        transform
        occlude={false}
        scale={0.002}
        center
        zIndexRange={[20, 21]}
      >
        <BrittneySpeechBubble text={lastResponse} isThinking={isThinking} />
      </Html>

      {/* Input panel — below speech bubble */}
      <Html
        position={[0.1, -0.01, 0]}
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
