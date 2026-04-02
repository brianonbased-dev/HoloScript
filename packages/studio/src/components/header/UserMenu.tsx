import { useState, useRef, useEffect } from 'react';
import { Settings2, Sparkles, CheckCircle, FolderGit2 } from 'lucide-react';
import { useStudioPresetStore } from '@/lib/stores/studioPresetStore';
import { STUDIO_PRESETS } from '@/lib/presets/studioPresets';
import { StudioEvents } from '@/lib/analytics';

interface UserMenuProps {
  setShowSetupWizard: (show: boolean) => void;
  setShowImportWizard: (show: boolean) => void;
}

export function UserMenu({ setShowSetupWizard, setShowImportWizard }: UserMenuProps) {
  const activePresetId = useStudioPresetStore((s) => s.activePresetId);
  const experienceLevel = useStudioPresetStore((s) => s.experienceLevel);
  const projectSpecifics = useStudioPresetStore((s) => s.projectSpecifics);
  const applyPreset = useStudioPresetStore((s) => s.applyPreset);
  const activePreset = activePresetId ? STUDIO_PRESETS.find((p) => p.id === activePresetId) : null;

  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // Close preset dropdown when clicking outside
  useEffect(() => {
    if (!presetDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presetDropdownOpen]);

  return (
    <div className="relative" ref={presetDropdownRef}>
      <div className="flex items-center">
        <button
          onClick={() => setPresetDropdownOpen((v) => !v)}
          title="Switch Studio Preset"
          className={`flex items-center gap-1.5 rounded-l-lg border px-2.5 py-1 text-xs font-medium transition ${
            presetDropdownOpen
              ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
              : 'border-studio-border bg-studio-surface text-studio-muted hover:border-emerald-500/40 hover:text-emerald-400'
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {activePreset && (
            <span className="hidden lg:inline text-emerald-400">
              {activePreset.emoji} {activePreset.label}
            </span>
          )}
          {!activePreset && <span className="hidden lg:inline">Setup</span>}
        </button>
        <button
          onClick={() => setShowSetupWizard(true)}
          title="Open Full Setup Wizard"
          className="flex items-center rounded-r-lg border border-l-0 border-studio-border bg-studio-surface px-1.5 py-1 text-xs text-studio-muted transition hover:border-emerald-500/40 hover:text-emerald-400"
        >
          <Sparkles className="h-3 w-3" />
        </button>
      </div>
      {presetDropdownOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-studio-border bg-studio-panel shadow-2xl shadow-black/40 animate-scale-in overflow-hidden">
          <div className="px-3 py-2 border-b border-studio-border">
            <p className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
              Quick Switch Preset
            </p>
          </div>
          <div className="p-1.5 space-y-0.5 max-h-[50vh] overflow-y-auto">
            {STUDIO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  StudioEvents.presetApplied(preset.id, 'quick_switch');
                  applyPreset(
                    preset.id,
                    projectSpecifics ?? {
                      projectSize: 'small',
                      artStyle: 'stylized',
                      platforms: ['web'],
                    },
                    experienceLevel
                  );
                  setPresetDropdownOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition ${
                  activePresetId === preset.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
                }`}
              >
                <span className="text-base shrink-0">{preset.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium truncate">{preset.label}</p>
                  <p className="text-[9px] text-studio-muted/70 truncate">
                    {preset.description}
                  </p>
                </div>
                {activePresetId === preset.id && (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-studio-border flex flex-col gap-1.5">
            <button
              onClick={() => {
                setShowSetupWizard(true);
                setPresetDropdownOpen(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-studio-accent/20 px-3 py-1.5 text-[10px] font-semibold text-studio-accent transition hover:bg-studio-accent/30"
            >
              <Sparkles className="h-3 w-3" />
              Full Setup Wizard
            </button>
            <button
              onClick={() => {
                setShowImportWizard(true);
                setPresetDropdownOpen(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[10px] font-semibold text-blue-400 transition hover:bg-blue-500/30"
            >
              <FolderGit2 className="h-3 w-3" />
              Import GitHub Repo
            </button>
            <button
              onClick={() => {
                useStudioPresetStore.getState().unlockMassiveIde();
                setPresetDropdownOpen(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg mt-1 border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-[10px] font-semibold text-rose-400 transition hover:bg-rose-500/30 hover:border-rose-500/50"
            >
              <Settings2 className="h-3 w-3" />
              Unlock Massive IDE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
