'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Mic,
  MicOff,
  ArrowRight,
} from 'lucide-react';
import { streamBrittney, buildRichContext } from '@/lib/brittney';
import type { BrittneyMessage, ToolCallPayload, ToolResult } from '@/lib/brittney';
import { executeTool } from '@/lib/brittney';
import { useBrittneyVoice } from '@/hooks/useBrittneyVoice';
import { useBrittneyHistory } from '@/hooks/useBrittneyHistory';
import { SuggestionCards } from './SuggestionCards';

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
// Streaming cursor
// ---------------------------------------------------------------------------

function StreamingCursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-studio-accent/70 rounded-full" />
  );
}

// ---------------------------------------------------------------------------
// Tool result inline badge
// ---------------------------------------------------------------------------

function ToolBadge({ result }: { result: ToolResult }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
        result.success
          ? 'bg-green-500/10 text-green-400 border border-green-500/10'
          : 'bg-red-500/10 text-red-400 border border-red-500/10'
      }`}
    >
      {result.success ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span>{result.message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress indicator for long operations
// ---------------------------------------------------------------------------

interface ProgressIndicatorProps {
  label: string;
}

function ProgressIndicator({ label }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="relative h-5 w-5">
        <div className="absolute inset-0 rounded-full border-2 border-studio-accent/20" />
        <div className="absolute inset-0 rounded-full border-2 border-studio-accent border-t-transparent animate-spin" />
      </div>
      <span className="text-sm text-white/60">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BrittneyFullScreen() {
  const router = useRouter();

  const GREETING: ChatMessage = {
    id: '0',
    role: 'brittney',
    text: "Hi, I'm Brittney. What are you building?",
  };

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [llmHistory, setLlmHistory] = useState<BrittneyMessage[]>([]);
  const [showCards, setShowCards] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persistent history
  const {
    history: savedHistory,
    addMessage: persistMessage,
    clearHistory: _clearHistory,
  } = useBrittneyHistory('start');

  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load persisted history on mount
  useEffect(() => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    if (savedHistory.length > 0) {
      setShowCards(false);
      setMessages([
        GREETING,
        ...savedHistory.map((m, i) => ({
          id: `h-${i}`,
          role: m.role === 'user' ? 'user' as const : 'brittney' as const,
          text: m.content,
        })),
      ]);
      setLlmHistory(
        savedHistory.map((m) => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.content,
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedHistory]);

  // Voice input
  const {
    isListening,
    isSupported: voiceSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    clearTranscript,
  } = useBrittneyVoice();

  useEffect(() => {
    if (transcript) {
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript).trim());
      clearTranscript();
    }
  }, [transcript, clearTranscript]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ----------- Send logic -----------

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    setInput('');
    setShowCards(false);

    const userMsgId = Date.now().toString();
    setMessages((m) => [...m, { id: userMsgId, role: 'user', text }]);
    persistMessage({ role: 'user', content: text });

    const updatedHistory: BrittneyMessage[] = [
      ...llmHistory,
      { role: 'user', content: text },
    ];
    setLlmHistory(updatedHistory);
    setIsThinking(true);

    // Minimal context for start flow (no scene yet)
    const sceneContext = buildRichContext('', [], null, null);

    const brittMsgId = (Date.now() + 1).toString();
    setMessages((m) => [
      ...m,
      { id: brittMsgId, role: 'brittney', text: '', isStreaming: true, toolResults: [] },
    ]);

    let accumulatedText = '';
    const toolResults: ToolResult[] = [];

    try {
      // Minimal store actions for start flow
      const storeActions = {
        nodes: [],
        addTrait: () => {},
        removeTrait: () => {},
        setTraitProperty: () => {},
        addNode: () => {},
        getCode: () => '',
        setCode: () => {},
      };

      for await (const event of streamBrittney(updatedHistory, sceneContext)) {
        if (event.type === 'text') {
          accumulatedText += event.payload as string;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === brittMsgId ? { ...msg, text: accumulatedText } : msg
            )
          );
        } else if (event.type === 'tool_call') {
          const tc = event.payload as ToolCallPayload;
          setProgressLabel(`Running ${tc.name}...`);
          const result = executeTool(tc.name, tc.arguments, storeActions);
          setProgressLabel(null);
          toolResults.push(result);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === brittMsgId
                ? { ...msg, toolResults: [...toolResults] }
                : msg
            )
          );
        } else if (event.type === 'error') {
          accumulatedText = `Sorry, I hit an error: ${event.payload}`;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === brittMsgId
                ? { ...msg, text: accumulatedText, isStreaming: false }
                : msg
            )
          );
        } else if (event.type === 'done') {
          break;
        }
      }
    } catch (err) {
      accumulatedText = `Connection error -- is the backend running? (${String(err)})`;
    }

    setMessages((m) =>
      m.map((msg) =>
        msg.id === brittMsgId
          ? { ...msg, text: accumulatedText, isStreaming: false, toolResults }
          : msg
      )
    );

    setLlmHistory((h) => [...h, { role: 'assistant', content: accumulatedText }]);
    persistMessage({ role: 'assistant', content: accumulatedText });
    setIsThinking(false);
    setProgressLabel(null);
  }, [input, isThinking, llmHistory, persistMessage]);

  // ----------- Card selection -----------

  const handleCardSelect = useCallback(
    (prompt: string) => {
      if (prompt === '') {
        // "Something else..." -- focus input
        setShowCards(false);
        inputRef.current?.focus();
        return;
      }
      setInput(prompt);
      setShowCards(false);
      // Auto-submit after a brief delay so the user sees it
      setTimeout(() => {
        setInput('');
        const userMsgId = Date.now().toString();
        setMessages((m) => [...m, { id: userMsgId, role: 'user', text: prompt }]);
        persistMessage({ role: 'user', content: prompt });
        // Trigger send with the prompt
        const updatedHistory: BrittneyMessage[] = [
          ...llmHistory,
          { role: 'user', content: prompt },
        ];
        setLlmHistory(updatedHistory);
        // We need to trigger send flow manually
        // Setting input then relying on handleSend won't work because of timing
        // Instead, just set input and let the user press enter or click send
      }, 100);
      // Set input for user to review and send
      setInput(prompt);
      inputRef.current?.focus();
    },
    [llmHistory, persistMessage]
  );

  // ----------- Transition to editor -----------

  const handleOpenEditor = useCallback(() => {
    setIsTransitioning(true);
    // Allow the animation to play, then navigate
    setTimeout(() => {
      router.push('/workspace');
    }, 400);
  }, [router]);

  // ----------- Key handler -----------

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasConversation = messages.filter((m) => m.role === 'user').length > 0;

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center bg-[#0a0a12] transition-all duration-500 ${
        isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-studio-accent/[0.03] blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[300px] w-[300px] rounded-full bg-purple-500/[0.02] blur-[100px]" />
      </div>

      {/* Header bar */}
      <header className="relative z-10 flex w-full items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-white/60 font-mono font-bold text-sm">
            HS
          </div>
          <span className="text-white/40 text-sm font-medium hidden sm:block">
            HoloScript Studio
          </span>
        </div>
        {hasConversation && (
          <button
            onClick={handleOpenEditor}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 transition-all hover:border-studio-accent/30 hover:text-white hover:bg-white/[0.06]"
          >
            Open Editor
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Main content area */}
      <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col px-4 pb-4">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {/* Centered greeting when no conversation yet */}
          {!hasConversation && (
            <div className="flex flex-col items-center justify-center pt-[15vh]">
              {/* Brittney avatar */}
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-studio-accent to-purple-500 shadow-lg shadow-studio-accent/20">
                <span className="text-xl font-bold text-white">B</span>
              </div>
              <h1 className="mb-2 text-2xl font-semibold text-white/90 tracking-tight">
                {GREETING.text}
              </h1>
              <p className="mb-8 text-sm text-white/30 max-w-md text-center">
                Describe your project, paste a GitHub URL, or pick a starting point below.
                I will scaffold it, wire the logic, and compile to any platform.
              </p>
            </div>
          )}

          {/* Conversation messages (only after first user message) */}
          {hasConversation &&
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className="flex items-start gap-3 max-w-[85%]">
                  {msg.role === 'brittney' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-studio-accent to-purple-500 text-white text-xs font-bold shadow">
                      B
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-studio-accent text-white rounded-br-md'
                          : 'bg-white/[0.04] text-white/85 border border-white/[0.06] rounded-bl-md'
                      }`}
                    >
                      {msg.text ||
                        (msg.isStreaming ? (
                          <span className="flex items-center gap-2 text-white/40">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Thinking...
                          </span>
                        ) : null)}
                      {msg.isStreaming && msg.text && <StreamingCursor />}
                    </div>

                    {/* Tool results inline */}
                    {msg.toolResults && msg.toolResults.length > 0 && (
                      <div className="space-y-1.5 pl-1">
                        {msg.toolResults.map((r, i) => (
                          <ToolBadge key={i} result={r} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

          {/* Progress indicator */}
          {progressLabel && (
            <div className="flex justify-start">
              <div className="ml-11">
                <ProgressIndicator label={progressLabel} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion cards */}
        {showCards && !hasConversation && (
          <div className="mb-4">
            <SuggestionCards onSelect={handleCardSelect} />
          </div>
        )}

        {/* Input area */}
        <div className="shrink-0">
          <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-lg shadow-black/20 transition-colors focus-within:border-studio-accent/30">
            <textarea
              ref={inputRef}
              value={
                isListening && interimTranscript
                  ? input + ' ' + interimTranscript
                  : input
              }
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Describe what you want to build..."
              disabled={isThinking}
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3.5 pr-24 text-sm text-white placeholder-white/25 outline-none disabled:opacity-50"
              aria-label="Message Brittney"
            />
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isThinking}
                  className={`rounded-lg p-2 transition ${
                    isListening
                      ? 'animate-pulse bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                  aria-label={
                    isListening ? 'Stop voice recording' : 'Start voice recording'
                  }
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={isThinking || !input.trim()}
                className="rounded-lg bg-studio-accent p-2 text-white shadow transition-all hover:bg-studio-accent/80 disabled:opacity-20 disabled:hover:bg-studio-accent"
                aria-label="Send message to Brittney"
              >
                {isThinking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/15">
            Brittney uses AI to scaffold projects. Results are editable in the Studio editor.
          </p>
        </div>
      </div>
    </div>
  );
}
