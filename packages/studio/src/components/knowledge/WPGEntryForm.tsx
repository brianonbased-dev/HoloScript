'use client';

import React, { useState } from 'react';
import { useForm, type UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, AlertTriangle, Send, Search } from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '../../app/providers';

const wpgSchema = z.object({
  type: z.enum(['wisdom', 'pattern', 'gotcha']),
  domain: z.string().min(3, 'Domain must be at least 3 characters'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
  workspace_id: z.string().min(2, 'Workspace ID is required'),
});

type WPGFormData = z.infer<typeof wpgSchema>;

const DOMAIN_TEMPLATES = [
  { id: 'healthcare_informatics', label: 'Healthcare Informatics (Warning: PII/PHI)' },
  { id: 'hft_execution', label: 'HFT & Fintech' },
  { id: 'kinematics', label: 'Physical Robotics' },
  { id: 'spatial_ai', label: 'Spatial Execution & Games' },
  { id: 'ai-ecosystem', label: 'HoloScript Core Ecosystem' },
];

export function WPGEntryForm() {
  const { addToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queryDomain, setQueryDomain] = useState('');
  const [queryResults, setQueryResults] = useState<any[] | null>(null);

  const formOpts: UseFormProps<WPGFormData> = {
    resolver: zodResolver(wpgSchema as any) as any,
    defaultValues: {
      type: 'wisdom',
      domain: '',
      content: '',
      workspace_id: 'ai-ecosystem',
    },
  };
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<WPGFormData>(formOpts);

  const formData = watch();
  const isHealthcare = formData.domain === 'healthcare_informatics';

  const previewJson = {
    workspace_id: formData.workspace_id,
    entries: [
      {
        type: formData.type,
        domain: formData.domain,
        content: formData.content,
      },
    ],
  };

  const onSubmit = async (data: WPGFormData) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/knowledge/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: data.workspace_id,
          entries: [{ type: data.type, domain: data.domain, content: data.content }],
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      addToast('W/P/G entry successfully filed to HoloMesh orchestrator.', 'success', 4000);
      reset({ ...data, content: '' }); // Clear content but keep domain/type config
    } catch (err: any) {
      addToast(`Sync Failed: ${err.message}`, 'error', 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryDomain) return;

    try {
      const res = await fetch('/api/knowledge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: formData.workspace_id,
          search: queryDomain,
          limit: 5,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setQueryResults(data.entries || data.results || []);
    } catch (err: any) {
      addToast(`Query Failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* LEFT COLUMN: Entry Form */}
      <div className="flex-1 space-y-6 bg-h-card border border-h-border rounded-xl p-6">
        <div className="border-b border-h-border pb-4 mb-4">
          <h2 className="text-xl font-semibold text-h-text">Knowledge Filing Assistant</h2>
          <p className="text-sm text-h-text-dim">
            Compress your insights into standard W/P/G formats for agentic discovery.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-h-text">Workspace ID</label>
              <input
                {...register('workspace_id')}
                className="w-full bg-h-bg border border-h-border rounded-md px-3 py-2 text-h-text focus:ring-1 focus:ring-h-primary focus:border-h-primary outline-none text-sm transition-colors"
                placeholder="e.g. ai-ecosystem"
              />
              {errors.workspace_id && <p className="text-xs text-red-500">{errors.workspace_id.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-h-text">Knowledge Type</label>
              <select
                {...register('type')}
                className="w-full bg-h-bg border border-h-border rounded-md px-3 py-2 text-h-text focus:ring-1 focus:ring-h-primary focus:border-h-primary outline-none text-sm transition-colors"
              >
                <option value="wisdom">Wisdom (Philosophy/Architecture)</option>
                <option value="pattern">Pattern (Structural Solutions)</option>
                <option value="gotcha">Gotcha (Failure Modes/Traps)</option>
              </select>
              {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-h-text flex justify-between">
              <span>Domain Tag</span>
              <div className="flex gap-2">
                {DOMAIN_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setValue('domain', t.id, { shouldValidate: true })}
                    className="text-[10px] bg-h-bg hover:bg-h-hover border border-h-border px-1.5 py-0.5 rounded transition-colors text-h-text-dim whitespace-nowrap"
                  >
                    {t.id}
                  </button>
                ))}
              </div>
            </label>
            <input
              {...register('domain')}
              className={clsx(
                "w-full bg-h-bg border rounded-md px-3 py-2 text-h-text focus:ring-1 focus:border-h-primary outline-none text-sm transition-colors",
                isHealthcare ? "border-amber-500/50 focus:ring-amber-500" : "border-h-border focus:ring-h-primary"
              )}
              placeholder="e.g. spatial_ai"
            />
            {errors.domain && <p className="text-xs text-red-500">{errors.domain.message}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-h-text">Content (Compress, do not summarize)</label>
            <textarea
              {...register('content')}
              rows={5}
              className="w-full bg-h-bg border border-h-border rounded-md px-3 py-2 text-h-text focus:ring-1 focus:ring-h-primary focus:border-h-primary outline-none text-sm transition-colors font-mono resize-y"
              placeholder={
                formData.type === 'gotcha'
                  ? 'G.LAT.11: GC pauses during order formulation. Use pre-allocated object pools.'
                  : 'Compress your technical insight here...'
              }
            />
            {errors.content && <p className="text-xs text-red-500">{errors.content.message}</p>}
          </div>

          {isHealthcare && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 flex gap-3 text-amber-500">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="text-xs leading-relaxed">
                <strong>HIPAA Warning:</strong> You have selected a medical domain. I explicitly confirm there is no PHI/PII (Protected Health Information) in this payload. All entries must be generalized technical knowledge.
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-h-primary text-white rounded-md px-4 py-2 hover:bg-h-primary-hover focus:ring-2 focus:ring-offset-2 focus:ring-h-primary focus:ring-offset-h-card transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? 'Syncing to HoloMesh...' : 'Post Knowledge Sync'}
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT COLUMN: Preview & Query */}
      <div className="flex-1 space-y-6">
        <div className="bg-[#1e1e1e] border border-h-border rounded-xl p-6 shadow-xl h-[300px] flex flex-col">
          <h3 className="text-sm font-medium text-[#c5c5c5] flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4" /> Preview JSON Payload
          </h3>
          <div className="flex-1 bg-[#121212] rounded border border-[#333] p-4 overflow-y-auto font-mono text-[11px] text-[#9cdcfe]">
            <pre>
              {JSON.stringify(previewJson, null, 2)}
            </pre>
          </div>
        </div>

        <div className="bg-h-card border border-h-border rounded-xl p-6">
          <div className="border-b border-h-border pb-3 mb-4">
            <h3 className="text-sm font-medium text-h-text">Query Knowledge Store (Smoke Test)</h3>
          </div>
          
          <form onSubmit={onQuerySubmit} className="flex gap-2 mb-4">
            <input
              value={queryDomain}
              onChange={(e) => setQueryDomain(e.target.value)}
              placeholder="Search by domain or text..."
              className="flex-1 bg-h-bg border border-h-border rounded-md px-3 py-1.5 text-h-text focus:ring-1 focus:ring-h-primary outline-none text-sm"
            />
            <button
              type="submit"
              className="bg-h-bg hover:bg-h-hover border border-h-border text-h-text rounded-md px-3 py-1.5 transition-colors flex items-center justify-center"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {queryResults && (
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
              {queryResults.length === 0 ? (
                <p className="text-xs text-h-text-dim text-center py-4">No entries found.</p>
              ) : (
                queryResults.map((res, i) => (
                  <div key={i} className="text-xs bg-h-bg border border-h-border rounded p-2">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-mono mb-1.5 mr-2">
                      {res.type?.toUpperCase() || 'W/P/G'}
                    </span>
                    <span className="text-h-text-dim">{res.domain}</span>
                    <p className="text-h-text mt-1.5">{res.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
