import { describe, expect, it } from 'vitest';
import { autoRigHandler, createNativeAutoRigPlan, generatedMeshHandler } from '../AutoRigTrait';

function createContext() {
  const events: Array<{ type: string; payload: unknown }> = [];
  return {
    events,
    emit(type: string, payload?: unknown) {
      events.push({ type, payload });
    },
  };
}

describe('AutoRigTrait', () => {
  it('creates a humanoid skeleton plan with animation-compatible metadata', () => {
    const plan = createNativeAutoRigPlan({ rig: 'humanoid', pose: 'a-pose' });

    expect(plan.source).toBe('native-holoscript');
    expect(plan.topology).toBe('animation-compatible');
    expect(plan.skeleton.rigType).toBe('humanoid');
    expect(plan.boneCount).toBe(21);
    expect(plan.humanoidMap?.leftHand).toBe('left_hand');
    expect(plan.animationCompatibility.standard).toBe('HoloScriptHumanoid21');
    expect(plan.animationCompatibility.retargetTargets).toContain('Unity Humanoid');
  });

  it('changes the arm bind pose between t-pose and a-pose', () => {
    const tPose = createNativeAutoRigPlan({ rig: 'humanoid', pose: 't-pose' });
    const aPose = createNativeAutoRigPlan({ rig: 'humanoid', pose: 'a-pose' });

    const tUpperArm = tPose.skeleton.bones?.find((bone) => bone.name === 'left_upper_arm');
    const aUpperArm = aPose.skeleton.bones?.find((bone) => bone.name === 'left_upper_arm');

    expect(tUpperArm?.bindPose.position[1]).toBe(0);
    expect(aUpperArm?.bindPose.position[1]).toBeLessThan(0);
  });

  it('creates a custom envelope skeleton when requested', () => {
    const plan = createNativeAutoRigPlan({ rig: 'custom' });

    expect(plan.skeleton.rigType).toBe('custom');
    expect(plan.boneCount).toBe(7);
    expect(plan.humanoidMap).toBeUndefined();
    expect(plan.weighting.solver).toBe('custom-envelope-seed');
  });

  it('emits generated mesh and skeleton bind events from handlers', () => {
    const node = {} as any;
    const meshCtx = createContext();
    const rigCtx = createContext();

    generatedMeshHandler.onAttach?.(
      node,
      { model: 'hero.glb', provider: 'meshy', topology: 'animation-compatible' },
      meshCtx as any
    );
    autoRigHandler.onAttach?.(
      node,
      { rig: 'humanoid', pose: 't-pose', sourceMesh: 'hero.glb' },
      rigCtx as any
    );

    expect(node.__generatedMesh.model).toBe('hero.glb');
    expect(node.__autoRigPlan.skeleton.rigType).toBe('humanoid');
    expect(meshCtx.events.map((event) => event.type)).toContain('generated_mesh_attached');
    expect(rigCtx.events.map((event) => event.type)).toEqual(['auto_rig_bound', 'skeleton_bind']);
  });
});
