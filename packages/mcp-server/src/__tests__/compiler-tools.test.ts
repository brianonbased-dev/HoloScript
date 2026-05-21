import { describe, expect, it } from 'vitest';
import { compilerTools, handleCompilerTool } from '../compiler-tools';

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
  it('publishes convenience tools for every listed export target', async () => {
    const result = (await handleCompilerTool('list_export_targets', {})) as {
      targets?: string[];
    };
    const toolNames = new Set(compilerTools.map((tool) => tool.name));
    const targetToolName = (target: string): string => {
      if (target === 'android-xr') return 'compile_to_android_xr';
      if (target === 'multi-layer') return 'compile_to_multi_layer';
      if (target === '3dgs') return 'compile_to_3dgs';
      return `compile_to_${target}`;
    };

    expect(Array.isArray(result.targets)).toBe(true);
    const missing = result.targets
      ?.map((target) => targetToolName(target))
      .filter((toolName) => !toolNames.has(toolName));

    expect(missing).toEqual([]);

    for (const target of result.targets ?? []) {
      const toolName = targetToolName(target);
      try {
        const dispatchResult = await handleCompilerTool(toolName, {});
        expect(dispatchResult).not.toBeNull();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toMatch(/^Unknown tool:/);
      }
    }
  });

  it('compiles USD through its convenience tool', async () => {
    const result = (await handleCompilerTool('compile_to_usd', {
      code: robotComposition,
    })) as {
      success?: boolean;
      output?: string;
    };

    expect(result.success).toBe(true);
    expect(result.output).toContain('#usda');
    expect(result.output).toContain('base_link');
  });

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
