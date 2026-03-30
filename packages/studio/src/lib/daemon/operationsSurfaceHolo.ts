import type { DaemonJob, DaemonTelemetrySummary } from '@/lib/daemon/types';

export type HoloScriptSurfaceFormat = 'hs' | 'hsplus' | 'holo';

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function statusColor(status: DaemonJob['status']): string {
  if (status === 'completed') return '#22c55e';
  if (status === 'running') return '#0ea5e9';
  if (status === 'failed') return '#ef4444';
  return '#f59e0b';
}

function eventColor(eventType: string): string {
  if (eventType.includes('failed') || eventType.includes('rejected')) return '#ef4444';
  if (eventType.includes('completed') || eventType.includes('applied')) return '#22c55e';
  if (eventType.includes('started') || eventType.includes('created')) return '#0ea5e9';
  return '#a78bfa';
}

// Build a deterministic 2D-first HoloScript projection for daemon operations.
function buildDaemonOperationsSurfaceHolo(
  jobs: DaemonJob[],
  telemetry: DaemonTelemetrySummary
): string {
  const topJobs = jobs.slice(0, 8);
  const recentEvents = telemetry.recentEvents.slice(-8);

  const projectCounts = new Map<string, number>();
  for (const job of jobs) {
    projectCounts.set(job.projectId, (projectCounts.get(job.projectId) ?? 0) + 1);
  }
  const forkNodes = [...projectCounts.entries()].slice(0, 6);

  const jobRows = topJobs
    .map((job, idx) => {
      const z = -2.4 - idx * 0.5;
      const id = sanitizeId(job.id);
      const summary = escapeText(job.summary ?? job.statusMessage ?? 'No summary yet');
      const profile = escapeText(job.profile);

      return `
    object job_${id} {
      geometry: "cube"
      color: "${statusColor(job.status)}"
      scale: [2.6, 0.16, 0.02]
      position: [-1.4, 1.2, ${z.toFixed(2)}]

      metadata: {
        label: "${escapeText(job.id)}"
        profile: "${profile}"
        status: "${job.status}"
        progress: ${job.progress}
        summary: "${summary}"
      }
    }
`;
    })
    .join('');

  const eventRows = recentEvents
    .map((event, idx) => {
      const z = -2.4 - idx * 0.48;
      const eventType = escapeText(event.eventType);
      return `
    object event_${idx} {
      geometry: "cube"
      color: "${eventColor(event.eventType)}"
      scale: [2.4, 0.12, 0.02]
      position: [1.6, 1.18, ${z.toFixed(2)}]

      metadata: {
        label: "${eventType}"
        job_id: "${escapeText(event.jobId)}"
        timestamp: "${escapeText(event.timestamp)}"
      }
    }
`;
    })
    .join('');

  const forkRows = forkNodes
    .map(([projectId, count], idx) => {
      const x = -2.2 + idx * 0.9;
      return `
    object fork_${idx} {
      geometry: "cube"
      color: "#6366f1"
      scale: [0.36, 0.12, 0.02]
      position: [${x.toFixed(2)}, 0.25, -1.55]

      metadata: {
        project: "${escapeText(projectId)}"
        lineage_count: ${count}
      }
    }
`;
    })
    .join('');

  const activeAgents = jobs.filter((j) => j.status === 'running').length;

  return `composition DaemonOperations2D {
  environment {
    skybox: "studio"
    ambient_light: 0.45
  }

  template panel {
    geometry: "plane"
    color: "#111827"
    scale: [6, 3.6, 1]
  }

  object operations_backdrop using panel {
    position: [0, 1.1, -2.7]
  }

  object telemetry_header {
    geometry: "cube"
    color: "#334155"
    scale: [5.3, 0.2, 0.02]
    position: [0, 2.05, -2.55]

    metadata: {
      label: "2D Operations Surface"
      total_jobs: ${telemetry.totalJobs}
      completed_jobs: ${telemetry.completedJobs}
      failed_jobs: ${telemetry.failedJobs}
      total_patches: ${telemetry.totalPatches}
      applied_patches: ${telemetry.appliedPatches}
      avg_quality_delta: ${telemetry.avgQualityDelta}
      avg_duration_ms: ${telemetry.avgDurationMs}
    }
  }

  object active_agents {
    geometry: "cube"
    color: "#14b8a6"
    scale: [0.8, 0.14, 0.02]
    position: [2.2, 0.25, -1.55]

    metadata: {
      label: "agents"
      active_count: ${activeAgents}
    }
  }

${jobRows}
${eventRows}
${forkRows}

  logic {
    on_start() {
      // Native 2D surface: jobs, events, agents, and fork lineage are composition-level data.
    }
  }
}
`;
}

function buildDaemonOperationsSurfaceHsplus(
  jobs: DaemonJob[],
  telemetry: DaemonTelemetrySummary
): string {
  const topJobs = jobs.slice(0, 8);

  const cards = topJobs
    .map((job, idx) => {
      const z = -2.3 - idx * 0.5;
      return `
  object "Job_${sanitizeId(job.id)}" using "OpsCard" {
    color: "${statusColor(job.status)}"
    position: [-1.2, 1.2, ${z.toFixed(2)}]
    data_label: "${escapeText(job.id)}"
    data_profile: "${escapeText(job.profile)}"
    data_status: "${job.status}"
    data_progress: ${job.progress}
  }
`;
    })
    .join('');

  return `composition "DaemonOperations2D" {
  environment {
    skybox: "studio"
    ambient: 0.45
  }

  template "OpsCard" {
    geometry: "cube"
    scale: [2.5, 0.16, 0.02]
  }

  object "TelemetryHeader" {
    geometry: "cube"
    color: "#334155"
    scale: [5.2, 0.2, 0.02]
    position: [0, 2.05, -2.55]
    total_jobs: ${telemetry.totalJobs}
    completed_jobs: ${telemetry.completedJobs}
    failed_jobs: ${telemetry.failedJobs}
    total_patches: ${telemetry.totalPatches}
    applied_patches: ${telemetry.appliedPatches}
    avg_quality_delta: ${telemetry.avgQualityDelta}
  }
${cards}
}
`;
}

function buildDaemonOperationsSurfaceHs(
  jobs: DaemonJob[],
  telemetry: DaemonTelemetrySummary
): string {
  const topJobs = jobs.slice(0, 8);

  const rows = topJobs
    .map((job, idx) => {
      const z = -2.3 - idx * 0.5;
      return `
object "job_${sanitizeId(job.id)}" {
  geometry: "cube"
  color: "${statusColor(job.status)}"
  scale: [2.4, 0.14, 0.02]
  position: [-1.2, 1.2, ${z.toFixed(2)}]
  label: "${escapeText(job.id)}"
  profile: "${escapeText(job.profile)}"
  status: "${job.status}"
  progress: ${job.progress}
}
`;
    })
    .join('');

  return `environment {
  skybox: "studio"
  ambient: 0.45
}

object "telemetry_header" {
  geometry: "cube"
  color: "#334155"
  scale: [5.2, 0.2, 0.02]
  position: [0, 2.05, -2.55]
  total_jobs: ${telemetry.totalJobs}
  completed_jobs: ${telemetry.completedJobs}
  failed_jobs: ${telemetry.failedJobs}
  total_patches: ${telemetry.totalPatches}
  applied_patches: ${telemetry.appliedPatches}
}
${rows}
`;
}

export function buildDaemonOperationsSurfaceCode(
  format: HoloScriptSurfaceFormat,
  jobs: DaemonJob[],
  telemetry: DaemonTelemetrySummary
): string {
  if (format === 'hs') return buildDaemonOperationsSurfaceHs(jobs, telemetry);
  if (format === 'hsplus') return buildDaemonOperationsSurfaceHsplus(jobs, telemetry);
  return buildDaemonOperationsSurfaceHolo(jobs, telemetry);
}
