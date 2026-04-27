/** @ros2_hardware_loop Trait — Bidirectional hardware-in-the-loop bridge for physical robotics. @trait ros2_hardware_loop */
export interface ROS2Config {
  nodeName: string;
  topicPrefix: string;
  updateFrequencyHz: number;
  bidirectional: boolean;
}

export interface ROS2State {
  connected: boolean;
  lastPingMs: number;
  activeTopics: string[];
  hardwareSyncDriftMs: number;
}

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export function createROS2HardwareLoopHandler(): TraitHandler<ROS2Config> {
  return {
    name: 'ros2_hardware_loop',
    defaultConfig: { nodeName: 'holo_rig_01', topicPrefix: '/holo', updateFrequencyHz: 60, bidirectional: true },
    onAttach(n: unknown, c: ROS2Config, ctx: unknown) {
      (n as any).__ros2State = { connected: false, lastPingMs: 0, activeTopics: [], hardwareSyncDriftMs: 0 };
      (ctx as any).emit?.('ros2:init', { node: c.nodeName });
    },
    onDetach(n: unknown, _c: ROS2Config, ctx: unknown) {
      delete (n as any).__ros2State;
      (ctx as any).emit?.('ros2:disconnect');
    },
    onUpdate() {},
    onEvent(n: unknown, c: ROS2Config, ctx: unknown, e: unknown) {
      const s = (n as any).__ros2State as ROS2State;
      if (!s) return;
      const evt = e as any;
      
      switch (evt.type) {
        case 'ros2:connect':
          s.connected = true;
          // In real usage, initializes rclnodejs bridge for pub/sub physics
          (ctx as any).emit?.('ros2:connected', { latencyMs: 12 });
          break;
          
        case 'scene:transform_change':
          if (c.bidirectional && s.connected) {
            // Push virtual set transform to physical robot joint
            (ctx as any).emit?.('ros2:publish', { topic: `${c.topicPrefix}/joint_cmd`, payload: evt.payload });
          }
           break;
           
        case 'ros2:telemetry':
          // Receive physical robot telemetry to drive virtual set
          s.hardwareSyncDriftMs = Math.abs(Date.now() - (evt.payload.timestamp || Date.now()));
          (n as any).transform = evt.payload.transform; 
          break;
          
        case 'ttu:manifested':
          // Dynamically bind to Text-To-Universe AST streams
          const crdtRoot = evt.payload?.crdtRoot;
          if (crdtRoot && s.connected) {
             const dynamicTopic = `${c.topicPrefix}/ttu_sync/${crdtRoot}`;
             s.activeTopics.push(dynamicTopic);
             (ctx as any).emit?.('ros2:subscribe', { topic: dynamicTopic });
             (ctx as any).emit?.('ros2:log', { message: `Bridged digital twin for TTU root: ${crdtRoot}` });
          }
          break;
      }
    }
  };
}
