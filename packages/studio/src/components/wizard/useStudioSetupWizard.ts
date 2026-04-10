import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import type { ExperienceLevel, ProjectSpecifics } from '@/lib/presets/studioPresets';
import type { SceneTemplate } from '@/lib/scene/sceneTemplates';
import { StudioEvents } from '@/lib/analytics';

export function useStudioSetupWizard(onClose: () => void) {
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

  return {
    step,
    direction,
    TOTAL_STEPS,
    category,
    subCategory,
    projectSize,
    experienceLevel,
    subCategories,
    selectedPreset,
    finalPanels,
    wizardTemplate,
    questions,
    canNext,
    created,
    platforms,
    setCategory,
    setSubCategory,
    setExperienceLevel,
    goToStep,
    togglePlatform,
    getSpecificValue,
    setSpecificValue,
    getToggleValue,
    setToggleValue,
    handleLaunch,
  };
}
