'use client';

import { X, ChevronRight, ChevronLeft, Sparkles, Check, Settings2 } from 'lucide-react';
import { CATEGORIES, LEVELS } from './wizardData';
import { AnimatedStep } from './AnimatedStep';
import { useStudioSetupWizard } from './useStudioSetupWizard';
import { Step0Category } from './Step0Category';
import { Step1SubCategory } from './Step1SubCategory';
import { Step2ProjectSpecifics } from './Step2ProjectSpecifics';
import { Step3ExperienceLevel } from './Step3ExperienceLevel';
import { Step4PreviewLaunch } from './Step4PreviewLaunch';

interface StudioSetupWizardProps {
  onClose: () => void;
}

export function StudioSetupWizard({ onClose }: StudioSetupWizardProps) {
  const wizard = useStudioSetupWizard(onClose);

  // ── Success flash ──
  if (wizard.created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 animate-bounce">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/50">
            <Check className="h-10 w-10 text-white" />
          </div>
          <p className="text-lg font-semibold text-emerald-400">Studio Ready!</p>
        </div>
      </div>
    );
  }

  const stepTitles = [
    'What are you building?',
    'What kind?',
    'About your project',
    'Experience level',
    'Your Studio',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl border border-studio-border bg-studio-panel shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/20 p-2">
              <Settings2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-studio-text">{stepTitles[wizard.step]}</p>
              <p className="text-xs text-studio-muted">
                Step {wizard.step + 1} of {wizard.TOTAL_STEPS}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 hover:text-studio-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-black/20">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${((wizard.step + 1) / wizard.TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="relative min-h-[360px] p-6">
          <AnimatedStep visible={wizard.step === 0} direction={wizard.direction}>
            <Step0Category 
              category={wizard.category} 
              setCategory={wizard.setCategory} 
              setSubCategory={wizard.setSubCategory} 
            />
          </AnimatedStep>

          <AnimatedStep visible={wizard.step === 1} direction={wizard.direction}>
            <Step1SubCategory 
              category={wizard.category} 
              subCategory={wizard.subCategory} 
              subCategories={wizard.subCategories} 
              setSubCategory={wizard.setSubCategory} 
            />
          </AnimatedStep>

          <AnimatedStep visible={wizard.step === 2} direction={wizard.direction}>
            <Step2ProjectSpecifics 
              questions={wizard.questions} 
              platforms={wizard.platforms} 
              getSpecificValue={wizard.getSpecificValue} 
              setSpecificValue={wizard.setSpecificValue} 
              getToggleValue={wizard.getToggleValue} 
              setToggleValue={wizard.setToggleValue} 
              togglePlatform={wizard.togglePlatform} 
            />
          </AnimatedStep>

          <AnimatedStep visible={wizard.step === 3} direction={wizard.direction}>
            <Step3ExperienceLevel 
              experienceLevel={wizard.experienceLevel} 
              setExperienceLevel={wizard.setExperienceLevel} 
            />
          </AnimatedStep>

          <AnimatedStep visible={wizard.step === 4} direction={wizard.direction}>
            <Step4PreviewLaunch 
              selectedPreset={wizard.selectedPreset} 
              finalPanels={wizard.finalPanels} 
              wizardTemplate={wizard.wizardTemplate} 
              experienceLevel={wizard.experienceLevel} 
            />
          </AnimatedStep>
        </div>

        {/* Summary chips */}
        {wizard.step > 0 && (
          <div className="px-6 pb-2">
            <div className="flex flex-wrap gap-1.5">
              {wizard.category && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {CATEGORIES.find((c) => c.id === wizard.category)?.label}
                </span>
              )}
              {wizard.subCategory && wizard.step >= 2 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {wizard.subCategories.find((sc) => sc.id === wizard.subCategory)?.emoji}{' '}
                  {wizard.subCategories.find((sc) => sc.id === wizard.subCategory)?.label}
                </span>
              )}
              {wizard.step >= 3 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {wizard.projectSize}
                </span>
              )}
              {wizard.step >= 4 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {LEVELS.find((l) => l.id === wizard.experienceLevel)?.emoji} {wizard.experienceLevel}
                </span>
              )}
              {wizard.step >= 4 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] text-emerald-400">
                  {wizard.finalPanels.length} panels
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={() => (wizard.step > 0 ? wizard.goToStep(wizard.step - 1) : onClose())}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text"
          >
            <ChevronLeft className="h-4 w-4" />
            {wizard.step === 0 ? 'Skip' : 'Back'}
          </button>

          {wizard.step < wizard.TOTAL_STEPS - 1 ? (
            <button
              onClick={() => wizard.goToStep(wizard.step + 1)}
              disabled={!wizard.canNext}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={wizard.handleLaunch}
              disabled={!wizard.selectedPreset}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-1.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-[1.02] active:scale-95 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Launch Studio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
