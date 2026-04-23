/**
 * @holoscript/urdformer-plugin — URDF → .holo composition stub.
 *
 * Research: ai-ecosystem/research/2026-04-22_urdformer-urdf-holoscript-bridge.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (robotics column)
 *
 * Status: STUB. URDF XML parsing + full kinematic chain import are future work.
 * Current scope: declare interface + a minimal parser that extracts link/joint
 * counts from a URDF string.
 */

export interface UrdfImportInput {
  urdf_xml: string;
  /** Unit the URDF uses for lengths; HoloScript traits expect meters. */
  unit?: 'meter' | 'millimeter';
}

export interface UrdfImportOutput {
  link_count: number;
  joint_count: number;
  /** Per-link traits in .holo-ish shape (trait names only — full emission is TODO). */
  link_traits: Array<{ name: string; type: 'fixed' | 'dynamic' }>;
  /** Per-joint kinematic role. */
  joint_kinematics: Array<{ name: string; type: string; parent?: string; child?: string }>;
}

const LINK_RE = /<link\s+name\s*=\s*"([^"]+)"/g;
const JOINT_RE = /<joint\s+name\s*=\s*"([^"]+)"\s+type\s*=\s*"([^"]+)"/g;
const PARENT_RE = /<parent\s+link\s*=\s*"([^"]+)"/;
const CHILD_RE = /<child\s+link\s*=\s*"([^"]+)"/;

/** Stub URDF parser — extracts link + joint names via regex. */
export function importUrdf(input: UrdfImportInput): UrdfImportOutput {
  const xml = input.urdf_xml;
  const link_traits: UrdfImportOutput['link_traits'] = [];
  for (const m of xml.matchAll(LINK_RE)) {
    link_traits.push({ name: m[1], type: 'dynamic' });
  }
  const joint_kinematics: UrdfImportOutput['joint_kinematics'] = [];
  for (const m of xml.matchAll(JOINT_RE)) {
    // Scope a substring from this match to the next <joint or </robot> to pull parent/child
    const start = m.index ?? 0;
    const end = xml.indexOf('</joint>', start);
    const segment = end > start ? xml.slice(start, end) : xml.slice(start);
    const parent = segment.match(PARENT_RE)?.[1];
    const child = segment.match(CHILD_RE)?.[1];
    joint_kinematics.push({ name: m[1], type: m[2], parent, child });
  }
  return {
    link_count: link_traits.length,
    joint_count: joint_kinematics.length,
    link_traits,
    joint_kinematics,
  };
}
