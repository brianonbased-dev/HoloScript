import { Check } from 'lucide-react';
import { LEVELS } from './wizardData';
import type { ExperienceLevel } from '@/lib/presets/studioPresets';

interface Step3ExperienceLevelProps {
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (l: ExperienceLevel) => void;
}

export function Step3ExperienceLevel({ experienceLevel, setExperienceLevel }: Step3ExperienceLevelProps) {
  return (
    <>
      <p className="mb-4 text-sm text-studio-muted">
        How familiar are you with 3D creation tools?
      </p>
      <div className="flex flex-col gap-3">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => setExperienceLevel(l.id as ExperienceLevel)}
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
    </>
  );
}
