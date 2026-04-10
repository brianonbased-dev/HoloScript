'use client';

/**
 * AIMaterialPanel — prompts Ollama to generate a GLSL fragment shader + @material trait.
 * Opens as a right-side drawer or bottom panel inside the Studio.
 */

import { useState } from 'react';
import { Sparkles, Loader2, Copy, Check, RotateCcw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAIMaterial } from '@/hooks/useAIMaterial';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface AIMaterialPanelProps {
  onClose: () => void;
  /** Called when user clicks "Apply to Selected" */
  onApply?: (glsl: string, traits: string) => void;
}

const EXAMPLE_PROMPTS = [
  'volcanic lava surface with glowing cracks',
  'deep sea bioluminescent coral',
  'iridescent soap bubble on dark background',
  'holographic neon grid cyberpunk floor',
  'weathered rust and oxidized copper',
  'northern lights aurora bokeh',
];

export function AIMaterialPanel({ onClose, onApply }: AIMaterialPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [baseColor, setBaseColor] = useState('#4466ff');
  const [copiedGlsl, setCopiedGlsl] = useState(false);
  const [copiedTraits, setCopiedTraits] = useState(false);
  const [expandGlsl, setExpandGlsl] = useState(true);

  const { generate, glsl, traits, status, error, reset } = useAIMaterial();

  const isGenerating = status === 'generating';
  const isDone = status === 'done';

  async function handleGenerate() {
    if (!prompt.trim()) return;
    await generate({ prompt: prompt.trim(), baseColor });
  }

  async function copyText(text: string, setter: (v: boolean) => void) {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), COPY_FEEDBACK_DURATION);
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-studio-accent" />
        <span className="flex-1 text-[12px] font-semibold">AI Material Generator</span>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
        {/* Prompt input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium uppercase tracking-widest text-studio-muted">
            Describe the material
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. glowing lava with cracks, ocean waves at night…"
            className="resize-none rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-[12px] text-studio-text placeholder:text-studio-muted outline-none focus:border-studio-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
            }}
          />
          {/* Example prompts */}
          <div className="flex flex-wrap gap-1">
            {EXAMPLE_PROMPTS.slice(0, 4).map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-studio-border/60 bg-studio-surface/60 px-2 py-0.5 text-[9px] text-studio-muted hover:border-studio-accent hover:text-studio-accent transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Base color */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-studio-muted">Base Color</label>
          <input
            type="color"
            value={baseColor}
            onChange={(e) => setBaseColor(e.target.value)}
            className="h-6 w-10 cursor-pointer rounded border border-studio-border bg-transparent"
          />
          <span className="font-mono text-[10px] text-studio-muted">{baseColor}</span>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate Material
            </>
          )}
        </button>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {isDone && (
          <div className="flex flex-col gap-3">
            {/* Traits */}
            {traits && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-studio-muted">
                    HoloScript Trait
                  </span>
                  <button
                    onClick={() => copyText(traits, setCopiedTraits)}
                    className="flex items-center gap-1 text-[9px] text-studio-muted hover:text-studio-text"
                  >
                    {copiedTraits ? (
                      <Check className="h-3 w-3 text-green-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedTraits ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="overflow-auto rounded bg-studio-surface p-2 text-[10px] text-studio-accent font-mono">
                  {traits}
                </pre>
              </div>
            )}

            {/* GLSL */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpandGlsl((v) => !v)}
                  className="flex items-center gap-1 text-[10px] font-medium text-studio-muted hover:text-studio-text"
                >
                  {expandGlsl ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  GLSL Shader ({glsl.split('\n').length} lines)
                </button>
                <button
                  onClick={() => copyText(glsl, setCopiedGlsl)}
                  className="flex items-center gap-1 text-[9px] text-studio-muted hover:text-studio-text"
                >
                  {copiedGlsl ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedGlsl ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {expandGlsl && (
                <pre className="max-h-48 overflow-auto rounded bg-[#0a0a12] p-2 text-[10px] text-studio-text font-mono leading-relaxed">
                  {glsl}
                </pre>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {onApply && (
                <button
                  onClick={() => onApply(glsl, traits)}
                  className="flex-1 rounded-lg bg-green-600/80 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-green-600 transition"
                >
                  Apply to Selected Object
                </button>
              )}
              <button
                onClick={reset}
                className="flex items-center gap-1 rounded-lg border border-studio-border px-3 py-1.5 text-[11px] text-studio-muted hover:text-studio-text transition"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
