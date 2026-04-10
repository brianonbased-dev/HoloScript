'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

const TraitManifestSchema = z.object({
  id: z.string().min(2, 'Trait ID is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['behavior', 'visual', 'physics', 'networking', 'core']),
  description: z.string().min(10, 'Provide a meaningful description'),
});

type TraitManifestForm = z.infer<typeof TraitManifestSchema>;

export default function NewTraitPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TraitManifestForm>({
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
      if (!res.ok)
        console.warn('Structural validation passed, /api/traits/define may not be wired yet.');
      router.push('/traits');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-zinc-900 min-h-screen text-zinc-100">
      <h1 className="text-3xl font-bold mb-2">Define Semantic Trait</h1>
      <p className="text-zinc-400 mb-8">
        Traits are the foundational building blocks of the HoloScript engine.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 bg-zinc-800 p-6 rounded-lg border border-zinc-700"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Trait ID (CamelCase)</label>
            <input
              {...register('id')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
              placeholder="oceanBuoyancy"
            />
            {errors.id && <p className="text-red-400 text-xs mt-1">{errors.id.message}</p>}
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Display Name</label>
            <input
              {...register('name')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
              placeholder="Ocean Buoyancy"
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Category</label>
          <select
            {...register('category')}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
          >
            <option value="behavior">Behavior / Logic</option>
            <option value="visual">Visual / Rendering</option>
            <option value="physics">Physics / Mechanics</option>
            <option value="networking">Networking / State</option>
            <option value="core">Core System</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            placeholder="Applies Archimedes' principle to dynamic rigid bodies..."
          />
          {errors.description && (
            <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-700">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded"
          >
            Define Trait
          </button>
        </div>
      </form>
    </div>
  );
}
