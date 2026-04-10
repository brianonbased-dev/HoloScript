'use client';

import { useState, useCallback } from 'react';
import {
  X,
  Crosshair,
  Upload,
  Link,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { useAssetStore } from './useAssetStore';
import { useSceneGraphStore } from '@/lib/stores';

type WizardStep = 'method' | 'capture' | 'url' | 'upload' | 'configure' | 'done';

interface SplatConfig {
  name: string;
  src: string;
  quality: 'low' | 'medium' | 'high';
  shDegree: number;
}

const DEFAULT_CONFIG: SplatConfig = {
  name: '',
  src: '',
  quality: 'medium',
  shDegree: 3,
};

// ─── Step: Method ─────────────────────────────────────────────────────────────

function StepMethod({ onChoose }: { onChoose: (step: WizardStep) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-studio-muted">How do you want to bring in your Gaussian Splat?</p>
      <div className="grid grid-cols-1 gap-2">
        {[
          {
            step: 'url' as WizardStep,
            icon: Link,
            title: 'Import from URL',
            desc: 'Paste a .splat or .ksplat URL',
            color: 'text-purple-400',
          },
          {
            step: 'upload' as WizardStep,
            icon: Upload,
            title: 'Upload .splat file',
            desc: 'From your local disk',
            color: 'text-blue-400',
          },
          {
            step: 'capture' as WizardStep,
            icon: Crosshair,
            title: 'Live Capture (App Required)',
            desc: 'Requires HoloScript mobile app for capture',
            color: 'text-gray-500',
            disabled: true,
          },
        ].map(({ step, icon: Icon, title, desc, color, disabled }) => (
          <button
            key={step}
            disabled={disabled}
            onClick={() => onChoose(step)}
            className={`flex items-center gap-4 rounded-xl border p-4 text-left transition ${
              disabled
                ? 'border-studio-border/30 opacity-40 cursor-not-allowed'
                : 'border-studio-border bg-studio-surface hover:border-studio-accent hover:shadow-md hover:shadow-studio-accent/10 cursor-pointer'
            }`}
          >
            <Icon className={`h-6 w-6 shrink-0 ${color}`} />
            <div>
              <div className="text-sm font-semibold text-studio-text">{title}</div>
              <div className="text-xs text-studio-muted">{desc}</div>
            </div>
            {!disabled && <ChevronRight className="ml-auto h-4 w-4 text-studio-muted" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step: URL ────────────────────────────────────────────────────────────────

function StepURL({
  config,
  onChange,
  onNext,
  onBack,
}: {
  config: SplatConfig;
  onChange: (patch: Partial<SplatConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs text-studio-muted">Splat URL</label>
        <input
          autoFocus
          type="url"
          value={config.src}
          onChange={(e) => onChange({ src: e.target.value })}
          placeholder="https://example.com/scene.splat"
          className="w-full rounded-xl border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
        />
        <p className="mt-1 text-[11px] text-studio-muted">Supports .splat, .ksplat formats</p>
      </div>
      <div>
        <label className="mb-1.5 block text-xs text-studio-muted">Display Name</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="My Gaussian Splat"
          className="w-full rounded-xl border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="rounded-xl border border-studio-border px-4 py-2 text-sm text-studio-muted transition hover:text-studio-text"
        >
          Back
        </button>
        <button
          disabled={!config.src || !config.name}
          onClick={onNext}
          className="flex-1 rounded-xl bg-studio-accent py-2 text-sm text-white transition hover:bg-studio-accent/80 disabled:opacity-40"
        >
          Configure →
        </button>
      </div>
    </div>
  );
}

// ─── Step: Upload ─────────────────────────────────────────────────────────────

function StepUpload({
  onChange,
  onNext,
  onBack,
}: {
  config: SplatConfig;
  onChange: (patch: Partial<SplatConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const name = file.name.replace(/\.[^.]+$/, '').replace(/-|_/g, ' ');
        onChange({ src, name });
        setFileName(file.name);
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition ${
          dragging
            ? 'border-studio-accent bg-studio-accent/5'
            : 'border-studio-border bg-studio-surface/50'
        }`}
      >
        <Upload
          className={`mb-2 h-8 w-8 ${dragging ? 'text-studio-accent' : 'text-studio-muted'}`}
        />
        <p className="text-sm text-studio-muted">Drop .splat file here</p>
        <p className="mt-1 text-xs text-studio-muted">or</p>
        <label className="mt-2 cursor-pointer rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted transition hover:border-studio-accent hover:text-studio-text">
          Browse file
          <input
            type="file"
            accept=".splat,.ksplat"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        {fileName && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {fileName}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="rounded-xl border border-studio-border px-4 py-2 text-sm text-studio-muted transition hover:text-studio-text"
        >
          Back
        </button>
        <button
          disabled={!fileName}
          onClick={onNext}
          className="flex-1 rounded-xl bg-studio-accent py-2 text-sm text-white transition hover:bg-studio-accent/80 disabled:opacity-40"
        >
          Configure →
        </button>
      </div>
    </div>
  );
}

// ─── Step: Configure ──────────────────────────────────────────────────────────

function StepConfigure({
  config,
  onChange,
  onImport,
  onBack,
  isImporting,
}: {
  config: SplatConfig;
  onChange: (patch: Partial<SplatConfig>) => void;
  onImport: () => void;
  onBack: () => void;
  isImporting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-studio-muted">Display Name</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-xl border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs text-studio-muted">Render Quality</label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map((q) => (
            <button
              key={q}
              onClick={() => onChange({ quality: q })}
              className={`flex-1 rounded-lg py-2 text-xs capitalize transition ${
                config.quality === q
                  ? 'bg-studio-accent text-white'
                  : 'border border-studio-border text-studio-muted hover:border-studio-accent/60'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-studio-muted">
          Spherical Harmonics Degree: {config.shDegree}
        </label>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={config.shDegree}
          onChange={(e) => onChange({ shDegree: parseInt(e.target.value) })}
          className="w-full accent-purple-500"
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-studio-muted">
          <span>Faster</span>
          <span>More color detail</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="rounded-xl border border-studio-border px-4 py-2 text-sm text-studio-muted transition hover:text-studio-text"
        >
          Back
        </button>
        <button
          disabled={!config.name || !config.src || isImporting}
          onClick={onImport}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2 text-sm text-white transition hover:bg-purple-500 disabled:opacity-40"
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            'Import Splat'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step: Done ───────────────────────────────────────────────────────────────

function StepDone({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
        <CheckCircle2 className="h-8 w-8 text-green-400" />
      </div>
      <div>
        <p className="font-semibold text-studio-text">Import complete!</p>
        <p className="mt-1 text-sm text-studio-muted">
          <span className="text-studio-text">{name}</span> has been added to your scene and asset
          library.
        </p>
      </div>
      <button
        onClick={onClose}
        className="rounded-xl bg-studio-accent px-6 py-2 text-sm text-white transition hover:bg-studio-accent/80"
      >
        Done
      </button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface SplatCaptureWizardProps {
  open: boolean;
  onClose: () => void;
}

const STEP_LABELS: Record<WizardStep, string> = {
  method: 'Choose Method',
  capture: 'Capture',
  url: 'Enter URL',
  upload: 'Upload File',
  configure: 'Configure',
  done: 'Done',
};

export function SplatCaptureWizard({ open, onClose }: SplatCaptureWizardProps) {
  const [step, setStep] = useState<WizardStep>('method');
  const [config, setConfig] = useState<SplatConfig>(DEFAULT_CONFIG);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  const { addAsset } = useAssetStore();
  const { addNode, addTrait } = useSceneGraphStore();

  const patchConfig = useCallback((patch: Partial<SplatConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
  }, []);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    setError('');
    try {
      // Add to asset library
      addAsset({
        id: `splat-${Date.now()}`,
        name: config.name,
        category: 'splat',
        src: config.src,
        size: 0,
        addedAt: Date.now(),
        tags: ['splat'],
      });

      // Add to scene graph with @gaussian_splat trait
      const nodeId = `splat-node-${Date.now()}`;
      addNode({
        id: nodeId,
        name: config.name,
        type: 'splat',
        parentId: null,
        traits: [],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
      addTrait(nodeId, {
        name: 'gaussian_splat',
        properties: {
          source: config.src,
          quality: config.quality,
          sh_degree: config.shDegree,
          sort_mode: 'distance',
        },
      });

      setStep('done');
    } catch (err) {
      setError(String(err));
    } finally {
      setIsImporting(false);
    }
  }, [config, addAsset, addNode, addTrait]);

  const handleClose = useCallback(() => {
    setStep('method');
    setConfig(DEFAULT_CONFIG);
    setError('');
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[520px] max-w-[95vw] rounded-2xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-studio-border px-5 py-4">
          <Crosshair className="h-5 w-5 text-purple-400" />
          <div>
            <div className="font-semibold text-studio-text">Gaussian Splat Import</div>
            <div className="text-xs text-studio-muted">{STEP_LABELS[step]}</div>
          </div>
          <button
            onClick={handleClose}
            className="ml-auto rounded-lg p-1.5 text-studio-muted hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex items-center gap-1 border-b border-studio-border/50 px-5 py-2">
            {(['method', 'url', 'configure'] as WizardStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`h-1.5 w-8 rounded-full transition-all ${
                    step === s ||
                    (step === 'upload' && s === 'url') ||
                    (step === 'configure' && i <= 2)
                      ? 'bg-purple-500'
                      : 'bg-studio-border'
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {step === 'method' && <StepMethod onChoose={setStep} />}
          {step === 'url' && (
            <StepURL
              config={config}
              onChange={patchConfig}
              onNext={() => setStep('configure')}
              onBack={() => setStep('method')}
            />
          )}
          {step === 'upload' && (
            <StepUpload
              config={config}
              onChange={patchConfig}
              onNext={() => setStep('configure')}
              onBack={() => setStep('method')}
            />
          )}
          {step === 'configure' && (
            <StepConfigure
              config={config}
              onChange={patchConfig}
              onImport={handleImport}
              onBack={() => setStep('method')}
              isImporting={isImporting}
            />
          )}
          {step === 'done' && <StepDone name={config.name} onClose={handleClose} />}
        </div>
      </div>
    </div>
  );
}
