'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

const PluginManifestSchema = z.object({
  id: z.string().min(3, 'Plugin ID must be at least 3 characters'),
  name: z.string().min(1, 'Plugin Name is required'),
  description: z.string().optional(),
  entryPoint: z.string().min(1, 'Entry point (e.g., index.ts) is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a valid semver (e.g. 1.0.0)'),
  author: z.string().optional(),
});

type PluginManifestForm = z.infer<typeof PluginManifestSchema>;

export default function NewPluginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PluginManifestForm>({
    // @ts-expect-error -- Typedef mismatch between RHF and Zod Resolver
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
      // Mocked endpoint - structural validation handles the value
      const res = await fetch('/api/plugins/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        console.warn(
          'Endpoint /api/plugins/register may not exist yet, but structural validation passed.'
        );
      }
      router.push('/plugins');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-zinc-900 min-h-screen text-zinc-100">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Register Ecosystem Plugin</h1>
        <p className="text-zinc-400">
          Plugins extend the core HoloScript compiler or studio capabilities.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="p-6 bg-zinc-800 rounded-lg border border-zinc-700 space-y-4">
          <h2 className="text-xl font-semibold border-b border-zinc-700 pb-2">Plugin Manifest</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Plugin ID</label>
              <input
                {...register('id')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
                placeholder="plugin-physics-havok"
              />
              {errors.id && <p className="text-red-400 text-xs mt-1">{errors.id.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Display Name</label>
              <input
                {...register('name')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
                placeholder="Havok Physics Adapter"
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Version (SemVer)
              </label>
              <input
                {...register('version')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
                placeholder="1.0.0"
              />
              {errors.version && (
                <p className="text-red-400 text-xs mt-1">{errors.version.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Author</label>
              <input
                {...register('author')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
                placeholder="holoscript-core"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Entry Point</label>
            <input
              {...register('entryPoint')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white font-mono text-sm"
              placeholder="src/index.ts"
            />
            {errors.entryPoint && (
              <p className="text-red-400 text-xs mt-1">{errors.entryPoint.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
              placeholder="Describe the plugin's capabilities..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded transition font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded transition font-medium"
          >
            {isSubmitting ? 'Registering...' : 'Register Plugin'}
          </button>
        </div>
      </form>
    </div>
  );
}
