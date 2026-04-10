import { Check } from 'lucide-react';
import { CATEGORIES } from './wizardData';

interface Step1SubCategoryProps {
  category: string | null;
  subCategory: string | null;
  subCategories: Array<{ id: string; label: string; description: string; emoji: string }>;
  setSubCategory: (c: string) => void;
}

export function Step1SubCategory({ category, subCategory, subCategories, setSubCategory }: Step1SubCategoryProps) {
  return (
    <>
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
    </>
  );
}
