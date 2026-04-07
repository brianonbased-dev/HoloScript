'use client';

/**
 * BrittneyWizard.tsx — Full-screen conversation-driven wizard
 *
 * Brittney guides users through: greeting -> intake -> absorb ->
 * classify -> consent -> scaffold -> scenario -> preview -> iterate -> deploy.
 *
 * The conversation drives the UI, not the other way around.
 * Each stage renders appropriate chrome around the chat.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  MessageSquare,
  GitBranch,
  Scan,
  Dna,
  ShieldCheck,
  FolderTree,
  LayoutGrid,
  Eye,
  Wand2,
  Rocket,
  Send,
  ChevronRight,
  RefreshCw,
  Check,
} from 'lucide-react';
import { ConsentStep } from './ConsentStep';
import { useWizardFlow } from '@/hooks/useWizardFlow';
import {
  WIZARD_STAGES,
  STAGE_META,
  type WizardStage,
} from '@/lib/brittney/WizardFlow';
import type { BrittneyMessage } from '@/lib/brittney/BrittneySession';
import type { ScenarioMatch } from '@/lib/brittney/ScenarioMatcher';

// ─── Stage icons ─────────────────────────────────────────────────────────────

const STAGE_ICONS: Record<WizardStage, React.ElementType> = {
  greeting: MessageSquare,
  intake: GitBranch,
  absorb: Scan,
  classify: Dna,
  consent: ShieldCheck,
  scaffold: FolderTree,
  scenario: LayoutGrid,
  preview: Eye,
  iterate: Wand2,
  deploy: Rocket,
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface BrittneyWizardProps {
  onClose: () => void;
  /** Callback when the wizard generates code for the editor */
  onCodeGenerated?: (code: string) => void;
  /** Callback when user selects a scenario to mount */
  onScenarioMount?: (scenarioId: string) => void;
}

// ─── Greeting suggestions ────────────────────────────────────────────────────

const GREETING_SUGGESTIONS = [
  'I want to build a dispensary inventory system',
  'I have a React app on GitHub I want to spatialize',
  'Help me create a surgical training simulator',
  'I need a music production tool with MIDI support',
  'Build me a climate monitoring dashboard',
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StageIndicator({
  currentStage,
  onStageClick,
}: {
  currentStage: WizardStage;
  onStageClick: (stage: WizardStage) => void;
}) {
  const visibleStages = WIZARD_STAGES.filter(
    (s) => STAGE_META[s].showInProgress
  );
  const currentIdx = visibleStages.indexOf(currentStage);

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
      {visibleStages.map((stage, idx) => {
        const Icon = STAGE_ICONS[stage];
        const meta = STAGE_META[stage];
        const isActive = stage === currentStage;
        const isComplete = idx < currentIdx;
        const isFuture = idx > currentIdx;

        return (
          <React.Fragment key={stage}>
            {idx > 0 && (
              <ChevronRight
                className={`h-3 w-3 shrink-0 ${
                  isComplete ? 'text-emerald-500' : 'text-studio-muted/30'
                }`}
              />
            )}
            <button
              onClick={() => isComplete && onStageClick(stage)}
              disabled={isFuture}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                isActive
                  ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40'
                  : isComplete
                    ? 'text-emerald-400 hover:bg-emerald-500/10 cursor-pointer'
                    : 'text-studio-muted/40 cursor-default'
              }`}
              title={meta.description}
            >
              {isComplete ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{meta.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ChatMessage({ message }: { message: BrittneyMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-purple-600 text-white rounded-br-md'
            : 'bg-[#1a1a2e] text-gray-200 border border-studio-border rounded-bl-md'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function GreetingView({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/20 ring-1 ring-purple-500/30">
        <Wand2 className="h-8 w-8 text-purple-400" />
      </div>
      <h2 className="text-2xl font-semibold text-white mb-2">
        Hi, I&apos;m Brittney
      </h2>
      <p className="text-studio-muted max-w-md mb-8">
        Tell me what you want to build. I&apos;ll scan your code, pick the
        right templates, and generate a live preview — all through our
        conversation.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-lg">
        {GREETING_SUGGESTIONS.map((text) => (
          <button
            key={text}
            onClick={() => onSuggestionClick(text)}
            className="rounded-xl border border-studio-border bg-[#111827] px-4 py-2 text-sm text-studio-muted hover:bg-[#161f33] hover:text-white transition"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function AbsorbProgressView({
  filesScanned,
  totalFiles,
  currentFile,
  status,
}: {
  filesScanned: number;
  totalFiles: number;
  currentFile: string;
  status: string;
}) {
  const pct = totalFiles > 0 ? Math.round((filesScanned / totalFiles) * 100) : 0;

  return (
    <div className="border border-studio-border rounded-xl bg-[#111827] p-5 mx-4 my-4">
      <div className="flex items-center gap-3 mb-3">
        <Scan className="h-5 w-5 text-purple-400 animate-pulse" />
        <span className="text-sm font-medium text-white">
          {status === 'complete' ? 'Scan Complete' : 'Scanning Repository...'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#0d0d14] overflow-hidden mb-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-studio-muted">
        <span>{filesScanned} / {totalFiles} files</span>
        <span className="truncate max-w-[60%] text-right">{currentFile}</span>
      </div>
    </div>
  );
}

function ScenarioCardGrid({
  matches,
  selectedId,
  onSelect,
}: {
  matches: ScenarioMatch[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-studio-muted text-sm">
          No matching templates found. Brittney will generate a custom setup.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-4 max-h-[300px] overflow-y-auto">
      {matches.slice(0, 6).map((match) => {
        const isSelected = match.scenario.id === selectedId;
        return (
          <button
            key={match.scenario.id}
            onClick={() => onSelect(match.scenario.id)}
            className={`text-left rounded-xl border p-4 transition-all ${
              isSelected
                ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
                : 'border-studio-border bg-[#111827] hover:bg-[#161f33]'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{match.scenario.emoji}</span>
              <span className="text-sm font-medium text-white">
                {match.scenario.name}
              </span>
            </div>
            <p className="text-xs text-studio-muted line-clamp-2">
              {match.scenario.description}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                {Math.round(match.score * 10)}% match
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ScaffoldFileTree({ files }: { files: string[] }) {
  return (
    <div className="border border-studio-border rounded-xl bg-[#111827] p-4 mx-4 my-4 max-h-[200px] overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <FolderTree className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-white">Generated Structure</span>
      </div>
      <div className="space-y-1">
        {files.map((file) => (
          <div key={file} className="text-xs text-studio-muted font-mono pl-2 border-l border-emerald-500/20">
            {file}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BrittneyWizard({
  onClose,
  onCodeGenerated,
  onScenarioMount,
}: BrittneyWizardProps) {
  const wizard = useWizardFlow();
  const { state, scenarioMatch } = wizard;
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages.length]);

  // Focus input on stage change
  useEffect(() => {
    inputRef.current?.focus();
  }, [state.stage]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue('');
    wizard.handleUserMessage(text);

    // Simulate Brittney's response (actual integration uses streamBrittney)
    setIsStreaming(true);
    setTimeout(() => {
      const stage = state.stage;
      let response = '';

      if (stage === 'greeting' || stage === 'intake') {
        const hasRepo = text.match(/github\.com/);
        if (hasRepo) {
          response = `I see you have a GitHub repo. Let me scan it to understand your codebase. This will take a moment...`;
          wizard.setHasCode(true, text.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/)?.[0]);
        } else {
          response = `Great, I understand you want to build something related to "${text}". Let me find the best templates for you. Do you have any existing code on GitHub?`;
          wizard.setIntent(text);
        }
      }

      if (response) {
        wizard.addMessage({ role: 'assistant', content: response });
      }

      setIsStreaming(false);
    }, 800);
  }, [inputValue, isStreaming, wizard, state.stage]);

  const handleSuggestionClick = useCallback(
    (text: string) => {
      setInputValue('');
      wizard.handleUserMessage(text);
      wizard.setIntent(text);

      // Auto-advance to intake after greeting suggestion
      setTimeout(() => {
        wizard.addMessage({
          role: 'assistant',
          content: `That sounds exciting! I can help you build that. Let me check if we have a matching template...`,
        });

        // If we found a good match, advance to scenario
        const match = scenarioMatch;
        if (match.best && match.best.score >= 4) {
          wizard.selectScenario(match.best.scenario.id);
          setTimeout(() => {
            wizard.addMessage({
              role: 'assistant',
              content: `I found a great match: ${match.best!.scenario.emoji} **${match.best!.scenario.name}** — ${match.best!.scenario.description}. Want me to load this template, or would you prefer to start from scratch?`,
            });
            wizard.setStage('scenario');
          }, 600);
        }
      }, 500);
    },
    [wizard, scenarioMatch]
  );

  const handleScenarioSelect = useCallback(
    (scenarioId: string) => {
      wizard.selectScenario(scenarioId);
      onScenarioMount?.(scenarioId);

      const code = wizard.generateTemplateCode();
      wizard.setGeneratedCode(code);
      onCodeGenerated?.(code);

      wizard.addMessage({
        role: 'assistant',
        content: 'Template loaded! You can see the live preview on the right. Feel free to ask me to modify anything.',
      });
      wizard.setStage('preview');
    },
    [wizard, onScenarioMount, onCodeGenerated]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Derived scaffold files list ────────────────────────────────
  const scaffoldFiles = state.scaffoldResult
    ? [
        '.claude/CLAUDE.md',
        '.claude/NORTH_STAR.md',
        'MEMORY.md',
        ...state.scaffoldResult.skills.map((s) => `.claude/skills/${s.name}.md`),
        ...state.scaffoldResult.hooks.map((h) => `.claude/hooks/${h.name}`),
        '.agent/daemon.json',
        '.agent/team-room.json',
      ]
    : [];

  // ── Layout decision ────────────────────────────────────────────
  const isPreviewMode = state.stage === 'preview' || state.stage === 'iterate';

  return (
    <div className="fixed inset-0 z-50 flex bg-black/80 backdrop-blur-sm">
      <div
        className={`flex flex-col h-full ${
          isPreviewMode ? 'w-[420px]' : 'w-full max-w-2xl mx-auto'
        } bg-[#0d0d14] border-r border-studio-border`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20">
              <Wand2 className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Brittney Wizard</h2>
              <p className="text-[10px] text-studio-muted">
                {STAGE_META[state.stage].description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={wizard.reset}
              className="rounded-lg p-1.5 text-studio-muted hover:bg-white/5 hover:text-white transition"
              title="Start over"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-studio-muted hover:bg-white/5 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stage indicator */}
        <StageIndicator
          currentStage={state.stage}
          onStageClick={(stage) => wizard.setStage(stage)}
        />

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Greeting view (centered, no chat history) */}
          {state.stage === 'greeting' && state.messages.length === 0 && (
            <GreetingView onSuggestionClick={handleSuggestionClick} />
          )}

          {/* Absorb progress (shown when scanning) */}
          {state.stage === 'absorb' && state.absorbProgress.status !== 'idle' && (
            <AbsorbProgressView
              filesScanned={state.absorbProgress.filesScanned}
              totalFiles={state.absorbProgress.totalFiles}
              currentFile={state.absorbProgress.currentFile}
              status={state.absorbProgress.status}
            />
          )}

          {/* Consent step */}
          {state.stage === 'consent' && (
            <ConsentStep
              consent={state.consent}
              onConsentChange={wizard.updateConsent}
              onContinue={wizard.advanceStage}
            />
          )}

          {/* Scaffold file tree */}
          {state.stage === 'scaffold' && scaffoldFiles.length > 0 && (
            <ScaffoldFileTree files={scaffoldFiles} />
          )}

          {/* Scenario cards */}
          {state.stage === 'scenario' && (
            <ScenarioCardGrid
              matches={scenarioMatch.ranked}
              selectedId={state.selectedScenario}
              onSelect={handleScenarioSelect}
            />
          )}

          {/* Chat messages */}
          <div className="px-4 py-3 space-y-1">
            {state.messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} />
            ))}
            {isStreaming && (
              <div className="flex justify-start mb-3">
                <div className="bg-[#1a1a2e] border border-studio-border rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-studio-border px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#111827] border border-studio-border px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                state.stage === 'greeting'
                  ? 'Tell me what you want to build...'
                  : 'Ask Brittney anything...'
              }
              className="flex-1 bg-transparent text-sm text-white placeholder-studio-muted outline-none"
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-default transition"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {/* Advance button when stage can progress */}
          {wizard.canAdvanceStage && state.stage !== 'greeting' && (
            <button
              onClick={wizard.advanceStage}
              className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/30 transition"
            >
              Continue to {STAGE_META[WIZARD_STAGES[WIZARD_STAGES.indexOf(state.stage) + 1] ?? 'deploy'].label}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Preview pane (visible in preview/iterate stages) */}
      {isPreviewMode && (
        <div className="flex-1 flex items-center justify-center bg-[#080810]">
          <div className="text-center text-studio-muted">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Live preview renders here</p>
            <p className="text-xs mt-1 opacity-60">
              Connect your editor to see the scene
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
