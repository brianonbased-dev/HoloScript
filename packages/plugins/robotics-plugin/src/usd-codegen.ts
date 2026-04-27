/**
 * HoloScript → USD Code Generator
 *
 * Generates Universal Scene Description (USD) files from HoloScript AST.
 * Targets NVIDIA Isaac Sim with UsdPhysics schema.
 */

import { CompositionNode, ObjectNode, PropertyValue } from './ast';

export class USDCodeGen {
  private output: string[] = [];
  private indentLevel: number = 0;

  generate(ast: CompositionNode): string {
    this.output = [];
    this.indentLevel = 0;

    // USD header
    this.emit('#usda 1.0');
    this.emit('(');
    this.indentLevel++;
    this.emit(`defaultPrim = "${ast.name}"`);
    this.emit('upAxis = "Z"');
    this.emit('metersPerUnit = 1.0');
    this.emit('kilogramsPerMass = 1.0');
    this.indentLevel--;
    this.emit(')');
    this.emit('');

    // Root articulation
    this.emit(`def Xform "${ast.name}" (`);
    this.indentLevel++;
    this.emit('prepend apiSchemas = ["PhysicsArticulationRootAPI"]');
    this.indentLevel--;
    this.emit(')');
    this.emit('{');
    this.indentLevel++;

    // Collect joints for later generation
    const joints: Array<{
      name: string;
      parent: string;
      child: string;
      props: Record<string, PropertyValue>;
    }> = [];

    // Separate joint and link objects
    const jointObjects: ObjectNode[] = [];
    const linkObjects: ObjectNode[] = [];

    for (const obj of ast.objects) {
      if (obj.traits.includes('joint_revolute') || obj.traits.includes('joint_prismatic')) {
        jointObjects.push(obj);
      } else {
        linkObjects.push(obj);
      }
    }

    // Generate links
    for (const obj of ast.objects) {
      if (obj.traits.includes('joint_revolute') || obj.traits.includes('joint_prismatic')) {
        // New template format: Joint is separate object
        // Check if there's a corresponding link (child of this joint)
        const childLink = linkObjects.find((link) => link.properties.parent === obj.name);

        if (childLink) {
          // Generate the child link
          this.generateLink(childLink);

          // Collect joint info
          const parent = (obj.properties.parent as string) || 'World';
          joints.push({
            name: obj.name,
            parent,
            child: childLink.name,
            props: obj.properties,
          });
        } else {
          // Old format: joint_parent property (backward compatibility)
          this.generateLink(obj);

          const parent = (obj.properties.joint_parent as string) || 'World';
          joints.push({
            name: `${obj.name}Joint`,
            parent,
            child: obj.name,
            props: obj.properties,
          });
        }
      } else {
        // Link object without joint (base, end effector, etc.)
        // Only generate if not already generated as child of a joint
        const isChildOfJoint = jointObjects.some((j) =>
          linkObjects.find((l) => l.properties.parent === j.name && l.name === obj.name)
        );

        if (!isChildOfJoint) {
          this.generateLink(obj);
        }
      }
    }

    // Generate joints after all links
    this.emit('');
    this.emit('# Joints');
    for (const joint of joints) {
      this.generateJoint(joint);
    }

    this.indentLevel--;
    this.emit('}');

    return this.output.join('\n');
  }

  private generateLink(obj: ObjectNode): void {
    const geometry = (obj.properties.geometry as string) || 'box';
    const usdType = this.geometryToUSD(geometry);
    const isStatic = obj.traits.includes('static');

    this.emit('');
    this.emit(`# ${obj.name}`);
    this.emit(`def ${usdType} "${obj.name}" (`);
    this.indentLevel++;

    // Add physics APIs (unless static)
    if (!isStatic) {
      this.emit(
        'prepend apiSchemas = ["PhysicsCollisionAPI", "PhysicsRigidBodyAPI", "PhysicsMassAPI"]'
      );
    }

    this.indentLevel--;
    this.emit(')');
    this.emit('{');
    this.indentLevel++;

    // Geometry dimensions (support both array and individual properties)
    if (geometry === 'cylinder') {
      let radius: number, height: number;

      if (obj.properties.dimensions) {
        // Old format: dimensions: [radius, height]
        const dims = obj.properties.dimensions as number[];
        [radius, height] = dims;
      } else {
        // New format: radius: 0.2, height/length: 0.2
        radius = (obj.properties.radius as number) || 0.1;
        height = ((obj.properties.height || obj.properties.length) as number) || 0.1;
      }

      this.emit(`float radius = ${radius}`);
      this.emit(`float height = ${height}`);
    } else if (geometry === 'box') {
      let length: number, width: number, height: number;

      if (obj.properties.dimensions) {
        // Old format: dimensions: [length, width, height]
        const dims = obj.properties.dimensions as number[];
        [length, width, height] = dims;
      } else {
        // New format: length: 1.0, width: 0.1, height: 0.1
        length = (obj.properties.length as number) || 1.0;
        width = (obj.properties.width as number) || 1.0;
        height = (obj.properties.height as number) || 1.0;
      }

      this.emit('double size = 1.0');
      this.emit(`float3 xformOp:scale = (${length}, ${width}, ${height})`);
      this.emit('uniform token[] xformOpOrder = ["xformOp:scale"]');
    } else if (geometry === 'sphere') {
      let radius: number;

      if (obj.properties.dimensions) {
        // Old format: dimensions: [radius]
        const dims = obj.properties.dimensions as number[];
        [radius] = dims;
      } else {
        // New format: radius: 0.08
        radius = (obj.properties.radius as number) || 0.1;
      }

      this.emit(`float radius = ${radius}`);
    }

    // Color/Material
    if (obj.properties.color) {
      const color = obj.properties.color as number[];
      const [r, g, b] = color;
      this.emit(`color3f[] primvars:displayColor = [(${r}, ${g}, ${b})]`);
    } else if (obj.properties.material) {
      // Default colors based on material
      const materialColors: Record<string, string> = {
        metal: '0.6, 0.6, 0.65',
        plastic: '0.8, 0.8, 0.8',
        wood: '0.6, 0.4, 0.2',
        glass: '0.9, 0.9, 1.0',
      };
      const material = obj.properties.material as string;
      const color = materialColors[material] || '0.8, 0.8, 0.8';
      this.emit(`color3f[] primvars:displayColor = [(${color})]`);
    }

    // Physics properties
    if (!isStatic) {
      this.emit('');
      this.emit('# Physics properties');

      const mass = (obj.properties.mass as number) || 1.0;
      this.emit(`float physics:mass = ${mass}`);

      if (obj.properties.inertia) {
        const inertia = obj.properties.inertia as number[];
        this.emit(`float3 physics:diagonalInertia = (${inertia[0]}, ${inertia[1]}, ${inertia[2]})`);
      }

      this.emit('uniform token physics:approximation = "convexHull"');
    } else {
      this.emit('');
      this.emit('# Static object');
      this.emit('uniform token physics:rigidBodyEnabled = false');
    }

    // Position (if specified)
    if (obj.properties.position) {
      const pos = obj.properties.position as number[];
      this.emit('');
      this.emit(`double3 xformOp:translate = (${pos[0]}, ${pos[1]}, ${pos[2]})`);
      if (!obj.properties.dimensions) {
        this.emit('uniform token[] xformOpOrder = ["xformOp:translate"]');
      }
    }

    this.indentLevel--;
    this.emit('}');
  }

  private generateJoint(joint: {
    name: string;
    parent: string;
    child: string;
    props: Record<string, PropertyValue>;
  }): void {
    this.emit('');
    this.emit(`def PhysicsRevoluteJoint "${joint.name}"`);
    this.emit('{');
    this.indentLevel++;

    // Body references
    this.emit(`rel physics:body0 = <../${joint.parent}>`);
    this.emit(`rel physics:body1 = <../${joint.child}>`);
    this.emit('');

    // Joint frames
    const origin = joint.props.joint_origin || joint.props.position;
    if (origin) {
      const pos = origin as number[];
      this.emit(`point3f physics:localPos0 = (${pos[0]}, ${pos[1]}, ${pos[2]})`);
    } else {
      this.emit('point3f physics:localPos0 = (0, 0, 0)');
    }
    this.emit('quatf physics:localRot0 = (1, 0, 0, 0)');
    this.emit('');
    this.emit('point3f physics:localPos1 = (0, 0, 0)');
    this.emit('quatf physics:localRot1 = (1, 0, 0, 0)');
    this.emit('');

    // Joint axis (support both old and new property names)
    const axis = joint.props.joint_axis || joint.props.axis;
    if (axis) {
      const axisVec = axis as number[];
      const axisName = this.vectorToAxisName(axisVec);
      this.emit(`uniform token physics:axis = "${axisName}"`);
    } else {
      this.emit('uniform token physics:axis = "Y"');
    }
    this.emit('');

    // Joint limits (support both old and new property names)
    const limits = joint.props.joint_limits || joint.props.limits;
    if (limits) {
      const limitsVec = limits as number[];
      this.emit(`float physics:lowerLimit = ${limitsVec[0]}`);
      this.emit(`float physics:upperLimit = ${limitsVec[1]}`);
    }
    this.emit('');

    // Joint dynamics (support both old and new property names)
    const effort = joint.props.joint_effort || joint.props.max_effort;
    if (effort) {
      this.emit(`float physics:maxForce = ${effort}`);
    }

    const velocity = joint.props.max_velocity;
    if (velocity) {
      this.emit(`float physics:maxVelocity = ${velocity}`);
    }

    this.indentLevel--;
    this.emit('}');
  }

  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }

  private emit(line: string): void {
    this.output.push(this.indent() + line);
  }

  private geometryToUSD(geometry: string): string {
    const mapping: Record<string, string> = {
      cylinder: 'Cylinder',
      box: 'Cube',
      sphere: 'Sphere',
      cone: 'Cone',
      plane: 'Plane',
      torus: 'Torus',
    };
    return mapping[geometry] || 'Cube';
  }

  private vectorToAxisName(axis: number[]): string {
    const [x = 0, y = 0, z = 1] = axis;

    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > Math.abs(z)) {
      return 'X';
    } else if (Math.abs(y) > Math.abs(z)) {
      return 'Y';
    } else {
      return 'Z';
    }
  }
}
