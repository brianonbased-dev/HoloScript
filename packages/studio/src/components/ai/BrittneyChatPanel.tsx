'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import {
  Send,
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  Mic,
  MicOff,
  Trash2,
  Volume2,
  VolumeX,
  Wrench,
  ChevronDown,
  MessagesSquare,
  Plus,
  Pencil,
  Archive,
} from 'lucide-react';
import type { ConversationSummary } from '@/lib/brittney/conversationsClient';
import {
  streamAssistant,
  buildRichContext,
  executeTool,
  SimulationToolExecutor,
} from '@/lib/brittney';
import type {
  AssistantMessage,
  ToolCallPayload,
  ToolResult,
  ToolResultPayload,
} from '@/lib/brittney';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { HologramMcpContentRenderer } from '@holoscript/r3f-renderer';
import { detectHologramContent } from '@holoscript/core';
import { useEditorStore, useSceneGraphStore, useSceneStore } from '@/lib/stores';
import { useHistoryStore, setNextHistoryLabel } from '@/lib/historyStore';
import { StudioEvents } from '@/lib/analytics';
import { useAssistantVoice } from '@/hooks/useBrittneyVoice';
import { useUnifiedBrittneyHistory } from '@/hooks/useUnifiedBrittneyHistory';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';
import { useAgentStore } from '@/lib/stores/agentStore';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import {
  buildWorkspaceAssistantContext,
  type BrittneyAbsorbStatusContext,
  type BrittneyBoardContext,
  type BrittneyDaemonJobContext,
  type BrittneyGitContext,
} from '@/lib/brittney/workspaceContext';

// ─── Markdown + LaTeX message rendering ─────────────────────────────────────────
// Inlined here (not a separate file) to stay within the render-surface native
// freeze: BrittneyChatPanel is grandfathered; a Markdown/KaTeX renderer wraps
// third-party libs and cannot be HS-native.

/**
 * Normalize the TeX delimiters Brittney emits — `\( … \)` (inline) and
 * `\[ … \]` (display) — to the `$ … $` / `$$ … $$` delimiters remark-math
 * understands, so e.g. `\( ^{ai}\text{Brittney} \)` renders as real math.
 * `$`/`$$` already pass through. Function replacements avoid the
 * `$$`-means-literal-`$` footgun in String.replace's replacement string.
 */
function normalizeMath(text: string): string {
  return text
    .replace(/\\\[/g, () => '$$')
    .replace(/\\\]/g, () => '$$')
    .replace(/\\\(/g, () => '$')
    .replace(/\\\)/g, () => '$');
}

/** Render an assistant message as Markdown + LaTeX (KaTeX). User messages stay plain. */
function MarkdownMessage({ text }: { text: string }) {
  return (
    <div
      className={
        'break-words [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ' +
        '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 ' +
        '[&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic ' +
        '[&_a]:text-studio-accent [&_a]:underline ' +
        '[&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.95em] ' +
        '[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/40 [&_pre]:p-2 ' +
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
        '[&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:font-semibold ' +
        '[&_table]:my-1 [&_table]:w-full [&_th]:border [&_th]:border-studio-border/50 [&_th]:px-1 ' +
        '[&_td]:border [&_td]:border-studio-border/40 [&_td]:px-1'
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
}

// ─── Message model ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolResults?: ToolResult[];
  isStreaming?: boolean;
}

const GREETING: ChatMessage = {
  id: '0',
  role: 'assistant',
  text: "Hi! I'm your assistant. Tell me what you want to build and I'll add traits, compose behaviors, and shape the scene for you.",
};

/**
 * Map persisted `toolCalls` (write-through qq65) back onto this surface's
 * ToolResult shape, best-effort. Entries can be the server persistence shape
 * `{id,name,input,result:{success,error?,data?}}` or the client whitelist
 * shape `{tool,success,message}` — narrow defensively and never throw;
 * malformed entries degrade to a generic badge.
 */
function toolCallsToToolResults(toolCalls: unknown[]): ToolResult[] {
  const results: ToolResult[] = [];
  for (const entry of toolCalls) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const result =
      typeof e.result === 'object' && e.result !== null
        ? (e.result as Record<string, unknown>)
        : undefined;
    const tool =
      typeof e.name === 'string' ? e.name : typeof e.tool === 'string' ? e.tool : 'tool';
    const success =
      typeof result?.success === 'boolean'
        ? result.success
        : typeof e.success === 'boolean'
          ? e.success
          : true;
    let message = '';
    if (typeof result?.error === 'string') {
      message = result.error;
    } else if (typeof e.message === 'string') {
      message = e.message;
    } else if (result && 'data' in result) {
      try {
        const json = JSON.stringify(result.data) ?? '';
        message = json.length > 200 ? `${json.slice(0, 200)}…` : json;
      } catch {
        // Circular / non-serializable data — keep the empty message.
      }
    }
    results.push({ tool, success, message });
  }
  return results;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Add a physics trait to the selected object',
  'Make something glow with a neon blue color',
  'Create a patrol guard AI agent',
  'Add a Gaussian Splat to the scene',
];

interface DaemonJobsPayload {
  jobs?: BrittneyDaemonJobContext[];
  error?: string;
}

async function fetchAssistantJson<T>(input: RequestInfo | URL): Promise<T> {
  const response = await fetch(input);
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? `Request failed (${response.status})`);
  }
  return json;
}

// ─── Tool result badge ────────────────────────────────────────────────────────

/**
 * Collapsible group for an assistant turn's tool-call signals. Rendered ABOVE the
 * response text. Collapsed by default (a one-line "N tool calls · ok/err" header) so
 * rapid tool-call badges don't flood the chat; auto-expands when a result needs the
 * user's confirm/decline.
 */
function ToolResultsGroup({
  results,
  isStreaming,
  onConfirm,
  onDecline,
}: {
  results: ToolResult[];
  isStreaming?: boolean;
  onConfirm: (i: number) => void;
  onDecline: (i: number) => void;
}) {
  const needsAction = results.some((r) => r.requiresConfirmation);
  const [expanded, setExpanded] = useState(false);
  const open = expanded || needsAction;
  const okCount = results.filter((r) => r.success).length;
  const errCount = results.length - okCount;
  return (
    <div className="mb-1 w-full max-w-[88%]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] text-studio-muted transition hover:text-studio-text"
      >
        <Wrench className="h-3 w-3" />
        <span>
          {results.length} tool {results.length === 1 ? 'call' : 'calls'}
        </span>
        {okCount > 0 && <span className="text-emerald-400">{okCount} ok</span>}
        {errCount > 0 && <span className="text-rose-400">{errCount} err</span>}
        {needsAction && <span className="text-amber-400">action needed</span>}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {results.map((r, i) => (
            <div key={i} className="space-y-1">
              <ToolBadge
                result={r}
                onConfirm={isStreaming ? undefined : () => onConfirm(i)}
                onDecline={isStreaming ? undefined : () => onDecline(i)}
              />
              {r.envelope !== undefined && <HologramMcpContentRenderer envelope={r.envelope} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolBadge({
  result,
  onConfirm,
  onDecline,
}: {
  result: ToolResult;
  onConfirm?: () => void;
  onDecline?: () => void;
}) {
  const stateClass = result.requiresConfirmation
    ? 'bg-yellow-500/10 text-yellow-300'
    : result.success
      ? 'bg-green-500/10 text-green-400'
      : 'bg-red-500/10 text-red-400';
  const canConfirm = Boolean(result.requiresConfirmation && result.pendingAction && onConfirm);
  return (
    <div className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${stateClass}`}>
      {result.success ? (
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        {result.message}
        {result.diff?.changes?.length ? ` (${result.diff.changes.join('; ')})` : ''}
      </span>
      {canConfirm && (
        <span className="ml-auto flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onConfirm}
            aria-label="Apply preview"
            title="Apply preview"
            className="rounded p-0.5 text-yellow-200 transition hover:bg-yellow-400/20 hover:text-white"
          >
            <CheckCircle2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDecline}
            aria-label="Decline preview"
            title="Decline preview"
            className="rounded p-0.5 text-yellow-200/70 transition hover:bg-yellow-400/20 hover:text-white"
          >
            <XCircle className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );
}

// ─── Conversation switcher ────────────────────────────────────────────────────

/**
 * Thread picker for the server-backed conversation store. Lists the scope's
 * threads (newest activity first), starts fresh threads, and exposes
 * rename/archive per thread. Hidden when signed out — localStorage keeps the
 * single-thread behavior there.
 */
function ConversationSwitcher({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onArchive,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const label = active ? active.title || 'Untitled chat' : 'New chat';

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Conversations"
        aria-label="Switch conversation"
        aria-expanded={open}
        className="flex max-w-[160px] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] text-studio-muted transition hover:bg-studio-border hover:text-studio-text"
      >
        <MessagesSquare className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-studio-border bg-studio-panel shadow-xl">
          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex w-full items-center gap-1.5 border-b border-studio-border/60 px-2.5 py-1.5 text-left text-[11px] text-studio-accent transition hover:bg-studio-surface"
          >
            <Plus className="h-3 w-3" />
            New chat
          </button>
          <div className="max-h-56 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="px-2.5 py-2 text-[10px] text-studio-muted">No saved conversations yet.</p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 px-2.5 py-1.5 transition hover:bg-studio-surface ${
                  c.id === activeId ? 'bg-studio-surface/60' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[11px] text-studio-text">
                    {c.title || 'Untitled chat'}
                  </span>
                  <span className="block text-[9px] text-studio-muted">
                    {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = window.prompt('Rename conversation', c.title || 'Untitled chat');
                    if (next !== null && next.trim()) onRename(c.id, next.trim());
                  }}
                  title="Rename conversation"
                  aria-label={`Rename conversation ${c.title || 'Untitled chat'}`}
                  className="rounded p-1 text-studio-muted opacity-0 transition hover:text-studio-text group-hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onArchive(c.id)}
                  title="Archive conversation"
                  aria-label={`Archive conversation ${c.title || 'Untitled chat'}`}
                  className="rounded p-1 text-studio-muted opacity-0 transition hover:text-amber-400 group-hover:opacity-100"
                >
                  <Archive className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function BrittneyChatPanel() {
  const pathname = usePathname();
  // The Brittney route gates all LLM spend on an authenticated session
  // (SEC-T03 — see sec-t03-llm-routes-auth.test.ts). Without this gate the
  // assistant fires a doomed POST /api/brittney that returns a security-
  // mandated 401, surfacing an opaque "API error 401" dead-end. Track auth
  // status so we offer an actionable sign-in CTA instead.
  const { status: sessionStatus } = useSession();
  const isUnauthenticated = sessionStatus === 'unauthenticated';
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const selectedName = useEditorStore((s) => s.selectedObjectName);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const code = useSceneStore((s) => s.code) ?? '';
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspace = useWorkspaceStore((s) =>
    s.activeWorkspaceId
      ? (s.workspaces.find((workspace) => workspace.id === s.activeWorkspaceId) ?? null)
      : null
  );
  const isAgentRunning = useAgentStore((s) => s.isRunning);
  const agentPhase = useAgentStore((s) => s.currentPhase);
  const agentAction = useAgentStore((s) => s.currentAction);
  const agentCycleCount = useAgentStore((s) => s.cycleCount);
  const agentLastError = useAgentStore((s) => s.lastError);
  const toolCallHistory = useOrchestrationStore((s) => s.toolCallHistory);
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const updateNode = useSceneGraphStore((s) => s.updateNode);

  // Unified history — one active thread shared with /start, /build, /create.
  // The old `routeScope: pathname` made /vibe and /create separate per-page
  // histories; the unified hook drops route fragmentation, anchors on the
  // workspace, and (when signed in) syncs threads through
  // /api/brittney/conversations so history survives browsers and devices.
  const {
    scope: assistantHistoryScope,
    threadKey: assistantThreadKey,
    history: savedHistory,
    addMessage: persistMessage,
    clearHistory: clearPersistedHistory,
    isLoaded: assistantHistoryLoaded,
    conversations,
    activeConversationId,
    newConversation,
    selectConversation,
    renameConversation,
    archiveConversation,
    adoptConversation,
    enqueueUpload,
  } = useUnifiedBrittneyHistory();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([GREETING]);
  const [loadedThreadKey, setLoadedThreadKey] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [llmHistory, setLlmHistory] = useState<AssistantMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [workspaceGitStatus, setWorkspaceGitStatus] = useState<BrittneyGitContext | null>(null);
  const [workspaceJobs, setWorkspaceJobs] = useState<BrittneyDaemonJobContext[]>([]);
  const [assistantTeamId, setAssistantTeamId] = useState<string | null>(null);
  const [teamBoard, setTeamBoard] = useState<BrittneyBoardContext | null>(null);
  const [vibeAbsorbStatus, setVibeAbsorbStatus] = useState<BrittneyAbsorbStatusContext | null>(
    null
  );

  const executorRef = useRef<SimulationToolExecutor | null>(null);
  if (!executorRef.current) {
    executorRef.current = new SimulationToolExecutor();
  }

  const getStoreActions = useCallback(
    () => ({
      nodes: useSceneGraphStore.getState().nodes,
      addTrait,
      removeTrait,
      setTraitProperty,
      addNode,
      removeNode,
      updateNode,
      getCode: () => useSceneStore.getState().code ?? '',
      setCode: useSceneStore.getState().setCode,
    }),
    [addTrait, removeTrait, setTraitProperty, addNode, removeNode, updateNode]
  );

  /** Speak text aloud via Web Speech Synthesis */
  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      // Cancel any in-progress speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      // Prefer a voice with a conversational tone for the assistant persona
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(
        (v) => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Zira')
      );
      if (femaleVoice) utterance.voice = femaleVoice;
      window.speechSynthesis.speak(utterance);
    },
    [ttsEnabled]
  );

  // Load persisted history after storage has resolved for the current thread.
  // Keyed on threadKey (scope + active conversation) so switching threads —
  // not just workspaces — rebuilds the rendered messages and LLM history.
  useEffect(() => {
    if (!assistantHistoryLoaded || loadedThreadKey === assistantThreadKey) return;
    setLoadedThreadKey(assistantThreadKey);
    if (savedHistory.length > 0) {
      setChatMessages([
        GREETING,
        ...savedHistory.map((m, i) => {
          // Persisted tool traces (write-through qq65) rebuild the tool
          // badges best-effort; absent/malformed traces render text-only.
          const toolResults = Array.isArray(m.toolCalls)
            ? toolCallsToToolResults(m.toolCalls)
            : [];
          return {
            id: `h-${i}`,
            role: m.role === 'user' ? 'user' : ('assistant' as ChatMessage['role']),
            text: m.content,
            ...(toolResults.length > 0 ? { toolResults } : {}),
          };
        }),
      ]);
      setLlmHistory(
        savedHistory.map(
          (m) =>
            ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
            }) as AssistantMessage
        )
      );
    } else {
      setChatMessages([GREETING]);
      setLlmHistory([]);
    }
  }, [assistantHistoryLoaded, assistantThreadKey, loadedThreadKey, savedHistory]);

  // Voice input
  const {
    isListening,
    isSupported: voiceSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useAssistantVoice();
  // Append confirmed voice transcript to input
  useEffect(() => {
    if (transcript) {
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript).trim());
      clearTranscript();
    }
  }, [transcript, clearTranscript]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTeamId =
      window.localStorage.getItem('holomesh_active_team_id') ??
      window.localStorage.getItem('workspace_workbench_team_id') ??
      process.env.NEXT_PUBLIC_HOLOMESH_TEAM_ID ??
      '';
    setAssistantTeamId(storedTeamId.trim() || null);
  }, []);

  // ─── /vibe session-start probe ──────────────────────────────────────────────
  // On the /vibe route Brittney has no active workspace, so she can't determine
  // which repos are scanned or what the board looks like. This effect fires once
  // on mount (when pathname is /vibe) to proactively fetch the Absorb project
  // list so Brittney's first reply reflects real operating context rather than
  // assumed defaults. Board context is already fetched via loadTeamBoardContext.
  useEffect(() => {
    if (pathname !== '/vibe') return;
    let cancelled = false;

    async function probeVibeSessionContext() {
      try {
        const absorbRes = await fetch('/api/absorb/projects');
        if (cancelled) return;
        if (absorbRes.ok) {
          interface AbsorbProject {
            id: string;
            name?: string | null;
            status?: string | null;
            repoUrl?: string | null;
            stats?: { totalFiles?: number | null; totalSymbols?: number | null } | null;
          }
          interface AbsorbProjectsPayload {
            projects?: AbsorbProject[];
          }
          const payload = (await absorbRes.json()) as AbsorbProjectsPayload;
          const projects = (payload.projects ?? []).map((p) => ({
            id: p.id,
            name: p.name ?? null,
            status: p.status ?? null,
            repoUrl: p.repoUrl ?? null,
            totalFiles: p.stats?.totalFiles ?? null,
            totalSymbols: p.stats?.totalSymbols ?? null,
          }));
          setVibeAbsorbStatus({ projects });
        } else {
          setVibeAbsorbStatus({ projects: [], error: `absorb/projects ${absorbRes.status}` });
        }
      } catch (err) {
        if (!cancelled) {
          setVibeAbsorbStatus({
            projects: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    void probeVibeSessionContext();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceRuntimeContext() {
      setWorkspaceGitStatus(null);
      setWorkspaceJobs([]);
      if (!activeWorkspace?.localPath) return;

      const encodedPath = encodeURIComponent(activeWorkspace.localPath);
      const [gitResult, jobsResult] = await Promise.allSettled([
        fetchAssistantJson<BrittneyGitContext>(`/api/git/status?workspacePath=${encodedPath}`),
        fetchAssistantJson<DaemonJobsPayload>('/api/daemon/jobs'),
      ]);
      if (cancelled) return;

      if (gitResult.status === 'fulfilled') {
        setWorkspaceGitStatus(gitResult.value);
      }
      if (jobsResult.status === 'fulfilled') {
        const jobs = jobsResult.value.jobs ?? [];
        setWorkspaceJobs(
          jobs.filter(
            (job) =>
              job.projectId === activeWorkspace.id || job.projectPath === activeWorkspace.localPath
          )
        );
      }
    }

    void loadWorkspaceRuntimeContext();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, activeWorkspace?.localPath]);

  useEffect(() => {
    let cancelled = false;

    async function loadTeamBoardContext() {
      setTeamBoard(null);
      if (!assistantTeamId) return;
      try {
        const board = await fetchAssistantJson<BrittneyBoardContext>(
          `/api/holomesh/team/${encodeURIComponent(assistantTeamId)}/board`
        );
        if (!cancelled) setTeamBoard(board);
      } catch (err) {
        if (!cancelled) {
          setTeamBoard({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    void loadTeamBoardContext();
    return () => {
      cancelled = true;
    };
  }, [assistantTeamId]);

  // Auto-scroll to bottom on new messages — but ONLY if the user is already near the
  // bottom. Tool-call signals stream in rapidly during a turn; yanking the view down
  // each time stuck the user at the bottom (founder feedback). If they've scrolled up
  // to read, leave their position alone.
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Listen for external prompt injection (from Prompt Library panel)
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (prompt) setInput(prompt);
    };
    window.addEventListener('assistant-prompt', handler);
    window.addEventListener('brittney-prompt', handler);
    return () => {
      window.removeEventListener('assistant-prompt', handler);
      window.removeEventListener('brittney-prompt', handler);
    };
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    // SEC-T03: the assistant requires an authenticated session. Surface an
    // actionable sign-in prompt rather than firing a request that 401s.
    if (isUnauthenticated) {
      setInput('');
      setChatMessages((m) => [
        ...m,
        { id: Date.now().toString(), role: 'user', text },
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: 'Sign in to use the assistant — AI generation is tied to your account so usage stays scoped to your workspace.',
        },
      ]);
      return;
    }
    setInput('');

    StudioEvents.brittneyPromptSent(text.length);

    // Write-through qq65: when authenticated, the Brittney route persists
    // both turns server-side. The local cache is still written immediately
    // (localOnly) — only the client upload is suppressed. Signed-out flow is
    // untouched: no conversation identity is sent and uploads behave as today.
    const serverPersistIntent = sessionStatus === 'authenticated';
    const userTimestamp = Date.now();

    // Add user message to chat
    const userMsgId = userTimestamp.toString();
    setChatMessages((m) => [...m, { id: userMsgId, role: 'user', text }]);
    persistMessage(
      { role: 'user', content: text, timestamp: userTimestamp },
      { localOnly: serverPersistIntent }
    );

    // Build updated LLM history
    const updatedHistory: AssistantMessage[] = [...llmHistory, { role: 'user', content: text }];
    setLlmHistory(updatedHistory);
    setIsThinking(true);

    // Build rich assistant context: workspace/repo state first, scene source second.
    const sceneContext = buildRichContext(code, nodes, selectedId, selectedName);
    const assistantContext = buildWorkspaceAssistantContext({
      sceneContext,
      historyScope: assistantHistoryScope,
      routeScope: pathname,
      workspace: activeWorkspace,
      git: workspaceGitStatus,
      board: teamBoard,
      teamId: assistantTeamId,
      daemonJobs: workspaceJobs,
      agentRuntime: {
        isRunning: isAgentRunning,
        currentPhase: agentPhase,
        currentAction: agentAction,
        cycleCount: agentCycleCount,
        lastError: agentLastError,
      },
      toolCalls: toolCallHistory.slice(-8),
      absorbStatus: vibeAbsorbStatus,
    });

    // Create streaming assistant message placeholder
    const assistantMsgId = (Date.now() + 1).toString();
    setChatMessages((m) => [
      ...m,
      { id: assistantMsgId, role: 'assistant', text: '', isStreaming: true, toolResults: [] },
    ]);

    let accumulatedText = '';
    const toolResults: ToolResult[] = [];
    // Set by the server's early `conversation` event — the write-through qq65
    // confirmation that this turn is persisted server-side. Stays false on
    // crash/old-server so the legacy client upload path takes over.
    let conversationConfirmed = false;

    try {
      const storeActions = getStoreActions();

      for await (const event of streamAssistant(
        updatedHistory,
        assistantContext,
        undefined,
        serverPersistIntent
          ? { conversationId: activeConversationId, scope: assistantHistoryScope }
          : undefined
      )) {
        if (event.type === 'conversation') {
          // Defensive narrow (write-through qq65): only a string id counts as
          // confirmation — without one we cannot adopt the thread, so fall
          // back to the legacy upload instead of trusting a malformed event.
          const convoId = (event.payload as { conversationId?: unknown } | null)?.conversationId;
          if (typeof convoId === 'string' && convoId.length > 0) {
            conversationConfirmed = true;
            adoptConversation(convoId);
          }
        } else if (event.type === 'persisted') {
          // Informational per-row ack — nothing to do client-side.
        } else if (event.type === 'text') {
          accumulatedText += event.payload as string;
          setChatMessages((m) =>
            m.map((msg) => (msg.id === assistantMsgId ? { ...msg, text: accumulatedText } : msg))
          );
        } else if (event.type === 'tool_call') {
          const tc = event.payload as ToolCallPayload;
          let result: ToolResult;

          if (executorRef.current?.isSimulationTool(tc.name)) {
            const simRes = await executorRef.current.execute(
              tc.name,
              tc.arguments as Record<string, unknown>
            );
            result = {
              tool: tc.name,
              success: simRes.success,
              message: simRes.message,
            };
          } else {
            result = executeTool(tc.name, tc.arguments, storeActions);
          }

          StudioEvents.brittneyToolCalled(tc.name, result.success);
          toolResults.push(result);
          setChatMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, toolResults: [...toolResults] } : msg
            )
          );
        } else if (event.type === 'tool_result') {
          // Server-side MCP/embodied/studio tool resolved. The `data` field
          // carries the raw MCP envelope so hologram-typed responses
          // (task_1778114362909_zp7u) can be detected at this surface and
          // rendered via /hologram instead of as text.
          const trp = event.payload as ToolResultPayload;
          const isHologram = detectHologramContent(trp.data) !== null;
          const result: ToolResult = {
            tool: trp.name,
            success: trp.success,
            message: trp.error
              ? trp.error
              : isHologram
                ? `Hologram returned by ${trp.name}`
                : `${trp.name} ok`,
            envelope: trp.data,
          };
          toolResults.push(result);
          setChatMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, toolResults: [...toolResults] } : msg
            )
          );
        } else if (event.type === 'error') {
          accumulatedText = `Sorry, I hit an error: ${event.payload}`;
          setChatMessages((m) =>
            m.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, text: accumulatedText, isStreaming: false }
                : msg
            )
          );
        } else if (event.type === 'done') {
          break;
        }
      }

      // ─── Semantic Undo Commit ────────────────────────────────────────────────
      if (toolResults.some((r) => r.success && !r.requiresConfirmation)) {
        setNextHistoryLabel(`AI Action: ${text.length > 25 ? text.substring(0, 25) + '…' : text}`);
        useHistoryStore
          .getState()
          .syncState(useSceneGraphStore.getState().nodes, useSceneStore.getState().code ?? '');
      }
    } catch (err) {
      accumulatedText = `Connection error — is Ollama running? (${String(err)})`;
    }

    // Finalize message
    setChatMessages((m) =>
      m.map((msg) =>
        msg.id === assistantMsgId
          ? { ...msg, text: accumulatedText, isStreaming: false, toolResults }
          : msg
      )
    );

    // Update LLM history with the assistant response
    setLlmHistory((h) => [...h, { role: 'assistant', content: accumulatedText }]);
    // Serializable projection of the turn's tool calls (write-through qq65) —
    // whitelist {tool,success,message}; envelope/pendingAction/diff are
    // dropped (non-serializable or too large for a persisted row).
    const persistedToolCalls = toolResults.map((r) => ({
      tool: r.tool,
      success: r.success,
      message: r.message,
    }));
    const assistantHistoryMsg = {
      role: 'assistant' as const,
      content: accumulatedText,
      ...(persistedToolCalls.length > 0 ? { toolCalls: persistedToolCalls } : {}),
    };
    if (serverPersistIntent && conversationConfirmed) {
      // Server persisted both turns — local cache only.
      persistMessage(assistantHistoryMsg, { localOnly: true });
    } else if (serverPersistIntent) {
      // Server never confirmed write-through (crash / pre-qq65 deploy) —
      // re-enqueue the suppressed user turn and upload normally.
      enqueueUpload([{ role: 'user', content: text, timestamp: userTimestamp }]);
      persistMessage(assistantHistoryMsg);
    } else {
      persistMessage(assistantHistoryMsg);
    }

    setIsThinking(false);

    // TTS: speak the response
    if (
      accumulatedText &&
      !accumulatedText.startsWith('Sorry') &&
      !accumulatedText.startsWith('Connection error')
    ) {
      speak(accumulatedText);
    }
  }, [
    input,
    isThinking,
    isUnauthenticated,
    sessionStatus,
    activeConversationId,
    adoptConversation,
    enqueueUpload,
    llmHistory,
    nodes,
    selectedId,
    selectedName,
    code,
    assistantHistoryScope,
    pathname,
    activeWorkspace,
    workspaceGitStatus,
    teamBoard,
    assistantTeamId,
    workspaceJobs,
    isAgentRunning,
    agentPhase,
    agentAction,
    agentCycleCount,
    agentLastError,
    toolCallHistory,
    vibeAbsorbStatus,
    addTrait,
    removeTrait,
    setTraitProperty,
    addNode,
    removeNode,
    updateNode,
    getStoreActions,
    persistMessage,
    speak,
  ]);

  const handleConfirmToolResult = useCallback(
    (messageId: string, resultIndex: number) => {
      const target = chatMessages.find((msg) => msg.id === messageId)?.toolResults?.[resultIndex];
      if (!target?.requiresConfirmation || !target.pendingAction) return;

      const applied = executeTool(
        target.pendingAction.tool,
        target.pendingAction.args,
        getStoreActions(),
        { confirmed: true }
      );
      const nextResult: ToolResult = applied.success
        ? { ...applied, message: `Applied: ${applied.message}` }
        : applied;

      setChatMessages((current) =>
        current.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                toolResults: msg.toolResults?.map((result, index) =>
                  index === resultIndex ? nextResult : result
                ),
              }
            : msg
        )
      );

      if (applied.success) {
        useHistoryStore
          .getState()
          .syncState(useSceneGraphStore.getState().nodes, useSceneStore.getState().code ?? '');
      }
    },
    [chatMessages, getStoreActions]
  );

  const handleDeclineToolResult = useCallback((messageId: string, resultIndex: number) => {
    setChatMessages((current) =>
      current.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              toolResults: msg.toolResults?.map((result, index) =>
                index === resultIndex && result.requiresConfirmation
                  ? {
                      ...result,
                      message: `Declined: ${result.diff?.summary ?? result.message}`,
                      requiresConfirmation: false,
                      pendingAction: undefined,
                      diff: undefined,
                    }
                  : result
              ),
            }
          : msg
      )
    );
  }, []);

  const handleClearHistory = useCallback(() => {
    clearPersistedHistory();
    setChatMessages([GREETING]);
    setLlmHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearPersistedHistory]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showSuggestions = chatMessages.filter((m) => m.role === 'user').length === 0;

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header — identity removed per founder annotation; utility bar only */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-studio-border px-4 py-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isThinking ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'
          }`}
          aria-label={isThinking ? 'Thinking' : 'Ready'}
        />
        {sessionStatus === 'authenticated' && (
          <ConversationSwitcher
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={(id) => void selectConversation(id)}
            onNew={newConversation}
            onRename={(id, title) => void renameConversation(id, title)}
            onArchive={(id) => void archiveConversation(id)}
          />
        )}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-studio-muted">
          <Zap className="h-3 w-3 text-studio-accent" />
          {selectedName ? (
            <span className="rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[8px] text-studio-accent">
              {selectedName}
            </span>
          ) : (
            <span>{nodes.length} obj</span>
          )}
          <span>· {code.split('\n').length}L</span>
          <button
            onClick={handleClearHistory}
            aria-label="Clear chat history"
            title="Clear conversation history"
            className="ml-1 rounded p-1 text-studio-muted hover:bg-studio-border hover:text-red-400 transition"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            aria-label={ttsEnabled ? 'Disable voice responses' : 'Enable voice responses'}
            title={ttsEnabled ? 'Disable voice responses' : 'Enable voice responses'}
            className={`rounded p-1 transition ${ttsEnabled ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {ttsEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-3 p-4">
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {/* Tool-call signals — collapsed group, rendered ABOVE the response so a
                flood of rapid badges doesn't push the text down / yank scroll (founder
                feedback). Confirm/decline still routes through the same handlers. */}
            {msg.toolResults && msg.toolResults.length > 0 && (
              <ToolResultsGroup
                results={msg.toolResults}
                isStreaming={msg.isStreaming}
                onConfirm={(i) => handleConfirmToolResult(msg.id, i)}
                onDecline={(i) => handleDeclineToolResult(msg.id, i)}
              />
            )}
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-surface text-studio-text border border-studio-border/50'
              }`}
            >
              {msg.text ? (
                msg.role === 'user' ? (
                  msg.text
                ) : (
                  <MarkdownMessage text={msg.text} />
                )
              ) : msg.isStreaming ? (
                <span className="flex items-center gap-1.5 text-studio-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  thinking…
                </span>
              ) : null}
              {msg.isStreaming && msg.text && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-studio-accent/70" />
              )}
            </div>
          </div>
        ))}

        {/* Suggestions when no user messages sent yet */}
        {showSuggestions && (
          <div className="space-y-1.5 pt-2">
            <p className="text-[10px] uppercase tracking-widest text-studio-muted">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="w-full rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-1.5 text-left text-xs text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-text"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-studio-border p-3">
        {isUnauthenticated ? (
          <button
            type="button"
            onClick={() => signIn(undefined, { callbackUrl: pathname })}
            className="w-full rounded-xl border border-studio-accent/40 bg-studio-accent/10 px-3 py-2.5 text-center text-xs font-medium text-studio-accent transition hover:bg-studio-accent/20"
            aria-label="Sign in to use the assistant"
          >
            Sign in to use the assistant
            <span className="mt-0.5 block text-[10px] font-normal text-studio-muted">
              AI generation needs an account — keeps usage scoped to your workspace
            </span>
          </button>
        ) : (
          <div className="relative">
            <textarea
              value={isListening && interimTranscript ? input + ' ' + interimTranscript : input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                nodes.length === 0
                  ? 'Create an object first, then ask the assistant to modify it…'
                  : selectedId
                    ? 'Tell the assistant what to do with the selected object…'
                    : 'Ask the assistant to build or modify your scene…'
              }
              disabled={isThinking}
              rows={2}
              className={`w-full resize-none rounded-xl border bg-studio-surface px-3 py-2 pr-16 text-xs text-studio-text placeholder-studio-muted outline-none transition focus:ring-1 disabled:opacity-50 ${
                isListening
                  ? 'border-red-400/70 focus:border-red-400 focus:ring-red-400/20'
                  : 'border-studio-border focus:border-studio-accent/60 focus:ring-studio-accent/20'
              }`}
              aria-label="Message assistant"
            />
            <div className="absolute bottom-2.5 right-2 flex items-center gap-1">
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isThinking}
                  className={`rounded-lg p-1.5 transition ${
                    isListening
                      ? 'animate-pulse bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                  aria-label={isListening ? 'Stop voice recording' : 'Start voice recording'}
                >
                  {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={isThinking || !input.trim()}
                className="rounded-lg bg-studio-accent p-1.5 text-white shadow transition hover:bg-studio-accent/80 disabled:opacity-30"
                aria-label="Send message to assistant"
              >
                {isThinking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
