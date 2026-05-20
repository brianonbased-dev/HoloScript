import { describe, expect, it } from 'vitest';
import { handleCompilerTool } from '../compiler-tools';

const robotComposition = `composition "Robot" {
  object "base_link" {
    geometry: "cube"
    position: [0, 0, 0]
  }
}`;

type TextContent = {
  type: 'text';
  text: string;
};

function firstTextContent(result: unknown): TextContent {
  const content = (result as { content?: unknown }).content;
  expect(Array.isArray(content)).toBe(true);
  const first = content[0] as Partial<TextContent> | undefined;
  expect(first?.type).toBe('text');
  expect(typeof first?.text).toBe('string');
  return first as TextContent;
}

describe('compiler tools', () => {
  it('returns a non-empty ROS 2 deployment bundle', async () => {
    const result = await handleCompilerTool('compile_to_ros2_deploy', {
      code: robotComposition,
      packageName: 'test_robot_pkg',
      options: {
        rviz: true,
        gazebo: true,
        controllers: ['base_joint'],
      },
    });

    const bundle = JSON.parse(firstTextContent(result).text) as {
      urdf?: string;
      launchFile?: string;
      controllersYaml?: string;
      packageName?: string;
      urdfFilename?: string;
    };

    expect(bundle.packageName).toBe('test_robot_pkg');
    expect(bundle.urdfFilename).toBe('test_robot_pkg.urdf');
    expect(bundle.urdf).toContain('<robot');
    expect(bundle.urdf).toContain('base_link');
    expect(bundle.launchFile).toContain('robot_state_publisher');
    expect(bundle.launchFile).toContain('test_robot_pkg.urdf');
    expect(bundle.controllersYaml).toContain('joint_state_broadcaster');
    expect(bundle.controllersYaml).toContain('base_joint');
  });
});
