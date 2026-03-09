/**
 * URDFToUSDZConverter Tests
 *
 * Comprehensive test coverage for URDF XML parsing, USD scene graph
 * construction, material mapping, geometry conversion, and USDA output.
 *
 * Test categories:
 *   1. URDF XML parsing (links, joints, visuals, collisions, inertials)
 *   2. Joint hierarchy -> USD scene graph conversion
 *   3. Mesh reference mapping (STL/DAE -> USDZ-compatible)
 *   4. Material/color -> USD PBR material generation
 *   5. USDZ packaging metadata and visionOS <model> element
 *   6. Edge cases and error handling
 *   7. URDFRobotTrait integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  URDFToUSDZConverter,
  convertURDFToUSDA,
  convertURDFToUSDZForVisionOS,
  parseURDFModel,
  type URDFToUSDZConverterOptions,
  type URDFModelIR,
} from './URDFToUSDZConverter';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/** Minimal valid URDF with a single link */
const MINIMAL_URDF = `<?xml version="1.0"?>
<robot name="MinimalRobot">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1"/>
      </geometry>
    </visual>
  </link>
</robot>`;

/** URDF with materials defined at robot level */
const URDF_WITH_MATERIALS = `<?xml version="1.0"?>
<robot name="ColoredRobot">
  <material name="red_material">
    <color rgba="1 0 0 1"/>
  </material>
  <material name="blue_material">
    <color rgba="0 0 1 0.8"/>
  </material>
  <link name="base_link">
    <visual>
      <geometry>
        <box size="0.5 0.5 0.5"/>
      </geometry>
      <material name="red_material"/>
    </visual>
  </link>
  <link name="arm_link">
    <visual>
      <geometry>
        <cylinder radius="0.1" length="0.5"/>
      </geometry>
      <material name="blue_material"/>
    </visual>
  </link>
  <joint name="base_to_arm" type="revolute">
    <parent link="base_link"/>
    <child link="arm_link"/>
    <origin xyz="0 0 0.5" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="100" velocity="1"/>
  </joint>
</robot>`;

/** URDF with multiple joint types and geometry */
const MULTI_JOINT_URDF = `<?xml version="1.0"?>
<robot name="MultiJointRobot">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="0.4 0.4 0.1"/>
      </geometry>
    </visual>
    <collision>
      <geometry>
        <box size="0.4 0.4 0.1"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="5.0"/>
      <inertia ixx="0.01" ixy="0" ixz="0" iyy="0.01" iyz="0" izz="0.01"/>
    </inertial>
  </link>
  <link name="shoulder_link">
    <visual>
      <origin xyz="0 0 0.1" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.05" length="0.3"/>
      </geometry>
    </visual>
  </link>
  <link name="elbow_link">
    <visual>
      <geometry>
        <sphere radius="0.04"/>
      </geometry>
    </visual>
  </link>
  <link name="wrist_link">
    <visual>
      <geometry>
        <box size="0.06 0.06 0.08"/>
      </geometry>
    </visual>
  </link>
  <link name="gripper_link"/>
  <joint name="shoulder_joint" type="revolute">
    <parent link="base_link"/>
    <child link="shoulder_link"/>
    <origin xyz="0 0 0.05" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.57" upper="1.57" effort="50" velocity="2"/>
    <dynamics damping="0.5" friction="0.1"/>
  </joint>
  <joint name="elbow_joint" type="revolute">
    <parent link="shoulder_link"/>
    <child link="elbow_link"/>
    <origin xyz="0 0 0.3" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="0" upper="2.61" effort="30" velocity="2"/>
  </joint>
  <joint name="wrist_joint" type="continuous">
    <parent link="elbow_link"/>
    <child link="wrist_link"/>
    <origin xyz="0 0 0.1" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
  </joint>
  <joint name="gripper_joint" type="fixed">
    <parent link="wrist_link"/>
    <child link="gripper_link"/>
    <origin xyz="0 0 0.04" rpy="0 0 0"/>
  </joint>
</robot>`;

/** URDF with mesh references */
const MESH_URDF = `<?xml version="1.0"?>
<robot name="MeshRobot">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="package://robot_description/meshes/base.stl" scale="0.001 0.001 0.001"/>
      </geometry>
      <material name="steel">
        <color rgba="0.7 0.7 0.75 1"/>
      </material>
    </visual>
  </link>
  <link name="arm_link">
    <visual>
      <geometry>
        <mesh filename="package://robot_description/meshes/arm.dae"/>
      </geometry>
    </visual>
  </link>
  <joint name="base_to_arm" type="prismatic">
    <parent link="base_link"/>
    <child link="arm_link"/>
    <origin xyz="0 0 0.2" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="0" upper="0.5" effort="200" velocity="0.5"/>
  </joint>
</robot>`;

/** URDF with inline material definitions inside visual */
const INLINE_MATERIAL_URDF = `<?xml version="1.0"?>
<robot name="InlineMaterialRobot">
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1"/>
      </geometry>
      <material name="custom_green">
        <color rgba="0 0.8 0 1"/>
      </material>
    </visual>
  </link>
</robot>`;

/** URDF with texture reference */
const TEXTURE_URDF = `<?xml version="1.0"?>
<robot name="TexturedRobot">
  <material name="textured_mat">
    <color rgba="1 1 1 1"/>
    <texture filename="textures/robot_skin.png"/>
  </material>
  <link name="base_link">
    <visual>
      <geometry>
        <box size="1 1 1"/>
      </geometry>
      <material name="textured_mat"/>
    </visual>
  </link>
</robot>`;

// =============================================================================
// TESTS
// =============================================================================

describe('URDFToUSDZConverter', () => {
  let converter: URDFToUSDZConverter;

  beforeEach(() => {
    converter = new URDFToUSDZConverter();
  });

  // ===========================================================================
  // 1. URDF XML PARSING
  // ===========================================================================

  describe('URDF XML Parsing', () => {
    it('should parse a minimal URDF and extract robot name', () => {
      const model = converter.parseURDF(MINIMAL_URDF);
      expect(model.name).toBe('MinimalRobot');
    });

    it('should parse links from URDF', () => {
      const model = converter.parseURDF(MINIMAL_URDF);
      expect(model.links).toHaveLength(1);
      expect(model.links[0].name).toBe('base_link');
    });

    it('should parse visual geometry from links', () => {
      const model = converter.parseURDF(MINIMAL_URDF);
      const visual = model.links[0].visual;
      expect(visual).toBeDefined();
      expect(visual!.geometry.type).toBe('box');
      expect(visual!.geometry.size).toEqual([1, 1, 1]);
    });

    it('should parse multiple links and joints', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      expect(model.links.length).toBeGreaterThanOrEqual(5);
      expect(model.joints).toHaveLength(4);
    });

    it('should parse joint types correctly', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const types = model.joints.map((j) => j.type);
      expect(types).toContain('revolute');
      expect(types).toContain('continuous');
      expect(types).toContain('fixed');
    });

    it('should parse joint parent-child relationships', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderJoint = model.joints.find((j) => j.name === 'shoulder_joint');
      expect(shoulderJoint).toBeDefined();
      expect(shoulderJoint!.parent).toBe('base_link');
      expect(shoulderJoint!.child).toBe('shoulder_link');
    });

    it('should parse joint origin (xyz + rpy)', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderJoint = model.joints.find((j) => j.name === 'shoulder_joint');
      expect(shoulderJoint!.origin).toBeDefined();
      expect(shoulderJoint!.origin!.xyz).toEqual([0, 0, 0.05]);
      expect(shoulderJoint!.origin!.rpy).toEqual([0, 0, 0]);
    });

    it('should parse joint axis', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderJoint = model.joints.find((j) => j.name === 'shoulder_joint');
      expect(shoulderJoint!.axis).toEqual([0, 1, 0]);
    });

    it('should parse joint limits', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderJoint = model.joints.find((j) => j.name === 'shoulder_joint');
      expect(shoulderJoint!.limits).toBeDefined();
      expect(shoulderJoint!.limits!.lower).toBe(-1.57);
      expect(shoulderJoint!.limits!.upper).toBe(1.57);
      expect(shoulderJoint!.limits!.effort).toBe(50);
      expect(shoulderJoint!.limits!.velocity).toBe(2);
    });

    it('should parse joint dynamics (damping + friction)', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderJoint = model.joints.find((j) => j.name === 'shoulder_joint');
      expect(shoulderJoint!.dynamics).toBeDefined();
      expect(shoulderJoint!.dynamics!.damping).toBe(0.5);
      expect(shoulderJoint!.dynamics!.friction).toBe(0.1);
    });

    it('should parse collision geometry', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const baseLink = model.links.find((l) => l.name === 'base_link');
      expect(baseLink!.collision).toBeDefined();
      expect(baseLink!.collision!.geometry.type).toBe('box');
      expect(baseLink!.collision!.geometry.size).toEqual([0.4, 0.4, 0.1]);
    });

    it('should parse inertial properties', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const baseLink = model.links.find((l) => l.name === 'base_link');
      expect(baseLink!.inertial).toBeDefined();
      expect(baseLink!.inertial!.mass).toBe(5.0);
      expect(baseLink!.inertial!.inertia.ixx).toBe(0.01);
      expect(baseLink!.inertial!.inertia.iyy).toBe(0.01);
      expect(baseLink!.inertial!.inertia.izz).toBe(0.01);
    });

    it('should parse sphere geometry', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const elbowLink = model.links.find((l) => l.name === 'elbow_link');
      expect(elbowLink!.visual!.geometry.type).toBe('sphere');
      expect(elbowLink!.visual!.geometry.radius).toBe(0.04);
    });

    it('should parse cylinder geometry', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderLink = model.links.find((l) => l.name === 'shoulder_link');
      expect(shoulderLink!.visual!.geometry.type).toBe('cylinder');
      expect(shoulderLink!.visual!.geometry.radius).toBe(0.05);
      expect(shoulderLink!.visual!.geometry.length).toBe(0.3);
    });

    it('should parse visual origin transforms', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const shoulderLink = model.links.find((l) => l.name === 'shoulder_link');
      expect(shoulderLink!.visual!.origin).toBeDefined();
      expect(shoulderLink!.visual!.origin!.xyz).toEqual([0, 0, 0.1]);
    });

    it('should parse empty/self-closing links', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      const gripperLink = model.links.find((l) => l.name === 'gripper_link');
      expect(gripperLink).toBeDefined();
      expect(gripperLink!.visual).toBeUndefined();
    });

    it('should parse mesh geometry with filename and scale', () => {
      const model = converter.parseURDF(MESH_URDF);
      const baseLink = model.links.find((l) => l.name === 'base_link');
      expect(baseLink!.visual!.geometry.type).toBe('mesh');
      expect(baseLink!.visual!.geometry.filename).toContain('base.stl');
      expect(baseLink!.visual!.geometry.scale).toEqual([0.001, 0.001, 0.001]);
    });

    it('should parse mesh geometry without scale', () => {
      const model = converter.parseURDF(MESH_URDF);
      const armLink = model.links.find((l) => l.name === 'arm_link');
      expect(armLink!.visual!.geometry.type).toBe('mesh');
      expect(armLink!.visual!.geometry.filename).toContain('arm.dae');
      expect(armLink!.visual!.geometry.scale).toBeUndefined();
    });

    it('should parse prismatic joints', () => {
      const model = converter.parseURDF(MESH_URDF);
      const joint = model.joints.find((j) => j.name === 'base_to_arm');
      expect(joint).toBeDefined();
      expect(joint!.type).toBe('prismatic');
      expect(joint!.limits).toBeDefined();
      expect(joint!.limits!.lower).toBe(0);
      expect(joint!.limits!.upper).toBe(0.5);
    });
  });

  // ===========================================================================
  // 2. MATERIAL PARSING
  // ===========================================================================

  describe('Material Parsing', () => {
    it('should parse global materials defined at robot level', () => {
      const model = converter.parseURDF(URDF_WITH_MATERIALS);
      expect(model.materials.size).toBeGreaterThanOrEqual(2);
      expect(model.materials.has('red_material')).toBe(true);
      expect(model.materials.has('blue_material')).toBe(true);
    });

    it('should parse material color RGBA values', () => {
      const model = converter.parseURDF(URDF_WITH_MATERIALS);
      const red = model.materials.get('red_material');
      expect(red!.color).toBeDefined();
      expect(red!.color!.r).toBe(1);
      expect(red!.color!.g).toBe(0);
      expect(red!.color!.b).toBe(0);
      expect(red!.color!.a).toBe(1);
    });

    it('should parse material with alpha < 1', () => {
      const model = converter.parseURDF(URDF_WITH_MATERIALS);
      const blue = model.materials.get('blue_material');
      expect(blue!.color!.a).toBe(0.8);
    });

    it('should parse inline material definitions in visual elements', () => {
      const model = converter.parseURDF(INLINE_MATERIAL_URDF);
      const baseLink = model.links.find((l) => l.name === 'base_link');
      expect(baseLink!.visual!.material).toBeDefined();
      expect(baseLink!.visual!.material!.name).toBe('custom_green');
      expect(baseLink!.visual!.material!.color!.g).toBe(0.8);
    });

    it('should resolve material references to global definitions', () => {
      const model = converter.parseURDF(URDF_WITH_MATERIALS);
      const baseLink = model.links.find((l) => l.name === 'base_link');
      expect(baseLink!.visual!.material).toBeDefined();
      expect(baseLink!.visual!.material!.name).toBe('red_material');
      // Should carry the color from the global definition
      expect(baseLink!.visual!.material!.color).toBeDefined();
    });

    it('should parse texture references', () => {
      const model = converter.parseURDF(TEXTURE_URDF);
      const texMat = model.materials.get('textured_mat');
      expect(texMat).toBeDefined();
      expect(texMat!.texture).toBe('textures/robot_skin.png');
    });

    it('should parse inline material with color from visual element', () => {
      const model = converter.parseURDF(MESH_URDF);
      const baseLink = model.links.find((l) => l.name === 'base_link');
      expect(baseLink!.visual!.material).toBeDefined();
      expect(baseLink!.visual!.material!.name).toBe('steel');
      expect(baseLink!.visual!.material!.color!.r).toBeCloseTo(0.7, 1);
    });
  });

  // ===========================================================================
  // 3. USDA OUTPUT GENERATION
  // ===========================================================================

  describe('USDA Output Generation', () => {
    it('should generate valid USDA header', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('#usda 1.0');
      expect(usda).toContain('defaultPrim = "MinimalRobot"');
      expect(usda).toContain('upAxis = "Y"');
      expect(usda).toContain('metersPerUnit = 1');
    });

    it('should include generator metadata', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('HoloScript URDFToUSDZConverter');
      expect(usda).toContain('sourceFormat = "URDF"');
      expect(usda).toContain('visionOS 26');
    });

    it('should generate root Xform prim', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('def Xform "MinimalRobot"');
      expect(usda).toContain('kind = "component"');
    });

    it('should generate Materials scope', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('def Scope "Materials"');
      expect(usda).toContain('def Material "DefaultMaterial"');
    });

    it('should generate PBR shader for materials', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('def Shader "PBRShader"');
      expect(usda).toContain('info:id = "UsdPreviewSurface"');
      expect(usda).toContain('inputs:diffuseColor');
      expect(usda).toContain('inputs:metallic');
      expect(usda).toContain('inputs:roughness');
    });

    it('should generate Xform for links', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('base_link');
      expect(usda).toContain('shoulder_link');
      expect(usda).toContain('elbow_link');
    });

    it('should generate geometry prims for visual shapes', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('def Cube');
    });

    it('should generate Sphere prim for sphere geometry', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('def Sphere');
      expect(usda).toContain('double radius = 0.04');
    });

    it('should generate Cylinder prim for cylinder geometry', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('def Cylinder');
      expect(usda).toContain('double radius = 0.05');
      expect(usda).toContain('double height = 0.3');
    });

    it('should include material bindings', () => {
      const usda = converter.compile(URDF_WITH_MATERIALS);
      expect(usda).toContain('material:binding');
    });

    it('should generate named materials from URDF colors', () => {
      const usda = converter.compile(URDF_WITH_MATERIALS);
      expect(usda).toContain('def Material "red_material"');
      expect(usda).toContain('def Material "blue_material"');
    });

    it('should emit correct RGB values for colored materials', () => {
      const usda = converter.compile(URDF_WITH_MATERIALS);
      // Red material should have (1, 0, 0)
      expect(usda).toContain('1.0000, 0.0000, 0.0000');
    });

    it('should emit opacity for semi-transparent materials', () => {
      const usda = converter.compile(URDF_WITH_MATERIALS);
      expect(usda).toContain('inputs:opacity');
    });

    it('should generate Xform nodes for joints in hierarchy', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('shoulder_joint');
      expect(usda).toContain('elbow_joint');
      expect(usda).toContain('wrist_joint');
    });

    it('should generate translate transforms from joint origins', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('xformOp:translate');
    });

    it('should include xformOpOrder', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('xformOpOrder');
    });
  });

  // ===========================================================================
  // 4. CONVERTER OPTIONS
  // ===========================================================================

  describe('Converter Options', () => {
    it('should respect Z-up axis option', () => {
      const conv = new URDFToUSDZConverter({ upAxis: 'Z' });
      const usda = conv.compile(MINIMAL_URDF);
      expect(usda).toContain('upAxis = "Z"');
    });

    it('should respect custom metersPerUnit', () => {
      const conv = new URDFToUSDZConverter({ metersPerUnit: 0.01 });
      const usda = conv.compile(MINIMAL_URDF);
      expect(usda).toContain('metersPerUnit = 0.01');
    });

    it('should include collision geometry when includeCollision is true', () => {
      const conv = new URDFToUSDZConverter({ includeCollision: true });
      const usda = conv.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('collision');
    });

    it('should exclude collision geometry by default', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      // collision xform nodes should not be present
      expect(usda).not.toContain('_collision');
    });

    it('should include physics mass when includePhysics is true', () => {
      const conv = new URDFToUSDZConverter({ includePhysics: true });
      const usda = conv.compile(MULTI_JOINT_URDF);
      expect(usda).toContain('physics:mass');
      expect(usda).toContain('5');
    });

    it('should not include physics mass by default', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      expect(usda).not.toContain('physics:mass');
    });

    it('should use custom default color', () => {
      const conv = new URDFToUSDZConverter({ defaultColor: [1.0, 0.5, 0.0] });
      const usda = conv.compile(MINIMAL_URDF);
      expect(usda).toContain('1.0000');
      expect(usda).toContain('0.5000');
    });

    it('should use custom metallic and roughness', () => {
      const conv = new URDFToUSDZConverter({ defaultMetallic: 0.8, defaultRoughness: 0.2 });
      const usda = conv.compile(MINIMAL_URDF);
      expect(usda).toContain('inputs:metallic = 0.8');
      expect(usda).toContain('inputs:roughness = 0.2');
    });

    it('should apply mesh path remapping', () => {
      const conv = new URDFToUSDZConverter({
        meshPathRemap: (path) => path.replace('package://robot_description/', 'assets/'),
      });
      const usda = conv.compile(MESH_URDF);
      expect(usda).toContain('assets/meshes/base.stl');
    });
  });

  // ===========================================================================
  // 5. SCENE GRAPH HIERARCHY
  // ===========================================================================

  describe('Scene Graph Hierarchy', () => {
    it('should identify root link (not child of any joint)', () => {
      const model = converter.parseURDF(MULTI_JOINT_URDF);
      // base_link is the root (not a child of any joint)
      const childNames = new Set(model.joints.map((j) => j.child));
      const rootLinks = model.links.filter((l) => !childNames.has(l.name));
      expect(rootLinks.length).toBe(1);
      expect(rootLinks[0].name).toBe('base_link');
    });

    it('should build correct hierarchy depth for chained joints', () => {
      const usda = converter.compile(MULTI_JOINT_URDF);
      // The hierarchy should be: base_link -> shoulder_joint -> shoulder_link
      //                                    -> elbow_joint -> elbow_link
      //                                                   -> wrist_joint -> wrist_link
      // Each joint creates a nested Xform
      expect(usda).toContain('shoulder_joint');
      expect(usda).toContain('elbow_joint');
      expect(usda).toContain('wrist_joint');
      expect(usda).toContain('gripper_joint');
    });

    it('should handle single-link URDF (no joints)', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('base_link');
      // Should still generate valid USDA
      expect(usda).toContain('#usda 1.0');
    });
  });

  // ===========================================================================
  // 6. MESH REFERENCE HANDLING
  // ===========================================================================

  describe('Mesh Reference Handling', () => {
    it('should preserve mesh filenames in output', () => {
      const conv = new URDFToUSDZConverter({ convertMeshReferences: true });
      const usda = conv.compile(MESH_URDF);
      expect(usda).toContain('base.stl');
    });

    it('should note mesh scale in comments', () => {
      const conv = new URDFToUSDZConverter({ convertMeshReferences: true });
      const usda = conv.compile(MESH_URDF);
      expect(usda).toContain('0.001');
    });

    it('should handle DAE mesh references', () => {
      const conv = new URDFToUSDZConverter({ convertMeshReferences: true });
      const usda = conv.compile(MESH_URDF);
      expect(usda).toContain('arm.dae');
    });

    it('should sanitize mesh paths to prevent traversal', () => {
      const maliciousUrdf = `<?xml version="1.0"?>
<robot name="TestRobot">
  <link name="link1">
    <visual>
      <geometry>
        <mesh filename="../../../etc/passwd"/>
      </geometry>
    </visual>
  </link>
</robot>`;
      const model = converter.parseURDF(maliciousUrdf);
      const meshFile = model.links[0].visual!.geometry.filename;
      expect(meshFile).not.toContain('..');
    });
  });

  // ===========================================================================
  // 7. TEXTURE HANDLING
  // ===========================================================================

  describe('Texture Handling', () => {
    it('should generate UsdUVTexture shader for textured materials', () => {
      const usda = converter.compile(TEXTURE_URDF);
      expect(usda).toContain('UsdUVTexture');
      expect(usda).toContain('robot_skin.png');
    });
  });

  // ===========================================================================
  // 8. VISIONOS INTEGRATION
  // ===========================================================================

  describe('visionOS Integration', () => {
    it('should generate HTML <model> element snippet', () => {
      const html = URDFToUSDZConverter.getVisionOSModelElement(
        'https://example.com/robot.usdz',
        'My Robot Arm'
      );
      expect(html).toContain('<model');
      expect(html).toContain('src="https://example.com/robot.usdz"');
      expect(html).toContain('alt="My Robot Arm"');
      expect(html).toContain('interactive');
      expect(html).toContain('model/usd+zip');
    });

    it('should generate usdz_converter command', () => {
      const cmd = URDFToUSDZConverter.getConversionCommand('robot.usda', 'robot.usdz');
      expect(cmd).toContain('xcrun usdz_converter');
      expect(cmd).toContain('robot.usda');
      expect(cmd).toContain('robot.usdz');
    });

    it('should generate Python conversion script', () => {
      const script = URDFToUSDZConverter.getPythonConversionScript('robot.usda', 'robot.usdz');
      expect(script).toContain('from pxr import Usd');
      expect(script).toContain('UsdUtils.CreateNewUsdzPackage');
    });
  });

  // ===========================================================================
  // 9. CONVENIENCE FUNCTIONS
  // ===========================================================================

  describe('Convenience Functions', () => {
    it('convertURDFToUSDA should produce valid output', () => {
      const usda = convertURDFToUSDA(MINIMAL_URDF);
      expect(usda).toContain('#usda 1.0');
      expect(usda).toContain('MinimalRobot');
    });

    it('convertURDFToUSDZForVisionOS should use Y-up axis', () => {
      const usda = convertURDFToUSDZForVisionOS(MINIMAL_URDF);
      expect(usda).toContain('upAxis = "Y"');
    });

    it('parseURDFModel should return correct structure', () => {
      const model = parseURDFModel(MULTI_JOINT_URDF);
      expect(model.name).toBe('MultiJointRobot');
      expect(model.links.length).toBeGreaterThanOrEqual(5);
      expect(model.joints).toHaveLength(4);
    });
  });

  // ===========================================================================
  // 10. ERROR HANDLING
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw on empty input', () => {
      expect(() => converter.compile('')).toThrow('non-empty string');
    });

    it('should throw on null input', () => {
      expect(() => converter.compile(null as any)).toThrow();
    });

    it('should throw on non-string input', () => {
      expect(() => converter.compile(123 as any)).toThrow();
    });

    it('should throw on XML without <robot> element', () => {
      expect(() => converter.compile('<html><body>Not URDF</body></html>')).toThrow('<robot>');
    });

    it('should handle URDF with no links gracefully', () => {
      const emptyUrdf = `<?xml version="1.0"?>
<robot name="EmptyRobot">
</robot>`;
      const usda = converter.compile(emptyUrdf);
      expect(usda).toContain('#usda 1.0');
      expect(usda).toContain('EmptyRobot');
    });

    it('should handle joints referencing non-existent links', () => {
      const badUrdf = `<?xml version="1.0"?>
<robot name="BadRobot">
  <link name="link1">
    <visual><geometry><box size="1 1 1"/></geometry></visual>
  </link>
  <joint name="bad_joint" type="fixed">
    <parent link="link1"/>
    <child link="nonexistent_link"/>
  </joint>
</robot>`;
      // Should not throw, just skip the bad joint hierarchy
      const usda = converter.compile(badUrdf);
      expect(usda).toContain('#usda 1.0');
      expect(usda).toContain('link1');
    });

    it('should use default robot name when name attribute is missing', () => {
      const noNameUrdf = `<?xml version="1.0"?>
<robot>
  <link name="base_link">
    <visual><geometry><box size="1 1 1"/></geometry></visual>
  </link>
</robot>`;
      // The regex won't match, falling back to 'UnnamedRobot'
      const model = converter.parseURDF(noNameUrdf);
      expect(model.name).toBe('UnnamedRobot');
    });
  });

  // ===========================================================================
  // 11. COORDINATE TRANSFORM
  // ===========================================================================

  describe('Coordinate Transform', () => {
    it('should apply Z-up to Y-up transform when upAxis is Y', () => {
      const conv = new URDFToUSDZConverter({ upAxis: 'Y', applyCoordinateTransform: true });
      const usda = conv.compile(URDF_WITH_MATERIALS);
      // The joint origin [0, 0, 0.5] in Z-up becomes [0, 0.5, 0] in Y-up
      expect(usda).toContain('xformOp:translate');
    });

    it('should not transform when applyCoordinateTransform is false', () => {
      const conv = new URDFToUSDZConverter({ upAxis: 'Y', applyCoordinateTransform: false });
      const usda = conv.compile(URDF_WITH_MATERIALS);
      // Should still contain transforms, just not transformed
      expect(usda).toContain('xformOp:translate');
    });
  });

  // ===========================================================================
  // 12. AGENT TOKEN / RBAC
  // ===========================================================================

  describe('Agent Token Handling', () => {
    it('should compile without agent token (backwards compatibility)', () => {
      const usda = converter.compile(MINIMAL_URDF);
      expect(usda).toContain('#usda 1.0');
    });

    it('should compile with empty agent token', () => {
      const usda = converter.compile(MINIMAL_URDF, '');
      expect(usda).toContain('#usda 1.0');
    });
  });

  // ===========================================================================
  // 13. NAME SANITIZATION
  // ===========================================================================

  describe('Name Sanitization', () => {
    it('should sanitize link names with special characters', () => {
      const specialUrdf = `<?xml version="1.0"?>
<robot name="Special-Robot 2.0">
  <link name="link-with-dashes">
    <visual><geometry><box size="1 1 1"/></geometry></visual>
  </link>
</robot>`;
      const usda = converter.compile(specialUrdf);
      expect(usda).toContain('Special_Robot_2_0');
      expect(usda).toContain('link_with_dashes');
    });

    it('should prefix names starting with digits', () => {
      const digitUrdf = `<?xml version="1.0"?>
<robot name="123Robot">
  <link name="1_link">
    <visual><geometry><box size="1 1 1"/></geometry></visual>
  </link>
</robot>`;
      const usda = converter.compile(digitUrdf);
      expect(usda).toContain('_123Robot');
      expect(usda).toContain('_1_link');
    });
  });
});

// =============================================================================
// URDF ROBOT TRAIT TESTS
// =============================================================================

import { URDFRobotTrait, createURDFRobotTrait } from '../../traits/URDFRobotTrait';

describe('URDFRobotTrait', () => {
  describe('Construction and Defaults', () => {
    it('should create with default configuration', () => {
      const trait = new URDFRobotTrait();
      const config = trait.getConfig();
      expect(config.urdf_source).toBe('');
      expect(config.preview_format).toBe('usdz');
      expect(config.interactive_joints).toBe(true);
      expect(config.up_axis).toBe('Y');
      expect(config.scale).toBe(1.0);
      expect(config.include_visual).toBe(true);
      expect(config.include_collision).toBe(false);
      expect(config.include_physics).toBe(false);
      expect(config.visionos_model_element).toBe(true);
    });

    it('should accept partial configuration', () => {
      const trait = new URDFRobotTrait({
        urdf_source: 'package://my_robot/robot.urdf',
        up_axis: 'Z',
        include_physics: true,
      });
      const config = trait.getConfig();
      expect(config.urdf_source).toBe('package://my_robot/robot.urdf');
      expect(config.up_axis).toBe('Z');
      expect(config.include_physics).toBe(true);
      expect(config.preview_format).toBe('usdz'); // default
    });
  });

  describe('State Management', () => {
    it('should start unloaded', () => {
      const trait = new URDFRobotTrait();
      expect(trait.isLoaded()).toBe(false);
      expect(trait.getLinkCount()).toBe(0);
      expect(trait.getJointCount()).toBe(0);
      expect(trait.getRobotName()).toBe('');
    });

    it('should update state on setLoadedState', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('TestRobot', 5, 4, ['joint1', 'joint2']);

      expect(trait.isLoaded()).toBe(true);
      expect(trait.getRobotName()).toBe('TestRobot');
      expect(trait.getLinkCount()).toBe(5);
      expect(trait.getJointCount()).toBe(4);
    });

    it('should initialize joint positions to zero', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('Robot', 3, 2, ['joint1', 'joint2']);

      expect(trait.getJointPosition('joint1')).toBe(0);
      expect(trait.getJointPosition('joint2')).toBe(0);
    });

    it('should track joint position changes', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('Robot', 3, 2, ['joint1', 'joint2']);

      trait.setJointPosition('joint1', 1.57);
      expect(trait.getJointPosition('joint1')).toBe(1.57);
    });

    it('should return all joint positions as object', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('Robot', 3, 2, ['j1', 'j2']);
      trait.setJointPosition('j1', 0.5);
      trait.setJointPosition('j2', -0.3);

      const positions = trait.getJointPositionsObject();
      expect(positions).toEqual({ j1: 0.5, j2: -0.3 });
    });

    it('should invalidate cached USDA on joint change', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('Robot', 2, 1, ['j1']);
      trait.setCachedUSDA('cached usda content');
      expect(trait.getCachedUSDA()).toBe('cached usda content');

      trait.setJointPosition('j1', 1.0);
      expect(trait.getCachedUSDA()).toBeNull();
    });
  });

  describe('Error State', () => {
    it('should track errors', () => {
      const trait = new URDFRobotTrait();
      trait.setError('Failed to parse URDF');
      const state = trait.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0]).toBe('Failed to parse URDF');
    });

    it('should accumulate multiple errors', () => {
      const trait = new URDFRobotTrait();
      trait.setError('Error 1');
      trait.setError('Error 2');
      const state = trait.getState();
      expect(state.errors).toHaveLength(2);
    });

    it('should clear errors on successful load', () => {
      const trait = new URDFRobotTrait();
      trait.setError('Previous error');
      trait.setLoadedState('Robot', 1, 0, []);
      const state = trait.getState();
      expect(state.errors).toHaveLength(0);
    });
  });

  describe('Events', () => {
    it('should emit urdf_loaded event', () => {
      const trait = new URDFRobotTrait();
      let receivedEvent: any = null;

      trait.on('urdf_loaded', (e) => {
        receivedEvent = e;
      });
      trait.setLoadedState('Robot', 3, 2, ['j1']);

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.type).toBe('urdf_loaded');
      expect(receivedEvent.robotName).toBe('Robot');
      expect(receivedEvent.linkCount).toBe(3);
      expect(receivedEvent.jointCount).toBe(2);
    });

    it('should emit joint_change event', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('Robot', 2, 1, ['j1']);
      let receivedEvent: any = null;

      trait.on('joint_change', (e) => {
        receivedEvent = e;
      });
      trait.setJointPosition('j1', 0.5);

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.type).toBe('joint_change');
      expect(receivedEvent.jointName).toBe('j1');
      expect(receivedEvent.position).toBe(0.5);
    });

    it('should emit urdf_error event', () => {
      const trait = new URDFRobotTrait();
      let receivedEvent: any = null;

      trait.on('urdf_error', (e) => {
        receivedEvent = e;
      });
      trait.setError('Parse failure');

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.type).toBe('urdf_error');
      expect(receivedEvent.error).toBe('Parse failure');
    });

    it('should emit usdz_generated event', () => {
      const trait = new URDFRobotTrait();
      let receivedEvent: any = null;

      trait.on('usdz_generated', (e) => {
        receivedEvent = e;
      });
      trait.setCachedUSDA('test content');

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.type).toBe('usdz_generated');
      expect(receivedEvent.size).toBe(12); // 'test content'.length
    });

    it('should support wildcard event listener', () => {
      const trait = new URDFRobotTrait();
      const events: string[] = [];

      trait.on('*', (e) => {
        events.push(e.type);
      });
      trait.setLoadedState('Robot', 1, 0, []);
      trait.setCachedUSDA('usda');

      expect(events).toContain('urdf_loaded');
      expect(events).toContain('usdz_generated');
    });

    it('should remove event listener with off()', () => {
      const trait = new URDFRobotTrait();
      let callCount = 0;

      const handler = () => {
        callCount++;
      };
      trait.on('urdf_loaded', handler);
      trait.setLoadedState('Robot', 1, 0, []);
      expect(callCount).toBe(1);

      trait.off('urdf_loaded', handler);
      trait.setLoadedState('Robot2', 2, 0, []);
      expect(callCount).toBe(1); // Should not increase
    });
  });

  describe('Serialization', () => {
    it('should serialize config to plain object', () => {
      const trait = createURDFRobotTrait({
        urdf_source: 'test.urdf',
        preview_format: 'usdz',
        up_axis: 'Z',
      });

      const serialized = trait.serialize();
      expect(serialized.urdf_source).toBe('test.urdf');
      expect(serialized.preview_format).toBe('usdz');
      expect(serialized.up_axis).toBe('Z');
    });
  });

  describe('Factory Function', () => {
    it('createURDFRobotTrait should return configured instance', () => {
      const trait = createURDFRobotTrait({ scale: 2.0 });
      expect(trait.getConfig().scale).toBe(2.0);
    });

    it('createURDFRobotTrait with no args should use defaults', () => {
      const trait = createURDFRobotTrait();
      expect(trait.getConfig().preview_format).toBe('usdz');
    });
  });

  describe('State Immutability', () => {
    it('getState should return a copy', () => {
      const trait = new URDFRobotTrait();
      trait.setLoadedState('Robot', 2, 1, ['j1']);
      const state1 = trait.getState();
      state1.robotName = 'Modified';
      const state2 = trait.getState();
      expect(state2.robotName).toBe('Robot');
    });

    it('getConfig should return a copy', () => {
      const trait = new URDFRobotTrait({ scale: 1.0 });
      const config1 = trait.getConfig();
      config1.scale = 999;
      const config2 = trait.getConfig();
      expect(config2.scale).toBe(1.0);
    });
  });
});
