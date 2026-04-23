import { describe, it, expect } from 'vitest';
import { importMsf } from '../index';

describe('msf-3d-plugin stub', () => {
  it('normalizes mm to meters', () => {
    const r = importMsf({
      header: { version: '1.0', unit: 'millimeter', semantic_tags: ['robot'] },
      mesh_ref: 'sha256:abc',
      annotations: [],
    });
    expect(r.unit_scale_factor).toBeCloseTo(0.001);
  });

  it('maps annotation labels to @trait names', () => {
    const r = importMsf({
      header: { version: '1.0', unit: 'meter', semantic_tags: ['vehicle'] },
      mesh_ref: 'sha256:abc',
      annotations: [{ part_id: 'wheel_fr', labels: ['Wheel', 'Front Right'] }],
    });
    expect(r.part_annotations[0].traits).toContain('@wheel');
    expect(r.part_annotations[0].traits).toContain('@front_right');
  });
});
