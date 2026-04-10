'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

const TrainingDataSchema = z.object({
  datasetId: z.string().min(3, 'Dataset ID is required'),
  name: z.string().min(1, 'Name is required'),
  format: z.enum(['jsonl', 'csv', 'markdown', 'holoscript-ast', 'embedding']),
  sourceUrl: z.string().url('Must be a valid URL/URI').optional().or(z.literal('')),
  description: z.string().optional(),
});

type TrainingDataForm = z.infer<typeof TrainingDataSchema>;

export default function NewTrainingDataPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrainingDataForm>({
    // @ts-expect-error -- Typedef mismatch between RHF and Zod Resolver
    resolver: zodResolver(TrainingDataSchema),
    defaultValues: {
      datasetId: 'dataset-',
      name: '',
      format: 'jsonl',
      description: '',
      sourceUrl: '',
    },
  });

  const onSubmit = async (data: TrainingDataForm) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/training-data/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) console.warn('Structural validation passed, endpoint may not exist yet.');
      router.push('/training-data');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-zinc-900 min-h-screen text-zinc-100">
      <h1 className="text-3xl font-bold mb-2">Ingest Training Data</h1>
      <p className="text-zinc-400 mb-8">
        Register ecosystem intelligence packages for model tuning and RAG pipelines.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 bg-zinc-800 p-6 rounded-lg border border-zinc-700"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Dataset ID</label>
            <input
              {...register('datasetId')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
              placeholder="dataset-core-traits"
            />
            {errors.datasetId && (
              <p className="text-red-400 text-xs mt-1">{errors.datasetId.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Display Name</label>
            <input
              {...register('name')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
              placeholder="Core Traits Corpus"
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Data Format</label>
            <select
              {...register('format')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            >
              <option value="jsonl">JSONL (Fine-tuning)</option>
              <option value="csv">CSV (Tabular)</option>
              <option value="markdown">Markdown (RAG)</option>
              <option value="holoscript-ast">HoloScript AST (Compilation)</option>
              <option value="embedding">Pre-computed Embeddings</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Source URL (Optional)</label>
            <input
              {...register('sourceUrl')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
              placeholder="https://..."
            />
            {errors.sourceUrl && (
              <p className="text-red-400 text-xs mt-1">{errors.sourceUrl.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            placeholder="Corpus detailing..."
          />
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
            Ingest Data
          </button>
        </div>
      </form>
    </div>
  );
}
