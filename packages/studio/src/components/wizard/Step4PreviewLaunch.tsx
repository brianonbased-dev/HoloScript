import type { StudioPreset, ExperienceLevel } from '@/lib/presets/studioPresets';
import type { SceneTemplate } from '@/lib/scene/sceneTemplates';

interface Step4PreviewLaunchProps {
  selectedPreset: StudioPreset | null;
  finalPanels: string[];
  wizardTemplate: SceneTemplate | null;
  experienceLevel: ExperienceLevel;
}

export function Step4PreviewLaunch({
  selectedPreset,
  finalPanels,
  wizardTemplate,
  experienceLevel,
}: Step4PreviewLaunchProps) {
  if (!selectedPreset) return null;

  return (
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
  );
}
