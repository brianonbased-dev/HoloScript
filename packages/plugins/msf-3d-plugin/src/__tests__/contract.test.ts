/**
 * @holoscript/msf-3d-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 11 (MSF semantic-annotated asset).
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { importMsf, type MsfAssetBody } from '../index';

function asset(overrides: Partial<MsfAssetBody> = {}): MsfAssetBody {
  return {
    header: { version: '1.0', unit: 'meter', semantic_tags: ['car', 'vehicle'] },
    mesh_ref: 'cas://mesh-hash-abc',
    annotations: [
      { part_id: 'wheel_fl', labels: ['Wheel', 'Front', 'Left'] },
      { part_id: 'door_fl', labels: ['Door'] },
    ],
    ...overrides,
  };
}

describe('CONTRACT: msf-3d-plugin adapter', () => {
  it('exposes importMsf at stable public path', () => {
    expect(typeof mod.importMsf).toBe('function');
  });

  it('trait.kind is @semantic_3d, target_id = mesh_ref', () => {
    const r = importMsf(asset());
    expect(r.trait.kind).toBe('@semantic_3d');
    expect(r.trait.target_id).toBe('cas://mesh-hash-abc');
  });

  it('unit meter → unit_scale_factor 1', () => {
    expect(importMsf(asset({ header: { version: '1', unit: 'meter', semantic_tags: [] } })).unit_scale_factor).toBe(1);
  });

  it('unit millimeter → unit_scale_factor 0.001', () => {
    expect(importMsf(asset({ header: { version: '1', unit: 'millimeter', semantic_tags: [] } })).unit_scale_factor).toBe(0.001);
  });

  it('unit inch → unit_scale_factor 0.0254', () => {
    expect(importMsf(asset({ header: { version: '1', unit: 'inch', semantic_tags: [] } })).unit_scale_factor).toBe(0.0254);
  });

  it('part_annotations length = input.annotations length', () => {
    const r = importMsf(asset());
    expect(r.part_annotations).toHaveLength(2);
  });

  it('part_annotation trait names are sanitized and @-prefixed', () => {
    const r = importMsf(asset());
    const wheel = r.part_annotations.find((p) => p.part_id === 'wheel_fl');
    expect(wheel?.traits).toEqual(['@wheel', '@front', '@left']);
  });

  it('semantic_tags preserved on trait.params.tags', () => {
    const r = importMsf(asset());
    expect(r.trait.params.tags).toEqual(['car', 'vehicle']);
  });

  it('empty annotations → empty part_annotations array', () => {
    const r = importMsf(asset({ annotations: [] }));
    expect(r.part_annotations).toEqual([]);
  });
});
