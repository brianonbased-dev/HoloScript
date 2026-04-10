import { Check } from 'lucide-react';
import type { WizardQuestion } from '@/lib/presets/studioPresets';

interface Step2ProjectSpecificsProps {
  questions: WizardQuestion[];
  platforms: Set<string>;
  getSpecificValue: (id: string) => string;
  setSpecificValue: (id: string, value: string) => void;
  getToggleValue: (id: string) => boolean;
  setToggleValue: (id: string, value: boolean) => void;
  togglePlatform: (p: string) => void;
}

type WizardOption = { value: string; label: string; emoji?: string };

export function Step2ProjectSpecifics({
  questions,
  platforms,
  getSpecificValue,
  setSpecificValue,
  getToggleValue,
  setToggleValue,
  togglePlatform,
}: Step2ProjectSpecificsProps) {
  return (
    <>
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
                  {q.options.map((opt: WizardOption) => (
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
                  {q.options.map((opt: WizardOption) => (
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
    </>
  );
}
