import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSceneStore } from '@/lib/stores';

export function SearchBar() {
  const metadata = useSceneStore((s) => s.metadata);
  const isDirty = useSceneStore((s) => s.isDirty);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Link href="/" aria-label="Back to home" className="text-studio-muted transition hover:text-studio-text shrink-0">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <span className="text-sm font-semibold hidden sm:inline shrink-0">
        HoloScript <span className="text-studio-accent">Studio</span>
      </span>
      <span className="text-xs text-studio-muted hidden sm:inline shrink-0">|</span>
      <input
        type="text"
        value={metadata.name || ''}
        onChange={(e) => setMetadata({ name: e.target.value })}
        aria-label="Scene name"
        className="min-w-0 w-28 bg-transparent text-sm text-studio-text outline-none truncate"
        placeholder="Untitled Scene"
      />
      {isDirty && (
        <span
          className="h-2 w-2 rounded-full bg-studio-warning shrink-0"
          title="Unsaved changes"
        />
      )}
    </div>
  );
}
