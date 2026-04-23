/**
 * @holoscript/urdformer-plugin — ADAPTER CONTRACT TEST
 *
 * This file is the contract gate for the URDF column of the Universal-IR
 * coverage matrix (docs/universal-ir-coverage.md). It MUST keep passing or
 * the matrix row cannot claim "🟡 Adapter + 🟡 Stub" status.
 *
 * Source: .ai-ecosystem/research/reviews/2026-04-23-wave-d-negative-sweep/stream-3-universal-ir-negative-sweep.md
 * Audit task: task_1776937048052_ybf4 (Wave D negative sweep, stream 3)
 *
 * Contract surface (what the adapter promises):
 *   1. Accepts the canonical UrdfImportInput shape and never throws on valid XML.
 *   2. Returns UrdfImportOutput with consistent counts (link_traits.length === link_count,
 *      joint_kinematics.length === joint_count).
 *   3. Preserves joint parent/child linkage from URDF when present.
 *   4. Fails soft (zero counts, no throw) on empty/degenerate input.
 *   5. Exposes a named public API — import path and export identity are stable.
 *
 * The contract is the minimum an external integrator can rely on. Breaking any
 * clause below = breaking the Universal-IR row and must be flagged in the
 * matrix before the test is relaxed.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { importUrdf, type UrdfImportInput, type UrdfImportOutput } from '../index';

describe('CONTRACT: urdformer-plugin adapter', () => {
  it('exposes importUrdf at a stable public path', () => {
    expect(typeof mod.importUrdf).toBe('function');
  });

  it('count invariant: link_traits.length === link_count, joint_kinematics.length === joint_count', () => {
    const input: UrdfImportInput = {
      urdf_xml: `
<robot name="r">
  <link name="a"/><link name="b"/><link name="c"/>
  <joint name="j" type="revolute">
    <parent link="a"/><child link="b"/>
  </joint>
</robot>`,
    };
    const out: UrdfImportOutput = importUrdf(input);
    expect(out.link_traits.length).toBe(out.link_count);
    expect(out.joint_kinematics.length).toBe(out.joint_count);
  });

  it('preserves parent/child linkage declared in URDF', () => {
    const out = importUrdf({
      urdf_xml: `
<robot name="r">
  <link name="base"/><link name="ee"/>
  <joint name="prismatic_j" type="prismatic">
    <parent link="base"/><child link="ee"/>
  </joint>
</robot>`,
    });
    const j = out.joint_kinematics[0];
    expect(j.parent).toBe('base');
    expect(j.child).toBe('ee');
    expect(j.type).toBe('prismatic');
  });

  it('fails soft on empty robot (no throw, zero counts)', () => {
    const out = importUrdf({ urdf_xml: '<robot></robot>' });
    expect(out.link_count).toBe(0);
    expect(out.joint_count).toBe(0);
    expect(out.link_traits).toEqual([]);
    expect(out.joint_kinematics).toEqual([]);
  });

  it('fails soft on malformed but non-throwing XML-ish input', () => {
    expect(() => importUrdf({ urdf_xml: 'not real xml at all' })).not.toThrow();
    const out = importUrdf({ urdf_xml: 'not real xml at all' });
    expect(out.link_count).toBe(0);
    expect(out.joint_count).toBe(0);
  });

  it('accepts optional unit hint without affecting parse shape', () => {
    const sample = '<robot><link name="x"/></robot>';
    const a = importUrdf({ urdf_xml: sample });
    const b = importUrdf({ urdf_xml: sample, unit: 'millimeter' });
    expect(a.link_count).toBe(b.link_count);
  });
});
