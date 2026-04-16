import { describe, it, expect } from 'vitest';

import {
  buildVRRCompositionFromDraft,
  businessVRRDraftSchema,
  draftToHoloPreview,
  handleBusinessQuestToolCall,
  validateBusinessVRRDraft,
} from './BusinessQuestTools';

const minimalDraft = {
  compositionName: 'PhoenixDemoVRR',
  twin: {
    mirrorId: 'phoenix_az_center',
    realitySync: ['weather', 'events'],
    geoSync: { center: 'phoenix_az_center', radius: 5 },
  },
  weather: { provider: 'weather.gov' as const },
  businesses: [
    {
      id: 'cafe_one',
      geo: { lat: 33.4484, lng: -112.074 },
      quests: [
        {
          id: 'latte_legend',
          title: 'Latte Legend',
          steps: ['ar_scan_window', 'vrr_hunt', 'vr_menu'],
        },
      ],
    },
  ],
};

describe('BusinessQuestTools', () => {
  it('accepts a minimal draft via Zod', () => {
    const parsed = businessVRRDraftSchema.safeParse(minimalDraft);
    expect(parsed.success).toBe(true);
  });

  it('buildVRRCompositionFromDraft attaches twin, weather, and quest_hub traits', () => {
    const parsed = businessVRRDraftSchema.parse(minimalDraft);
    const comp = buildVRRCompositionFromDraft(parsed);
    expect(comp.type).toBe('Composition');
    expect(comp.name).toBe('PhoenixDemoVRR');
    expect(comp.objects.length).toBeGreaterThanOrEqual(3);

    const biz = comp.objects.find((o) => o.name === 'cafe_one');
    expect(biz).toBeDefined();
    const traitNames = biz!.traits.map((t) => t.name);
    expect(traitNames).toContain('geo_anchor');
    expect(traitNames).toContain('quest_hub');
  });

  it('validateBusinessVRRDraft rejects invalid composition names', async () => {
    const bad = { ...minimalDraft, compositionName: '9-invalid' };
    const result = await validateBusinessVRRDraft(bad);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path.includes('compositionName'))).toBe(true);
  });

  it('handleBusinessQuestToolCall scaffold returns composition and trait counts', async () => {
    const res = await handleBusinessQuestToolCall({
      name: 'holoscript_business_quest_scaffold_vrr',
      arguments: { draft: minimalDraft, runVrrParse: true },
    });
    expect(res.isError).toBe(false);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const json = JSON.parse(text) as {
      vrrTraitCounts: Record<string, number>;
      composition: { name: string };
    };
    expect(json.composition.name).toBe('PhoenixDemoVRR');
    expect(json.vrrTraitCounts?.questNodes).toBeGreaterThanOrEqual(1);
    expect(json.vrrTraitCounts?.twinNodes).toBeGreaterThanOrEqual(1);
  });

  it('draftToHoloPreview includes composition name', () => {
    const parsed = businessVRRDraftSchema.parse(minimalDraft);
    const preview = draftToHoloPreview(parsed);
    expect(preview).toContain('PhoenixDemoVRR');
    expect(preview).toContain('cafe_one');
  });
});
