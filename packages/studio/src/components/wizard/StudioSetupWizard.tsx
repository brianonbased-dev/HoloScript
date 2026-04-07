'use client';

/**
 * StudioSetupWizard — 5-step personalized IDE configuration wizard.
 *
 * Step 1: "What are you building?" (category)
 * Step 2: "What kind?" (sub-category → selects preset)
 * Step 3: "Tell us about your project" (scope + specifics)
 * Step 4: "Experience level" (beginner / intermediate / advanced)
 * Step 5: "Your Studio" (preview + launch)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Check,
  Settings2,
} from 'lucide-react';
import { CATEGORIES, LEVELS } from './wizardData';
import { AnimatedStep } from './AnimatedStep';
import {
  STUDIO_PRESETS,
  SUBCATEGORIES,
  SUBCATEGORY_PRESET_MAP,
  PROJECT_QUESTIONS,
  getExtraPanels,
  filterByExperience,
} from '@/lib/presets/studioPresets';
import { useStudioPresetStore } from '@/lib/stores/studioPresetStore';
import { useSceneStore } from '@/lib/stores/sceneStore';
import { getWizardTemplate } from '@/lib/presets/wizardTemplates';
import type { ExperienceLevel, ProjectSpecifics, StudioPreset } from '@/lib/presets/studioPresets';
import type { SceneTemplate } from '@/lib/scene/sceneTemplates';
import { StudioEvents } from '@/lib/analytics';

// ─── Component ───────────────────────────────────────────────────────────────

interface StudioSetupWizardProps {
  onClose: () => void;
}

export function StudioSetupWizard({ onClose }: StudioSetupWizardProps) {
  const router = useRouter();
  const applyPreset = useStudioPresetStore((s) => s.applyPreset);
  const setCode = useSceneStore((s) => s.setCode);

  const [step, setStep] = useState(0);
  const [prevStep, setPrevStep] = useState(0);

  // Step 1
  const [category, setCategory] = useState<string | null>(null);

  // Step 2
  const [subCategory, setSubCategory] = useState<string | null>(null);

  // Step 3 — project specifics
  const [projectSize, setProjectSize] = useState<ProjectSpecifics['projectSize']>('small');
  const [artStyle, setArtStyle] = useState<ProjectSpecifics['artStyle']>('stylized');
  const [platforms, setPlatforms] = useState<Set<string>>(new Set(['web']));
  const [needsMultiplayer, setNeedsMultiplayer] = useState(false);
  const [needsAI, setNeedsAI] = useState(false);
  const [characterCount, setCharacterCount] = useState<ProjectSpecifics['characterCount']>('none');
  const [needsDialogue, setNeedsDialogue] = useState(false);
  const [needsDeployment, setNeedsDeployment] = useState(false);
  const [exportFormat, setExportFormat] = useState<ProjectSpecifics['exportFormat']>('gltf');

  // Step 4
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('intermediate');

  // Done state
  const [created, setCreated] = useState(false);

  const direction: 'left' | 'right' = step >= prevStep ? 'right' : 'left';
  const TOTAL_STEPS = 5;

  const goToStep = useCallback(
    (next: number) => {
      setPrevStep(step);
      setStep(next);
    },
    [step]
  );

  // ── Derived values ──

  const subCategories = useMemo(
    () => (category ? (SUBCATEGORIES[category] ?? []) : []),
    [category]
  );

  const selectedPresetId = useMemo(
    () => (subCategory ? (SUBCATEGORY_PRESET_MAP[subCategory] ?? null) : null),
    [subCategory]
  );

  const selectedPreset = useMemo(
    () =>
      selectedPresetId ? (STUDIO_PRESETS.find((p) => p.id === selectedPresetId) ?? null) : null,
    [selectedPresetId]
  );

  const specifics = useMemo<ProjectSpecifics>(
    () => ({
      projectSize,
      artStyle,
      platforms: [...platforms] as ProjectSpecifics['platforms'],
      characterCount,
      needsMultiplayer,
      needsAI,
      needsDialogue,
      exportFormat,
      needsDeployment,
    }),
    [
      projectSize,
      artStyle,
      platforms,
      characterCount,
      needsMultiplayer,
      needsAI,
      needsDialogue,
      exportFormat,
      needsDeployment,
    ]
  );

  const finalPanels = useMemo(() => {
    if (!selectedPreset) return [];
    const extras = getExtraPanels(specifics);
    return filterByExperience(selectedPreset.openPanels, extras, experienceLevel);
  }, [selectedPreset, specifics, experienceLevel]);

  const [wizardTemplate, setWizardTemplate] = useState<SceneTemplate | null>(null);

  useEffect(() => {
    if (subCategory) {
      getWizardTemplate(subCategory).then(setWizardTemplate);
    } else {
      setWizardTemplate(null);
    }
  }, [subCategory]);

  // Questions for step 3 — filtered by category
  const questions = useMemo(
    () => PROJECT_QUESTIONS.filter((q) => category && q.categories.includes(category)),
    [category]
  );

  // ── Validation ──

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return !!category;
      case 1:
        return !!subCategory;
      case 2:
        return true; // all have defaults
      case 3:
        return true;
      case 4:
        return !!selectedPreset;
      default:
        return false;
    }
  }, [step, category, subCategory, selectedPreset]);

  // ── Toggle helpers ──

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  // ── Launch ──

  const handleLaunch = useCallback(() => {
    if (!selectedPresetId) return;
    applyPreset(selectedPresetId, specifics, experienceLevel);
    if (wizardTemplate) {
      setCode(wizardTemplate.code);
    }
    StudioEvents.wizardCompleted(
      selectedPresetId,
      category ?? '',
      subCategory ?? '',
      experienceLevel
    );
    StudioEvents.presetApplied(selectedPresetId, 'wizard');
    setCreated(true);
    setTimeout(() => {
      onClose();
      
      // Route users to their appropriate standalone workspace based on category
      const industryCategories = [
        'healthcare', 'architecture', 'agriculture', 'iot', 
        'robotics', 'science', 'creator', 'hologram'
      ];
      if (category && industryCategories.includes(category)) {
        router.push(`/industry/${category}`);
      } else {
        router.push('/create');
      }
    }, 800);
  }, [selectedPresetId, specifics, experienceLevel, applyPreset, onClose, wizardTemplate, setCode, router, category]);

  // ── Success flash ──

  if (created) {
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
              <p className="text-sm font-semibold text-studio-text">{stepTitles[step]}</p>
              <p className="text-xs text-studio-muted">
                Step {step + 1} of {TOTAL_STEPS}
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
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <div className="relative min-h-[360px] p-6">
          {/* ── Step 0: Category ── */}
          <AnimatedStep visible={step === 0} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">
              Choose the type of project you want to create
            </p>
            <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setSubCategory(null);
                  }}
                  className={`relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                    category === c.id
                      ? 'border-emerald-500/60 bg-emerald-500/10 scale-[1.02] shadow-lg shadow-emerald-500/10'
                      : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                  }`}
                >
                  <div
                    className={`mt-0.5 ${category === c.id ? 'text-emerald-400' : 'text-studio-muted'}`}
                  >
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-studio-text">{c.label}</span>
                    <p className="text-[11px] text-studio-muted mt-0.5">{c.description}</p>
                  </div>
                  {category === c.id && (
                    <Check className="absolute top-3 right-3 h-4 w-4 text-emerald-400" />
                  )}
                </button>
              ))}
            </div>
          </AnimatedStep>

          {/* ── Step 1: Sub-category ── */}
          <AnimatedStep visible={step === 1} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">
              Pick the type of{' '}
              {CATEGORIES.find((c) => c.id === category)?.label.toLowerCase() ?? 'project'} you want
              to build
            </p>
            <div className="grid grid-cols-2 gap-3">
              {subCategories.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setSubCategory(sc.id)}
                  className={`relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all duration-200 ${
                    subCategory === sc.id
                      ? 'border-emerald-500/60 bg-emerald-500/10 scale-[1.02] shadow-lg shadow-emerald-500/10'
                      : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                  }`}
                >
                  <span className="text-2xl">{sc.emoji}</span>
                  <span className="text-sm font-medium text-studio-text">{sc.label}</span>
                  <span className="text-[11px] text-studio-muted">{sc.description}</span>
                  {subCategory === sc.id && (
                    <Check className="absolute top-3 right-3 h-4 w-4 text-emerald-400" />
                  )}
                </button>
              ))}
            </div>
          </AnimatedStep>

          {/* ── Step 2: Project specifics ── */}
          <AnimatedStep visible={step === 2} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">
              Tell us about your project so we can set up the right tools
            </p>
            <div className="flex flex-col gap-4 max-h-[260px] overflow-y-auto pr-1">
              {questions.map((q) => {
                if (q.type === 'card-select' && q.options) {
                  const value = getSpecificValue(q.stateKey ?? q.id);
                  return (
                    <div key={q.id}>
                      <label className="text-xs font-medium text-studio-text mb-1.5 block">
                        {q.label}
                      </label>
                      <div className="flex gap-2">
                        {q.options.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setSpecificValue(q.stateKey ?? q.id, opt.value)}
                            className={`flex-1 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left transition-all duration-200 ${
                              value === opt.value
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                                : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                            }`}
                          >
                            {opt.emoji && <span className="text-sm">{opt.emoji}</span>}
                            <span className="text-[11px] font-medium">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (q.type === 'multi-select' && q.options) {
                  return (
                    <div key={q.id}>
                      <label className="text-xs font-medium text-studio-text mb-1.5 block">
                        {q.label}
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {q.options.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => togglePlatform(opt.value)}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-all duration-200 ${
                              platforms.has(opt.value)
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                                : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                            }`}
                          >
                            {opt.emoji && <span className="text-sm">{opt.emoji}</span>}
                            <span className="text-[11px] font-medium">{opt.label}</span>
                            {platforms.has(opt.value) && (
                              <Check className="h-3 w-3 text-emerald-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (q.type === 'toggle') {
                  const checked = getToggleValue(q.stateKey ?? q.id);
                  return (
                    <div key={q.id} className="flex items-center justify-between">
                      <label className="text-xs font-medium text-studio-text">{q.label}</label>
                      <button
                        onClick={() => setToggleValue(q.stateKey ?? q.id, !checked)}
                        className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                          checked ? 'bg-emerald-500' : 'bg-studio-border'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                            checked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </AnimatedStep>

          {/* ── Step 3: Experience level ── */}
          <AnimatedStep visible={step === 3} direction={direction}>
            <p className="mb-4 text-sm text-studio-muted">
              How familiar are you with 3D creation tools?
            </p>
            <div className="flex flex-col gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setExperienceLevel(l.id)}
                  className={`relative flex items-center gap-4 rounded-xl border p-4 text-left transition-all duration-200 ${
                    experienceLevel === l.id
                      ? 'border-emerald-500/60 bg-emerald-500/10 scale-[1.01] shadow-lg shadow-emerald-500/10'
                      : 'border-studio-border bg-black/20 hover:border-studio-border/60 hover:bg-white/5'
                  }`}
                >
                  <span className="text-3xl">{l.emoji}</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-studio-text">{l.label}</span>
                    <p className="text-[11px] text-studio-muted mt-0.5">{l.description}</p>
                  </div>
                  {experienceLevel === l.id && (
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </AnimatedStep>

          {/* ── Step 4: Preview & Launch ── */}
          <AnimatedStep visible={step === 4} direction={direction}>
            {selectedPreset && (
              <div className="flex flex-col gap-4">
                {/* Preset summary */}
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <span className="text-3xl">{selectedPreset.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-studio-text">{selectedPreset.label}</p>
                    <p className="text-[11px] text-studio-muted">{selectedPreset.description}</p>
                  </div>
                </div>

                {/* What's included */}
                <div>
                  <p className="text-xs font-medium text-studio-text mb-2">
                    Your studio will include:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {finalPanels.map((panel) => (
                      <span
                        key={panel}
                        className="inline-flex items-center rounded-md bg-white/5 border border-studio-border px-2 py-0.5 text-[10px] text-studio-muted"
                      >
                        {panel}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sidebar tabs */}
                <div>
                  <p className="text-xs font-medium text-studio-text mb-2">Sidebar tools:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPreset.sidebarTabs.map((tab) => (
                      <span
                        key={tab}
                        className="inline-flex items-center rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400"
                      >
                        {tab}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Starter template */}
                {wizardTemplate && (
                  <div>
                    <p className="text-xs font-medium text-studio-text mb-2">
                      Starter template: {wizardTemplate.name}
                    </p>
                    <div className="rounded-lg border border-studio-border bg-black/30 p-3 max-h-[100px] overflow-y-auto">
                      <pre className="text-[10px] text-studio-muted font-mono whitespace-pre-wrap leading-relaxed">
                        {wizardTemplate.code.slice(0, 300)}
                        {wizardTemplate.code.length > 300 && '...'}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Config summary */}
                <div className="flex items-center gap-3 text-[10px] text-studio-muted">
                  <span>Mode: {selectedPreset.studioMode}</span>
                  <span className="text-studio-border">|</span>
                  <span>Domain: {selectedPreset.domainProfile}</span>
                  <span className="text-studio-border">|</span>
                  <span>Level: {experienceLevel}</span>
                </div>
              </div>
            )}
          </AnimatedStep>
        </div>

        {/* Summary chips */}
        {step > 0 && (
          <div className="px-6 pb-2">
            <div className="flex flex-wrap gap-1.5">
              {category && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {CATEGORIES.find((c) => c.id === category)?.label}
                </span>
              )}
              {subCategory && step >= 2 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {subCategories.find((sc) => sc.id === subCategory)?.emoji}{' '}
                  {subCategories.find((sc) => sc.id === subCategory)?.label}
                </span>
              )}
              {step >= 3 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {projectSize}
                </span>
              )}
              {step >= 4 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] text-studio-muted">
                  {LEVELS.find((l) => l.id === experienceLevel)?.emoji} {experienceLevel}
                </span>
              )}
              {step >= 4 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] text-emerald-400">
                  {finalPanels.length} panels
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={() => (step > 0 ? goToStep(step - 1) : onClose())}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-studio-muted transition hover:text-studio-text"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? 'Skip' : 'Back'}
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => goToStep(step + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={!selectedPreset}
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

  // ── Specific value getters/setters ──

  function getSpecificValue(id: string): string {
    switch (id) {
      case 'projectSize':
        return projectSize;
      case 'artStyle':
        return artStyle;
      case 'characterCount':
        return characterCount ?? 'none';
      case 'exportFormat':
        return exportFormat ?? 'gltf';
      default:
        return '';
    }
  }

  function setSpecificValue(id: string, value: string) {
    switch (id) {
      case 'projectSize':
        setProjectSize(value as ProjectSpecifics['projectSize']);
        break;
      case 'artStyle':
        setArtStyle(value as ProjectSpecifics['artStyle']);
        break;
      case 'characterCount':
        setCharacterCount(value as ProjectSpecifics['characterCount']);
        break;
      case 'exportFormat':
        setExportFormat(value as ProjectSpecifics['exportFormat']);
        break;
    }
  }

  function getToggleValue(id: string): boolean {
    switch (id) {
      case 'needsMultiplayer':
        return needsMultiplayer;
      case 'needsAI':
        return needsAI;
      case 'needsDialogue':
        return needsDialogue;
      case 'needsDeployment':
        return needsDeployment;
      default:
        return false;
    }
  }

  function setToggleValue(id: string, value: boolean) {
    switch (id) {
      case 'needsMultiplayer':
        setNeedsMultiplayer(value);
        break;
      case 'needsAI':
        setNeedsAI(value);
        break;
      case 'needsDialogue':
        setNeedsDialogue(value);
        break;
      case 'needsDeployment':
        setNeedsDeployment(value);
        break;
    }
  }
}
