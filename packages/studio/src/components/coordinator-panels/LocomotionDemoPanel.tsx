'use client';
/**
 * LocomotionDemoPanel — Studio downstream consumer of GenerativeJobMonitor.
 *
 * Closes the W.081 "wire through ONE real consumer" requirement at the
 * Studio surface for the GenerativeJobMonitor. Renders an at-a-glance
 * dashboard of in-flight generative-AI jobs across the 4 trait kinds
 * (inpainting / texture_gen / controlnet / diffusion_rt) — same bus
 * surface that locomotion-synthesis pipelines (motion-matching,
 * neural-locomotion offline gen) plug into when they add their kind.
 *
 * Per-kind cards show ready-state + queued/running/completed/cancelled/
 * errored counts + mean latency. The "Recent jobs" section shows the
 * last N tracked jobs (newest first) with status pill + duration.
 */
import type { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import {
  useGenerativeJobs,
  type GenerativeJobsView,
} from './TraitRuntimeContext';
import type { GenerativeJobKind, GenerativeJobState } from '@holoscript/core/coordinators';

export interface LocomotionDemoPanelProps {
  runtime?: TraitRuntimeIntegration | null;
  /** Max recent-jobs rows. Default 12. */
  maxRecentJobs?: number;
}

const KIND_LABEL: Record<GenerativeJobKind, string> = {
  inpainting: 'Inpainting',
  texture_gen: 'Texture gen',
  controlnet: 'ControlNet',
  diffusion_rt: 'Realtime diffusion',
};

export function LocomotionDemoPanel({ runtime, maxRecentJobs = 12 }: LocomotionDemoPanelProps) {
  const view: GenerativeJobsView = useGenerativeJobs(runtime);
  const { stats, jobs } = view;
  // Newest first by updatedAt — getAllJobs returns insertion order, so sort.
  const recent = jobs.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxRecentJobs);

  const kinds: GenerativeJobKind[] = ['inpainting', 'texture_gen', 'controlnet', 'diffusion_rt'];

  return (
    <div
      data-testid="locomotion-demo-panel"
      style={{
        padding: 12,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Generative jobs</h2>
        <span data-testid="locomotion-total-counter" style={{ color: '#94a3b8' }}>
          {stats.total} tracked
        </span>
      </div>

      <div
        data-testid="locomotion-kind-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}
      >
        {kinds.map((kind) => {
          const k = stats.byKind[kind];
          const ready = stats.anyReady;
          return (
            <div
              key={kind}
              data-testid={`locomotion-kind-${kind}`}
              style={{
                background: '#1e293b',
                padding: 10,
                borderRadius: 6,
                borderLeft: `3px solid ${k.errored > 0 ? '#f87171' : k.running > 0 ? '#38bdf8' : '#475569'}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <strong style={{ fontSize: 13 }}>{KIND_LABEL[kind]}</strong>
                <span
                  data-testid={`locomotion-ready-${kind}`}
                  style={{
                    fontSize: 10,
                    color: ready ? '#4ade80' : '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {ready ? 'ready' : 'idle'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, fontSize: 11 }}>
                <KindStat label="queued" value={k.queued} />
                <KindStat label="running" value={k.running} accent={k.running > 0 ? '#38bdf8' : undefined} />
                <KindStat
                  label="errored"
                  value={k.errored}
                  accent={k.errored > 0 ? '#f87171' : undefined}
                />
                <KindStat label="done" value={k.completed} />
                <KindStat label="cancel" value={k.cancelled} />
                <KindStat label="ms" value={Math.round(k.meanLatencyMs)} />
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ margin: '0 0 6px', fontSize: 14, color: '#cbd5e1' }}>Recent jobs</h3>
      {recent.length === 0 ? (
        <div data-testid="locomotion-jobs-empty" style={{ color: '#64748b', fontStyle: 'italic' }}>
          No generative jobs observed yet.
        </div>
      ) : (
        <div data-testid="locomotion-jobs-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
          {recent.map((job) => (
            <JobRow key={job.jobId} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function KindStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: accent ?? '#e2e8f0', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function JobRow({ job }: { job: GenerativeJobState }) {
  const color =
    job.status === 'completed'
      ? '#4ade80'
      : job.status === 'errored'
        ? '#f87171'
        : job.status === 'cancelled'
          ? '#94a3b8'
          : job.status === 'running'
            ? '#38bdf8'
            : '#facc15'; // queued
  return (
    <div
      data-testid={`locomotion-job-row-${job.jobId}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr 90px 70px',
        gap: 6,
        padding: '4px 0',
        borderBottom: '1px solid #1e293b',
        fontSize: 12,
      }}
    >
      <span style={{ color: '#94a3b8' }}>{job.kind}</span>
      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {job.jobId}
      </span>
      <span style={{ color, textTransform: 'uppercase', fontSize: 11 }}>{job.status}</span>
      <span style={{ color: '#64748b', textAlign: 'right' }}>
        {job.durationMs !== undefined ? `${Math.round(job.durationMs)}ms` : '—'}
      </span>
    </div>
  );
}
