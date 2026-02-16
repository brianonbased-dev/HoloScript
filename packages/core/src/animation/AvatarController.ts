/**
 * AvatarController.ts
 *
 * Maps VR input sources (HMD, Controllers) to IK Solver targets.
 * Handles calibration and VRIK logic (spine handling, shoulder offsets).
 *
 * @module animation
 */

import { IKSolver } from './IKSolver';
import { BoneSystem } from './BoneSystem';

export interface AvatarInput {
  head: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } };
  leftHand: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } };
  rightHand: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } };
  height: number;
}

export class AvatarController {
  private solver: IKSolver;
  private bones: BoneSystem;
  private calibrated = false;
  
  // Configuration for VRIK
  private config = {
    headOffset: { x: 0, y: -0.1, z: 0 }, // Neck pivot relative to HMD
    shoulderWidth: 0.4,
    spineLength: 0.6,
  };

  constructor(solver: IKSolver, bones: BoneSystem) {
    this.solver = solver;
    this.bones = bones;
  }

  /**
   * Calibrate avatar scale based on user height
   */
  calibrate(userHeight: number): void {
    // scale bones based on user height vs default avatar height
    // simplifed for now
    this.calibrated = true;
  }

  /**
   * Update IK targets from VR input
   */
  update(input: AvatarInput): void {
    if (!this.calibrated) return;

    // 1. Head / Spine
    // In a full VRIK system, we'd solve the spine. 
    // Here we map the head target directly for the neck/head chain ideally.
    // For now, let's assume we update the root position and rotation based on head.
    
    // 2. Arms
    this.solver.setTarget('leftArm', input.leftHand.position.x, input.leftHand.position.y, input.leftHand.position.z);
    this.solver.setTarget('rightArm', input.rightHand.position.x, input.rightHand.position.y, input.rightHand.position.z);
    
    // Set orientations if solver supported it (IKSolver currently only does position targets for chains)
    // We would manually set rotation of end effectors (hands) in BoneSystem
    const leftHandBone = this.bones.getBone('LeftHand');
    if (leftHandBone) {
      // In a real impl, we'd convert world rot to local or set world directly
      // BoneSystem.setLocalTransform is available.
      // We might need a helper to set world rotation.
    }

    // 3. Solve
    this.solver.solveAll();
  }
}
