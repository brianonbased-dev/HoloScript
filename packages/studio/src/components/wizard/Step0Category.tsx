import { Check } from 'lucide-react';
import { CATEGORIES } from './wizardData';

interface Step0CategoryProps {
  category: string | null;
  setCategory: (c: string) => void;
  setSubCategory: (c: string | null) => void;
}

export function Step0Category({ category, setCategory, setSubCategory }: Step0CategoryProps) {
  return (
    <>
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
    </>
  );
}
