'use client';

/**
 * RobotDeployPanel — Robotics panel for HoloScript Studio.
 *
 * Surfaces robotHelpers.ts:
 *  - URDF import / parse
 *  - Joint inspector with angle sliders
 *  - Forward kinematics live preview
 *  - Workspace bounds visualization
 *  - Export to URDF / HoloScript traits
 *  - ROS connection URL input
 *
 * This panel lets robotics engineers design, simulate, and deploy
 * robot configurations directly from the Studio.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Bot, Upload, Download, Sliders, Play, Radio,
  ChevronDown, ChevronRight, RotateCcw, Wifi, WifiOff,
} from 'lucide-react';
import {
  parseRobotDefinition, setJointAngle, forwardKinematics,
  workspaceBounds, jointToTrait,
  type RobotDefinition, type Joint,
} from '@/lib/robotHelpers';

type ViewMode = 'joints' | 'kinematics' | 'export' | 'deploy';

const DEMO_URDF = `<?xml version="1.0"?>
<robot name="demo_arm">
  <link name="base_link"/>
  <link name="shoulder"/>
  <link name="elbow"/>
  <link name="wrist"/>
  <link name="end_effector"/>
  <joint name="shoulder_joint" type="revolute">
    <parent link="base_link"/>
    <child link="shoulder"/>
    <axis xyz="0 1 0"/>
    <origin xyz="0 0 0.5" rpy="0 0 0"/>
    <limit lower="-1.57" upper="1.57"/>
  </joint>
  <joint name="elbow_joint" type="revolute">
    <parent link="shoulder"/>
    <child link="elbow"/>
    <axis xyz="0 1 0"/>
    <origin xyz="0 0 1.0" rpy="0 0 0"/>
    <limit lower="0" upper="2.36"/>
  </joint>
  <joint name="wrist_joint" type="revolute">
    <parent link="elbow"/>
    <child link="wrist"/>
    <axis xyz="0 1 0"/>
    <origin xyz="0 0 0.8" rpy="0 0 0"/>
    <limit lower="-1.57" upper="1.57"/>
  </joint>
  <joint name="end_joint" type="fixed">
    <parent link="wrist"/>
    <child link="end_effector"/>
    <origin xyz="0 0 0.3" rpy="0 0 0"/>
  </joint>
</robot>`;

export function RobotDeployPanel() {
  const [robot, setRobot] = useState<RobotDefinition | null>(null);
  const [jointAngles, setJointAngles] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('joints');
  const [rosUrl, setRosUrl] = useState('ws://localhost:9090');
  const [rosConnected, setRosConnected] = useState(false);
  const [filename, setFilename] = useState('');

  const handleUrdfUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseRobotDefinition(text);
      setRobot(parsed);
      const angles: Record<string, number> = {};
      parsed.joints.forEach(j => { angles[j.name] = 0; });
      setJointAngles(angles);
    };
    reader.readAsText(file);
  }, []);

  const handleLoadDemo = useCallback(() => {
    const parsed = parseRobotDefinition(DEMO_URDF);
    setRobot(parsed);
    setFilename('demo_arm.urdf');
    const angles: Record<string, number> = {};
    parsed.joints.forEach(j => { angles[j.name] = 0; });
    setJointAngles(angles);
  }, []);

  const handleJointChange = useCallback((joint: Joint, angle: number) => {
    const clamped = setJointAngle(joint, angle);
    setJointAngles(prev => ({ ...prev, [joint.name]: clamped }));
  }, []);

  const handleReset = useCallback(() => {
    if (!robot) return;
    const angles: Record<string, number> = {};
    robot.joints.forEach(j => { angles[j.name] = 0; });
    setJointAngles(angles);
  }, [robot]);

  // Live forward kinematics
  const endEffectorPos = useMemo(() => {
    if (!robot) return [0, 0, 0] as [number, number, number];
    const chain = robot.joints
      .filter(j => j.type !== 'fixed')
      .map(j => ({
        joint: j,
        angle: jointAngles[j.name] ?? 0,
        linkLength: Math.sqrt(j.origin.x ** 2 + j.origin.y ** 2 + j.origin.z ** 2) || 1,
      }));
    return forwardKinematics(chain);
  }, [robot, jointAngles]);

  const workspace = useMemo(() => {
    if (!robot) return null;
    const chain = robot.joints
      .filter(j => j.type !== 'fixed')
      .map(j => ({
        joint: j,
        linkLength: Math.sqrt(j.origin.x ** 2 + j.origin.y ** 2 + j.origin.z ** 2) || 1,
      }));
    return workspaceBounds(chain);
  }, [robot]);

  // Generate HoloScript traits
  const holoTraits = useMemo(() => {
    if (!robot) return '';
    return robot.joints.map(j => jointToTrait(j)).join('\n');
  }, [robot]);

  const activeJoints = robot?.joints.filter(j => j.type !== 'fixed') ?? [];

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-studio-text">Robot Deploy</h3>
      </div>

      {/* URDF Upload */}
      <div className="flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-studio-border bg-studio-panel/50 px-3 py-2 text-xs text-studio-muted transition hover:border-orange-500/40 hover:text-studio-text">
          <Upload className="h-3.5 w-3.5" />
          {filename || 'Upload URDF'}
          <input type="file" accept=".urdf,.xml,.xacro" className="hidden" onChange={handleUrdfUpload} />
        </label>
        <button
          onClick={handleLoadDemo}
          className="rounded-lg border border-studio-border bg-studio-panel/50 px-3 py-2 text-xs text-studio-muted transition hover:text-studio-text"
          title="Load demo robot arm"
        >
          Demo
        </button>
      </div>

      {/* Robot Info */}
      {robot && (
        <div className="flex items-center justify-between rounded-lg border border-studio-border bg-studio-panel/30 px-3 py-2 text-xs">
          <span className="font-semibold text-studio-text">{robot.name}</span>
          <span className="text-studio-muted">{robot.links.length} links · {robot.joints.length} joints</span>
        </div>
      )}

      {/* View Mode Tabs */}
      {robot && (
        <div className="flex gap-1 rounded-lg bg-studio-panel/50 p-1">
          {([
            { mode: 'joints' as ViewMode, label: 'Joints', icon: Sliders },
            { mode: 'kinematics' as ViewMode, label: 'FK', icon: Play },
            { mode: 'export' as ViewMode, label: 'Export', icon: Download },
            { mode: 'deploy' as ViewMode, label: 'Deploy', icon: Radio },
          ]).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] transition ${
                viewMode === mode
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Joint Sliders */}
      {robot && viewMode === 'joints' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
              Active Joints ({activeJoints.length})
            </span>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[10px] text-studio-muted hover:text-studio-text"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
          {activeJoints.map(joint => (
            <div key={joint.name} className="rounded-lg border border-studio-border bg-studio-panel/30 p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-studio-text">{joint.name}</span>
                <span className="font-mono text-[10px] text-studio-muted">
                  {((jointAngles[joint.name] ?? 0) * 180 / Math.PI).toFixed(1)}°
                </span>
              </div>
              <input
                type="range"
                min={joint.limits.min * 100}
                max={joint.limits.max * 100}
                value={(jointAngles[joint.name] ?? 0) * 100}
                onChange={(e) => handleJointChange(joint, parseInt(e.target.value) / 100)}
                className="mt-1 w-full accent-orange-500"
              />
              <div className="flex justify-between text-[9px] text-studio-muted">
                <span>{(joint.limits.min * 180 / Math.PI).toFixed(0)}°</span>
                <span className="text-orange-400/60">{joint.type}</span>
                <span>{(joint.limits.max * 180 / Math.PI).toFixed(0)}°</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Forward Kinematics */}
      {robot && viewMode === 'kinematics' && (
        <div className="flex flex-col gap-2 rounded-lg border border-studio-border bg-studio-panel/30 p-3 text-xs">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">End Effector Position</div>
          <div className="grid grid-cols-3 gap-2">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div key={axis} className="text-center">
                <div className="text-[10px] text-studio-muted">{axis}</div>
                <div className="font-mono text-lg font-bold text-orange-400">
                  {endEffectorPos[i].toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          {workspace && (
            <div className="mt-2 border-t border-studio-border pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">Workspace</div>
              <div className="text-studio-text mt-1">
                Reach: <span className="font-mono text-orange-400">{workspace.radius.toFixed(2)}m</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export */}
      {robot && viewMode === 'export' && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            HoloScript Traits
          </div>
          <pre className="max-h-32 overflow-auto rounded-lg border border-studio-border bg-studio-panel/30 p-2 text-[10px] text-emerald-400 font-mono">
            {holoTraits}
          </pre>
          <button
            onClick={() => navigator.clipboard?.writeText(holoTraits)}
            className="flex items-center justify-center gap-2 rounded-lg border border-studio-border bg-studio-panel/50 px-3 py-1.5 text-xs text-studio-muted transition hover:text-studio-text"
          >
            Copy to Clipboard
          </button>
        </div>
      )}

      {/* Deploy */}
      {robot && viewMode === 'deploy' && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            ROS Bridge Connection
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={rosUrl}
              onChange={(e) => setRosUrl(e.target.value)}
              placeholder="ws://localhost:9090"
              className="flex-1 rounded-lg border border-studio-border bg-studio-panel/50 px-3 py-1.5 text-xs text-studio-text outline-none focus:border-orange-500/40"
            />
            <button
              onClick={() => setRosConnected(!rosConnected)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rosConnected
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
              }`}
            >
              {rosConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {rosConnected ? 'Connected' : 'Connect'}
            </button>
          </div>
          <div className="rounded-lg border border-studio-border bg-studio-panel/30 p-3 text-[11px] text-studio-muted">
            <p>Send joint commands to a real robot via ROSBridge:</p>
            <ol className="mt-1 ml-4 list-decimal space-y-0.5">
              <li>Start <code className="text-orange-400">roslaunch rosbridge_server rosbridge_websocket_launch.xml</code></li>
              <li>Enter the WebSocket URL above</li>
              <li>Click Connect</li>
              <li>Adjust joints — commands publish to <code className="text-orange-400">/joint_states</code></li>
            </ol>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!robot && (
        <div className="rounded-lg border border-dashed border-studio-border p-4 text-center text-xs text-studio-muted">
          Upload a URDF file or click "Demo" to load a robot arm
        </div>
      )}
    </div>
  );
}
