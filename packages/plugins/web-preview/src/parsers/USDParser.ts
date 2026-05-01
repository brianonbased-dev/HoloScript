/**
 * Simple USD Parser for HoloScript-generated robot arms
 * Parses USD geometry and physics data into Three.js-renderable format
 */

export interface USDMesh {
  name: string;
  type: 'Cylinder' | 'Sphere' | 'Box';
  radius?: number;
  height?: number;
  position?: [number, number, number];
  color?: [number, number, number];
  isStatic?: boolean;
  mass?: number;
}

export interface USDJoint {
  name: string;
  parent: string;
  child: string;
  axis: 'X' | 'Y' | 'Z';
  lowerLimit: number;
  upperLimit: number;
  localPos0?: [number, number, number];
}

export interface USDScene {
  name: string;
  meshes: USDMesh[];
  joints: USDJoint[];
}

export class USDParser {
  parse(usdContent: string): USDScene {
    const lines = usdContent.split('\n');
    const meshes: USDMesh[] = [];
    const joints: USDJoint[] = [];
    let defaultPrim = '';

    // Extract default prim name
    const defaultPrimMatch = usdContent.match(/defaultPrim = "([^"]+)"/);
    if (defaultPrimMatch) {
      defaultPrim = defaultPrimMatch[1];
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      // Parse Cylinder
      if (line.startsWith('def Cylinder')) {
        const mesh = this.parseCylinder(lines, i);
        if (mesh) meshes.push(mesh);
      }

      // Parse Sphere
      if (line.startsWith('def Sphere')) {
        const mesh = this.parseSphere(lines, i);
        if (mesh) meshes.push(mesh);
      }

      // Parse Box
      if (line.startsWith('def Box')) {
        const mesh = this.parseBox(lines, i);
        if (mesh) meshes.push(mesh);
      }

      // Parse Joint
      if (line.startsWith('def PhysicsRevoluteJoint')) {
        const joint = this.parseJoint(lines, i);
        if (joint) joints.push(joint);
      }

      i++;
    }

    return { name: defaultPrim, meshes, joints };
  }

  private parseCylinder(lines: string[], startIdx: number): USDMesh | null {
    const defLine = lines[startIdx].trim();
    const nameMatch = defLine.match(/def Cylinder "([^"]+)"/);
    if (!nameMatch) return null;

    const mesh: USDMesh = {
      name: nameMatch[1],
      type: 'Cylinder',
    };

    // Parse properties within this def block
    let i = startIdx + 1;
    let braceDepth = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('{')) braceDepth++;
      if (line.includes('}')) {
        braceDepth--;
        if (braceDepth === 0) break;
      }

      // Parse radius
      const radiusMatch = line.match(/float radius = ([\d.]+)/);
      if (radiusMatch) mesh.radius = parseFloat(radiusMatch[1]);

      // Parse height
      const heightMatch = line.match(/float height = ([\d.]+)/);
      if (heightMatch) mesh.height = parseFloat(heightMatch[1]);

      // Parse position
      const posMatch = line.match(
        /double3 xformOp:translate = \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/
      );
      if (posMatch) {
        mesh.position = [parseFloat(posMatch[1]), parseFloat(posMatch[2]), parseFloat(posMatch[3])];
      }

      // Parse color
      const colorMatch = line.match(
        /color3f\[\] primvars:displayColor = \[\(([\d.]+), ([\d.]+), ([\d.]+)\)\]/
      );
      if (colorMatch) {
        mesh.color = [
          parseFloat(colorMatch[1]),
          parseFloat(colorMatch[2]),
          parseFloat(colorMatch[3]),
        ];
      }

      // Parse physics
      if (line.includes('physics:rigidBodyEnabled = false')) {
        mesh.isStatic = true;
      }

      const massMatch = line.match(/float physics:mass = ([\d.]+)/);
      if (massMatch) mesh.mass = parseFloat(massMatch[1]);

      i++;
    }

    return mesh;
  }

  private parseSphere(lines: string[], startIdx: number): USDMesh | null {
    const defLine = lines[startIdx].trim();
    const nameMatch = defLine.match(/def Sphere "([^"]+)"/);
    if (!nameMatch) return null;

    const mesh: USDMesh = {
      name: nameMatch[1],
      type: 'Sphere',
    };

    let i = startIdx + 1;
    let braceDepth = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('{')) braceDepth++;
      if (line.includes('}')) {
        braceDepth--;
        if (braceDepth === 0) break;
      }

      const radiusMatch = line.match(/float radius = ([\d.]+)/);
      if (radiusMatch) mesh.radius = parseFloat(radiusMatch[1]);

      const posMatch = line.match(
        /double3 xformOp:translate = \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/
      );
      if (posMatch) {
        mesh.position = [parseFloat(posMatch[1]), parseFloat(posMatch[2]), parseFloat(posMatch[3])];
      }

      const colorMatch = line.match(
        /color3f\[\] primvars:displayColor = \[\(([\d.]+), ([\d.]+), ([\d.]+)\)\]/
      );
      if (colorMatch) {
        mesh.color = [
          parseFloat(colorMatch[1]),
          parseFloat(colorMatch[2]),
          parseFloat(colorMatch[3]),
        ];
      }

      if (line.includes('physics:rigidBodyEnabled = false')) {
        mesh.isStatic = true;
      }

      i++;
    }

    return mesh;
  }

  private parseBox(lines: string[], startIdx: number): USDMesh | null {
    const defLine = lines[startIdx].trim();
    const nameMatch = defLine.match(/def Box "([^"]+)"/);
    if (!nameMatch) return null;

    const mesh: USDMesh = {
      name: nameMatch[1],
      type: 'Box',
    };

    let i = startIdx + 1;
    let braceDepth = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('{')) braceDepth++;
      if (line.includes('}')) {
        braceDepth--;
        if (braceDepth === 0) break;
      }

      const posMatch = line.match(
        /double3 xformOp:translate = \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/
      );
      if (posMatch) {
        mesh.position = [parseFloat(posMatch[1]), parseFloat(posMatch[2]), parseFloat(posMatch[3])];
      }

      const colorMatch = line.match(
        /color3f\[\] primvars:displayColor = \[\(([\d.]+), ([\d.]+), ([\d.]+)\)\]/
      );
      if (colorMatch) {
        mesh.color = [
          parseFloat(colorMatch[1]),
          parseFloat(colorMatch[2]),
          parseFloat(colorMatch[3]),
        ];
      }

      i++;
    }

    return mesh;
  }

  private parseJoint(lines: string[], startIdx: number): USDJoint | null {
    const defLine = lines[startIdx].trim();
    const nameMatch = defLine.match(/def PhysicsRevoluteJoint "([^"]+)"/);
    if (!nameMatch) return null;

    const joint: USDJoint = {
      name: nameMatch[1],
      parent: '',
      child: '',
      axis: 'Y',
      lowerLimit: 0,
      upperLimit: 0,
    };

    let i = startIdx + 1;
    let braceDepth = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('{')) braceDepth++;
      if (line.includes('}')) {
        braceDepth--;
        if (braceDepth === 0) break;
      }

      // Parse body references
      const body0Match = line.match(/rel physics:body0 = <\.\.\/([^>]+)>/);
      if (body0Match) {
        joint.parent = body0Match[1];
      }

      const body1Match = line.match(/rel physics:body1 = <\.\.\/([^>]+)>/);
      if (body1Match) {
        joint.child = body1Match[1];
      }

      // Parse axis
      const axisMatch = line.match(/uniform token physics:axis = "([^"]+)"/);
      if (axisMatch) joint.axis = axisMatch[1] as 'X' | 'Y' | 'Z';

      // Parse limits
      const lowerMatch = line.match(/float physics:lowerLimit = ([-\d.]+)/);
      if (lowerMatch) joint.lowerLimit = parseFloat(lowerMatch[1]);

      const upperMatch = line.match(/float physics:upperLimit = ([-\d.]+)/);
      if (upperMatch) joint.upperLimit = parseFloat(upperMatch[1]);

      // Parse local position
      const localPosMatch = line.match(
        /point3f physics:localPos0 = \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/
      );
      if (localPosMatch) {
        joint.localPos0 = [
          parseFloat(localPosMatch[1]),
          parseFloat(localPosMatch[2]),
          parseFloat(localPosMatch[3]),
        ];
      }

      i++;
    }

    return joint;
  }
}
