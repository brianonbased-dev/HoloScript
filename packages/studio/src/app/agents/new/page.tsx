'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

// ============================================================================
// ZOD SCHEMA DEFINITION (Mirrors core AgentManifest interfaces)
// ============================================================================

const _Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

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

  categories: z
    .array(
      z.enum([
        'trading',
        'analysis',
        'optimization',
        'monitoring',
        'creative',
        'management',
        'strategic',
        'assistant',
        'orchestrator',
        'quest_creator',
        'librarian',
        'twin_manager',
        'payment_handler',
        'autonomous',
      ])
    )
    .optional(),

  trustLevel: z.enum(['local', 'verified', 'known', 'external', 'untrusted']),

  capabilities: z.array(CapabilitySchema).min(1, 'At least one capability is required'),
  endpoints: z.array(EndpointSchema).min(1, 'At least one endpoint is required'),
});

type AgentManifestForm = z.infer<typeof AgentManifestSchema>;

export default function NewAgentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AgentManifestForm>({
    // @ts-expect-error -- Typedef mismatch between RHF and Zod Resolver
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

  const {
    fields: capFields,
    append: appendCap,
    remove: removeCap,
  } = useFieldArray({
    control,
    name: 'capabilities',
  });

  const {
    fields: epFields,
    append: appendEp,
    remove: removeEp,
  } = useFieldArray({
    control,
    name: 'endpoints',
  });

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
          manifest: data, // Keep the full structural object for actual backend use
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
    <div className="max-w-4xl mx-auto p-8 bg-zinc-900 min-h-screen text-zinc-100">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Configure Sovereign Agent</h1>
        <p className="text-zinc-400">
          Provision a new native uAA2++ agent on the platform. The manifest below enforces
          structural topology and validation against the core Engine configuration schemas.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Core Identity */}
        <div className="p-6 bg-zinc-800 rounded-lg border border-zinc-700 space-y-4">
          <h2 className="text-xl font-semibold border-b border-zinc-700 pb-2">
            1. Identity & Classification
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Agent ID</label>
              <input
                {...register('id')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
                placeholder="agent-x1"
              />
              {errors.id && <p className="text-red-400 text-xs mt-1">{errors.id.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Human-Readable Name
              </label>
              <input
                {...register('name')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
                placeholder="Sentinel Protocol"
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
              <label className="block text-sm font-medium text-zinc-400 mb-1">Trust Profile</label>
              <select
                {...register('trustLevel')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
              >
                <option value="local">Local (In-process, Highest Trust)</option>
                <option value="verified">Verified (Cryptographic Sig)</option>
                <option value="known">Known (Ecosystem default)</option>
                <option value="external">External (Sandboxed)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white"
              placeholder="What does this agent do?"
            />
          </div>
        </div>

        {/* Capabilities */}
        <div className="p-6 bg-zinc-800 rounded-lg border border-zinc-700 space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-700 pb-2">
            <h2 className="text-xl font-semibold">2. Agent Capabilities</h2>
            <button
              type="button"
              onClick={() => appendCap({ type: 'custom', domain: 'general' })}
              className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition"
            >
              + Add Capability
            </button>
          </div>

          {errors.capabilities?.message && (
            <p className="text-red-400 text-sm">{errors.capabilities.message}</p>
          )}

          {capFields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-12 gap-3 p-4 bg-zinc-900 rounded border border-zinc-700 relative"
            >
              <button
                type="button"
                onClick={() => removeCap(index)}
                className="absolute top-2 right-2 text-zinc-500 hover:text-red-400"
              >
                ✕
              </button>

              <div className="col-span-12 sm:col-span-6">
                <label className="block text-xs text-zinc-500 mb-1">Capability Type</label>
                <select
                  {...register(`capabilities.${index}.type` as const)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                >
                  <option value="render">Render</option>
                  <option value="analyze">Analyze</option>
                  <option value="generate">Generate</option>
                  <option value="orchestrate">Orchestrate</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="col-span-12 sm:col-span-6">
                <label className="block text-xs text-zinc-500 mb-1">Domain</label>
                <select
                  {...register(`capabilities.${index}.domain` as const)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                >
                  <option value="spatial">Spatial 3D</option>
                  <option value="nlp">NLP</option>
                  <option value="vision">Vision</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="col-span-12">
                <label className="block text-xs text-zinc-500 mb-1">
                  Capability Name / Description
                </label>
                <input
                  {...register(`capabilities.${index}.name` as const)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  placeholder="e.g. Realtime Neural Splatting"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Endpoints */}
        <div className="p-6 bg-zinc-800 rounded-lg border border-zinc-700 space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-700 pb-2">
            <h2 className="text-xl font-semibold">3. Neural Endpoints</h2>
            <button
              type="button"
              onClick={() => appendEp({ protocol: 'http', address: 'http://' })}
              className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition"
            >
              + Add Endpoint
            </button>
          </div>

          {errors.endpoints?.message && (
            <p className="text-red-400 text-sm">{errors.endpoints.message}</p>
          )}

          {epFields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-3">
              <select
                {...register(`endpoints.${index}.protocol` as const)}
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="ws">WS</option>
                <option value="ipc">IPC</option>
                <option value="local">LOCAL</option>
              </select>

              <input
                {...register(`endpoints.${index}.address` as const)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                placeholder="localhost:3000/api/agent"
              />

              <button
                type="button"
                onClick={() => removeEp(index)}
                className="text-zinc-500 hover:text-red-400 p-2"
              >
                ✕
              </button>
            </div>
          ))}
          {errors.endpoints &&
            Array.isArray(errors.endpoints) &&
            errors.endpoints.map(
              (ep, idx) =>
                ep?.address && (
                  <p key={idx} className="text-red-400 text-xs mt-1">
                    Endpoint {idx + 1}: {ep.address.message}
                  </p>
                )
            )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-4">
          {submitError && <p className="text-red-400 text-sm">{submitError}</p>}
          <div className="ml-auto flex gap-4">
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
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded transition font-medium shadow-lg"
            >
              {isSubmitting ? 'Provisioning...' : 'Provision Agent'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
