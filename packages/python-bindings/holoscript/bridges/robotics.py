#!/usr/bin/env python3
"""
ROS2 Bridge for HoloScript Robotics Plugin
Runtime integration with ROS2 via rosbridge_server

Requirements:
  pip install roslibpy

Usage:
  from ros2_bridge import ROS2Bridge

  bridge = ROS2Bridge('ws://localhost:9090')
  bridge.connect()
  bridge.publish_joint_command('/joint_states', {...})
"""

import sys
import json
from typing import Dict, Any, List
import roslibpy

class ROS2Bridge:
    """ROS2 runtime bridge for HoloScript robotics"""

    def __init__(self, ros_bridge_url: str = 'ws://localhost:9090'):
        self.ros_bridge_url = ros_bridge_url
        self.client = None
        self.subscribers = {}
        self.publishers = {}

    def connect(self) -> Dict[str, Any]:
        """Connect to ROS2 via rosbridge_server"""
        try:
            self.client = roslibpy.Ros(host=self.ros_bridge_url.replace('ws://', '').split(':')[0],
                                       port=int(self.ros_bridge_url.split(':')[-1]))
            self.client.run()

            return {
                'status': 'success',
                'connected': self.client.is_connected,
                'url': self.ros_bridge_url,
            }
        except Exception as e:
            return {
                'status': 'failed',
                'error': str(e),
            }

    def publish_joint_command(self, topic: str, joint_positions: Dict[str, float]) -> Dict[str, Any]:
        """Publish joint command to ROS2 topic"""
        try:
            if topic not in self.publishers:
                self.publishers[topic] = roslibpy.Topic(self.client, topic, 'sensor_msgs/JointState')

            msg = {
                'name': list(joint_positions.keys()),
                'position': list(joint_positions.values()),
            }

            self.publishers[topic].publish(roslibpy.Message(msg))

            return {'status': 'success', 'topic': topic}
        except Exception as e:
            return {'status': 'failed', 'error': str(e)}

    def get_status(self) -> Dict[str, Any]:
        """Get bridge status"""
        return {
            'connected': self.client.is_connected if self.client else False,
            'url': self.ros_bridge_url,
            'version': '1.0.0',
        }

if __name__ == '__main__':
    bridge = ROS2Bridge()
    status = bridge.connect()
    print(f"ROS2 Bridge: {status}")
