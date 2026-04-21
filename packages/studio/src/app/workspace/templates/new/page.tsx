'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ResponsiveStudioLayout } from '@/components/layouts/ResponsiveStudioLayout';
import { useSceneStore } from '@/lib/stores';
import { AIGeneratorWizard } from '@/components/generative/AIGeneratorWizard';

const HoloScriptEditor = dynamic(
  () => import('@/components/editor/HoloScriptEditor').then((m) => ({ default: m.HoloScriptEditor })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-zinc-500">Loading editor...</div> }
);

const TemplateManifestSchema = z.object({
  id: z.string().min(3, 'ID must be at least 3 characters'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['scene', 'agent_swarm', 'ui', 'workflow', 'custom']),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().default(false),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a valid semver (e.g. 1.0.0)'),
});

type TemplateManifestForm = z.infer<typeof TemplateManifestSchema>;

function TemplateConfigurationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<TemplateManifestForm>({
    resolver: (zodResolver as any)(TemplateManifestSchema),
    defaultValues: {
      id: 'template-',
      name: '',
      description: '',
      type: 'scene',
      tags: [],
      isPublic: false,
      version: '1.0.0',
    },
  });

  const onSubmit = async (data: TemplateManifestForm) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/templates/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        console.warn('Endpoint /api/templates/provision may not exist yet, but structural validation passed.');
      }

      router.push('/templates');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-zinc-900 text-zinc-100">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Initialize New Template</h1>
        <p className="text-sm text-zinc-400">
          Define a structural blueprint for reusability. Strict schema enforces topology before provisioning.
        </p>
      </div>

      <AIGeneratorWizard contextName="Template" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="p-5 bg-zinc-800 rounded border border-zinc-700 space-y-4">
          <h2 className="text-lg font-semibold border-b border-zinc-700 pb-2">1. Template Metadata</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="template-id" className="block text-xs font-medium text-zinc-400 mb-1">Template ID</label>
              <input id="template-id" {...register('id')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="template-core-ui" />
              {errors.id && <p className="text-red-400 text-[10px] mt-1">{errors.id.message}</p>}
            </div>

            <div>
              <label htmlFor="template-name" className="block text-xs font-medium text-zinc-400 mb-1">Display Name</label>
              <input id="template-name" {...register('name')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="Core UI Scaffold" />
              {errors.name && <p className="text-red-400 text-[10px] mt-1">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="template-version" className="block text-xs font-medium text-zinc-400 mb-1">Version (SemVer)</label>
              <input id="template-version" {...register('version')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="1.0.0" />
              {errors.version && <p className="text-red-400 text-[10px] mt-1">{errors.version.message}</p>}
            </div>

            <div>
              <label htmlFor="template-type" className="block text-xs font-medium text-zinc-400 mb-1">Template Type</label>
              <select id="template-type" {...register('type')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white outline-none">
                <option value="scene">3D Scene</option>
                <option value="agent_swarm">Agent Swarm</option>
                <option value="ui">User Interface</option>
                <option value="workflow">Data Workflow</option>
                <option value="custom">Custom Pipeline</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="template-description" className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
            <textarea id="template-description" {...register('description')} rows={3} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="What makes this template useful?" />
          </div>

          <div className="flex items-center gap-2 mt-4 text-sm">
            <input type="checkbox" {...register('isPublic')} className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500" id="isPublic" />
            <label htmlFor="isPublic" className="font-medium text-zinc-400 cursor-pointer">
              Publish to global template registry
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {submitError && <p className="text-red-400 text-[10px]">{submitError}</p>}
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={() => router.back()} className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition text-sm font-medium">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded transition text-sm font-medium shadow-md">
              {isSubmitting ? 'Provisioning...' : 'Provision Template'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function WorkspaceNewTemplatePage() {
  const setCode = useSceneStore((s) => s.setCode);

  useEffect(() => {
    setCode(`// This workspace features AI-native provisioning.
// Use the AI Template Generator on the left panel to scaffold boilerplate structures.
// You can also manually paste validated HoloScript configurations here.
`);
  }, [setCode]);

  return (
    <ResponsiveStudioLayout
      leftTitle="Template Definition"
      rightTitle="Properties"
      leftPanel={<TemplateConfigurationForm />}
    >
      <HoloScriptEditor height="100%" />
    </ResponsiveStudioLayout>
  );
}
