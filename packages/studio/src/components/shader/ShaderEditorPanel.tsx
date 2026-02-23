'use client';

/**
 * ShaderEditorPanel — GLSL snippet editor with preset catalog and @material codegen.
 */

import { useState, useEffect } from 'react';
import { Code2, X, Copy, Plus, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

interface ShaderPreset {
  id: string; name: string; category: string; description: string;
  emoji: string; vertexGLSL?: string; fragmentGLSL?: string; traitSnippet: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  distortion: '#ff6644', color: '#44aaff', procedural: '#aa44ff', post: '#44ffaa',
};

interface GlslShaderPanelProps { onClose: () => void; }

export function GlslShaderPanel({ onClose }: GlslShaderPanelProps) {
  const [presets, setPresets] = useState<ShaderPreset[]>([]);
  const [selected, setSelected] = useState<ShaderPreset | null>(null);
  const [activeTab, setActiveTab] = useState<'fragment' | 'vertex'>('fragment');
  const [customGLSL, setCustomGLSL] = useState('');
  const [glslErrors, setGlslErrors] = useState<string[]>([]);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  useEffect(() => {
    fetch('/api/shader-presets')
      .then((r) => r.json())
      .then((d: { presets: ShaderPreset[] }) => {
        setPresets(d.presets);
        if (d.presets[0]) {
          setSelected(d.presets[0]);
          setCustomGLSL(d.presets[0].fragmentGLSL ?? d.presets[0].vertexGLSL ?? '');
        }
      })
      .catch(() => {});
  }, []);

  const loadPreset = (p: ShaderPreset) => {
    setSelected(p);
    setActiveTab(p.fragmentGLSL ? 'fragment' : 'vertex');
    setCustomGLSL(p.fragmentGLSL ?? p.vertexGLSL ?? '');
    setGlslErrors([]);
  };

  // Basic client-side GLSL lint (heuristic only)
  const validate = () => {
    const errors: string[] = [];
    if (!customGLSL.trim()) { errors.push('Shader is empty.'); }
    if (customGLSL.includes('while(true)') || customGLSL.includes('while (true)')) {
      errors.push('Infinite loops are not allowed in GLSL shaders.');
    }
    const openBraces = (customGLSL.match(/\{/g) ?? []).length;
    const closeBraces = (customGLSL.match(/\}/g) ?? []).length;
    if (openBraces !== closeBraces) errors.push(`Mismatched braces: ${openBraces} opened, ${closeBraces} closed.`);
    setGlslErrors(errors);
    return errors.length === 0;
  };

  const buildSnippet = () => {
    if (!selected) return '';
    const glslKey = activeTab === 'fragment' ? 'fragmentShader' : 'vertexShader';
    return `  @material {\n    ${glslKey}: "${selected.id}"\n    /* custom GLSL:\n${customGLSL.split('\n').map((l) => '      ' + l).join('\n')}\n    */\n  }`;
  };

  const insert = () => {
    if (!validate()) return;
    const name = selected?.name ?? 'Custom';
    setCode(code + `\nobject "${name.replace(/\s+/g,'_')}_Shader" {\n${buildSnippet()}\n}\n`);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(buildSnippet());
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Code2 className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Shader Editor</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preset list */}
      <div className="shrink-0 max-h-44 overflow-y-auto border-b border-studio-border divide-y divide-studio-border/40">
        {presets.map((p) => (
          <div key={p.id} className={`${selected?.id === p.id ? 'bg-studio-accent/8' : ''}`}>
            <button
              onClick={() => { loadPreset(p); setExpandedPreset((prev) => prev === p.id ? null : p.id); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-surface/50 transition">
              {expandedPreset === p.id ? <ChevronDown className="h-3 w-3 shrink-0 text-studio-muted" /> : <ChevronRight className="h-3 w-3 shrink-0 text-studio-muted" />}
              <span className="text-sm">{p.emoji}</span>
              <span className="flex-1 text-[10px] font-medium">{p.name}</span>
              <span className="rounded-full px-1.5 py-0.5 text-[7px]"
                style={{ backgroundColor: `${CATEGORY_COLORS[p.category] ?? '#888'}22`, color: CATEGORY_COLORS[p.category] ?? '#888' }}>
                {p.category}
              </span>
            </button>
            {expandedPreset === p.id && (
              <p className="px-8 pb-1.5 text-[8px] text-studio-muted">{p.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* GLSL editor */}
      <div className="flex shrink-0 border-b border-studio-border">
        {(['fragment', 'vertex'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-[9px] font-medium transition ${activeTab === tab ? 'border-b-2 border-studio-accent text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)} GLSL
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <textarea
          value={customGLSL}
          onChange={(e) => { setCustomGLSL(e.target.value); setGlslErrors([]); }}
          spellCheck={false}
          placeholder="// Enter GLSL code here…"
          className="flex-1 resize-none bg-[#080810] p-3 font-mono text-[9px] text-green-300/90 outline-none placeholder-studio-muted/30 leading-relaxed"
        />

        {/* Errors */}
        {glslErrors.length > 0 && (
          <div className="shrink-0 border-t border-red-900/40 bg-red-950/40 p-2 space-y-1">
            {glslErrors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0 text-red-400 mt-0.5" />
                <p className="text-[8px] text-red-300">{e}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-studio-border flex gap-1.5 p-2.5">
        <button onClick={validate}
          className="flex items-center gap-1 rounded-xl border border-studio-border px-3 py-2 text-[9px] text-studio-muted hover:text-studio-text transition">
          Validate
        </button>
        <button onClick={insert}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-2 text-[10px] font-semibold text-white hover:brightness-110 transition">
          <Plus className="h-3 w-3" /> Insert Object
        </button>
        <button onClick={copy}
          className={`flex items-center gap-1 rounded-xl border px-3 py-2 text-[9px] transition ${copied ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}>
          <Copy className="h-3 w-3" /> {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
