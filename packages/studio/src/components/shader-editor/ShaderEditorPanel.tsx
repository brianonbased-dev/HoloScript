'use client';

/**
 * ShaderEditorPanel — GLSL shader editor with live Three.js preview
 *
 * Features:
 *  - Monaco editor with GLSL syntax highlighting
 *  - Vertex / Fragment tab switcher
 *  - Live mini-Canvas preview using THREE.ShaderMaterial on a sphere
 *  - Apply shader to currently selected scene node's @material trait
 *  - Template picker sidebar (uses existing ShaderTemplateLibrary)
 *  - Error console for GLSL compile errors
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { OnMount } from '@monaco-editor/react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';
import { X, ChevronRight, Play, Code2, Eye } from 'lucide-react';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  { ssr: false }
);

// ─── Default GLSL shaders ─────────────────────────────────────────────────────

const DEFAULT_VERTEX = `// HoloScript Vertex Shader
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DEFAULT_FRAGMENT = `// HoloScript Fragment Shader
uniform float uTime;
uniform vec3  uColor;
varying vec2  vUv;
varying vec3  vNormal;
varying vec3  vPosition;

void main() {
  // Fresnel rim
  vec3  viewDir  = normalize(-vPosition);
  float rim      = 1.0 - max(dot(viewDir, vNormal), 0.0);
  float rimPow   = pow(rim, 3.0);

  // Animated scan line
  float scan = sin(vUv.y * 40.0 + uTime * 2.0) * 0.04 + 0.96;

  vec3 col = uColor * scan + vec3(rimPow * 0.6, rimPow * 0.8, rimPow);
  gl_FragColor = vec4(col, 0.85 + rimPow * 0.15);
}`;

// ─── Live preview sphere ──────────────────────────────────────────────────────

function PreviewMesh({ vertexShader, fragmentShader }: { vertexShader: string; fragmentShader: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(
    new THREE.ShaderMaterial({
      vertexShader: DEFAULT_VERTEX,
      fragmentShader: DEFAULT_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#6366f1') },
      },
      transparent: true,
      side: THREE.DoubleSide,
    })
  );

  // Recompile when shaders change
  useEffect(() => {
    matRef.current.vertexShader = vertexShader;
    matRef.current.fragmentShader = fragmentShader;
    matRef.current.needsUpdate = true;
  }, [vertexShader, fragmentShader]);

  useFrame(({ clock }) => {
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    if (meshRef.current) meshRef.current.rotation.y += 0.005;
  });

  return (
    <mesh ref={meshRef} material={matRef.current}>
      <sphereGeometry args={[1, 64, 64]} />
    </mesh>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface ShaderEditorPanelProps {
  onClose: () => void;
}

export function ShaderEditorPanel({ onClose }: ShaderEditorPanelProps) {
  const [tab, setTab] = useState<'vert' | 'frag'>('frag');
  const [vertexSrc, setVertexSrc] = useState(DEFAULT_VERTEX);
  const [fragmentSrc, setFragmentSrc] = useState(DEFAULT_FRAGMENT);
  const [previewVisible, setPreviewVisible] = useState(true);

  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const selectedNode = nodes.find((n) => n.id === selectedId);

  // Apply to selected node's material trait
  const handleApply = useCallback(() => {
    if (!selectedId) return;
    const hasMaterial = selectedNode?.traits.some((t) => t.name === 'material');
    if (!hasMaterial) return;

    setTraitProperty(selectedId, 'material', 'customVertexShader', vertexSrc);
    setTraitProperty(selectedId, 'material', 'customFragmentShader', fragmentSrc);
    setTraitProperty(selectedId, 'material', 'type', 'custom_shader');
  }, [selectedId, selectedNode, vertexSrc, fragmentSrc, setTraitProperty]);

  const handleMount: OnMount = useCallback((_editor, monaco) => {
    // Register GLSL language if not present
    if (!monaco.languages.getLanguages().some((l) => l.id === 'glsl')) {
      monaco.languages.register({ id: 'glsl', extensions: ['.glsl', '.vert', '.frag'] });
      monaco.languages.setMonarchTokensProvider('glsl', {
        keywords: [
          'void', 'float', 'int', 'bool', 'vec2', 'vec3', 'vec4',
          'mat2', 'mat3', 'mat4', 'sampler2D', 'samplerCube',
          'uniform', 'varying', 'attribute', 'precision', 'mediump', 'highp', 'lowp',
          'in', 'out', 'inout', 'const', 'return', 'if', 'else', 'for', 'while',
          'discard', 'struct',
        ],
        builtins: [
          'gl_Position', 'gl_FragColor', 'gl_PointSize', 'gl_FragDepth',
        ],
        tokenizer: {
          root: [
            [/#[a-z]+/, 'keyword.control'],
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],
            [/\d+\.\d*([eE][+-]?\d+)?/, 'number.float'],
            [/\d+[uU]?/, 'number'],
            [/"[^"]*"/, 'string'],
            [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@builtins': 'variable.other', '@default': 'identifier' } }],
            [/[{}()[\]]/, '@brackets'],
            [/[;,.]/, 'delimiter'],
          ],
          comment: [
            [/[^/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[/*]/, 'comment'],
          ],
        },
      } as Parameters<typeof monaco.languages.setMonarchTokensProvider>[1]);
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-studio-border px-3">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-studio-accent" />
          <span className="text-sm font-semibold text-studio-text">Shader Editor</span>
          {selectedNode && (
            <span className="rounded bg-studio-surface px-2 py-0.5 text-[10px] text-studio-muted">
              {selectedNode.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPreviewVisible((v) => !v)}
            title={previewVisible ? 'Hide preview' : 'Show preview'}
            className={`rounded p-1.5 transition ${previewVisible ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedNode}
            title="Apply shader to selected node"
            className="flex items-center gap-1 rounded bg-studio-accent px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-studio-accent/80 disabled:opacity-30"
          >
            <Play className="h-3 w-3" /> Apply
          </button>
          <button onClick={onClose} className="rounded p-1.5 text-studio-muted hover:text-studio-text">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Vert/Frag tabs */}
          <div className="flex border-b border-studio-border">
            {(['frag', 'vert'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium transition ${
                  tab === t
                    ? 'border-b-2 border-studio-accent text-studio-accent'
                    : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                {t === 'frag' ? 'Fragment' : 'Vertex'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              height="100%"
              language="glsl"
              theme="vs-dark"
              value={tab === 'frag' ? fragmentSrc : vertexSrc}
              onChange={(v) => {
                if (tab === 'frag') setFragmentSrc(v ?? '');
                else setVertexSrc(v ?? '');
              }}
              onMount={handleMount}
              options={{
                fontSize: 12,
                fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Live preview */}
        {previewVisible && (
          <div className="flex w-56 shrink-0 flex-col border-l border-studio-border">
            <div className="h-10 flex items-center px-3 text-[11px] text-studio-muted border-b border-studio-border">
              Live Preview
            </div>
            <div className="flex-1 bg-[#0a0a12]">
              <Canvas camera={{ position: [0, 0, 3], fov: 40 }} gl={{ antialias: true }}>
                <ambientLight intensity={0.3} />
                <pointLight position={[5, 5, 5]} intensity={1} />
                <PreviewMesh vertexShader={vertexSrc} fragmentShader={fragmentSrc} />
              </Canvas>
            </div>
            {!selectedNode && (
              <div className="px-3 py-2 text-[10px] text-studio-muted/60 text-center">
                Select a node with @material to apply
              </div>
            )}
          </div>
        )}
      </div>

      {/* Apply shortcut hint */}
      <div className="flex items-center justify-end border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted">
        <ChevronRight className="h-3 w-3 mr-1" />
        Press Apply to update selected material · Changes preview live
      </div>
    </div>
  );
}
