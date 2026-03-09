import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { CodeStep } from '../components/CodeStep';

const STEPS = [
  {
    title: 'Install the Python Package',
    description: 'Install holoscript from PyPI and import the core module in your script.',
    lines: [
      { content: '# Install from PyPI', dim: true },
      { content: 'pip install holoscript', highlight: true, annotation: 'requires Python 3.9+' },
      { content: '' },
      { content: '# In your Python script', dim: true },
      { content: 'import holoscript', highlight: true },
      { content: 'from holoscript import parse, compile_to_target' },
      { content: 'from holoscript import HoloScriptError' },
      { content: '' },
      { content: "print(holoscript.__version__)  # '3.4.0'" },
    ],
  },
  {
    title: 'Parse and Compile',
    description:
      'Load a .holo file, parse it into a composition, then compile to your target platform.',
    lines: [
      { content: 'from holoscript import parse_file, compile_to_target', highlight: true },
      { content: 'from pathlib import Path' },
      { content: '' },
      { content: '# Parse the source file', dim: true },
      {
        content: "composition = parse_file('scenes/SpinningCube.holo')",
        highlight: true,
        annotation: '→ Composition',
      },
      { content: '' },
      { content: '# Compile to Unity C#', dim: true },
      {
        content: "result = compile_to_target(composition, target='unity', options={",
        highlight: true,
      },
      { content: "    'namespace': 'MyGame'," },
      { content: "    'useURP': True," },
      { content: '})' },
      { content: '' },
      {
        content: "Path('output/SpinningCube.cs').write_text(result.code)",
        type: 'added' as const,
        annotation: 'write output',
      },
    ],
  },
  {
    title: 'Robotics: Export URDF',
    description: 'Use the robotics module to export a robot arm scene as a URDF file for ROS2.',
    lines: [
      { content: 'from holoscript.robotics import export_urdf', highlight: true },
      { content: 'from holoscript import parse_file' },
      { content: '' },
      { content: '# Load the robot scene', dim: true },
      { content: "composition = parse_file('robots/ArmRobot.holo')", highlight: true },
      { content: '' },
      {
        content: 'urdf_xml = export_urdf(composition, options={',
        highlight: true,
        annotation: '→ URDF string',
      },
      { content: "    'robot_name': 'arm_robot'," },
      { content: "    'mesh_package': 'arm_robot_description'," },
      { content: "    'collision_geometry': True," },
      { content: '})' },
      { content: '' },
      { content: "with open('output/arm_robot.urdf', 'w') as f:", type: 'added' as const },
      { content: '    f.write(urdf_xml)', type: 'added' as const },
    ],
  },
  {
    title: 'Automation Scripts',
    description:
      'Batch-compile an entire directory of .holo files to multiple targets in one script.',
    lines: [
      { content: 'from pathlib import Path', highlight: true },
      { content: 'from holoscript import parse_file, compile_to_target' },
      { content: '' },
      { content: "scenes_dir = Path('scenes/')", highlight: true },
      { content: "targets = ['unity', 'godot', 'babylon']", annotation: '3 targets' },
      { content: '' },
      { content: "for holo_file in scenes_dir.glob('**/*.holo'):", highlight: true },
      { content: '    composition = parse_file(holo_file)' },
      { content: '    for target in targets:' },
      {
        content: '        result = compile_to_target(composition, target=target)',
        type: 'added' as const,
      },
      { content: "        out = Path('output') / target / holo_file.stem", type: 'added' as const },
      { content: '        out.parent.mkdir(parents=True, exist_ok=True)', type: 'added' as const },
      { content: '        out.write_text(result.code)', type: 'added' as const },
      { content: "        print(f'  compiled {holo_file.name} → {target}')", dim: true },
    ],
  },
  {
    title: 'ROS2 Launch Files',
    description: 'Generate a ROS2 launch configuration directly from a HoloScript composition.',
    lines: [
      { content: 'from holoscript.robotics import generate_ros2_launch', highlight: true },
      { content: 'from holoscript import parse_file' },
      { content: '' },
      { content: "composition = parse_file('robots/WarehouseBot.holo')" },
      { content: '' },
      {
        content: 'launch_py = generate_ros2_launch(composition, config={',
        highlight: true,
        annotation: '→ launch.py',
      },
      { content: "    'package': 'warehouse_bot_bringup'," },
      { content: "    'nodes': ['controller_manager', 'joint_state_publisher']," },
      { content: "    'use_sim_time': True," },
      { content: "    'rviz_config': 'config/robot.rviz'," },
      { content: '})' },
      { content: '' },
      { content: "Path('ros2_ws/src/launch/warehouse_bot.launch.py')", type: 'added' as const },
      { content: '    .write_text(launch_py)', type: 'added' as const },
    ],
  },
];

export const PythonBindings: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDuration = 3 * fps;
  const stepDuration = 5 * fps;

  return (
    <AbsoluteFill style={{ background: '#0f1117' }}>
      <Sequence from={0} durationInFrames={titleDuration}>
        <TitleCard
          title="Python Bindings"
          subtitle="Control HoloScript from Python — scripting, automation, and robotics pipelines"
          tag="Advanced"
        />
      </Sequence>

      {STEPS.map((step, i) => (
        <Sequence key={i} from={titleDuration + i * stepDuration} durationInFrames={stepDuration}>
          <CodeStep
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            lines={step.lines}
            language="python"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
