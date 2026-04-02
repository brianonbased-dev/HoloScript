'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { useAIStore, useSceneStore } from '@/lib/stores';
import { generateScene } from '@/lib/api';
import { STATUS_RESET_DURATION } from '@/lib/ui-timings';

const SUGGESTIONS = [
  'A floating island with waterfalls',
  'A neon cyberpunk street corner',
  'A cozy medieval tavern',
  'A space station control room',
  'An underwater coral reef',
  'A zen garden with cherry blossoms',
];

export function PromptBar() {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const status = useAIStore((s) => s.status);
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const setAIStatus = useAIStore((s) => s.setStatus);
  const model = useAIStore((s) => s.model);
  const addPrompt = useAIStore((s) => s.addPrompt);
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);

  const isGenerating = status === 'generating';
  const isDisconnected = ollamaStatus === 'disconnected';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    setAIStatus('generating');

    try {
      const result = await generateScene({
        prompt: trimmed,
        existingCode: code || undefined,
        model,
      });

      if (result.success && result.code) {
        setCode(result.code);
        addPrompt({
          id: `${Date.now()}`,
          prompt: trimmed,
          code: result.code,
          timestamp: Date.now(),
        });
        setPrompt('');
        setAIStatus('idle');
      } else {
        setAIStatus('error');
        setTimeout(() => setAIStatus('idle'), STATUS_RESET_DURATION);
      }
    } catch {
      setAIStatus('error');
      setTimeout(() => setAIStatus('idle'), STATUS_RESET_DURATION);
    }
  }, [prompt, isGenerating, code, model, setAIStatus, setCode, addPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Main prompt input */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            code
              ? 'Refine your scene... "Add a dragon" or "Make it nighttime"'
              : 'Describe your 3D scene... "A floating crystal castle with glowing towers"'
          }
          disabled={isGenerating}
          rows={2}
          className="w-full resize-none rounded-xl border border-studio-border bg-studio-surface px-4 py-3 pr-12 text-studio-text placeholder-studio-muted outline-none transition focus:border-studio-accent focus:ring-1 focus:ring-studio-accent/50 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={isGenerating || !prompt.trim()}
          className="absolute bottom-3 right-3 rounded-lg bg-studio-accent p-2 text-white transition hover:bg-studio-accent/80 disabled:opacity-30"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Status messages */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-sm text-studio-accent animate-fade-in">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating your scene...
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-studio-error animate-fade-in">
          Generation failed. Please try again.
        </div>
      )}

      {isDisconnected && !isGenerating && (
        <div className="rounded-lg border border-studio-border bg-studio-surface/50 px-3 py-2 text-xs text-studio-muted">
          Using built-in scene generator. Install Ollama for AI-powered generation.
        </div>
      )}

      {/* Suggestion chips (only show when no code yet) */}
      {!code && !isGenerating && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setPrompt(s)}
              className="flex items-center gap-1.5 rounded-full border border-studio-border bg-studio-panel px-3 py-1.5 text-xs text-studio-muted transition hover:border-studio-accent hover:text-studio-text"
            >
              <Sparkles className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
