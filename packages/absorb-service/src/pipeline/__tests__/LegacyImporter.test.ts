import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LegacyImporter } from '../LegacyImporter';

const tmpDirs: string[] = [];

function mkTmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LegacyImporter fixtures', () => {
  it('imports tiny .unity snippet and emits transform shape', async () => {
    const unityDir = mkTmp('unity-fixture-');
    const outDir = mkTmp('unity-out-');

    const unityScene = `
--- !u!4 &100
Transform:
  m_LocalPosition: {x: 1, y: 2, z: 3}
`;

    fs.writeFileSync(path.join(unityDir, 'Sample.unity'), unityScene, 'utf-8');

    const outputPath = await LegacyImporter.importProject({
      engineType: 'unity',
      sourcePath: unityDir,
      outputPath: outDir,
    });

    const out = fs.readFileSync(outputPath, 'utf-8');
    expect(out).toContain('object "transform_0"');
    expect(out).toContain('position: [1, 2, 3]');
  });

  it('imports tiny .urdf and emits link/joint output shape', async () => {
    const urdfDir = mkTmp('urdf-fixture-');
    const outDir = mkTmp('urdf-out-');
    const urdfPath = path.join(urdfDir, 'robot.urdf');

    const urdf = `
<robot name="tiny_bot">
  <link name="base_link" />
  <joint name="joint1" type="revolute">
    <parent link="base_link" />
    <child link="arm_link" />
  </joint>
</robot>
`;

    fs.writeFileSync(urdfPath, urdf, 'utf-8');

    const outputPath = await LegacyImporter.importProject({
      engineType: 'ros2',
      sourcePath: urdfPath,
      outputPath: outDir,
    });

    const out = fs.readFileSync(outputPath, 'utf-8');
    expect(out).toContain('object "link_base_link"');
    expect(out).toContain('object "joint_joint1"');
    expect(out).toContain('type: "revolute"');
    expect(out).toContain('@RoboticsPlugin.robotic_joint');
  });
});
