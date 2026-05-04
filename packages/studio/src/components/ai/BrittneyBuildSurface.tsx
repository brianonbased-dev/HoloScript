'use client';

/**
 * BrittneyBuildSurface — chat-with-Brittney + live preview window.
 *
 * The unified entry product:
 *   left pane:  chat with Brittney (streamBrittney + tool execution)
 *   right pane: live SceneViewer rendering whatever the chat builds
 *   below:      feature chips (compile-target preview, common traits) so
 *               the user can poke the surface without typing
 *   header:     "Open in Studio" — the only path into the heavy IDE,
 *               rendered after the first message lands so the surface
 *               itself is 2 clicks deep at most.
 *
 * The pieces composed here all already existed; the contribution is
 * arranging them so the user *sees* what Brittney is building.
 *
 *   - streamBrittney / buildRichContext / executeTool — `@/lib/brittney`
 *   - useSceneStore.code — `@/lib/stores`
 *   - SceneViewer — `@/embed/SceneViewer`
 *   - SuggestionCards — `@/components/ai/SuggestionCards`
 *
 * Mounted at `/build` (see `src/app/build/page.tsx`). Existing `/start`
 * BrittneyFullScreen surface is left untouched on purpose so this is an
 * additive A/B candidate, not a destructive replacement.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Mic,
  MicOff,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  streamBrittney,
  buildRichContext,
  executeTool,
} from '@/lib/brittney';
import type { BrittneyMessage, ToolCallPayload, ToolResult } from '@/lib/brittney';
import { useBrittneyVoice } from '@/hooks/useBrittneyVoice';
import { useSceneGraphStore, useSceneStore } from '@/lib/stores';
import { SuggestionCards } from './SuggestionCards';

// Heavy R3F bundle — defer to client. The preview pane is the marquee
// feature here, but we don't want to block the chat shell on its load.
const SceneViewer = dynamic(
  () => import('@/embed/SceneViewer').then((m) => ({ default: m.SceneViewer })),
  { ssr: false, loading: () => <PreviewSkeleton /> },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'brittney';
  text: string;
  toolResults?: ToolResult[];
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Feature chips — inline picker that works mid-conversation.
// Each chip is a one-shot prompt that nudges the scene in a direction
// without requiring the user to type. Brittney's tool execution turns
// these into real scene edits.
// ---------------------------------------------------------------------------

interface FeatureChip {
  label: string;
  prompt: string;
  group: 'platform' | 'trait' | 'kind';
}

const FEATURE_CHIPS: readonly FeatureChip[] = [
  { label: 'Quest 3 (XR)', prompt: 'Target Quest 3 — make sure traits are XR-ready.', group: 'platform' },
  { label: 'Web (R3F)', prompt: 'Compile this for the web with React Three Fiber.', group: 'platform' },
  { label: 'Unity', prompt: 'Compile this for Unity. Show me what changes.', group: 'platform' },
  { label: 'Robotics (URDF)', prompt: 'Convert the rig to URDF for ROS 2.', group: 'platform' },
  { label: 'Add @physics', prompt: 'Add the @physics trait to the most recent object.', group: 'trait' },
  { label: 'Add @grabbable', prompt: 'Make the most recent object @grabbable.', group: 'trait' },
  { label: 'Add lighting', prompt: 'Add a couple of lights so the scene is well-lit.', group: 'trait' },
  { label: 'A robot', prompt: 'Add a simple robot — base, arm, gripper.', group: 'kind' },
  { label: 'A character', prompt: 'Add a stylized character with rigged limbs.', group: 'kind' },
  { label: 'A dashboard', prompt: 'Add a floating UI dashboard with stat tiles.', group: 'kind' },
];

// ---------------------------------------------------------------------------
// Initial scene — a single welcoming object so the preview pane has
// something to render before the first message. The chat then mutates
// `useSceneStore.code` as Brittney's tool calls land.
// ---------------------------------------------------------------------------

const INITIAL_CODE = `composition "Brittney's Canvas" {
  object "Welcome" {
    @label(text: "describe what you want to build →")
    geometry: "sphere"
    color: "#3b82f6"
    position: [0, 1, 0]
  }
}`;

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function StreamingCursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-studio-accent/70 rounded-full" />
  );
}

function ToolBadge({ result }: { result: ToolResult }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-1.5 text-[11px] ${
        result.success
          ? 'bg-green-500/10 text-green-400 border border-green-500/10'
          : 'bg-red-500/10 text-red-400 border border-red-500/10'
      }`}
    >
      {result.success ? (
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
      )}
      <span>{result.message}</span>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
      <div className="flex flex-col items-center gap-3 text-white/30">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-xs">loading preview…</span>
      </div>
    </div>
  );
}

function FeatureChipRow({ onChip }: { onChip: (prompt: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {FEATURE_CHIPS.map((c) => (
        <button
          key={c.label}
          onClick={() => onChip(c.prompt)}
          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/60 transition hover:border-studio-accent/40 hover:bg-white/[0.06] hover:text-white/85"
          title={c.prompt}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HoloMesh template chips — Path 5 from the wizard-redundancy audit.
//
// OnboardingWizard explicitly offers four Studio-builder paths (GitHub-
// starter / Absorb-driven / domain-templated / Brittney-driven) but
// HoloMesh, one of the four roots, has no entry into the build surface.
// This row closes that gap by surfacing room templates from the live
// `/api/holomesh/team/templates` endpoint. Click → seed the chat with a
// "Set up a <name> session" prompt; Brittney's existing tools take it
// from there. Future iteration can offer inline team-creation; v0 is
// "make HoloMesh visible in the entry."
// ---------------------------------------------------------------------------

interface HolomeshTemplate {
  slug: string;
  name: string;
  description: string;
  mode: string;
  objective: string;
}

// Sanitize HoloMesh-served template strings before splicing into Brittney's
// prompt. Strips control characters / newlines that could break out of the
// inline context, and length-caps so a compromised /api/holomesh/team/templates
// response can't blow out or instruction-inject the prompt the LLM receives.
function sanitizeForPrompt(s: string, maxLen: number): string {
  let stripped = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    stripped += code < 0x20 || code === 0x7f ? ' ' : s[i];
  }
  stripped = stripped.trim();
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen)}...` : stripped;
}

function HolomeshTemplateChips({ onChip }: { onChip: (prompt: string) => void }) {
  const [templates, setTemplates] = useState<HolomeshTemplate[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/holomesh/team/templates')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { templates?: HolomeshTemplate[] }) => {
        if (cancelled) return;
        setTemplates(d.templates ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quietly hide the row when the endpoint is unreachable (local dev w/o
  // backend, etc.). The chips are progressive enhancement — their absence
  // shouldn't dent the rest of the surface. Returning null hides the
  // group label too (parent renders the label only as part of the
  // wrapper this component returns).
  if (loadFailed || templates.length === 0) return null;

  return (
    <div>
      <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/25">
        from holomesh
      </div>
      <div className="flex flex-wrap gap-1.5 px-1">
      {templates.map((t) => {
        const safeName = sanitizeForPrompt(t.name, 60);
        const safeObjective = sanitizeForPrompt(t.objective, 200);
        const prompt = `Set up a HoloMesh "${safeName}" team session — ${safeObjective}.`;
        return (
          <button
            key={t.slug}
            onClick={() => onChip(prompt)}
            className="rounded-full border border-purple-400/20 bg-purple-500/[0.06] px-3 py-1 text-[11px] text-purple-300/80 transition hover:border-purple-400/50 hover:bg-purple-500/[0.12] hover:text-purple-200"
            title={t.description}
          >
            {t.name}
          </button>
        );
      })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main surface
// ---------------------------------------------------------------------------

export function BrittneyBuildSurface() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [llmHistory, setLlmHistory] = useState<BrittneyMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [showCards, setShowCards] = useState(true);

  // Scene state — what's being built, rendered live in the right pane.
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const sceneErrors = useSceneStore((s) => s.errors);
  const setErrors = useSceneStore((s) => s.setErrors);

  const nodes = useSceneGraphStore((s) => s.nodes);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const updateNode = useSceneGraphStore((s) => s.updateNode);
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);

  const {
    isListening,
    interimTranscript,
    transcript,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    clearTranscript,
  } = useBrittneyVoice();

  // Seed scene with the welcome composition on first mount, but only if
  // the user hasn't already typed something. The store persists across
  // navigations so we don't want to clobber an in-progress build.
  useEffect(() => {
    if (!code) setCode(INITIAL_CODE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice transcript → input text.
  useEffect(() => {
    if (transcript) {
      setInput((curr) => (curr ? `${curr} ${transcript}` : transcript));
      clearTranscript();
    }
  }, [transcript, clearTranscript]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSend = useCallback(
    async (text: string) => {
      if (!text || isThinking) return;
      setInput('');
      setShowCards(false);

      const userMsgId = Date.now().toString();
      setMessages((m) => [...m, { id: userMsgId, role: 'user', text }]);

      const updated: BrittneyMessage[] = [...llmHistory, { role: 'user', content: text }];
      setLlmHistory(updated);
      setIsThinking(true);

      // Rich context now uses the live scene — Brittney can see what's
      // already there and reason about it instead of starting from blank.
      const sceneContext = buildRichContext(
        code,
        nodes,
        null,
        null,
      );

      const brittId = (Date.now() + 1).toString();
      setMessages((m) => [
        ...m,
        { id: brittId, role: 'brittney', text: '', isStreaming: true, toolResults: [] },
      ]);

      let acc = '';
      const toolResults: ToolResult[] = [];

      const storeActions = {
        nodes,
        addTrait,
        removeTrait,
        setTraitProperty,
        addNode,
        removeNode,
        updateNode,
        getCode: () => useSceneStore.getState().code ?? '',
        setCode,
      };

      try {
        for await (const event of streamBrittney(updated, sceneContext)) {
          if (event.type === 'text') {
            acc += event.payload as string;
            setMessages((m) =>
              m.map((msg) => (msg.id === brittId ? { ...msg, text: acc } : msg)),
            );
          } else if (event.type === 'tool_call') {
            const tc = event.payload as ToolCallPayload;
            setProgressLabel(`Running ${tc.name}…`);
            const result = executeTool(tc.name, tc.arguments, storeActions);
            setProgressLabel(null);
            toolResults.push(result);
            setMessages((m) =>
              m.map((msg) =>
                msg.id === brittId ? { ...msg, toolResults: [...toolResults] } : msg,
              ),
            );
          } else if (event.type === 'error') {
            acc = `Sorry, I hit an error: ${event.payload}`;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === brittId ? { ...msg, text: acc, isStreaming: false } : msg,
              ),
            );
          } else if (event.type === 'done') {
            break;
          }
        }
      } catch (err) {
        acc = `Connection error — is the backend running? (${String(err)})`;
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === brittId ? { ...msg, text: acc, isStreaming: false, toolResults } : msg,
        ),
      );
      setLlmHistory((h) => [...h, { role: 'assistant', content: acc }]);
      setIsThinking(false);
      setProgressLabel(null);
    },
    [
      isThinking,
      llmHistory,
      code,
      nodes,
      addNode,
      removeNode,
      updateNode,
      addTrait,
      removeTrait,
      setTraitProperty,
      setCode,
    ],
  );

  const handleSend = useCallback(() => runSend(input.trim()), [input, runSend]);
  const handleCardSelect = useCallback(
    (prompt: string) => {
      if (prompt === '') {
        setShowCards(false);
        inputRef.current?.focus();
        return;
      }
      runSend(prompt);
    },
    [runSend],
  );

  const handleOpenStudio = useCallback(() => {
    // Heavy IDE is /create. Scene state is already in zustand stores, so
    // navigating preserves it for free — `/create` reads the same code.
    router.push('/create');
  }, [router]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasConversation = messages.some((m) => m.role === 'user');

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0a12]">
      {/* â”€â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="z-10 flex w-full items-center justify-between border-b border-white/[0.04] px-6 py-3">
        <Link
          href="/"
          aria-label="HoloScript Studio home"
          className="flex items-center gap-2 rounded-lg transition hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-white/60 font-mono font-bold text-sm">
            HS
          </div>
          <span className="text-white/40 text-sm font-medium hidden sm:block">
            Build with Brittney
          </span>
        </Link>
        <button
          onClick={handleOpenStudio}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-studio-accent/30 hover:text-white hover:bg-white/[0.06]"
          title="Open the heavy IDE — full panels, timeline, debugger"
        >
          Open in Studio
          <ArrowRight className="h-4 w-4" />
        </button>
      </header>

      {/* â”€â”€â”€ Main split â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[420px_1fr] xl:grid-cols-[480px_1fr]">
        {/* Left: chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="flex min-h-0 flex-col border-r border-white/[0.04]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {!hasConversation && (
              <div className="flex flex-col items-center justify-center pt-[2vh] text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-studio-accent to-purple-500 shadow-lg shadow-studio-accent/20">
                  <span className="text-lg font-bold text-white">B</span>
                </div>
                <h1 className="mb-1 text-xl font-semibold text-white/90 tracking-tight">
                  What are we building?
                </h1>
                <p className="mb-6 text-xs text-white/30 max-w-xs">
                  Tell me — I'll wire it up live in the window on the right.
                </p>
                {showCards && <SuggestionCards onSelect={handleCardSelect} />}
              </div>
            )}

            {hasConversation && (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="flex max-w-[90%] items-start gap-2">
                      {msg.role === 'brittney' && (
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-studio-accent to-purple-500 text-white text-xs font-bold shadow">
                          B
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-studio-accent text-white rounded-br-md'
                              : 'bg-white/[0.04] text-white/85 border border-white/[0.06] rounded-bl-md'
                          }`}
                        >
                          {msg.text ||
                            (msg.isStreaming ? (
                              <span className="flex items-center gap-2 text-white/40">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Thinking…
                              </span>
                            ) : null)}
                          {msg.isStreaming && msg.text && <StreamingCursor />}
                        </div>
                        {msg.toolResults && msg.toolResults.length > 0 && (
                          <div className="space-y-1 pl-1">
                            {msg.toolResults.map((r, i) => (
                              <ToolBadge key={i} result={r} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {progressLabel && (
                  <div className="ml-9 flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/50">
                    <Sparkles className="h-3 w-3 animate-pulse text-studio-accent" />
                    <span>{progressLabel}</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Feature chips — always available, even mid-conversation */}
          <div className="border-t border-white/[0.04] px-3 py-2 space-y-2">
            <div>
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/25">
                quick adds
              </div>
              <FeatureChipRow onChip={runSend} />
            </div>
            {/* Path 5 — HoloMesh team templates. Rendered below the local
                chips because they're remote-fetched and progressive: the
                component owns its own label and renders nothing when the
                /api/holomesh/team/templates endpoint is unreachable. */}
            <HolomeshTemplateChips onChip={runSend} />
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.04] p-3">
            <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-lg shadow-black/20 transition-colors focus-within:border-studio-accent/30">
              <textarea
                ref={inputRef}
                value={isListening && interimTranscript ? `${input} ${interimTranscript}` : input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Describe what you want to build…"
                disabled={isThinking}
                rows={1}
                className="w-full resize-none bg-transparent px-3.5 py-3 pr-20 text-sm text-white placeholder-white/25 outline-none disabled:opacity-50"
                aria-label="Message Brittney"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                {voiceSupported && (
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isThinking}
                    className={`rounded-lg p-1.5 transition ${
                      isListening
                        ? 'animate-pulse bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'
                    }`}
                    aria-label={isListening ? 'Stop voice recording' : 'Start voice recording'}
                  >
                    {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  onClick={handleSend}
                  disabled={isThinking || !input.trim()}
                  className="rounded-lg bg-studio-accent p-1.5 text-white shadow transition-all hover:bg-studio-accent/80 disabled:opacity-20 disabled:hover:bg-studio-accent"
                  aria-label="Send message to Brittney"
                >
                  {isThinking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right: live preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="relative min-h-0 bg-[#0a0a12]">
          <SceneViewer
            code={code}
            showGrid
            showStars
            showObjectCount
            backgroundColor="#0a0a12"
            onErrors={(errs) => setErrors(errs)}
          />
          {sceneErrors.length > 0 && (
            <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[11px] text-red-300">
              <div className="mb-1 font-semibold">scene errors</div>
              <ul className="space-y-0.5">
                {sceneErrors.slice(0, 3).map((e, i) => (
                  <li key={i} className="truncate">
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasConversation && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/40">
              live preview — updates as we chat
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
