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

const PluginManifestSchema = z.object({
  id: z.string().min(3, 'Plugin ID must be at least 3 characters'),
  name: z.string().min(1, 'Plugin Name is required'),
  description: z.string().optional(),
  entryPoint: z.string().min(1, 'Entry point (e.g., index.ts) is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a valid semver (e.g. 1.0.0)'),
  author: z.string().optional(),
});

type PluginManifestForm = z.infer<typeof PluginManifestSchema>;

function PluginConfigurationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<PluginManifestForm>({
    resolver: zodResolver(PluginManifestSchema),
    defaultValues: {
      id: 'plugin-',
      name: '',
      description: '',
      entryPoint: 'src/index.ts',
      version: '1.0.0',
      author: '',
    },
  });

  const onSubmit = async (data: PluginManifestForm) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/plugins/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        console.warn('Endpoint /api/plugins/register may not exist yet, but structural validation passed.');
      }
      router.push('/plugins');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-zinc-900 text-zinc-100">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Register Ecosystem Plugin</h1>
        <p className="text-sm text-zinc-400">
          Plugins extend the core HoloScript compiler or studio capabilities.
        </p>
      </div>

      <AIGeneratorWizard contextName="Plugin" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="p-5 bg-zinc-800 rounded border border-zinc-700 space-y-4">
          <h2 className="text-lg font-semibold border-b border-zinc-700 pb-2">Plugin Manifest</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="plugin-id" className="block text-xs font-medium text-zinc-400 mb-1">Plugin ID</label>
              <input id="plugin-id" {...register('id')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="plugin-physics-havok" />
              {errors.id && <p className="text-red-400 text-[10px] mt-1">{errors.id.message}</p>}
            </div>

            <div>
              <label htmlFor="plugin-name" className="block text-xs font-medium text-zinc-400 mb-1">Display Name</label>
              <input id="plugin-name" {...register('name')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="Havok Physics Adapter" />
              {errors.name && <p className="text-red-400 text-[10px] mt-1">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="plugin-version" className="block text-xs font-medium text-zinc-400 mb-1">Version (SemVer)</label>
              <input id="plugin-version" {...register('version')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="1.0.0" />
              {errors.version && <p className="text-red-400 text-[10px] mt-1">{errors.version.message}</p>}
            </div>
            <div>
              <label htmlFor="plugin-author" className="block text-xs font-medium text-zinc-400 mb-1">Author</label>
              <input id="plugin-author" {...register('author')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="holoscript-core" />
            </div>
          </div>

          <div>
            <label htmlFor="plugin-entrypoint" className="block text-xs font-medium text-zinc-400 mb-1">Entry Point</label>
            <input id="plugin-entrypoint" {...register('entryPoint')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white font-mono" placeholder="src/index.ts" />
            {errors.entryPoint && <p className="text-red-400 text-[10px] mt-1">{errors.entryPoint.message}</p>}
          </div>

          <div>
            <label htmlFor="plugin-description" className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
            <textarea id="plugin-description" {...register('description')} rows={3} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white" placeholder="Describe the plugin's capabilities..." />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition text-sm font-medium">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded transition text-sm font-medium">
            {isSubmitting ? 'Registering...' : 'Register Plugin'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function WorkspaceNewPluginPage() {
  const setCode = useSceneStore((s) => s.setCode);

  useEffect(() => {
    setCode(`// This workspace features AI-native provisioning.
// Use the AI Plugin Generator on the left panel to scaffold boilerplate structures.
// You can also manually paste validated HoloScript configurations here.
`);
  }, [setCode]);

  return (
    <ResponsiveStudioLayout
      leftTitle="Plugin Configuration"
      rightTitle="Plugin Graph"
      leftPanel={<PluginConfigurationForm />}
    >
      <HoloScriptEditor height="100%" />
    </ResponsiveStudioLayout>
  );
}
