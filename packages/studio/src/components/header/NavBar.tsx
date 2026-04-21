import { SearchBar } from './SearchBar';
import { GeometricViewModeSegment } from './GeometricViewModeSegment';
import { Toolbar } from './Toolbar';
import { useEditorStore } from '@/lib/stores';
import { useStudioPresetStore } from '@/lib/stores/studioPresetStore';
import { Settings2 } from 'lucide-react';

interface NavBarProps {
  setShowSetupWizard?: (show: boolean) => void;
  setShowImportWizard?: (show: boolean) => void;
}

export function NavBar({ setShowSetupWizard, setShowImportWizard }: NavBarProps) {
  const studioMode = useEditorStore((s) => s.studioMode);
  const isExpert = studioMode === 'expert';
  const geometricPipelineBusy = useEditorStore((s) => s.geometricPipelineTransitioning);

  return (
    <div className="w-full">
      <header role="banner" aria-label="Studio editor toolbar" className="grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-studio-border bg-studio-panel px-2 sm:px-4 gap-1 sm:gap-2">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <GeometricViewModeSegment />
          <div className="min-w-0 flex-1">
            <SearchBar />
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => {
              if (isExpert) {
                useStudioPresetStore.getState().reset();
                if (typeof window !== 'undefined') window.location.reload();
              } else {
                useStudioPresetStore.getState().unlockMassiveIde();
              }
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
              isExpert
                ? 'bg-studio-accent text-white shadow-md shadow-studio-accent/20'
                : 'bg-studio-panel border border-studio-border text-studio-muted hover:text-studio-text hover:bg-studio-surface'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {isExpert ? 'Massive IDE' : 'Expert Mode'}
          </button>
        </div>

        <Toolbar setShowSetupWizard={setShowSetupWizard} setShowImportWizard={setShowImportWizard} />
      </header>
      {geometricPipelineBusy && (
        <div
          className="pointer-events-none h-1 w-full overflow-hidden border-b border-studio-border/40 bg-black/10"
          role="progressbar"
          aria-label="Updating draft–mesh–sim pipeline"
          aria-busy="true"
        >
          <div className="h-full w-full bg-gradient-to-r from-transparent via-studio-accent/90 to-transparent animate-pulse" />
        </div>
      )}
    </div>
  );
}
