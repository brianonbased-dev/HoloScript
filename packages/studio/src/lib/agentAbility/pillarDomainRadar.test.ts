import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHolo } from '../../../../core/src/parser/HoloCompositionParser';
import { Vector2DCompiler } from '../../../../core/src/compiler/Vector2DCompiler';
import type { HoloComposition } from '../../../../core/src/parser/HoloCompositionTypes';
import { applyPillarDomainRadarTelemetry, normalizePillarTelemetryInput } from './pillarDomainRadar';

const composition = {
  objects: [
    { name: 'radar', properties: [{ key: 'kind', value: 'radar' }] },
    {
      name: 'axis_reason',
      properties: [
        { key: 'kind', value: 'axis' },
        { key: 'label', value: 'Reasoning' },
        { key: 'pillar_domain', value: 'solver' },
      ],
    },
    {
      name: 'axis_truth',
      properties: [
        { key: 'kind', value: 'axis' },
        { key: 'label', value: 'Truth' },
        { key: 'pillar_domain', value: 'truth_approval' },
      ],
    },
    {
      name: 'axis_memory',
      properties: [
        { key: 'kind', value: 'axis' },
        { key: 'label', value: 'Memory' },
        { key: 'pillar_domain', value: 'storage' },
      ],
    },
    {
      name: 'series_worker',
      properties: [
        { key: 'kind', value: 'series' },
        { key: 'name', value: 'Worker' },
        { key: 'fallback_values', value: '1,2,3' },
      ],
    },
    {
      name: 'series_brittney',
      properties: [
        { key: 'kind', value: 'series' },
        { key: 'name', value: 'Brittney' },
        { key: 'fallback_values', value: '4,5,6' },
      ],
    },
  ],
};

function valuesFor(next: typeof composition, seriesName: string): string | undefined {
  const series = next.objects.find((object) => object.name === seriesName);
  return series?.properties.find((property) => property.key === 'values')?.value as string | undefined;
}

describe('pillarDomainRadar', () => {
  it('normalizes telemetry arrays and envelope objects', () => {
    const event = { type: 'pillar:slice', payload: { slice: { pillar_domain: 'solver' } } };

    expect(normalizePillarTelemetryInput([event])).toEqual([event]);
    expect(normalizePillarTelemetryInput({ events: [event] })).toEqual([event]);
    expect(normalizePillarTelemetryInput(event)).toEqual([event]);
  });

  it('injects radar series values from pillar_domain slice telemetry', () => {
    const next = applyPillarDomainRadarTelemetry(composition, [
      {
        type: 'pillar:slice',
        payload: {
          context: { metadata: { agent_class: 'Worker' } },
          slice: { pillar_domain: 'solver', pos_1: 0.8, pos_2: 0.6 },
        },
      },
      {
        type: 'pillar:slice',
        agent_class: 'worker',
        payload: {
          slice: { pillar_domain: 'truth_approval', pos_1: 0.9, pos_2: 0.1 },
        },
      },
      {
        type: 'pillar:slice',
        payload: {
          context: { agent_id: 'brittney-main' },
          slice: { pillar_domain: 'storage', pos_1: 0.2, pos_2: 0.7 },
        },
      },
    ]);

    expect(valuesFor(next, 'series_worker')).toBe('7,9,3');
    expect(valuesFor(next, 'series_brittney')).toBe('4,5,7.5');
  });

  it('falls back to Worker for unclassified registry slice events', () => {
    const next = applyPillarDomainRadarTelemetry(composition, [
      {
        type: 'pillar:slice',
        payload: {
          slice: { pillar_domain: 'solver', pos_1: 1, pos_2: 1 },
        },
      },
    ]);

    expect(valuesFor(next, 'series_worker')).toBe('10,2,3');
  });

  it('feeds the real agent-ability .holo page before Vector2D compilation', () => {
    const source = readFileSync(resolve(__dirname, '../../../holo-pages/agent-ability/page.holo'), 'utf-8');
    const parsed = parseHolo(source);
    expect(parsed.success).toBe(true);

    const next = applyPillarDomainRadarTelemetry(parsed.ast as unknown as HoloComposition, [
      {
        payload: {
          context: { metadata: { agent_class: 'Worker' } },
          slice: { pillar_domain: 'solver', pos_1: 1, pos_2: 1 },
        },
      },
    ]);

    const { code } = new Vector2DCompiler().compile(next as unknown as HoloComposition, {
      componentName: 'AgentAbility',
    });

    expect(code).toContain('export default function AgentAbility()');
    expect(code).toContain('<svg viewBox="0 0 460 440"');
    expect(code).toContain('points="220,60');
  });
});
