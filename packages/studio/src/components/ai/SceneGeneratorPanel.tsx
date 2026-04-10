'use client';

/**
 * SceneGeneratorPanel — right-rail AI scene generator.
 * Converts natural language prompts into HoloScript scenes via /api/generate.
 * Preview the generated code, then apply it to the main editor in one click.
 */

import { useState, useRef } from 'react';
import {
  Wand2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { useSceneGenerator } from '@/hooks/useSceneGenerator';
import { useSceneStore } from '@/lib/stores';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

const EXAMPLE_PROMPTS = [
  'A medieval castle courtyard at sunset with torches',
  'Futuristic space station interior with glowing panels',
  'Enchanted forest with bioluminescent mushrooms',
  'Desert ruins with wind-worn sandstone columns',
  'Cozy cabin with fireplace and snow outside',
];

interface SceneGeneratorPanelProps {
  onClose: () => void;
}

export function SceneGeneratorPanel({ onClose }: SceneGeneratorPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const existingCode = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  const { status, generatedCode, warning, error, generate, reset } = useSceneGenerator();

  const handleGenerate = () => {
    setApplied(false);
    generate(prompt, undefined);
  };

  const handleRefine = () => {
    setApplied(false);
    generate(prompt, existingCode);
  };

  const handleApply = () => {
    if (!generatedCode) return;
    setCode(generatedCode);
    setApplied(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), SAVE_FEEDBACK_DURATION);
    });
  };

  const handleExample = (ex: string) => {
    setPrompt(ex);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Wand2 className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">AI Scene Generator</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Prompt input */}
        <div>
          <label className="mb-1 block text-[10px] text-studio-muted">Describe your scene</label>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleGenerate();
            }}
            placeholder="e.g. A cyberpunk alley with neon signs and rain puddles…"
            rows={3}
            className="w-full resize-none rounded-xl border border-studio-border bg-studio-surface px-3 py-2 text-[11px] text-studio-text outline-none placeholder-studio-muted/40 focus:border-studio-accent"
          />
          <p className="mt-1 text-[9px] text-studio-muted">Ctrl+Enter to generate</p>
        </div>

        {/* Example prompts */}
        <div>
          <p className="mb-1 text-[10px] text-studio-muted">Examples</p>
          <div className="flex flex-wrap gap-1">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                onClick={() => handleExample(ex)}
                className="rounded-full border border-studio-border bg-studio-surface px-2 py-0.5 text-[9px] text-studio-muted hover:text-studio-accent hover:border-studio-accent/40 transition"
              >
                {ex.slice(0, 30)}…
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || status === 'generating'}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-studio-accent py-2 text-[11px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {status === 'generating' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            Generate
          </button>
          <button
            onClick={handleRefine}
            disabled={!prompt.trim() || status === 'generating' || !existingCode.trim()}
            title="Modify the current scene based on your prompt"
            className="flex items-center gap-1.5 rounded-xl border border-studio-border px-3 py-2 text-[11px] text-studio-muted hover:text-studio-accent transition disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refine
          </button>
        </div>

        {/* Warning */}
        {warning && (
          <div className="flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-2.5 text-[10px] text-yellow-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {warning}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-[11px] text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Generated code preview */}
        {generatedCode && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-studio-muted">Generated scene</p>
              <div className="flex gap-1">
                <button
                  onClick={handleCopy}
                  className="text-[10px] text-studio-muted hover:text-studio-accent transition"
                >
                  {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
                <button
                  onClick={reset}
                  className="text-[10px] text-studio-muted hover:text-red-400 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <pre className="max-h-64 overflow-y-auto rounded-xl border border-studio-border bg-studio-surface p-2.5 text-[9px] font-mono text-studio-text leading-relaxed whitespace-pre-wrap">
              {generatedCode}
            </pre>
          </div>
        )}
      </div>

      {/* Apply button */}
      {generatedCode && (
        <div className="shrink-0 border-t border-studio-border p-3">
          <button
            onClick={handleApply}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              applied
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-studio-accent text-white hover:brightness-110'
            }`}
          >
            {applied ? <CheckCircle className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {applied ? 'Applied to editor!' : 'Apply to Scene'}
          </button>
        </div>
      )}
    </div>
  );
}
