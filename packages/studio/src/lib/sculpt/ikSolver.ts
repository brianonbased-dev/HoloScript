import * as THREE from 'three';

/**
 * Inverse Kinematics (IK) Solver
 * 
 * Uses Cyclic Coordinate Descent (CCD) or a simple Jacobian pseudo-inverse
 * to articulate robotic arm joints towards a target end-effector position.
 * 
 * This allows the 'robot-engineer' template users to grab the end of a mechanical
 * arm in VR, while the solver automatically rotates the base and elbow joints
 * to follow the grab-point realistically.
 */

export interface IKJoint {
  mesh: THREE.Object3D;
  axis: THREE.Vector3;  // The local axis of rotation (e.g., Vector3(1,0,0) for pitch)
  minAngle: number;
  maxAngle: number;
}

export class IKSolver {
  private joints: IKJoint[] = [];
  private endEffector: THREE.Object3D | null = null;
  private maxIterations = 15;
  private tolerance = 0.01;

  constructor(joints: IKJoint[], endEffector: THREE.Object3D) {
    this.joints = joints;
    this.endEffector = endEffector;
  }

  /**
   * Solves the IK chain using Cyclic Coordinate Descent (CCD).
   * Iterates backwards from the tip to the root, aligning each joint
   * to point towards the target.
   * 
   * @param targetPosition The world-space coordinate the arm should reach
   */
  public solve(targetPosition: THREE.Vector3): boolean {
    if (!this.endEffector || this.joints.length === 0) return false;

    // Temporary vectors to avoid garbage collection during the loop
    const _effectorPos = new THREE.Vector3();
    const _jointPos = new THREE.Vector3();
    const _toEffector = new THREE.Vector3();
    const _toTarget = new THREE.Vector3();
    const _axisWorld = new THREE.Vector3();

    for (let iter = 0; iter < this.maxIterations; iter++) {
      this.endEffector.getWorldPosition(_effectorPos);
      
      // If we are close enough, stop early
      if (_effectorPos.distanceToSquared(targetPosition) < this.tolerance * this.tolerance) {
        return true;
      }

      // Iterate backwards from the end effector
      for (let i = this.joints.length - 1; i >= 0; i--) {
        const joint = this.joints[i];
        
        joint.mesh.getWorldPosition(_jointPos);
        this.endEffector.getWorldPosition(_effectorPos);

        // Vector from joint to current effector pos
        _toEffector.subVectors(_effectorPos, _jointPos).normalize();
        
        // Vector from joint to target
        _toTarget.subVectors(targetPosition, _jointPos).normalize();

        // Find the joint's constraint axis in world space
        _axisWorld.copy(joint.axis).applyQuaternion(joint.mesh.parent ? joint.mesh.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()).normalize();

        // Project vectors onto the plane normal to the rotation axis
        const t1 = _toEffector.clone().sub(_axisWorld.clone().multiplyScalar(_toEffector.dot(_axisWorld))).normalize();
        const t2 = _toTarget.clone().sub(_axisWorld.clone().multiplyScalar(_toTarget.dot(_axisWorld))).normalize();

        // Calculate needed angle
        let angle = Math.acos(THREE.MathUtils.clamp(t1.dot(t2), -1, 1));
        
        // Determine direction using cross product
        const cross = new THREE.Vector3().crossVectors(t1, t2);
        if (cross.dot(_axisWorld) < 0) {
          angle = -angle;
        }

        // Apply rotation to the joint locally
        if (Math.abs(angle) > 0.001) {
          joint.mesh.rotateOnAxis(joint.axis, angle);

          // Needs a world matrix update for the next joint in the chain
          joint.mesh.updateMatrixWorld(true);
        }
      }
    }

    return false; // Did not reach within tolerance, but got as close as possible
  }
}
