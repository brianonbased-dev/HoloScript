'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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

// ============================================================================
// ZOD SCHEMA DEFINITION (Mirrors core AgentManifest interfaces)
// ============================================================================

const CapabilitySchema = z.object({
  type: z.string().min(1, 'Type is required'),
  domain: z.string().min(1, 'Domain is required'),
  name: z.string().optional(),
  description: z.string().optional(),
  latency: z.enum(['instant', 'fast', 'medium', 'slow', 'background']).optional(),
  version: z.string().optional(),
});

const EndpointSchema = z.object({
  protocol: z.enum(['local', 'ipc', 'http', 'https', 'ws', 'wss', 'grpc', 'mqtt', 'custom']),
  address: z.string().min(1, 'Address is required').url('Must be a valid URL/URI'),
  port: z.number().int().positive().optional(),
  primary: z.boolean().optional(),
});

const AgentManifestSchema = z.object({
  id: z.string().min(3, 'Agent ID must be at least 3 characters'),
  name: z.string().min(1, 'Agent Name is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a valid semver (e.g. 1.0.0)'),
  description: z.string().optional(),
  categories: z.array(z.enum(['trading', 'analysis', 'optimization', 'monitoring', 'creative', 'management', 'strategic', 'assistant', 'orchestrator', 'quest_creator', 'librarian', 'twin_manager', 'payment_handler', 'autonomous'])).optional(),
  trustLevel: z.enum(['local', 'verified', 'known', 'external', 'untrusted']),
  capabilities: z.array(CapabilitySchema).min(1, 'At least one capability is required'),
  endpoints: z.array(EndpointSchema).min(1, 'At least one endpoint is required'),
});

type AgentManifestForm = z.infer<typeof AgentManifestSchema>;

function AgentConfigurationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, control, handleSubmit, formState: { errors } } = useForm<AgentManifestForm>({
    resolver: zodResolver(AgentManifestSchema),
    defaultValues: {
      id: 'agent-',
      name: '',
      version: '1.0.0',
      description: '',
      trustLevel: 'local',
      categories: ['assistant'],
      capabilities: [{ type: 'custom', domain: 'general', name: 'Primary Capability' }],
      endpoints: [{ protocol: 'http', address: 'http://localhost:3000/api/agents', primary: true }],
    },
  });

  const { fields: capFields, append: appendCap, remove: removeCap } = useFieldArray({ control, name: 'capabilities' });
  const { fields: epFields, append: appendEp, remove: removeEp } = useFieldArray({ control, name: 'endpoints' });

  const onSubmit = async (data: AgentManifestForm) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/agents/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'holomesh',
          name: data.name,
          bio: data.description,
          personalityMode: 'assistant',
          skills: data.capabilities.map((c) => c.type),
          manifest: data,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to provision agent');
      }

      router.push('/agents');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-zinc-900 text-zinc-100">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-white">Configure Sovereign Agent</h1>
        <p className="text-sm text-zinc-400">
          Provision a new native uAA2++ agent on the platform. The manifest below enforces
          structural topology and validation against the core Engine configuration schemas.
        </p>
      </div>

      <AIGeneratorWizard contextName="Agent" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Core Identity */}
        <div className="p-5 bg-zinc-800 rounded border border-zinc-700 space-y-4">
          <h2 className="text-lg font-semibold border-b border-zinc-700 pb-2">1. Identity & Classification</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="agent-id" className="block text-xs font-medium text-zinc-400 mb-1">Agent ID</label>
              <input id="agent-id" {...register('id')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="agent-x1" />
              {errors.id && <p className="text-red-400 text-[10px] mt-1">{errors.id.message}</p>}
            </div>
            <div>
              <label htmlFor="agent-name" className="block text-xs font-medium text-zinc-400 mb-1">Human-Readable Name</label>
              <input id="agent-name" {...register('name')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="Sentinel Protocol" />
              {errors.name && <p className="text-red-400 text-[10px] mt-1">{errors.name.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="agent-version" className="block text-xs font-medium text-zinc-400 mb-1">Version (SemVer)</label>
              <input id="agent-version" {...register('version')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" placeholder="1.0.0" />
              {errors.version && <p className="text-red-400 text-[10px] mt-1">{errors.version.message}</p>}
            </div>
            <div>
              <label htmlFor="agent-trust" className="block text-xs font-medium text-zinc-400 mb-1">Trust Profile</label>
              <select id="agent-trust" {...register('trustLevel')} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white">
                <option value="local">Local (In-process, Highest Trust)</option>
                <option value="verified">Verified (Cryptographic Sig)</option>
                <option value="known">Known (Ecosystem default)</option>
                <option value="external">External (Sandboxed)</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="agent-description" className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
            <textarea id="agent-description" {...register('description')} rows={2} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white" placeholder="What does this agent do?" />
          </div>
        </div>

        {/* Capabilities */}
        <div className="p-5 bg-zinc-800 rounded border border-zinc-700 space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-700 pb-2">
            <h2 className="text-lg font-semibold">2. Agent Capabilities</h2>
            <button type="button" onClick={() => appendCap({ type: 'custom', domain: 'general' })} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-[11px] transition">
              + Add Capability
            </button>
          </div>
          {errors.capabilities?.message && <p className="text-red-400 text-xs">{errors.capabilities.message}</p>}
          {capFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-3 p-3 bg-zinc-900 rounded border border-zinc-700 relative">
              <button type="button" onClick={() => removeCap(index)} className="absolute top-1 right-1 text-zinc-500 hover:text-red-400 text-xs">✕</button>
              <div className="col-span-12 sm:col-span-6">
                <label className="block text-[10px] text-zinc-500 mb-1">Type</label>
                <select {...register(`capabilities.${index}.type` as const)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs">
                  <option value="render">Render</option>
                  <option value="analyze">Analyze</option>
                  <option value="generate">Generate</option>
                  <option value="orchestrate">Orchestrate</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className="block text-[10px] text-zinc-500 mb-1">Domain</label>
                <select {...register(`capabilities.${index}.domain` as const)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs">
                  <option value="spatial">Spatial 3D</option>
                  <option value="nlp">NLP</option>
                  <option value="vision">Vision</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div className="col-span-12">
                <label className="block text-[10px] text-zinc-500 mb-1">Capability Name</label>
                <input {...register(`capabilities.${index}.name` as const)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs" placeholder="e.g. Realtime Neural Splatting" />
              </div>
            </div>
          ))}
        </div>

        {/* Endpoints */}
        <div className="p-5 bg-zinc-800 rounded border border-zinc-700 space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-700 pb-2">
            <h2 className="text-lg font-semibold">3. Neural Endpoints</h2>
            <button type="button" onClick={() => appendEp({ protocol: 'http', address: 'http://' })} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-[11px] transition">
              + Add Endpoint
            </button>
          </div>
          {errors.endpoints?.message && <p className="text-red-400 text-xs">{errors.endpoints.message}</p>}
          {epFields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <select {...register(`endpoints.${index}.protocol` as const)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs outline-none">
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="ws">WS</option>
                <option value="ipc">IPC</option>
                <option value="local">LOCAL</option>
              </select>
              <input {...register(`endpoints.${index}.address` as const)} className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white" placeholder="localhost:3000/api/agent" />
              <button type="button" onClick={() => removeEp(index)} className="text-zinc-500 hover:text-red-400 text-xs px-1">✕</button>
            </div>
          ))}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-2">
          {submitError && <p className="text-red-400 text-xs">{submitError}</p>}
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={() => router.back()} className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition text-sm font-medium">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded transition text-sm font-medium shadow-md">
              {isSubmitting ? 'Provisioning...' : 'Provision Agent'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function WorkspaceNewAgentPage() {
  const setCode = useSceneStore((s) => s.setCode);

  useEffect(() => {
    setCode(`// This workspace features AI-native provisioning.
// Use the AI Agent Generator on the left panel to scaffold HoloScript code via the MCP backlink.
// You can also manually paste validated HoloScript configurations here.
`);
  }, [setCode]);

  return (
    <ResponsiveStudioLayout
      leftTitle="Agent Configuration"
      rightTitle="Agent Graph"
      leftPanel={<AgentConfigurationForm />}
    >
      <HoloScriptEditor height="100%" />
    </ResponsiveStudioLayout>
  );
}
