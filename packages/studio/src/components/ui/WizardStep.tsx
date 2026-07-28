'use client';

/**
 * WizardStep — Studio-local wizard step frame primitive.
 *
 * Provides a consistent step-number indicator, title, description, body area,
 * and prev/next navigation bar for the two multi-step wizard families
 * (Step0-4 onboarding and Step0-4 ImportRepo, ~27 wizard files in total).
 *
 * Part of B2 studio consolidation (splendid-popping-lark plan).
 *
 * Usage:
 *   <WizardStep
 *     stepIndex={0}
 *     totalSteps={4}
 *     title="Choose a category"
 *     description="Pick the type of project you want to create."
 *     onBack={handleBack}
 *     onNext={handleNext}
 *     nextLabel="Next"
 *     nextDisabled={!category}
 *   >
 *     <Step0Category ... />
 *   </WizardStep>
 */

import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WizardStepProps {
  /** 0-based index of the current step */
  stepIndex: number;
  /** Total number of steps (used for the progress indicator) */
  totalSteps: number;
  /** Step heading */
  title: React.ReactNode;
  /** Optional sub-heading / description */
  description?: React.ReactNode;
  /** Content for this step */
  children: React.ReactNode;
  /** Called when the Back button is pressed.  Omit to hide the Back button. */
  onBack?: () => void;
  /** Called when the Next / primary button is pressed */
  onNext?: () => void;
  /** Label for the primary action button.  Defaults to "Next". */
  nextLabel?: React.ReactNode;
  /** When true the primary button renders as disabled */
  nextDisabled?: boolean;
  /** When true the primary button shows a spinner and is disabled */
  nextLoading?: boolean;
  /** When true the step number dots are hidden */
  hideDots?: boolean;
  /** Extra class names on the outer wrapper */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WizardStep({
  stepIndex,
  totalSteps,
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
  nextLoading = false,
  hideDots = false,
  className,
}: WizardStepProps) {
  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {/* Step progress dots */}
      {!hideDots && totalSteps > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? 'w-6 bg-emerald-500'
                  : i < stepIndex
                    ? 'w-1.5 bg-emerald-500/40'
                    : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
      )}

      {/* Heading */}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-studio-text">{title}</h3>
        {description && <p className="text-sm text-studio-muted">{description}</p>}
      </div>

      {/* Body */}
      <div className="flex-1">{children}</div>

      {/* Navigation footer */}
      {(onBack !== undefined || onNext !== undefined) && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-studio-border/40 text-xs text-studio-muted transition-colors hover:border-studio-border hover:text-studio-text"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
          </div>
          <div>
            {onNext && (
              <button
                onClick={nextLoading || nextDisabled ? undefined : onNext}
                disabled={nextLoading || nextDisabled}
                className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  nextLoading || nextDisabled
                    ? 'bg-emerald-500/30 text-emerald-400/50 cursor-not-allowed'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95'
                }`}
              >
                {nextLoading && <Loader2 size={12} className="animate-spin" />}
                {nextLabel}
                {!nextLoading && !isLastStep && <ChevronRight size={14} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
