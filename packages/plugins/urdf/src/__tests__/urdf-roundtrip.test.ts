/**
 * @holoscript/urdf-plugin — ROUND-TRIP TEST
 *
 * Verifies the bidirectional URDF <-> HoloScript IR adapter:
 *   1. importFromUrdf parses URDF XML to IR
 *   2. exportToUrdf serializes IR back to URDF XML
 *   3. urdfRoundTrip confirms structural stability across the full cycle
 *
 * Robot fixture: a 3-link, 2-joint arm (base → link1 → ee)
 */
import { describe, it, expect } from 'vitest';
import {
  importFromUrdf,
  exportToUrdf,
  urdfRoundTrip,
  type HoloScriptRobotIR,
  type UrdfImportOutput,
} from '../index';

// ─── Fixture ─────────────────────────────────────────────────────────────────

const ROBOT_FIXTURE = `<robot name="test_arm">
  <link name="base">
    <inertial>
      <mass value="5.0"/>
    </inertial>
    <visual>
      <geometry>
        <box/>
      </geometry>
    </visual>
  </link>
  <link name="link1">
    <visual>
      <geometry>
        <cylinder/>
      </geometry>
    </visual>
  </link>
  <link name="ee"/>

  <joint name="joint1" type="revolute">
    <parent link="base"/>
    <child link="link1"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.57" upper="1.57"/>
  </joint>
  <joint name="joint2" type="prismatic">
    <parent link="link1"/>
    <child link="ee"/>
    <axis xyz="0 1 0"/>
    <limit lower="0.0" upper="0.5"/>
  </joint>
</robot>`;

// ─── Import tests ─────────────────────────────────────────────────────────────

describe('urdf-plugin: importFromUrdf', () => {
  let result: UrdfImportOutput;

  it('parses the fixture without throwing', () => {
    expect(() => {
      result = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    }).not.toThrow();
    result = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
  });

  it('extracts the correct link count', () => {
    const r = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    expect(r.link_count).toBe(3);
    expect(r.ir.links.length).toBe(3);
  });

  it('extracts the correct joint count', () => {
    const r = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    expect(r.joint_count).toBe(2);
    expect(r.ir.joints.length).toBe(2);
  });

  it('preserves robot name', () => {
    const r = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    expect(r.ir.robotName).toBe('test_arm');
  });

  it('extracts joint parent/child linkage', () => {
    const r = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    const j1 = r.ir.joints.find(j => j.name === 'joint1');
    expect(j1).toBeDefined();
    expect(j1!.parent).toBe('base');
    expect(j1!.child).toBe('link1');
    expect(j1!.type).toBe('revolute');
  });

  it('extracts joint axis', () => {
    const r = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    const j1 = r.ir.joints.find(j => j.name === 'joint1');
    expect(j1!.axis).toEqual([0, 0, 1]);
  });

  it('extracts joint limits', () => {
    const r = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    const j1 = r.ir.joints.find(j => j.name === 'joint1');
    expect(j1!.limitLower).toBeCloseTo(-1.57);
    expect(j1!.limitUpper).toBeCloseTo(1.57);
  });

  it('handles empty input gracefully (zero counts, no throw)', () => {
    const r = importFromUrdf({ urdf_xml: '' });
    expect(r.link_count).toBe(0);
    expect(r.joint_count).toBe(0);
  });
});

// ─── Export tests ─────────────────────────────────────────────────────────────

describe('urdf-plugin: exportToUrdf', () => {
  it('produces XML with robot name tag', () => {
    const ir: HoloScriptRobotIR = {
      robotName: 'my_robot',
      links: [{ name: 'base' }, { name: 'end' }],
      joints: [
        {
          name: 'j1',
          type: 'revolute',
          parent: 'base',
          child: 'end',
          axis: [0, 0, 1],
        },
      ],
    };
    const { urdf_xml } = exportToUrdf({ ir });
    expect(urdf_xml).toContain('<robot name="my_robot">');
    expect(urdf_xml).toContain('<link name="base">');
    expect(urdf_xml).toContain('<link name="end">');
    expect(urdf_xml).toContain('<joint name="j1" type="revolute">');
    expect(urdf_xml).toContain('<parent link="base"/>');
    expect(urdf_xml).toContain('<child link="end"/>');
    expect(urdf_xml).toContain('</robot>');
  });

  it('includes mass when present in IR', () => {
    const ir: HoloScriptRobotIR = {
      robotName: 'r',
      links: [{ name: 'base', mass: 2.5 }],
      joints: [],
    };
    const { urdf_xml } = exportToUrdf({ ir });
    expect(urdf_xml).toContain('<mass value="2.5"/>');
  });
});

// ─── Round-trip test ─────────────────────────────────────────────────────────

describe('urdf-plugin: urdfRoundTrip', () => {
  it('preserves link_count and joint_count through import → export → import', () => {
    expect(urdfRoundTrip(ROBOT_FIXTURE)).toBe(true);
  });

  it('handles a minimal single-link robot round-trip', () => {
    const minimal = `<robot name="minimal"><link name="root"/></robot>`;
    expect(urdfRoundTrip(minimal)).toBe(true);
  });

  it('re-imported IR matches original robot name', () => {
    const first = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    const exported = exportToUrdf({ ir: first.ir });
    const second = importFromUrdf({ urdf_xml: exported.urdf_xml });
    expect(second.ir.robotName).toBe('test_arm');
  });

  it('re-imported joint parent/child are preserved', () => {
    const first = importFromUrdf({ urdf_xml: ROBOT_FIXTURE });
    const exported = exportToUrdf({ ir: first.ir });
    const second = importFromUrdf({ urdf_xml: exported.urdf_xml });
    const j = second.ir.joints.find(j => j.name === 'joint1');
    expect(j).toBeDefined();
    expect(j!.parent).toBe('base');
    expect(j!.child).toBe('link1');
  });
});
