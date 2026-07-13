// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { FleetPanel, summarizeResourceFlow, toHardwareEntry } from '../FleetPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FleetPanel telemetry mapping', () => {
  it('preserves GPU, CPU, memory, disk, and effective spend telemetry', () => {
    expect(
      toHardwareEntry(
        {
          handle: 'mesh-worker-01',
          instance_id: 101,
          gpu_name: 'RTX 4090',
          vram_gb: 24,
          gpu_util: 42,
          cpu_util: 18,
          mem_usage_gb: 7.25,
          disk_usage_gb: 31,
          disk_space_gb: 120,
          listed_compute_dph_usd: 0.24,
          listed_storage_dph_usd: 0.01,
          listed_total_dph_usd: 0.25,
          effective_compute_dph_usd: 0.24,
          effective_storage_dph_usd: 0.01,
          effective_total_dph_usd: 0.25,
          storage_dph_usd: 0.01,
          effective_dph_usd: 0.25,
          effective_cost_mode: 'compute_plus_storage',
          cost_so_far_usd: 1.5,
          runtime_cost_estimate_usd: 1.5,
        },
        0
      )
    ).toMatchObject({
      device_id: '101',
      utilization: 42,
      cpu_utilization: 18,
      memory_used_gb: 7.25,
      disk_used_gb: 31,
      disk_capacity_gb: 120,
      listed_compute_dph_usd: 0.24,
      listed_storage_dph_usd: 0.01,
      listed_total_dph_usd: 0.25,
      effective_compute_dph_usd: 0.24,
      effective_storage_dph_usd: 0.01,
      effective_total_dph_usd: 0.25,
      storage_dph_usd: 0.01,
      effective_dph_usd: 0.25,
      effective_cost_mode: 'compute_plus_storage',
      cost_so_far_usd: 1.5,
      runtime_cost_estimate_usd: 1.5,
    });
  });

  it('summarizes utilized, produced, stored, consumed, and visibility fields', () => {
    expect(
      summarizeResourceFlow({
        provider: 'vast.ai',
        utilized: {
          instance_count: 2,
          active_compute_count: 1,
          retained_storage_count: 1,
          effective_dph_usd: 0.25,
          projected_24h_usd: 6,
        },
        produced: {
          active_manifest_count: 9,
          output_aware_lane_count: 9,
          output_contract_count: 9,
          evidence_backed_output_count: 2,
          verified_product_count: 2,
          verified_artifact_count: 2,
          verified_receipt_count: 1,
          declared_only_output_count: 4,
          unverified_evidence_output_count: 3,
          productive_count: 2,
          work_in_progress_count: 1,
          inference_output_tokens: 4096,
          artifacts: [{}, {}],
          receipts: [{}],
        },
        stored: {
          instance_volume_count: 2,
          total_used_gb: 40,
          total_capacity_gb: 240,
          projected_storage_24h_usd: 0.48,
          evidence_backed_output_location_count: 3,
          verified_artifact_location_count: 2,
          verified_receipt_location_count: 1,
          artifact_locations: [{}, {}],
          receipt_locations: [{}],
        },
        consumed: {
          consumer_count: 1,
          manifest_attributed_count: 1,
          current_physical_consumer_count: 1,
          declared_or_historical_manifest_consumer_count: 9,
          runtime_requests: 9,
          compute_bearing_requests: 7,
          last_consumed_at_utc: '2026-07-13T18:00:00.000Z',
          runtime_metrics_age_ms: 7_200_000,
        },
        visibility: {
          gap_count: 1,
          gaps: ['endpoint_request_telemetry_unlinked'],
        },
      })
    ).toEqual({
      providerLabel: 'Vast',
      providerAttributionAvailable: false,
      utilized: {
        instanceCount: 2,
        activeComputeCount: 1,
        retainedStorageCount: 1,
        effectiveDphUsd: 0.25,
        projected24hUsd: 6,
      },
      produced: {
        activeManifestCount: 9,
        outputContractCount: 9,
        verifiedProductCount: 2,
        verifiedArtifactCount: 2,
        verifiedReceiptCount: 1,
        declaredOnlyOutputCount: 4,
        unverifiedEvidenceOutputCount: 3,
        outputAwareLaneCount: 9,
        productiveCount: 2,
        workInProgressCount: 1,
        artifactCount: 2,
        inferenceOutputTokens: 4096,
        providerUnattributedContractCount: 0,
        fleetCatalog: {
          activeManifestCount: 9,
          outputContractCount: 9,
          verifiedProductCount: 2,
          verifiedArtifactCount: 2,
          verifiedReceiptCount: 1,
          declaredOnlyOutputCount: 4,
          unverifiedEvidenceOutputCount: 3,
        },
      },
      stored: {
        volumeCount: 2,
        usedGb: 40,
        capacityGb: 240,
        artifactLocationCount: 3,
        evidenceBackedLocationCount: 3,
        verifiedArtifactLocationCount: 2,
        verifiedReceiptLocationCount: 1,
        projected24hUsd: 0.48,
        fleetCatalog: {
          evidenceBackedLocationCount: 3,
          verifiedArtifactLocationCount: 2,
          verifiedReceiptLocationCount: 1,
        },
      },
      consumed: {
        currentPhysicalConsumerCount: 1,
        declaredOrHistoricalManifestConsumerCount: 9,
        consumerCount: 1,
        manifestAttributedCount: 1,
        runtimeRequests: 9,
        computeBearingRequests: 7,
        lastConsumedAtUtc: '2026-07-13T18:00:00.000Z',
        runtimeMetricsAgeMs: 7_200_000,
        fleetCatalogDeclaredOrHistoricalManifestConsumerCount: 9,
      },
      visibility: {
        gapCount: 1,
        gaps: ['endpoint_request_telemetry_unlinked'],
      },
    });
  });

  it('keeps provider-unknown catalog output out of Vast produced, stored, and consumed totals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/api/agents/fleet/dispatch')) {
          return Response.json({
            executorEnabled: false,
            spend: { capUsd: 25, spentUsd: 0, remainingUsd: 25 },
          });
        }
        if (url.endsWith('/api/agents/fleet/schedules')) {
          return Response.json({ schedules: [] });
        }
        if (url.includes('/members')) {
          return Response.json({
            teamId: 'team-test',
            online_count: 1,
            members: [
              {
                agentId: 'agent-1',
                agentName: 'mesh-worker-01',
                online: true,
                lastHeartbeat: '2026-07-13T19:00:00.000Z',
              },
            ],
          });
        }
        if (url.includes('/fleet')) {
          return Response.json({
            teamId: 'team-test',
            publishedAt: '2026-07-13T19:00:00.000Z',
            health: { status: 'ok', reasons: [] },
            snapshot: {
              matched: [
                {
                  handle: 'mesh-worker-01',
                  instance_id: 101,
                  actual_status: 'running',
                  gpu_name: 'RTX 4090',
                  vram_gb: 24,
                  gpu_util: 42,
                  cpu_util: 18,
                  mem_usage_gb: 7.25,
                  disk_usage_gb: 31,
                  disk_space_gb: 120,
                  listed_compute_dph_usd: 0.24,
                  listed_storage_dph_usd: 0.01,
                  listed_total_dph_usd: 0.25,
                  effective_compute_dph_usd: 0.24,
                  effective_storage_dph_usd: 0.01,
                  effective_total_dph_usd: 0.25,
                  storage_dph_usd: 0.01,
                  effective_dph_usd: 0.25,
                  effective_cost_mode: 'compute_plus_storage',
                  cost_so_far_usd: 1.5,
                  runtime_cost_estimate_usd: 1.5,
                },
              ],
              orphans: [],
              resource_flow: {
                provider: 'vast.ai',
                utilized: {
                  instance_count: 1,
                  active_compute_count: 1,
                  effective_dph_usd: 0.25,
                  projected_24h_usd: 6,
                },
                produced: {
                  active_manifest_count: 1,
                  output_aware_lane_count: 1,
                  output_contract_count: 1,
                  evidence_backed_output_count: 0,
                  verified_product_count: 0,
                  verified_artifact_count: 1,
                  verified_receipt_count: 1,
                  declared_only_output_count: 1,
                  unverified_evidence_output_count: 0,
                  inference_output_tokens: 512,
                  provider_attributed_contract_count: 1,
                  provider_unattributed_contract_count: 8,
                  catalog_active_manifest_count: 9,
                  catalog_output_contract_count: 9,
                  catalog_verified_product_count: 0,
                  catalog_verified_artifact_count: 3,
                  catalog_verified_receipt_count: 2,
                  catalog_declared_only_output_count: 5,
                  catalog_unverified_evidence_output_count: 2,
                  artifacts: [{}],
                  receipts: [{}],
                  provider_attributed: {
                    provider: 'vast.ai',
                    active_manifest_count: 1,
                    output_contract_count: 1,
                    verified_product_count: 0,
                    verified_artifact_count: 1,
                    verified_receipt_count: 1,
                  },
                  fleet_catalog: {
                    active_manifest_count: 9,
                    output_contract_count: 9,
                    verified_product_count: 0,
                    verified_artifact_count: 3,
                    verified_receipt_count: 2,
                    provider_unattributed_contract_count: 8,
                  },
                },
                stored: {
                  instance_volume_count: 1,
                  total_used_gb: 31,
                  total_capacity_gb: 120,
                  evidence_backed_output_location_count: 2,
                  verified_artifact_location_count: 1,
                  verified_receipt_location_count: 1,
                  artifact_locations: [{}],
                  receipt_locations: [{}],
                  catalog_evidence_backed_output_location_count: 5,
                  catalog_verified_artifact_location_count: 3,
                  catalog_verified_receipt_location_count: 2,
                  fleet_catalog: {
                    evidence_backed_output_location_count: 5,
                    verified_artifact_location_count: 3,
                    verified_receipt_location_count: 2,
                  },
                },
                consumed: {
                  consumer_count: 1,
                  manifest_attributed_count: 1,
                  current_physical_consumer_count: 1,
                  declared_or_historical_manifest_consumer_count: 1,
                  catalog_declared_or_historical_manifest_consumer_count: 9,
                  runtime_requests: 3,
                  compute_bearing_requests: 2,
                  last_consumed_at_utc: '2026-07-13T18:00:00.000Z',
                  runtime_metrics_age_ms: 7_200_000,
                },
                visibility: {
                  gap_count: 1,
                  gaps: ['endpoint_request_telemetry_unlinked'],
                },
              },
            },
          });
        }
        return Response.json({}, { status: 404 });
      })
    );

    render(<FleetPanel />);

    expect(await screen.findByText('RESOURCE FLOW')).toBeInTheDocument();
    expect(screen.getByText(/1\/1 active/)).toBeInTheDocument();
    expect(screen.getByText('GPU 42%')).toBeInTheDocument();
    expect(screen.getByText(/CPU 18%/)).toBeInTheDocument();
    expect(screen.getByText(/effective \$0\.2500\/h/)).toBeInTheDocument();
    expect(screen.getByText('Produced (Vast)')).toBeInTheDocument();
    expect(
      screen.getByText(/1 contracts · 0 products verified · 1 artifacts \+ 1 receipts verified/)
    ).toBeInTheDocument();
    expect(screen.getByText('Produced (Fleet catalog)')).toBeInTheDocument();
    expect(
      screen.getByText(
        /9 contracts · 0 products verified · 3 artifacts \+ 2 receipts verified · 8 provider unknown/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 declared-only · 0 evidence unverified · 512 tokens/)
    ).toBeInTheDocument();
    expect(screen.getByText('Stored (Vast)')).toBeInTheDocument();
    expect(
      screen.getByText(/2 evidence-backed locations \(1 artifacts \+ 1 receipts\)/)
    ).toBeInTheDocument();
    expect(screen.getByText('Stored (Fleet catalog)')).toBeInTheDocument();
    expect(
      screen.getByText(/5 evidence-backed locations \(3 artifacts \+ 2 receipts\)/)
    ).toBeInTheDocument();
    expect(screen.getByText('Consumed (Vast)')).toBeInTheDocument();
    expect(
      screen.getByText(
        /1 current physical consumers · 1 declared\/historical manifest consumers · 2\/3 compute requests/
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Consumed (Fleet catalog)')).toBeInTheDocument();
    expect(screen.getByText(/^9 declared\/historical manifest consumers$/)).toBeInTheDocument();
    expect(screen.getByText(/Last consumed 2026-07-13T18:00:00.000Z/)).toBeInTheDocument();
    expect(screen.getByText(/telemetry 2h old/)).toBeInTheDocument();
    expect(screen.getByText(/endpoint request telemetry unlinked/)).toBeInTheDocument();
  });
});
