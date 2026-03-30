'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Play,
  CheckCircle2,
  AlertCircle,
  X,
  Award,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@holoscript/ui';

export interface TutorialStep {
  title: string;
  markdown: string;
  initialCode: string;
  solutionCode?: string;
  validationRule?: (code: string) => boolean;
}

export interface TutorialEngineProps {
  title: string;
  moduleName: string;
  steps: TutorialStep[];
  onComplete?: () => void;
  onExit?: () => void;
}

export function TutorialEngineWrapper({
  title,
  moduleName,
  steps,
  onComplete,
  onExit,
}: TutorialEngineProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [code, setCode] = useState(steps[0]?.initialCode || '');
  const [validationState, setValidationState] = useState<'idle' | 'success' | 'error'>('idle');
  const [showSolution, setShowSolution] = useState(false);

  // Reset state when step changes
  useEffect(() => {
    setCode(steps[currentStep]?.initialCode || '');
    setValidationState('idle');
    setShowSolution(false);
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((curr) => curr + 1);
    } else {
      onComplete?.();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((curr) => curr - 1);
    }
  };

  const handleRunAndValidate = () => {
    const step = steps[currentStep];
    if (step.validationRule) {
      const isValid = step.validationRule(code);
      setValidationState(isValid ? 'success' : 'error');
    } else {
      // If no validation rule, consider it successful just by running
      setValidationState('success');
    }
  };

  const progressPct = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* ── Top Navigation Bar ── */}
      <header className="h-14 shrink-0 border-b border-slate-800 bg-slate-900/50 flex items-center px-4 justify-between select-none">
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider hidden sm:block">
              {moduleName}
            </span>
            <span className="text-sm font-semibold">{title}</span>
          </div>
        </div>

        {/* Progress Tracker */}
        <div className="flex flex-col items-center justify-center w-48 sm:w-64">
          <div className="flex justify-between w-full text-[10px] text-slate-400 mb-1.5 font-medium">
            <span>
              Step {currentStep + 1} of {steps.length}
            </span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {validationState === 'success' && currentStep === steps.length - 1 && (
            <div className="hidden sm:flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
              <Award size={14} /> Tutorial Complete!
            </div>
          )}
        </div>
      </header>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Instructions */}
        <div className="w-1/3 min-w-[300px] border-r border-slate-800 bg-slate-900/80 flex flex-col">
          <div className="flex-1 overflow-auto p-6 prose prose-invert prose-emerald max-w-none">
            <h2 className="text-2xl font-bold mb-4 text-emerald-50">{steps[currentStep].title}</h2>
            {/* Simple markdown rendering placeholder. In full app, use react-markdown */}
            <div
              className="space-y-4 text-slate-300 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: steps[currentStep].markdown }}
            />

            {showSolution && steps[currentStep].solutionCode && (
              <div className="mt-8 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-2">
                  Solution
                </h4>
                <pre className="text-xs text-slate-300 overflow-x-auto bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <code>{steps[currentStep].solutionCode}</code>
                </pre>
              </div>
            )}
          </div>

          {/* Left Pane footer: Status & Actions */}
          <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0 flex flex-col gap-3">
            {validationState === 'error' && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertCircle size={14} className="shrink-0" />
                <span>That didn't quite work. Try again or check the hint.</span>
              </div>
            )}

            <div className="flex justify-between items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex gap-2">
                {!showSolution && steps[currentStep].solutionCode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSolution(true)}
                    className="text-xs text-slate-400 border-slate-700"
                  >
                    View Solution
                  </Button>
                )}
                {validationState === 'success' ? (
                  <Button
                    className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                    onClick={handleNext}
                  >
                    {currentStep === steps.length - 1 ? 'Finish' : 'Next Step'}{' '}
                    <ChevronRight size={16} className="ml-1" />
                  </Button>
                ) : (
                  <Button
                    className="bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                    onClick={handleRunAndValidate}
                  >
                    <Play size={14} className="mr-1.5" /> Run & Validate
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Code + Preview */}
        <div className="w-2/3 flex flex-col bg-[#0d1117]">
          {/* Mock Monaco Editor Area */}
          <div className="h-1/2 border-b border-slate-800 flex flex-col">
            <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between">
              <div className="flex items-center gap-2">
                <div className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
                  main.hs
                </div>
              </div>
              <button
                onClick={() => setCode(steps[currentStep].initialCode)}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
              >
                <RotateCcw size={12} /> Reset Code
              </button>
            </div>
            <div className="flex-1 relative">
              {/* In a real scenario, this is an actual MonacoEditor component */}
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="absolute inset-0 w-full h-full bg-[#0d1117] text-slate-300 p-4 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Mock Preview Area */}
          <div className="h-1/2 relative bg-black/60 overflow-hidden flex flex-col">
            <div className="absolute top-2 left-2 z-10 text-[10px] font-semibold tracking-widest uppercase text-slate-500 bg-black/50 px-2 py-1 rounded">
              3D Live Preview
            </div>

            <div className="flex-1 flex items-center justify-center relative">
              {/* Fake 3D Scene based on validation state */}
              <div
                className={`w-32 h-32 rounded-xl border-2 shadow-2xl transition-all duration-700 ${
                  validationState === 'success'
                    ? 'border-emerald-500 bg-emerald-500/20 shadow-emerald-500/20 rotate-12 scale-110'
                    : validationState === 'error'
                      ? 'border-rose-500 bg-rose-500/20 shadow-rose-500/20 -rotate-6'
                      : 'border-cyan-500/30 bg-cyan-500/10 shadow-cyan-500/10'
                }`}
              />

              {/* Success overlay */}
              {validationState === 'success' && (
                <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[2px] animate-in fade-in duration-300">
                  <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-6 py-3 rounded-full flex items-center gap-2 shadow-xl shadow-emerald-500/20">
                    <CheckCircle2 size={24} />
                    <span className="font-bold tracking-wide">Excellent work!</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
