import { describe, it, expect } from 'vitest';
import { importUrdf } from '../index';

const SAMPLE_URDF = `
<?xml version="1.0"?>
<robot name="arm2">
  <link name="base"/>
  <link name="link1"/>
  <link name="link2"/>
  <joint name="j0" type="revolute">
    <parent link="base"/>
    <child link="link1"/>
  </joint>
  <joint name="j1" type="revolute">
    <parent link="link1"/>
    <child link="link2"/>
  </joint>
</robot>
`;

describe('urdformer-plugin stub', () => {
  it('extracts link + joint counts', () => {
    const r = importUrdf({ urdf_xml: SAMPLE_URDF });
    expect(r.link_count).toBe(3);
    expect(r.joint_count).toBe(2);
  });

  it('extracts joint kinematics with parent + child', () => {
    const r = importUrdf({ urdf_xml: SAMPLE_URDF });
    expect(r.joint_kinematics[0]).toMatchObject({ name: 'j0', type: 'revolute', parent: 'base', child: 'link1' });
    expect(r.joint_kinematics[1]).toMatchObject({ name: 'j1', type: 'revolute', parent: 'link1', child: 'link2' });
  });

  it('handles empty URDF gracefully', () => {
    const r = importUrdf({ urdf_xml: '<robot></robot>' });
    expect(r.link_count).toBe(0);
    expect(r.joint_count).toBe(0);
  });
});
