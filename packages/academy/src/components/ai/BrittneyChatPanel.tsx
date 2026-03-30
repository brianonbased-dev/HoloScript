'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { streamBrittney, buildRichContext, executeTool } from '@/lib/brittney';
import type { BrittneyMessage, ToolCallPayload, ToolResult } from '@/lib/brittney';
import { useEditorStore, useSceneGraphStore, useSceneStore } from '@/lib/stores';
import { StudioEvents } from '@/lib/analytics';
import { useBrittneyVoice } from '@/hooks/useBrittneyVoice';
import { useBrittneyHistory } from '@/hooks/useBrittneyHistory';

// ─── Message model ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'brittney';
  text: string;
  toolResults?: ToolResult[];
  isStreaming?: boolean;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Add a physics trait to the selected object',
  'Make something glow with a neon blue color',
  'Create a patrol guard AI agent',
  'Add a Gaussian Splat to the scene',
];

// ─── Tool result badge ────────────────────────────────────────────────────────

function ToolBadge({ result }: { result: ToolResult }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
        result.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
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

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function BrittneyChatPanel() {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const selectedName = useEditorStore((s) => s.selectedObjectName);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const code = useSceneStore((s) => s.code) ?? '';
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);
  const addNode = useSceneGraphStore((s) => s.addNode);

  // Persistent history
  const {
    history: savedHistory,
    addMessage: persistMessage,
    clearHistory: clearPersistedHistory,
  } = useBrittneyHistory('default');

  const GREETING: ChatMessage = {
    id: '0',
    role: 'brittney',
    text: "Hi! I'm Brittney. Tell me what you want to build — I'll add traits, compose behaviors, and shape the scene for you.",
  };

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([GREETING]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [llmHistory, setLlmHistory] = useState<BrittneyMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  /** Speak text aloud via Web Speech Synthesis */
  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      // Cancel any in-progress speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      // Prefer a female voice for Brittney's persona
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(
        (v) => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Zira')
      );
      if (femaleVoice) utterance.voice = femaleVoice;
      window.speechSynthesis.speak(utterance);
    },
    [ttsEnabled]
  );

  // Load persisted history on mount
  useEffect(() => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    if (savedHistory.length > 0) {
      setChatMessages([
        GREETING,
        ...savedHistory.map((m, i) => ({
          id: `h-${i}`,
          role: m.role === 'user' ? 'user' : ('brittney' as ChatMessage['role']),
          text: m.content,
        })),
      ]);
      setLlmHistory(
        savedHistory.map(
          (m) =>
            ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
            }) as BrittneyMessage
        )
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
  // Append confirmed voice transcript to input
  useEffect(() => {
    if (transcript) {
      setInput((prev) => (prev ? prev + ' ' + transcript : transcript).trim());
      clearTranscript();
    }
  }, [transcript, clearTranscript]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Listen for external prompt injection (from Prompt Library panel)
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (prompt) setInput(prompt);
    };
    window.addEventListener('brittney-prompt', handler);
    return () => window.removeEventListener('brittney-prompt', handler);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');

    StudioEvents.brittneyPromptSent(text.length);

    // Add user message to chat
    const userMsgId = Date.now().toString();
    setChatMessages((m) => [...m, { id: userMsgId, role: 'user', text }]);
    persistMessage({ role: 'user', content: text });

    // Build updated LLM history
    const updatedHistory: BrittneyMessage[] = [...llmHistory, { role: 'user', content: text }];
    setLlmHistory(updatedHistory);
    setIsThinking(true);

    // Build rich scene context (code + node graph + selection)
    const sceneContext = buildRichContext(code, nodes, selectedId, selectedName);

    // Create streaming Brittney message placeholder
    const brittMsgId = (Date.now() + 1).toString();
    setChatMessages((m) => [
      ...m,
      { id: brittMsgId, role: 'brittney', text: '', isStreaming: true, toolResults: [] },
    ]);

    let accumulatedText = '';
    const toolResults: ToolResult[] = [];

    try {
      const setCodeFn = useSceneStore.getState().setCode;
      const getCodeFn = () => useSceneStore.getState().code ?? '';
      const storeActions = {
        nodes,
        addTrait,
        removeTrait,
        setTraitProperty,
        addNode,
        getCode: getCodeFn,
        setCode: setCodeFn,
      };

      for await (const event of streamBrittney(updatedHistory, sceneContext)) {
        if (event.type === 'text') {
          accumulatedText += event.payload as string;
          setChatMessages((m) =>
            m.map((msg) => (msg.id === brittMsgId ? { ...msg, text: accumulatedText } : msg))
          );
        } else if (event.type === 'tool_call') {
          const tc = event.payload as ToolCallPayload;
          const result = executeTool(tc.name, tc.arguments, storeActions);
          StudioEvents.brittneyToolCalled(tc.name, result.success);
          toolResults.push(result);
          setChatMessages((m) =>
            m.map((msg) =>
              msg.id === brittMsgId ? { ...msg, toolResults: [...toolResults] } : msg
            )
          );
        } else if (event.type === 'error') {
          accumulatedText = `Sorry, I hit an error: ${event.payload}`;
          setChatMessages((m) =>
            m.map((msg) =>
              msg.id === brittMsgId ? { ...msg, text: accumulatedText, isStreaming: false } : msg
            )
          );
        } else if (event.type === 'done') {
          break;
        }
      }
    } catch (err) {
      accumulatedText = `Connection error — is Ollama running? (${String(err)})`;
    }

    // Finalize message
    setChatMessages((m) =>
      m.map((msg) =>
        msg.id === brittMsgId
          ? { ...msg, text: accumulatedText, isStreaming: false, toolResults }
          : msg
      )
    );

    // Update LLM history with Brittney's response
    setLlmHistory((h) => [...h, { role: 'assistant', content: accumulatedText }]);
    persistMessage({ role: 'assistant', content: accumulatedText });

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
    llmHistory,
    nodes,
    selectedId,
    selectedName,
    code,
    addTrait,
    removeTrait,
    setTraitProperty,
    addNode,
    persistMessage,
    speak,
  ]);

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
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-studio-border px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-studio-accent to-purple-500 text-white text-sm font-bold shadow-lg">
          B
        </div>
        <div>
          <div className="text-sm font-semibold text-studio-text">Brittney</div>
          <div className="flex items-center gap-1.5 text-[10px] text-studio-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isThinking ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'
              }`}
            />
            {isThinking ? 'Thinking…' : 'AI Scene Director'}
          </div>
        </div>
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
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-surface text-studio-text border border-studio-border/50'
              }`}
            >
              {msg.text ||
                (msg.isStreaming ? (
                  <span className="flex items-center gap-1.5 text-studio-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    thinking…
                  </span>
                ) : null)}
              {msg.isStreaming && msg.text && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-studio-accent/70" />
              )}
            </div>

            {/* Tool results */}
            {msg.toolResults && msg.toolResults.length > 0 && (
              <div className="mt-1.5 w-full max-w-[88%] space-y-1">
                {msg.toolResults.map((r, i) => (
                  <ToolBadge key={i} result={r} />
                ))}
              </div>
            )}
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
        <div className="relative">
          <textarea
            value={isListening && interimTranscript ? input + ' ' + interimTranscript : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              nodes.length === 0
                ? 'Create an object first, then ask Brittney to modify it…'
                : selectedId
                  ? 'Tell Brittney what to do with the selected object…'
                  : 'Ask Brittney to build or modify your scene…'
            }
            disabled={isThinking}
            rows={2}
            className={`w-full resize-none rounded-xl border bg-studio-surface px-3 py-2 pr-16 text-xs text-studio-text placeholder-studio-muted outline-none transition focus:ring-1 disabled:opacity-50 ${
              isListening
                ? 'border-red-400/70 focus:border-red-400 focus:ring-red-400/20'
                : 'border-studio-border focus:border-studio-accent/60 focus:ring-studio-accent/20'
            }`}
            aria-label="Message Brittney"
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
              aria-label="Send message to Brittney"
            >
              {isThinking ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
