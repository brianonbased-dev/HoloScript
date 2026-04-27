/**
 * @holoscript/urdf-plugin
 *
 * Bidirectional URDF <-> HoloScript IR adapter.
 * Converts URDF robot description XML to HoloScript composition IR and back.
 *
 * Part of the Universal-IR coverage matrix — robotics column.
 * Related: urdformer-plugin (ML model bridge), URDFCompiler (core compiler).
 */

// ─── Input / Output shapes ───────────────────────────────────────────────────

export interface UrdfLink {
  name: string;
  /** Visual geometry type extracted from URDF, when present */
  geometry?: 'box' | 'cylinder' | 'sphere' | 'mesh' | 'unknown';
  /** Inertial mass in kg, when present */
  mass?: number;
}

export interface UrdfJoint {
  name: string;
  type: 'revolute' | 'continuous' | 'prismatic' | 'fixed' | 'floating' | 'planar' | 'unknown';
  parent: string;
  child: string;
  /** Axis of rotation/translation [x, y, z], defaults to [0, 0, 1] */
  axis: [number, number, number];
  /** Lower limit (rad or m) */
  limitLower?: number;
  /** Upper limit (rad or m) */
  limitUpper?: number;
}

/** HoloScript IR for a robot composition */
export interface HoloScriptRobotIR {
  robotName: string;
  links: UrdfLink[];
  joints: UrdfJoint[];
}

// ─── Import: URDF XML → HoloScript IR ────────────────────────────────────────

export interface UrdfImportInput {
  urdf_xml: string;
}

export interface UrdfImportOutput {
  ir: HoloScriptRobotIR;
  link_count: number;
  joint_count: number;
}

/**
 * Parse URDF XML and produce a HoloScript robot IR.
 * Uses regex-based extraction for portability (no DOM dependency).
 */
export function importFromUrdf(input: UrdfImportInput): UrdfImportOutput {
  const { urdf_xml } = input;

  // Robot name
  const robotNameMatch = urdf_xml.match(/<robot[^>]+name="([^"]+)"/);
  const robotName = robotNameMatch ? robotNameMatch[1] : 'unnamed_robot';

  // Links
  const linkRegex = /<link[^>]+name="([^"]+)"/g;
  const links: UrdfLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(urdf_xml)) !== null) {
    const name = m[1];
    const link: UrdfLink = { name };

    // Geometry — look for geometry block near this link name
    const geomMatch = urdf_xml.match(
      new RegExp(`<link[^>]+name="${name}"[\\s\\S]*?<geometry>[\\s\\S]*?<(box|cylinder|sphere|mesh)`)
    );
    if (geomMatch) {
      link.geometry = geomMatch[1] as UrdfLink['geometry'];
    }

    // Mass
    const massSection = urdf_xml.match(
      new RegExp(`<link[^>]+name="${name}"[\\s\\S]*?<mass\\s+value="([^"]+)"`)
    );
    if (massSection) {
      const massVal = parseFloat(massSection[1]);
      if (!isNaN(massVal)) link.mass = massVal;
    }

    links.push(link);
  }

  // Joints
  const jointBlockRegex = /<joint\b([^>]*)>([\s\S]*?)<\/joint>/g;
  const joints: UrdfJoint[] = [];

  while ((m = jointBlockRegex.exec(urdf_xml)) !== null) {
    const attrs = m[1];
    const body = m[2];

    const nameMatch = attrs.match(/name="([^"]+)"/);
    const typeMatch = attrs.match(/type="([^"]+)"/);
    const parentMatch = body.match(/<parent\s+link="([^"]+)"/);
    const childMatch = body.match(/<child\s+link="([^"]+)"/);

    if (!nameMatch || !parentMatch || !childMatch) continue;

    const rawType = typeMatch ? typeMatch[1] : 'unknown';
    const validTypes = ['revolute', 'continuous', 'prismatic', 'fixed', 'floating', 'planar'];
    const type = validTypes.includes(rawType)
      ? (rawType as UrdfJoint['type'])
      : 'unknown';

    // Axis
    const axisMatch = body.match(/<axis\s+xyz="([^"]+)"/);
    let axis: [number, number, number] = [0, 0, 1];
    if (axisMatch) {
      const parts = axisMatch[1].split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every(n => !isNaN(n))) {
        axis = [parts[0], parts[1], parts[2]];
      }
    }

    // Limits
    const limitMatch = body.match(/<limit[^>]+lower="([^"]+)"[^>]+upper="([^"]+)"/);
    const joint: UrdfJoint = {
      name: nameMatch[1],
      type,
      parent: parentMatch[1],
      child: childMatch[1],
      axis,
    };
    if (limitMatch) {
      joint.limitLower = parseFloat(limitMatch[1]);
      joint.limitUpper = parseFloat(limitMatch[2]);
    }

    joints.push(joint);
  }

  const ir: HoloScriptRobotIR = { robotName, links, joints };
  return { ir, link_count: links.length, joint_count: joints.length };
}

// ─── Export: HoloScript IR → URDF XML ────────────────────────────────────────

export interface UrdfExportInput {
  ir: HoloScriptRobotIR;
}

export interface UrdfExportOutput {
  urdf_xml: string;
}

/**
 * Serialize a HoloScript robot IR back to URDF XML.
 */
export function exportToUrdf(input: UrdfExportInput): UrdfExportOutput {
  const { ir } = input;
  const lines: string[] = [`<robot name="${ir.robotName}">`];

  for (const link of ir.links) {
    lines.push(`  <link name="${link.name}">`);
    if (link.mass !== undefined) {
      lines.push(`    <inertial>`);
      lines.push(`      <mass value="${link.mass}"/>`);
      lines.push(`    </inertial>`);
    }
    if (link.geometry) {
      lines.push(`    <visual>`);
      lines.push(`      <geometry>`);
      lines.push(`        <${link.geometry}/>`);
      lines.push(`      </geometry>`);
      lines.push(`    </visual>`);
    }
    lines.push(`  </link>`);
  }

  for (const joint of ir.joints) {
    lines.push(`  <joint name="${joint.name}" type="${joint.type}">`);
    lines.push(`    <parent link="${joint.parent}"/>`);
    lines.push(`    <child link="${joint.child}"/>`);
    lines.push(`    <axis xyz="${joint.axis.join(' ')}"/>`);
    if (joint.limitLower !== undefined && joint.limitUpper !== undefined) {
      lines.push(`    <limit lower="${joint.limitLower}" upper="${joint.limitUpper}"/>`);
    }
    lines.push(`  </joint>`);
  }

  lines.push(`</robot>`);
  return { urdf_xml: lines.join('\n') };
}

// ─── Round-trip stability ─────────────────────────────────────────────────────

/**
 * Check structural round-trip stability: import → export → re-import.
 * Returns true if link_count and joint_count are preserved across the cycle.
 */
export function urdfRoundTrip(urdf_xml: string): boolean {
  const first = importFromUrdf({ urdf_xml });
  const exported = exportToUrdf({ ir: first.ir });
  const second = importFromUrdf({ urdf_xml: exported.urdf_xml });
  return (
    second.link_count === first.link_count &&
    second.joint_count === first.joint_count
  );
}
