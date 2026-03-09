/**
 * Avatar Trait Integration Tests
 *
 * Tests complex combinations of avatar traits to validate that the parser
 * correctly handles real-world avatar configurations:
 * - VRChat-compatible avatar (skeleton + morph + clothing + VRC station)
 * - Full-body IK with locomotion (skeleton + ik + character)
 * - Social avatar with lip sync and expressions (morph + avatar_embodiment + body_tracking)
 * - Performance-optimized Quest 3 avatar (all traits + performance budget)
 * - Cross-platform export validation (VRM 1.0 metadata + multi-trait)
 *
 * @directive Integration tests for avatar trait combinations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

// Mock RBAC for compiler tests
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true }),
    }),
  };
});

/**
 * Helper to extract composition and object nodes from parse result.
 */
function getObjectFromResult(result: any, objectName?: string) {
  const ast = result.ast as any;
  const composition = ast?.children?.[0];
  if (!composition) return { composition: null, object: null };
  const objects = composition.children || [];
  const object = objectName ? objects.find((o: any) => o.name === objectName) : objects[0];
  return { composition, object };
}

/**
 * Helper to find a trait/directive by name from an object node.
 */
function findTrait(object: any, traitName: string) {
  if (!object?.directives) return undefined;
  return object.directives.find((d: any) => d.type === 'trait' && d.name === traitName);
}

/**
 * Count total traits on an object node.
 */
function countTraits(object: any): number {
  if (!object?.directives) return 0;
  return object.directives.filter((d: any) => d.type === 'trait').length;
}

describe('Avatar Trait Integration - VRChat Compatible Avatar', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should parse VRChat avatar with skeleton, morph, and clothing traits', () => {
    const code = `
      composition "VRChatAvatar" {
        object "VRCAvatar" {
          @skeleton {
            rigType: "humanoid"
            humanoidMap: {
              hips: "Hips"
              spine: "Spine"
              chest: "Chest"
              neck: "Neck"
              head: "Head"
              leftUpperArm: "Left arm"
              leftLowerArm: "Left elbow"
              leftHand: "Left wrist"
              rightUpperArm: "Right arm"
              rightLowerArm: "Right elbow"
              rightHand: "Right wrist"
              leftUpperLeg: "Left leg"
              leftLowerLeg: "Left knee"
              leftFoot: "Left ankle"
              rightUpperLeg: "Right leg"
              rightLowerLeg: "Right knee"
              rightFoot: "Right ankle"
            }
            clips: [
              { name: "Idle", duration: 3.33, loop: true, rootMotion: false }
              { name: "Walk", duration: 0.667, loop: true, rootMotion: true }
              { name: "Run", duration: 0.5, loop: true, rootMotion: true }
              { name: "Jump", duration: 0.5, loop: false, rootMotion: false }
              { name: "Dance", duration: 4.0, loop: true, rootMotion: false }
            ]
            blendTrees: {
              Locomotion: {
                type: "2D-freeform"
                parameter: "VelocityX"
                parameter2: "VelocityZ"
                motions: [
                  { clip: "Idle", position: { x: 0, y: 0 } }
                  { clip: "Walk", position: { x: 0, y: 1 }, speed: 1.0 }
                  { clip: "Run", position: { x: 0, y: 2 }, speed: 1.5 }
                ]
              }
            }
            layers: [
              { name: "Base", weight: 1.0, blendMode: "override" }
              { name: "Gesture", weight: 1.0, blendMode: "override", mask: ["LeftArm", "RightArm"] }
              { name: "Action", weight: 0.0, blendMode: "override" }
              { name: "FX", weight: 1.0, blendMode: "override" }
            ]
            parameters: {
              VelocityX: 0
              VelocityZ: 0
              Grounded: true
              Seated: false
              Viseme: 0
              GestureLeft: 0
              GestureRight: 0
            }
          }
          @morph {
            targets: [
              { name: "vrc.v_sil", weight: 1, category: "viseme" }
              { name: "vrc.v_pp", weight: 0, category: "viseme" }
              { name: "vrc.v_ff", weight: 0, category: "viseme" }
              { name: "vrc.v_th", weight: 0, category: "viseme" }
              { name: "vrc.v_dd", weight: 0, category: "viseme" }
              { name: "vrc.v_kk", weight: 0, category: "viseme" }
              { name: "vrc.v_ch", weight: 0, category: "viseme" }
              { name: "vrc.v_ss", weight: 0, category: "viseme" }
              { name: "vrc.v_nn", weight: 0, category: "viseme" }
              { name: "vrc.v_rr", weight: 0, category: "viseme" }
              { name: "vrc.v_aa", weight: 0, category: "viseme" }
              { name: "vrc.v_e", weight: 0, category: "viseme" }
              { name: "vrc.v_i", weight: 0, category: "viseme" }
              { name: "vrc.v_o", weight: 0, category: "viseme" }
              { name: "vrc.v_u", weight: 0, category: "viseme" }
              { name: "Blink", weight: 0, category: "eyes" }
              { name: "Happy", weight: 0, category: "expression" }
              { name: "Sad", weight: 0, category: "expression" }
              { name: "Angry", weight: 0, category: "expression" }
            ]
            autoBlink: {
              enabled: true
              targets: ["Blink"]
              interval: 3.5
              duration: 0.12
            }
          }
          @clothing {
            slots: [
              { name: "Hat", mesh: "Hat_Mesh", enabled: true, toggleParameter: "Hat_Toggle" }
              { name: "Jacket", mesh: "Jacket_Mesh", enabled: true, toggleParameter: "Jacket_Toggle" }
              { name: "Shoes", mesh: "Shoes_Mesh", enabled: true, toggleParameter: "Shoes_Toggle" }
            ]
            physics: {
              Hair: { gravity: 0.2, damping: 0.4, stiffness: 0.3 }
              Tail: { gravity: 0.3, damping: 0.5, stiffness: 0.2 }
            }
          }
          model: "/models/vrchat/avatar_base.fbx"
          scale: [1, 1, 1]
          performance: {
            maxTriangles: 7500
            maxMaterialSlots: 1
            maxBones: 75
            maxPhysBones: 8
            textureMemoryMB: 40
            combineMeshes: true
            atlasTextures: true
            maxTextureSize: 512
          }
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const { object } = getObjectFromResult(result, 'VRCAvatar');
    expect(object).toBeDefined();

    // Verify all 3 traits are present
    expect(countTraits(object)).toBe(3);

    // Skeleton trait validation
    const skeleton = findTrait(object, 'skeleton');
    expect(skeleton).toBeDefined();
    expect(skeleton?.config?.rigType).toBe('humanoid');
    expect(Object.keys(skeleton?.config?.humanoidMap || {}).length).toBeGreaterThanOrEqual(17);
    expect(skeleton?.config?.clips).toHaveLength(5);
    expect(skeleton?.config?.blendTrees?.Locomotion).toBeDefined();
    expect(skeleton?.config?.blendTrees?.Locomotion?.type).toBe('2D-freeform');
    expect(skeleton?.config?.layers).toHaveLength(4);
    expect(skeleton?.config?.parameters?.Grounded).toBe(true);

    // Morph trait validation - 15 visemes + blink + 3 expressions = 19
    const morph = findTrait(object, 'morph');
    expect(morph).toBeDefined();
    expect(morph?.config?.targets).toHaveLength(19);
    const visemes = morph?.config?.targets.filter((t: any) => t.category === 'viseme');
    expect(visemes.length).toBe(15);
    expect(morph?.config?.autoBlink?.enabled).toBe(true);

    // Clothing trait validation
    const clothing = findTrait(object, 'clothing');
    expect(clothing).toBeDefined();
    expect(clothing?.config?.slots).toHaveLength(3);
    expect(clothing?.config?.physics?.Hair).toBeDefined();

    // Performance properties
    expect(object?.properties?.performance?.maxTriangles).toBe(7500);
    expect(object?.properties?.performance?.maxTextureSize).toBe(512);
    expect(object?.properties?.performance?.combineMeshes).toBe(true);
  });
});

describe('Avatar Trait Integration - Full-Body IK with Locomotion', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should parse avatar with skeleton, dual IK chains, and character controller', () => {
    const code = `
      composition "IKLocomotion" {
        object "Player" {
          @skeleton {
            rigType: "humanoid"
            humanoidMap: {
              hips: "Hips"
              spine: "Spine"
              head: "Head"
              leftUpperLeg: "LeftUpLeg"
              leftLowerLeg: "LeftLeg"
              leftFoot: "LeftFoot"
              rightUpperLeg: "RightUpLeg"
              rightLowerLeg: "RightLeg"
              rightFoot: "RightFoot"
              leftUpperArm: "LeftArm"
              leftLowerArm: "LeftForeArm"
              leftHand: "LeftHand"
            }
            clips: [
              { name: "Idle", duration: 3.0, loop: true }
              { name: "Walk", duration: 1.0, loop: true }
              { name: "Run", duration: 0.5, loop: true }
              { name: "Crouch_Walk", duration: 1.2, loop: true }
              { name: "Climb_Up", duration: 0.8, loop: true }
              { name: "Swim_Forward", duration: 1.5, loop: true }
            ]
            blendTrees: {
              GroundMovement: {
                type: "2D-freeform"
                parameter: "MoveX"
                parameter2: "MoveZ"
                motions: [
                  { clip: "Idle", position: { x: 0, y: 0 } }
                  { clip: "Walk", position: { x: 0, y: 0.5 } }
                  { clip: "Run", position: { x: 0, y: 1.0 } }
                ]
              }
              CrouchMovement: {
                type: "1D"
                parameter: "CrouchSpeed"
                motions: [
                  { clip: "Idle", threshold: 0.0 }
                  { clip: "Crouch_Walk", threshold: 1.0 }
                ]
              }
            }
          }
          @ik {
            chain: {
              name: "LeftLeg"
              bones: [
                { name: "LeftUpLeg", length: 0.45, parent: "Hips" }
                { name: "LeftLeg", length: 0.42, parent: "LeftUpLeg" }
                { name: "LeftFoot", length: 0.08, parent: "LeftLeg" }
              ]
              solver: "two-bone"
              weight: 1.0
            }
            poleTarget: "LeftKneeHint"
            iterations: 5
            tolerance: 0.01
          }
          @character {
            height: 1.8
            radius: 0.3
            walkSpeed: 3.0
            runSpeed: 6.0
            sprintSpeed: 9.0
            crouchSpeed: 1.5
            jumpHeight: 1.2
            gravity: -9.81
            maxSlopeAngle: 45
            stepHeight: 0.3
            canCrouch: true
            canSprint: true
            canSwim: true
            swimSpeed: 3.5
            canClimb: true
            climbSpeed: 2.0
          }
          model: "/models/player.glb"
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const { object } = getObjectFromResult(result, 'Player');
    expect(object).toBeDefined();
    expect(countTraits(object)).toBe(3);

    // Skeleton with locomotion blend trees
    const skeleton = findTrait(object, 'skeleton');
    expect(skeleton).toBeDefined();
    expect(skeleton?.config?.clips).toHaveLength(6);
    expect(skeleton?.config?.blendTrees?.GroundMovement?.type).toBe('2D-freeform');
    expect(skeleton?.config?.blendTrees?.CrouchMovement?.type).toBe('1D');

    // IK chain
    const ik = findTrait(object, 'ik');
    expect(ik).toBeDefined();
    expect(ik?.config?.chain?.bones).toHaveLength(3);
    expect(ik?.config?.chain?.solver).toBe('two-bone');

    // Character controller with full locomotion modes
    const character = findTrait(object, 'character');
    expect(character).toBeDefined();
    expect(character?.config?.walkSpeed).toBe(3.0);
    expect(character?.config?.canSwim).toBe(true);
    expect(character?.config?.canClimb).toBe(true);
    expect(character?.config?.canCrouch).toBe(true);
  });
});

describe('Avatar Trait Integration - Social Avatar with Expression System', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should parse social avatar with morph, embodiment, and body tracking', () => {
    const code = `
      composition "SocialAvatar" {
        object "SocialCompanion" {
          @morph {
            targets: [
              { name: "blinkLeft", weight: 0, category: "eyes", min: 0, max: 1 }
              { name: "blinkRight", weight: 0, category: "eyes", min: 0, max: 1 }
              { name: "lookUp", weight: 0, category: "eyes" }
              { name: "lookDown", weight: 0, category: "eyes" }
              { name: "aa", weight: 0, category: "mouth" }
              { name: "ih", weight: 0, category: "mouth" }
              { name: "ou", weight: 0, category: "mouth" }
              { name: "ee", weight: 0, category: "mouth" }
              { name: "oh", weight: 0, category: "mouth" }
              { name: "neutral", weight: 1, category: "expression" }
              { name: "happy", weight: 0, category: "expression" }
              { name: "angry", weight: 0, category: "expression" }
              { name: "sad", weight: 0, category: "expression" }
              { name: "surprised", weight: 0, category: "expression" }
              { name: "relaxed", weight: 0, category: "expression" }
            ]
            presets: {
              greeting: { happy: 0.8, blendTime: 0.3 }
              thinking: { lookUp: 0.4, blendTime: 0.5 }
              listening: { neutral: 0.7, blendTime: 0.2 }
            }
            autoBlink: {
              enabled: true
              targets: ["blinkLeft", "blinkRight"]
              interval: 4.0
              duration: 0.15
              randomize: 2.0
            }
            lipSync: {
              enabled: true
              visemeMap: {
                sil: "neutral"
                PP: "oh"
                FF: "ee"
                aa: "aa"
                E: "ee"
                I: "ih"
                O: "oh"
                U: "ou"
              }
            }
          }
          @avatar_embodiment {
            tracking_source: "ai"
            ik_mode: "upper_body"
            lip_sync: true
            emotion_directives: true
            mirror_expressions: true
            eye_tracking_forward: true
            personal_space_radius: 0.5
          }
          @body_tracking {
            mode: "upper_body"
            joint_smoothing: 0.3
            prediction: true
            avatar_binding: true
            calibrate_on_start: true
            tracking_confidence_threshold: 0.7
          }
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const { object } = getObjectFromResult(result, 'SocialCompanion');
    expect(object).toBeDefined();
    expect(countTraits(object)).toBe(3);

    // Morph with full expression system
    const morph = findTrait(object, 'morph');
    expect(morph).toBeDefined();
    expect(morph?.config?.targets).toHaveLength(15);
    const expressions = morph?.config?.targets.filter((t: any) => t.category === 'expression');
    expect(expressions.length).toBe(6);
    expect(morph?.config?.presets?.greeting).toBeDefined();
    expect(morph?.config?.lipSync?.enabled).toBe(true);
    expect(Object.keys(morph?.config?.lipSync?.visemeMap || {}).length).toBe(8);

    // Avatar embodiment with AI tracking
    const embodiment = findTrait(object, 'avatar_embodiment');
    expect(embodiment).toBeDefined();
    expect(embodiment?.config?.tracking_source).toBe('ai');
    expect(embodiment?.config?.emotion_directives).toBe(true);
    expect(embodiment?.config?.lip_sync).toBe(true);

    // Body tracking
    const bodyTracking = findTrait(object, 'body_tracking');
    expect(bodyTracking).toBeDefined();
    expect(bodyTracking?.config?.mode).toBe('upper_body');
    expect(bodyTracking?.config?.prediction).toBe(true);
  });
});

describe('Avatar Trait Integration - Quest 3 Optimized Full Avatar', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should parse full avatar with all traits within Quest 3 performance budget', () => {
    const code = `
      composition "Quest3FullAvatar" {
        object "OptimizedAvatar" {
          @skeleton {
            rigType: "humanoid"
            humanoidMap: {
              hips: "Hips"
              spine: "Spine"
              chest: "Spine1"
              upperChest: "Spine2"
              neck: "Neck"
              head: "Head"
              leftShoulder: "LeftShoulder"
              leftUpperArm: "LeftArm"
              leftLowerArm: "LeftForeArm"
              leftHand: "LeftHand"
              rightShoulder: "RightShoulder"
              rightUpperArm: "RightArm"
              rightLowerArm: "RightForeArm"
              rightHand: "RightHand"
              leftUpperLeg: "LeftUpLeg"
              leftLowerLeg: "LeftLeg"
              leftFoot: "LeftFoot"
              leftToes: "LeftToeBase"
              rightUpperLeg: "RightUpLeg"
              rightLowerLeg: "RightLeg"
              rightFoot: "RightFoot"
              rightToes: "RightToeBase"
            }
            clips: [
              { name: "idle", duration: 3.0, loop: true }
              { name: "walk", duration: 1.0, loop: true }
              { name: "wave", duration: 2.0, loop: false }
              { name: "celebrate", duration: 2.5, loop: false }
            ]
            blendTrees: {
              locomotion: {
                type: "1D"
                parameter: "speed"
                motions: [
                  { clip: "idle", threshold: 0.0 }
                  { clip: "walk", threshold: 0.5 }
                ]
              }
            }
            rootMotion: true
          }
          @morph {
            targets: [
              { name: "blinkLeft", weight: 0, category: "eyes", min: 0, max: 1 }
              { name: "blinkRight", weight: 0, category: "eyes", min: 0, max: 1 }
              { name: "lookUp", weight: 0, category: "eyes" }
              { name: "lookDown", weight: 0, category: "eyes" }
              { name: "lookLeft", weight: 0, category: "eyes" }
              { name: "lookRight", weight: 0, category: "eyes" }
              { name: "aa", weight: 0, category: "mouth" }
              { name: "ih", weight: 0, category: "mouth" }
              { name: "ou", weight: 0, category: "mouth" }
              { name: "ee", weight: 0, category: "mouth" }
              { name: "oh", weight: 0, category: "mouth" }
              { name: "neutral", weight: 1, category: "expression" }
              { name: "happy", weight: 0, category: "expression" }
              { name: "angry", weight: 0, category: "expression" }
              { name: "sad", weight: 0, category: "expression" }
              { name: "relaxed", weight: 0, category: "expression" }
              { name: "surprised", weight: 0, category: "expression" }
            ]
            presets: {
              neutral: { neutral: 1.0, blendTime: 0.3 }
              happy: { happy: 1.0, blendTime: 0.3 }
            }
            autoBlink: {
              enabled: true
              targets: ["blinkLeft", "blinkRight"]
              interval: 4.0
              duration: 0.15
              randomize: 2.0
            }
            lipSync: {
              enabled: true
              visemeMap: {
                sil: "neutral"
                PP: "oh"
                FF: "ee"
                aa: "aa"
                E: "ee"
              }
            }
          }
          @ik {
            chain: {
              name: "LeftArm"
              bones: [
                { name: "LeftUpperArm", length: 0.28, parent: "LeftShoulder" }
                { name: "LeftLowerArm", length: 0.25, parent: "LeftUpperArm" }
                { name: "LeftHand", length: 0.08, parent: "LeftLowerArm" }
              ]
              solver: "fabrik"
              weight: 1.0
            }
            iterations: 10
            tolerance: 0.001
            stretch: false
          }
          @avatar_embodiment {
            tracking_source: "headset"
            ik_mode: "full_body"
            lip_sync: true
            emotion_directives: true
            mirror_expressions: true
            eye_tracking_forward: true
            personal_space_radius: 0.5
          }
          @body_tracking {
            mode: "full_body"
            joint_smoothing: 0.3
            prediction: true
            avatar_binding: true
            calibrate_on_start: true
            tracking_confidence_threshold: 0.6
          }
          model: "https://models.readyplayer.me/avatar.glb"
          scale: [1, 1, 1]
          performance: {
            lodLevels: 3
            maxDrawCalls: 1
            maxMaterialSlots: 3
            maxTriangles: 10000
            maxBoneInfluences: 4
            textureMaxSize: 1024
            useGPUSkinning: true
          }
          vrm: {
            version: "1.0"
            meta: {
              name: "Quest 3 Avatar"
              author: "HoloScript"
              allowedUserName: "Everyone"
              commercialUsage: "Allow"
              licenseName: "CC0"
            }
            humanoid: {
              armStretch: 0.05
              legStretch: 0.05
              upperArmTwist: 0.5
              lowerArmTwist: 0.5
              feetSpacing: 0.0
            }
            firstPerson: {
              meshAnnotations: [
                { mesh: "Body", firstPersonFlag: "ThirdPersonOnly" }
                { mesh: "Head", firstPersonFlag: "FirstPersonOnly" }
              ]
            }
            lookAt: {
              offsetFromHeadBone: [0, 0.06, 0]
              type: "bone"
            }
          }
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const { object } = getObjectFromResult(result, 'OptimizedAvatar');
    expect(object).toBeDefined();

    // All 5 VR traits should be present
    expect(countTraits(object)).toBe(5);

    // Validate each trait exists
    expect(findTrait(object, 'skeleton')).toBeDefined();
    expect(findTrait(object, 'morph')).toBeDefined();
    expect(findTrait(object, 'ik')).toBeDefined();
    expect(findTrait(object, 'avatar_embodiment')).toBeDefined();
    expect(findTrait(object, 'body_tracking')).toBeDefined();

    // Validate skeleton has 22 bone mappings (full humanoid)
    const skeleton = findTrait(object, 'skeleton');
    expect(Object.keys(skeleton?.config?.humanoidMap || {}).length).toBe(22);
    expect(skeleton?.config?.rootMotion).toBe(true);

    // Validate morph has 17 targets matching VRM 1.0 subset
    const morph = findTrait(object, 'morph');
    expect(morph?.config?.targets).toHaveLength(17);
    const eyeTargets = morph?.config?.targets.filter((t: any) => t.category === 'eyes');
    expect(eyeTargets.length).toBe(6);
    const mouthTargets = morph?.config?.targets.filter((t: any) => t.category === 'mouth');
    expect(mouthTargets.length).toBe(5);

    // Validate IK uses FABRIK solver
    const ik = findTrait(object, 'ik');
    expect(ik?.config?.chain?.solver).toBe('fabrik');
    expect(ik?.config?.iterations).toBe(10);

    // Quest 3 performance budget: 10K triangles
    expect(object?.properties?.performance?.maxTriangles).toBe(10000);
    expect(object?.properties?.performance?.maxBoneInfluences).toBe(4);
    expect(object?.properties?.performance?.textureMaxSize).toBe(1024);

    // VRM 1.0 metadata
    expect(object?.properties?.vrm?.version).toBe('1.0');
    expect(object?.properties?.vrm?.meta?.author).toBe('HoloScript');
    expect(object?.properties?.vrm?.humanoid?.armStretch).toBe(0.05);
    expect(object?.properties?.vrm?.firstPerson?.meshAnnotations).toHaveLength(2);
    expect(object?.properties?.vrm?.lookAt?.type).toBe('bone');
  });
});

describe('Avatar Trait Integration - Multi-Object Scene', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should parse scene with multiple avatar objects and environment', () => {
    const code = `
      composition "AvatarShowroom" {
        environment {
          backgroundColor: "#0d1117"
          ambient: 0.3
          shadows: true
        }

        object "PlayerAvatar" {
          @skeleton {
            rigType: "humanoid"
            humanoidMap: {
              hips: "Hips"
              head: "Head"
            }
            clips: [
              { name: "idle", duration: 3.0, loop: true }
            ]
          }
          @morph {
            targets: [
              { name: "blinkLeft", weight: 0, category: "eyes" }
              { name: "blinkRight", weight: 0, category: "eyes" }
            ]
            autoBlink: {
              enabled: true
              targets: ["blinkLeft", "blinkRight"]
              interval: 4.0
              duration: 0.15
            }
          }
          @avatar_embodiment {
            tracking_source: "headset"
            ik_mode: "full_body"
          }
          model: "/models/player.glb"
        }

        object "NPCAvatar" {
          @skeleton {
            rigType: "humanoid"
            humanoidMap: {
              hips: "Hips"
              head: "Head"
            }
            clips: [
              { name: "idle", duration: 3.0, loop: true }
              { name: "wave", duration: 2.0, loop: false }
              { name: "talk", duration: 1.5, loop: true }
            ]
          }
          @morph {
            targets: [
              { name: "happy", weight: 0, category: "expression" }
              { name: "neutral", weight: 1, category: "expression" }
            ]
            lipSync: {
              enabled: true
              visemeMap: {
                sil: "neutral"
                aa: "happy"
              }
            }
          }
          @avatar_embodiment {
            tracking_source: "ai"
            lip_sync: true
            emotion_directives: true
          }
          model: "/models/npc.glb"
          position: [2, 0, 0]
        }

        object "Pedestal" {
          geometry: "cylinder"
          position: [0, 0, 0]
          scale: [0.8, 0.05, 0.8]
          color: "#2a2a4a"
          material: {
            metalness: 0.8
            roughness: 0.2
          }
        }

        light "KeyLight" {
          type: "directional"
          color: "#ffffff"
          intensity: 1.0
          position: [2, 3, 2]
          cast_shadows: true
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const ast = result.ast as any;
    const composition = ast?.children?.[0];
    expect(composition).toBeDefined();
    expect(composition?.type).toBe('composition');
    expect(composition?.name).toBe('AvatarShowroom');

    // Scene has environment + 2 avatar objects + 1 pedestal + 1 light
    const children = composition?.children || [];
    expect(children.length).toBeGreaterThanOrEqual(4);

    // Player avatar
    const player = children.find((c: any) => c.name === 'PlayerAvatar');
    expect(player).toBeDefined();
    expect(countTraits(player)).toBe(3);
    expect(findTrait(player, 'skeleton')).toBeDefined();
    expect(findTrait(player, 'morph')).toBeDefined();
    expect(findTrait(player, 'avatar_embodiment')?.config?.tracking_source).toBe('headset');

    // NPC avatar with AI tracking
    const npc = children.find((c: any) => c.name === 'NPCAvatar');
    expect(npc).toBeDefined();
    expect(countTraits(npc)).toBe(3);
    expect(findTrait(npc, 'avatar_embodiment')?.config?.tracking_source).toBe('ai');
    expect(findTrait(npc, 'avatar_embodiment')?.config?.emotion_directives).toBe(true);

    // Pedestal is a simple geometry object
    const pedestal = children.find((c: any) => c.name === 'Pedestal');
    expect(pedestal).toBeDefined();
    expect(pedestal?.properties?.geometry).toBe('cylinder');
    expect(countTraits(pedestal)).toBe(0);

    // Light
    const light = children.find((c: any) => c.name === 'KeyLight');
    expect(light).toBeDefined();
  });
});

describe('Avatar Trait Integration - Trait Config Validation', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  it('should correctly parse traits with both parentheses and brace syntax', () => {
    const code = `
      composition "SyntaxTest" {
        object "AvatarParens" {
          @skeleton(rigType: "humanoid")
          @morph(autoBlink: { enabled: true })
          model: "avatar.glb"
        }
        object "AvatarBraces" {
          @skeleton {
            rigType: "humanoid"
          }
          @morph {
            autoBlink: {
              enabled: true
            }
          }
          model: "avatar.glb"
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const ast = result.ast as any;
    const composition = ast?.children?.[0];
    const objects = composition?.children || [];

    const parensObj = objects.find((o: any) => o.name === 'AvatarParens');
    const bracesObj = objects.find((o: any) => o.name === 'AvatarBraces');

    expect(parensObj).toBeDefined();
    expect(bracesObj).toBeDefined();

    // Both should have skeleton and morph traits
    const skelParens = findTrait(parensObj, 'skeleton');
    const skelBraces = findTrait(bracesObj, 'skeleton');
    expect(skelParens?.config?.rigType).toBe('humanoid');
    expect(skelBraces?.config?.rigType).toBe('humanoid');

    const morphParens = findTrait(parensObj, 'morph');
    const morphBraces = findTrait(bracesObj, 'morph');
    expect(morphParens?.config?.autoBlink?.enabled).toBe(true);
    expect(morphBraces?.config?.autoBlink?.enabled).toBe(true);
  });

  it('should parse VR traits with no config (bare decorators)', () => {
    const code = `
      composition "BareTraits" {
        object "MinimalAvatar" {
          @skeleton
          @morph
          @ik
          @avatar_embodiment
          @body_tracking
          model: "avatar.glb"
        }
      }
    `;

    const result = parser.parse(code);
    expect(result.success).toBe(true);
    expect(result.errors?.length || 0).toBe(0);

    const { object } = getObjectFromResult(result, 'MinimalAvatar');
    expect(object).toBeDefined();
    expect(countTraits(object)).toBe(5);

    // All traits should have empty config
    expect(findTrait(object, 'skeleton')?.config).toEqual({});
    expect(findTrait(object, 'morph')?.config).toEqual({});
    expect(findTrait(object, 'ik')?.config).toEqual({});
    expect(findTrait(object, 'avatar_embodiment')?.config).toEqual({});
    expect(findTrait(object, 'body_tracking')?.config).toEqual({});
  });
});
