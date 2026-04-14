'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ResponsiveStudioLayout } from '@/components/layouts/ResponsiveStudioLayout';
import { useSceneStore } from '@/lib/stores';

const HoloScriptEditor = dynamic(
  () => import('@/components/editor/HoloScriptEditor').then((m) => ({ default: m.HoloScriptEditor })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-zinc-500">Loading editor...</div> }
);

const TraitManifestSchema = z.object({
  id: z.string().min(2, 'Trait ID is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['behavior', 'visual', 'physics', 'networking', 'core']),
  description: z.string().min(10, 'Provide a meaningful description'),
});

type TraitManifestForm = z.infer<typeof TraitManifestSchema>;

function TraitConfigurationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<TraitManifestForm>({
    // @ts-expect-error -- Typedef mismatch between RHF and Zod Resolver
    resolver: zodResolver(TraitManifestSchema),
    defaultValues: { id: '', name: '', category: 'behavior', description: '' },
  });

  const onSubmit = async (data: TraitManifestForm) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/traits/define', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) console.warn('Structural validation passed, /api/traits/define may not be wired yet.');
      router.push('/traits');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-zinc-900 text-zinc-100">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Define Semantic Trait</h1>
        <p className="text-sm text-zinc-400">
          Traits are the foundational building blocks of the HoloScript engine.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 bg-zinc-800 p-5 rounded border border-zinc-700">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Trait ID (CamelCase)</label>
            <input {...register('id')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="oceanBuoyancy" />
            {errors.id && <p className="text-red-400 text-[10px] mt-1">{errors.id.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Display Name</label>
            <input {...register('name')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="Ocean Buoyancy" />
            {errors.name && <p className="text-red-400 text-[10px] mt-1">{errors.name.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Category</label>
          <select {...register('category')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white outline-none">
            <option value="behavior">Behavior / Logic</option>
            <option value="visual">Visual / Rendering</option>
            <option value="physics">Physics / Mechanics</option>
            <option value="networking">Networking / State</option>
            <option value="core">Core System</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
          <textarea {...register('description')} rows={3} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="Applies Archimedes' principle to dynamic rigid bodies..." />
          {errors.description && <p className="text-red-400 text-[10px] mt-1">{errors.description.message}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-zinc-700">
          <button type="button" onClick={() => router.back()} className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition text-sm font-medium">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded transition text-sm font-medium">
            Define Trait
          </button>
        </div>
      </form>
    </div>
  );
}

export default function WorkspaceNewTraitPage() {
  const setCode = useSceneStore((s) => s.setCode);

  useEffect(() => {
    setCode(`// Trait authoring starts blank here by design.
// Avoid hand-written HoloScript starter code.
// Generate and validate traits through MCP tooling before inserting content.
`);
  }, [setCode]);

  return (
    <ResponsiveStudioLayout
      leftTitle="Trait Definition"
      rightTitle="Properties"
      leftPanel={<TraitConfigurationForm />}
    >
      <HoloScriptEditor height="100%" />
    </ResponsiveStudioLayout>
  );
}
