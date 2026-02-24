'use client';

/**
 * SceneGeneratorPanel — AI-powered scene code generator.
 * Uses GET /api/generate (template list) + POST /api/generate (prompt → code).
 */

import { useEffect, useState } from 'react';
import { Wand2, X, Sparkles, Copy, CheckCircle2, Plus, ChevronRight } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

interface Template { id: string; label: string; emoji: string; description: string; }

interface GenerateResult { success?: boolean; code: string; source?: string; template?: string | null; }

interface SceneGeneratorPanelProps { onClose: () => void; }

export function SceneGeneratorPanel({ onClose }: SceneGeneratorPanelProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  useEffect(() => {
    fetch('/api/generate')
      .then((r) => r.json())
      .then((d: { templates?: Template[] }) => setTemplates(d.templates ?? []))
      .catch(() => {});
  }, []);

  const generate = async (templateId?: string, customPrompt?: string) => {
    const p = customPrompt ?? prompt;
    if (!p && !templateId) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setInserted(false);
    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: p || (templateId ?? ''),
          template: templateId,
        }),
      });
      const d: GenerateResult = await r.json();
      if (!r.ok || d.success === false) throw new Error((d as { error?: string }).error ?? 'Generation failed');
      setResult(d.code);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const insertCode = () => {
    if (!result) return;
    setCode(result);
    setInserted(true);
  };

  const appendCode = () => {
    if (!result) return;
    setCode(code + '\n\n' + result);
    setInserted(true);
  };

  const copyCode = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Wand2 className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">AI Scene Generator</span>
        <span className="ml-1 rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[9px] text-studio-accent">AI</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-3">
        {/* Prompt input */}
        <div className="space-y-2">
          <p className="text-[9px] uppercase tracking-widest text-studio-muted">Describe your scene</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); }}
            placeholder="A foggy forest at night with glowing mushrooms…"
            rows={3}
            className="w-full resize-none rounded-xl border border-studio-border bg-studio-surface px-3 py-2 text-[10px] text-studio-text placeholder:text-studio-muted/60 outline-none focus:border-studio-accent transition"
          />
          <button
            onClick={() => generate()}
            disabled={loading || !prompt.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-[10px] font-semibold text-white hover:brightness-110 disabled:opacity-50 transition"
          >
            {loading ? (
              <Sparkles className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? 'Generating…' : 'Generate Scene (Ctrl+Enter)'}
          </button>
        </div>

        {/* Template grid */}
        {templates.length > 0 && (
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-widest text-studio-muted">Starter templates</p>
            <div className="grid grid-cols-2 gap-1.5">
              {templates.map((t) => (
                <button key={t.id}
                  onClick={() => generate(t.id, t.label)}
                  disabled={loading}
                  className="flex flex-col items-start gap-1 rounded-xl border border-studio-border bg-studio-surface p-2.5 text-left hover:border-studio-accent/50 hover:bg-studio-surface/80 transition disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-base">{t.emoji}</span>
                    <span className="text-[9px] font-semibold flex-1 truncate">{t.label}</span>
                    <ChevronRight className="h-2.5 w-2.5 text-studio-muted/50 shrink-0" />
                  </div>
                  <p className="text-[7px] text-studio-muted leading-snug line-clamp-2">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-700/30 bg-red-900/10 p-3 text-[9px] text-red-400">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-widest text-studio-muted">Generated Code</p>
              <span className="text-[7px] text-studio-muted/60">{result.split('\n').length} lines</span>
            </div>
            <pre className="max-h-52 overflow-auto rounded-xl border border-studio-border bg-studio-surface/60 p-2.5 text-[7px] text-studio-muted/80 leading-relaxed">
              {result}
            </pre>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={insertCode}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[9px] font-semibold transition ${inserted ? 'bg-green-700/30 text-green-400 border border-green-700/40' : 'bg-studio-accent text-white hover:brightness-110'}`}>
                {inserted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {inserted ? 'Inserted!' : 'Replace Scene'}
              </button>
              <button onClick={appendCode}
                className="flex items-center justify-center gap-1 rounded-xl border border-studio-border px-3 py-2 text-[9px] text-studio-muted hover:text-studio-text transition">
                <Plus className="h-3.5 w-3.5" /> Append
              </button>
              <button onClick={copyCode}
                className={`flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-[9px] transition ${copied ? 'border-green-600 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}>
                {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
