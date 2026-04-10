/**
 * HealthcareRoboticsDomain.test.ts
 * Tests for healthcare and robotics domain block compilation + cross-platform transpilers.
 */

import { describe, it, expect, vi } from 'vitest';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';
import {
  compileHealthcareBlock,
  healthcareToR3F,
  healthcareToUnity,
  healthcareToGodot,
  healthcareToVRChat,
  healthcareToUSDA,
  compileRoboticsBlock,
  roboticsToR3F,
  roboticsToUnity,
  roboticsToGodot,
  roboticsToVRChat,
  roboticsToUSDA,
} from '../DomainBlockCompilerMixin';

// Mock RBAC
vi.mock('../../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as any), getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }) };
});

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeBlock(
  domain: string,
  keyword: string,
  name: string,
  properties: Record<string, any> = {},
  opts: { traits?: string[]; children?: any[] } = {}
): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain: domain as any,
    keyword,
    name,
    traits: opts.traits ?? [],
    properties,
    children: opts.children,
  } as HoloDomainBlock;
}

// =============================================================================
// Healthcare Domain
// =============================================================================

describe('Healthcare Domain Compilation', () => {
  describe('compileHealthcareBlock', () => {
    it('extracts basic properties from a procedure block', () => {
      const block = makeBlock('healthcare', 'procedure', 'Appendectomy', {
        body_system: 'digestive',
        steps: ['incision', 'locate_appendix', 'excise', 'close'],
      });

      const result = compileHealthcareBlock(block);

      expect(result.name).toBe('Appendectomy');
      expect(result.keyword).toBe('procedure');
      expect(result.bodySystem).toBe('digestive');
      expect(result.procedureSteps).toEqual(['incision', 'locate_appendix', 'excise', 'close']);
    });

    it('extracts DICOM window/level from imaging block', () => {
      const block = makeBlock('healthcare', 'vital_monitor', 'ChestCT', {
        modality: 'ct',
        window_center: 40,
        window_width: 400,
      });

      const result = compileHealthcareBlock(block);

      expect(result.modality).toBe('ct');
      expect(result.dicomWindow).toEqual({ center: 40, width: 400 });
    });

    it('extracts vital signs and alert thresholds', () => {
      const block = makeBlock('healthcare', 'vital_monitor', 'ICUMonitor', {
        vital_signs: ['heart_rate', 'spo2', 'blood_pressure'],
        alert_thresholds: {
          heart_rate: { min: 50, max: 120 },
          spo2: { min: 90, max: 100 },
        },
      });

      const result = compileHealthcareBlock(block);

      expect(result.vitalSigns).toEqual(['heart_rate', 'spo2', 'blood_pressure']);
      expect(result.alertThresholds).toEqual({
        heart_rate: { min: 50, max: 120 },
        spo2: { min: 90, max: 100 },
      });
    });

    it('extracts procedure steps from children', () => {
      const block = makeBlock(
        'healthcare',
        'procedure',
        'BiopsiFlow',
        {},
        {
          children: [
            { type: 'DomainBlock', keyword: 'step', name: 'sterilize' },
            { type: 'DomainBlock', keyword: 'step', name: 'extract_tissue' },
            { type: 'DomainBlock', keyword: 'step', name: 'send_to_lab' },
          ],
        }
      );

      const result = compileHealthcareBlock(block);

      expect(result.procedureSteps).toEqual(['sterilize', 'extract_tissue', 'send_to_lab']);
    });

    it('defaults to sensible values when properties are missing', () => {
      const block = makeBlock('healthcare', 'patient_model', 'Generic');

      const result = compileHealthcareBlock(block);

      expect(result.name).toBe('Generic');
      expect(result.keyword).toBe('patient_model');
      expect(result.modality).toBeUndefined();
      expect(result.dicomWindow).toBeUndefined();
      expect(result.vitalSigns).toBeUndefined();
      expect(result.procedureSteps).toBeUndefined();
    });

    it('handles single vital sign string', () => {
      const block = makeBlock('healthcare', 'vital_monitor', 'SimpleMonitor', {
        vital_signs: 'heart_rate',
      });

      const result = compileHealthcareBlock(block);

      expect(result.vitalSigns).toEqual(['heart_rate']);
    });
  });

  describe('healthcareToR3F', () => {
    it('generates React config with DICOM window', () => {
      const healthcare = compileHealthcareBlock(
        makeBlock('healthcare', 'vital_monitor', 'CTViewer', {
          modality: 'ct',
          window_center: 50,
          window_width: 350,
        })
      );

      const code = healthcareToR3F(healthcare);

      expect(code).toContain('export const CTViewerConfig');
      expect(code).toContain('modality: "ct"');
      expect(code).toContain('dicomWindow: { center: 50, width: 350 }');
    });

    it('generates React config with vital signs', () => {
      const healthcare = compileHealthcareBlock(
        makeBlock('healthcare', 'vital_monitor', 'Monitor', {
          vital_signs: ['heart_rate', 'spo2'],
        })
      );

      const code = healthcareToR3F(healthcare);

      expect(code).toContain('vitalSigns: ["heart_rate", "spo2"]');
    });
  });

  describe('healthcareToUnity', () => {
    it('generates C# class with DICOM shader uniforms', () => {
      const healthcare = compileHealthcareBlock(
        makeBlock('healthcare', 'procedure', 'BrainMRI', {
          modality: 'mri',
          window_center: 600,
          window_width: 1200,
        })
      );

      const code = healthcareToUnity(healthcare);

      expect(code).toContain('class BrainMRIMedical : MonoBehaviour');
      expect(code).toContain('windowCenter = 600f');
      expect(code).toContain('windowWidth = 1200f');
      expect(code).toContain('SetFloat("_WindowCenter"');
    });
  });

  describe('healthcareToGodot', () => {
    it('generates GDScript with window-level signals', () => {
      const healthcare = compileHealthcareBlock(
        makeBlock('healthcare', 'vital_monitor', 'XRayView', {
          modality: 'xray',
          window_center: 0,
          window_width: 2000,
        })
      );

      const code = healthcareToGodot(healthcare);

      expect(code).toContain('extends Node3D');
      expect(code).toContain('modality: String = "xray"');
      expect(code).toContain('window_center: float = 0');
      expect(code).toContain('signal window_level_changed');
      expect(code).toContain('set_shader_parameter("window_center"');
    });
  });

  describe('healthcareToVRChat', () => {
    it('generates UdonSharp with synced vital data', () => {
      const healthcare = compileHealthcareBlock(
        makeBlock('healthcare', 'vital_monitor', 'VRMonitor', {
          vital_signs: ['heart_rate'],
          window_center: 40,
          window_width: 400,
        })
      );

      const code = healthcareToVRChat(healthcare);

      expect(code).toContain('UdonBehaviourSyncMode');
      expect(code).toContain('[UdonSynced] public string vitalData');
      expect(code).toContain('[UdonSynced] public float windowCenter = 40f');
    });
  });

  describe('healthcareToUSDA', () => {
    it('generates USD custom data annotations', () => {
      const healthcare = compileHealthcareBlock(
        makeBlock('healthcare', 'procedure', 'Arthroscopy', {
          modality: 'camera',
          body_system: 'musculoskeletal',
        })
      );

      const code = healthcareToUSDA(healthcare);

      expect(code).toContain('def Scope "Medical_Arthroscopy"');
      expect(code).toContain('holoscript:medicalType = "procedure"');
      expect(code).toContain('holoscript:modality = "camera"');
      expect(code).toContain('holoscript:bodySystem = "musculoskeletal"');
    });
  });
});

// =============================================================================
// Robotics Domain
// =============================================================================

describe('Robotics Domain Compilation', () => {
  describe('compileRoboticsBlock', () => {
    it('extracts joint properties from a revolute joint block', () => {
      const block = makeBlock('robotics', 'joint', 'ShoulderPitch', {
        joint_type: 'revolute',
        lower: -1.57,
        upper: 1.57,
        effort: 87,
        velocity: 2.175,
      });

      const result = compileRoboticsBlock(block);

      expect(result.name).toBe('ShoulderPitch');
      expect(result.keyword).toBe('joint');
      expect(result.jointType).toBe('revolute');
      expect(result.jointLimits).toEqual({
        lower: -1.57,
        upper: 1.57,
        effort: 87,
        velocity: 2.175,
      });
    });

    it('extracts joint limits from nested limits object', () => {
      const block = makeBlock('robotics', 'joint', 'ElbowFlex', {
        type: 'prismatic',
        limits: { lower: 0, upper: 0.5, effort: 50, velocity: 0.3 },
      });

      const result = compileRoboticsBlock(block);

      expect(result.jointType).toBe('prismatic');
      expect(result.jointLimits).toEqual({
        lower: 0,
        upper: 0.5,
        effort: 50,
        velocity: 0.3,
      });
    });

    it('extracts controller and drive type', () => {
      const block = makeBlock('robotics', 'controller', 'ArmController', {
        controller_type: 'pid',
        drive_type: 'position',
      });

      const result = compileRoboticsBlock(block);

      expect(result.controllerType).toBe('pid');
      expect(result.driveType).toBe('position');
    });

    it('extracts end effector type', () => {
      const block = makeBlock('robotics', 'end_effector', 'Gripper', {
        effector_type: 'parallel_gripper',
      });

      const result = compileRoboticsBlock(block);

      expect(result.effectorType).toBe('parallel_gripper');
    });

    it('extracts sensor type', () => {
      const block = makeBlock('robotics', 'actuator', 'WristSensor', {
        sensor_type: 'force_torque',
      });

      const result = compileRoboticsBlock(block);

      expect(result.sensorType).toBe('force_torque');
    });

    it('extracts ROS 2 configuration', () => {
      const block = makeBlock('robotics', 'controller', 'NavNode', {
        controller_type: 'mpc',
        ros2_package: 'my_robot',
        ros2_node: 'controller_node',
        ros2_topic: '/cmd_vel',
      });

      const result = compileRoboticsBlock(block);

      expect(result.ros2).toEqual({
        packageName: 'my_robot',
        nodeType: 'controller_node',
        topicName: '/cmd_vel',
      });
    });

    it('extracts safety rating', () => {
      const block = makeBlock('robotics', 'joint', 'CoBot', {
        joint_type: 'revolute',
        safety_rating: 'iso_ts_15066',
      });

      const result = compileRoboticsBlock(block);

      expect(result.safetyRating).toBe('iso_ts_15066');
    });

    it('defaults to sensible values when properties are missing', () => {
      const block = makeBlock('robotics', 'actuator', 'Motor1');

      const result = compileRoboticsBlock(block);

      expect(result.name).toBe('Motor1');
      expect(result.jointType).toBeUndefined();
      expect(result.jointLimits).toBeUndefined();
      expect(result.driveType).toBeUndefined();
      expect(result.ros2).toBeUndefined();
    });
  });

  describe('roboticsToR3F', () => {
    it('generates React config with joint limits', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'joint', 'Shoulder', {
          joint_type: 'revolute',
          lower: -1.57,
          upper: 1.57,
          effort: 87,
          velocity: 2.0,
          drive_type: 'position',
        })
      );

      const code = roboticsToR3F(robotics);

      expect(code).toContain('export const ShoulderConfig');
      expect(code).toContain('jointType: "revolute"');
      expect(code).toContain('jointLimits: { lower: -1.57, upper: 1.57');
      expect(code).toContain('driveType: "position"');
    });
  });

  describe('roboticsToUnity', () => {
    it('generates C# ArticulationBody setup', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'joint', 'HipJoint', {
          joint_type: 'revolute',
          lower: -0.785,
          upper: 0.785,
          effort: 150,
          velocity: 1.5,
        })
      );

      const code = roboticsToUnity(robotics);

      expect(code).toContain('class HipJointRobotics : MonoBehaviour');
      expect(code).toContain('ArticulationJointType.Revolute');
      expect(code).toContain('lowerLimit = -0.785f');
      expect(code).toContain('upperLimit = 0.785f');
      expect(code).toContain('ArticulationBody');
      expect(code).toContain('xDrive');
    });

    it('generates C# with safety rating', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'joint', 'SafeJoint', {
          joint_type: 'continuous',
          safety_rating: 'iso_10218',
        })
      );

      const code = roboticsToUnity(robotics);

      expect(code).toContain('safetyRating = "iso_10218"');
    });
  });

  describe('roboticsToGodot', () => {
    it('generates GDScript with joint angle control for revolute joints', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'joint', 'Wrist', {
          joint_type: 'revolute',
          lower: -1.0,
          upper: 1.0,
          effort: 30,
          velocity: 3.0,
        })
      );

      const code = roboticsToGodot(robotics);

      expect(code).toContain('extends Node3D');
      expect(code).toContain('joint_type: String = "revolute"');
      expect(code).toContain('lower_limit: float = -1');
      expect(code).toContain('signal joint_position_changed');
      expect(code).toContain('clampf(angle, -1, 1)');
    });

    it('omits joint angle functions for non-revolute joints', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'end_effector', 'Claw', {
          effector_type: 'parallel_gripper',
        })
      );

      const code = roboticsToGodot(robotics);

      expect(code).not.toContain('signal joint_position_changed');
    });
  });

  describe('roboticsToVRChat', () => {
    it('generates UdonSharp with synced joint angle', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'joint', 'VRArm', {
          joint_type: 'revolute',
          lower: -3.14,
          upper: 3.14,
          effort: 100,
          velocity: 2.0,
        })
      );

      const code = roboticsToVRChat(robotics);

      expect(code).toContain('UdonBehaviourSyncMode');
      expect(code).toContain('[UdonSynced] public float jointAngle');
      expect(code).toContain('lowerLimit = -3.14f');
    });
  });

  describe('roboticsToUSDA', () => {
    it('generates USD annotations for a joint', () => {
      const robotics = compileRoboticsBlock(
        makeBlock('robotics', 'joint', 'BaseRotation', {
          joint_type: 'continuous',
          lower: -6.28,
          upper: 6.28,
          effort: 200,
          velocity: 1.0,
          drive_type: 'velocity',
          safety_rating: 'iso_ts_15066',
        })
      );

      const code = roboticsToUSDA(robotics);

      expect(code).toContain('def Scope "Robotics_BaseRotation"');
      expect(code).toContain('holoscript:jointType = "continuous"');
      expect(code).toContain('holoscript:jointLower = -6.28');
      expect(code).toContain('holoscript:jointUpper = 6.28');
      expect(code).toContain('holoscript:driveType = "velocity"');
      expect(code).toContain('holoscript:safetyRating = "iso_ts_15066"');
    });
  });
});
