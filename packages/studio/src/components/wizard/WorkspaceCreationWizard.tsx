// @ts-nocheck
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ANIM_NAVIGATE } from '@/lib/ui-timings';
import {
  Box,
  Bot,
  Puzzle,
  LayoutTemplate,
  Database,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Terminal,
} from 'lucide-react';

export type WorkspaceEntityType = 'trait' | 'agent' | 'plugin' | 'template' | 'training-data';

interface WorkspaceCreationWizardProps {
  entityType: WorkspaceEntityType;
}

const ENTITY_CONFIG: Record<
  WorkspaceEntityType,
  {
    title: string;
    description: string;
    icon: React.ElementType;
    fields: { name: string; label: string; placeholder: string }[];
  }
> = {
  trait: {
    title: 'Create New Trait',
    description: 'Traits define the physical and behavioral properties of a spatial entity.',
    icon: Box,
    fields: [
      { name: 'name', label: 'Trait Name', placeholder: 'e.g., MagneticAura' },
      {
        name: 'description',
        label: 'Description',
        placeholder: 'Adds a pulsating magnetic force field.',
      },
    ],
  },
  agent: {
    title: 'Spawn Autonomy Agent',
    description: 'Agents execute tasks within the spatial environment and act on logic loops.',
    icon: Bot,
    fields: [
      { name: 'name', label: 'Agent Persona', placeholder: 'e.g., NavMeshPathfinder' },
      {
        name: 'description',
        label: 'Primary Directive',
        placeholder: 'Finds optimal paths around dynamic obstacles.',
      },
    ],
  },
  plugin: {
    title: 'Initialize Plugin',
    description: 'Plugins extend HoloScript Studio capabilities connected to the MCP orchestrator.',
    icon: Puzzle,
    fields: [
      { name: 'name', label: 'Plugin Identifier', placeholder: 'e.g., holoscript-jira-sync' },
      {
        name: 'description',
        label: 'Functionality',
        placeholder: 'Syncs spatial tasks with Jira boards.',
      },
    ],
  },
  template: {
    title: 'New Spatial Template',
    description: 'Templates are reusable blueprints for commonly used spaces or components.',
    icon: LayoutTemplate,
    fields: [
      { name: 'name', label: 'Template Name', placeholder: 'e.g., Corporate_Meeting_Room_V2' },
      {
        name: 'description',
        label: 'Use Case',
        placeholder: 'A standard boardroom with 12 chairs and a projector.',
      },
    ],
  },
  'training-data': {
    title: 'Curate Training Data',
    description: 'Curate and tag datasets for the DataForge and neural weights synthesis.',
    icon: Database,
    fields: [
      {
        name: 'name',
        label: 'Dataset Registry ID',
        placeholder: 'e.g., dataset-vision-spatial-10k',
      },
      {
        name: 'description',
        label: 'Contents',
        placeholder: '10,000 spatial layouts of generic indoor spaces.',
      },
    ],
  },
};

export function WorkspaceCreationWizard({ entityType }: WorkspaceCreationWizardProps) {
  const router = useRouter();
  const config = ENTITY_CONFIG[entityType];
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const Icon = config.icon;

  const handleNext = () => setStep((s) => s + 1);
  const handlePrev = () => setStep((s) => s - 1);

  const handleCreate = async () => {
    setLoading(true);
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, ANIM_NAVIGATE));
    setLoading(false);
    setStep(3); // Success step
  };

  const handleBackToWorkspace = () => {
    router.push('/workspace');
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3rem)] bg-[#0A0A0A] p-4 text-slate-200 font-sans">
      <div className="w-full max-w-xl bg-slate-900/50 border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-xl">
        {/* Header */}
        <div className="border-b border-slate-800 p-6 flex items-start gap-4 bg-slate-900/80">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Icon size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{config.title}</h1>
            <p className="text-sm text-slate-400 mt-1">{config.description}</p>
          </div>
        </div>

        {/* Dynamic Steps */}
        <div className="p-6">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                Basic Information
              </h2>
              <div className="space-y-4">
                {config.fields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-300">{field.label}</label>
                    <input
                      type="text"
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition"
                      placeholder={field.placeholder}
                      value={formData[field.name] || ''}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                Configuration Output
              </h2>
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg font-mono text-sm text-slate-400">
                <div className="flex items-center gap-2 mb-3 px-2 py-1 rounded bg-slate-900/80 border border-slate-800">
                  <Terminal size={14} className="text-emerald-400" />
                  <span className="text-xs">holoscript.config.json preview</span>
                </div>
                <pre className="overflow-x-auto p-2">
                  {JSON.stringify(
                    {
                      type: entityType,
                      metadata: {
                        ...formData,
                        createdAt: new Date().toISOString(),
                      },
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in zoom-in-95 duration-500 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 ring-8 ring-emerald-500/10">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-100 mb-2">Successfully Created!</h2>
              <p className="text-slate-400 max-w-sm">
                Your new {entityType} has been scaffolded and injected into the active workspace
                graph.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step < 3 && (
          <div className="border-t border-slate-800 p-4 bg-slate-900/80 flex justify-between items-center">
            <button
              onClick={step === 1 ? handleBackToWorkspace : handlePrev}
              className="flex items-center text-sm font-medium text-slate-400 hover:text-slate-200 transition px-3 py-2 rounded-lg hover:bg-slate-800"
            >
              {step === 1 ? (
                'Cancel'
              ) : (
                <>
                  <ArrowLeft size={16} className="mr-2" /> Back
                </>
              )}
            </button>
            <button
              onClick={step === 1 ? handleNext : handleCreate}
              disabled={loading || (step === 1 && !formData[config.fields[0].name])}
              className="flex items-center bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {loading ? (
                'Processing...'
              ) : step === 1 ? (
                <>
                  Next <ArrowRight size={16} className="ml-2" />
                </>
              ) : (
                'Generate Engine Scaffolding'
              )}
            </button>
          </div>
        )}
        {step === 3 && (
          <div className="border-t border-slate-800 p-4 bg-slate-900/80 flex justify-center">
            <button
              onClick={handleBackToWorkspace}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg transition border border-slate-700"
            >
              Return to Workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
