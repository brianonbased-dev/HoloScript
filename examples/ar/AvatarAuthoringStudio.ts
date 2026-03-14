/**
 * AvatarAuthoringStudio.ts
 *
 * VRM avatar authoring using @pixiv/three-vrm. Provides blend shape editing,
 * bone mapping, spring bone configuration, and VRM metadata editing.
 * Designed for use in Hololand's VR avatar pipeline.
 *
 * Staging area file for Hololand integration (TODO-031).
 *
 * @version 1.0.0
 * @package hololand/avatar
 */

// =============================================================================
// VRM Metadata Types
// =============================================================================

/** VRM specification version */
export type VRMVersion = '0.0' | '1.0';

/** Allowed use policy */
export type VRMAllowedUser = 'OnlyAuthor' | 'ExplicitlyLicensedPerson' | 'Everyone';

/** License type */
export type VRMLicenseType =
  | 'Redistribution_Prohibited'
  | 'CC0'
  | 'CC_BY'
  | 'CC_BY_NC'
  | 'CC_BY_SA'
  | 'CC_BY_NC_SA'
  | 'CC_BY_ND'
  | 'CC_BY_NC_ND'
  | 'Other';

/** Commercial use policy */
export type VRMCommercialUse = 'personalNonProfit' | 'personalProfit' | 'corporation';

/** VRM metadata (VRM 1.0 specification) */
export interface VRMMetadata {
  name: string;
  version: string;
  authors: string[];
  contactInformation?: string;
  references?: string[];
  thumbnailImage?: string; // base64 or URL
  avatarPermission: VRMAllowedUser;
  allowExcessivelyViolentUsage: boolean;
  allowExcessivelySexualUsage: boolean;
  commercialUsage: VRMCommercialUse;
  allowPoliticalOrReligiousUsage: boolean;
  allowAntisocialOrHateUsage: boolean;
  creditNotation: 'required' | 'unnecessary';
  allowRedistribution: boolean;
  modification: 'prohibited' | 'allowModification' | 'allowModificationRedistribution';
  licenseUrl?: string;
  otherLicenseUrl?: string;
}

// =============================================================================
// Bone Mapping Types
// =============================================================================

/** VRM humanoid bone names (VRM 1.0) */
export type VRMHumanBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'jaw'
  | 'leftEye'
  | 'rightEye'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'leftToes'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'
  | 'rightToes'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftThumbMetacarpal'
  | 'leftThumbProximal'
  | 'leftThumbDistal'
  | 'leftIndexProximal'
  | 'leftIndexIntermediate'
  | 'leftIndexDistal'
  | 'leftMiddleProximal'
  | 'leftMiddleIntermediate'
  | 'leftMiddleDistal'
  | 'leftRingProximal'
  | 'leftRingIntermediate'
  | 'leftRingDistal'
  | 'leftLittleProximal'
  | 'leftLittleIntermediate'
  | 'leftLittleDistal'
  | 'rightThumbMetacarpal'
  | 'rightThumbProximal'
  | 'rightThumbDistal'
  | 'rightIndexProximal'
  | 'rightIndexIntermediate'
  | 'rightIndexDistal'
  | 'rightMiddleProximal'
  | 'rightMiddleIntermediate'
  | 'rightMiddleDistal'
  | 'rightRingProximal'
  | 'rightRingIntermediate'
  | 'rightRingDistal'
  | 'rightLittleProximal'
  | 'rightLittleIntermediate'
  | 'rightLittleDistal';

/** Required bones per VRM 1.0 spec */
export const VRM_REQUIRED_BONES: VRMHumanBoneName[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

/** Bone mapping entry: VRM bone name to skeleton node name */
export interface BoneMapping {
  vrmBone: VRMHumanBoneName;
  nodeName: string;
  /** Optional rest pose offset (Euler angles in radians) */
  restPoseOffset?: [number, number, number];
}

/** Bone mapping validation result */
export interface BoneMappingValidation {
  isValid: boolean;
  missingRequired: VRMHumanBoneName[];
  warnings: string[];
  mappedCount: number;
  totalRequired: number;
}

// =============================================================================
// Blend Shape / Expression Types
// =============================================================================

/** VRM expression preset names */
export type VRMExpressionPreset =
  | 'happy'
  | 'angry'
  | 'sad'
  | 'relaxed'
  | 'surprised'
  | 'neutral'
  | 'aa'
  | 'ih'
  | 'ou'
  | 'ee'
  | 'oh'
  | 'blink'
  | 'blinkLeft'
  | 'blinkRight'
  | 'lookUp'
  | 'lookDown'
  | 'lookLeft'
  | 'lookRight';

/** Morph target binding for a blend shape */
export interface MorphTargetBinding {
  /** Mesh name in the glTF scene */
  meshName: string;
  /** Morph target index on the mesh */
  morphTargetIndex: number;
  /** Weight at full expression (0-1) */
  weight: number;
}

/** Material color binding for an expression */
export interface MaterialColorBinding {
  materialName: string;
  propertyName: 'color' | 'emissionColor' | 'shadeColor' | 'rimColor' | 'outlineColor';
  targetValue: [number, number, number, number]; // RGBA
}

/** Texture transform binding for an expression */
export interface TextureTransformBinding {
  materialName: string;
  propertyName: string;
  scale?: [number, number];
  offset?: [number, number];
}

/** VRM expression definition */
export interface VRMExpression {
  name: string;
  preset?: VRMExpressionPreset;
  isBinary: boolean;
  morphTargetBindings: MorphTargetBinding[];
  materialColorBindings: MaterialColorBinding[];
  textureTransformBindings: TextureTransformBinding[];
  /** Override settings for this expression */
  overrideBlink?: 'none' | 'block' | 'blend';
  overrideLookAt?: 'none' | 'block' | 'blend';
  overrideMouth?: 'none' | 'block' | 'blend';
}

// =============================================================================
// Spring Bone Types
// =============================================================================

/** Spring bone joint definition */
export interface SpringBoneJoint {
  /** Node name in the skeleton */
  nodeName: string;
  /** Hit radius for collision */
  hitRadius: number;
  /** Stiffness force (0-4 typical) */
  stiffness: number;
  /** Gravity influence (0-1) */
  gravityPower: number;
  /** Gravity direction override */
  gravityDir: [number, number, number];
  /** Drag coefficient (0-1) */
  dragForce: number;
}

/** Spring bone chain (a set of joints that simulate together) */
export interface SpringBoneChain {
  name: string;
  joints: SpringBoneJoint[];
  /** Optional collider group references */
  colliderGroupNames: string[];
  /** Center space node (e.g., head for hair) */
  centerNodeName?: string;
}

/** Collider shape */
export type ColliderShape =
  | { type: 'sphere'; offset: [number, number, number]; radius: number }
  | { type: 'capsule'; offset: [number, number, number]; tail: [number, number, number]; radius: number };

/** Collider group for spring bone collision */
export interface SpringBoneColliderGroup {
  name: string;
  /** Node this collider group is attached to */
  nodeName: string;
  colliders: ColliderShape[];
}

/** Full spring bone configuration */
export interface SpringBoneConfig {
  chains: SpringBoneChain[];
  colliderGroups: SpringBoneColliderGroup[];
}

// =============================================================================
// Avatar Authoring Studio
// =============================================================================

/** Validation result for the entire avatar */
export interface AvatarValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  boneValidation: BoneMappingValidation;
  expressionCount: number;
  springBoneChainCount: number;
  estimatedTriangleCount: number;
  estimatedTextureMemoryMB: number;
}

/** Avatar project state (serializable) */
export interface AvatarProject {
  version: string;
  metadata: VRMMetadata;
  boneMappings: BoneMapping[];
  expressions: VRMExpression[];
  springBoneConfig: SpringBoneConfig;
  lookAtConfig: LookAtConfig;
  firstPersonConfig: FirstPersonConfig;
  /** Source model file info */
  sourceModel: {
    filename: string;
    format: 'glb' | 'gltf' | 'vrm' | 'fbx';
    nodeNames: string[];
    meshNames: string[];
    morphTargetNames: Record<string, string[]>; // meshName -> target names
  };
}

/** VRM look-at configuration */
export interface LookAtConfig {
  type: 'bone' | 'expression';
  /** Offset from head bone (meters) */
  offsetFromHeadBone: [number, number, number];
  /** Range map for horizontal inner rotation */
  rangeMapHorizontalInner: { inputMaxValue: number; outputScale: number };
  /** Range map for horizontal outer rotation */
  rangeMapHorizontalOuter: { inputMaxValue: number; outputScale: number };
  /** Range map for vertical down rotation */
  rangeMapVerticalDown: { inputMaxValue: number; outputScale: number };
  /** Range map for vertical up rotation */
  rangeMapVerticalUp: { inputMaxValue: number; outputScale: number };
}

/** VRM first-person configuration */
export interface FirstPersonConfig {
  meshAnnotations: {
    meshName: string;
    type: 'auto' | 'both' | 'thirdPersonOnly' | 'firstPersonOnly';
  }[];
}

/**
 * Avatar Authoring Studio
 *
 * Central class for creating and editing VRM avatars. Manages bone mapping,
 * blend shape editing, spring bone configuration, and metadata.
 */
export class AvatarAuthoringStudio {
  private project: AvatarProject;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxUndoHistory: number = 50;

  constructor(sourceModelInfo?: AvatarProject['sourceModel']) {
    this.project = this.createDefaultProject(sourceModelInfo);
  }

  // ============================
  // Project Management
  // ============================

  /** Get the current project state */
  getProject(): AvatarProject {
    return this.project;
  }

  /** Load a project from JSON */
  loadProject(json: string): void {
    this.saveUndoState();
    this.project = JSON.parse(json) as AvatarProject;
  }

  /** Export the project as JSON */
  exportProject(): string {
    return JSON.stringify(this.project, null, 2);
  }

  /** Undo the last change */
  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop()!);
    return true;
  }

  /** Redo the last undone change */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop()!);
    return true;
  }

  // ============================
  // Metadata Editing
  // ============================

  /** Get current metadata */
  getMetadata(): VRMMetadata {
    return { ...this.project.metadata };
  }

  /** Update metadata fields */
  updateMetadata(updates: Partial<VRMMetadata>): void {
    this.saveUndoState();
    this.project.metadata = { ...this.project.metadata, ...updates };
  }

  // ============================
  // Bone Mapping
  // ============================

  /** Get all bone mappings */
  getBoneMappings(): BoneMapping[] {
    return [...this.project.boneMappings];
  }

  /** Set a bone mapping */
  setBoneMapping(vrmBone: VRMHumanBoneName, nodeName: string, restPoseOffset?: [number, number, number]): void {
    this.saveUndoState();
    const existing = this.project.boneMappings.findIndex((m) => m.vrmBone === vrmBone);
    const mapping: BoneMapping = { vrmBone, nodeName, restPoseOffset };
    if (existing >= 0) {
      this.project.boneMappings[existing] = mapping;
    } else {
      this.project.boneMappings.push(mapping);
    }
  }

  /** Remove a bone mapping */
  removeBoneMapping(vrmBone: VRMHumanBoneName): void {
    this.saveUndoState();
    this.project.boneMappings = this.project.boneMappings.filter((m) => m.vrmBone !== vrmBone);
  }

  /** Auto-map bones by common naming conventions */
  autoMapBones(nodeNames: string[]): BoneMapping[] {
    this.saveUndoState();
    const mappings: BoneMapping[] = [];

    const nameMap: Record<string, VRMHumanBoneName[]> = {
      'hips': ['hips'],
      'hip': ['hips'],
      'pelvis': ['hips'],
      'spine': ['spine'],
      'spine1': ['spine'],
      'spine2': ['chest'],
      'chest': ['chest'],
      'upperchest': ['upperChest'],
      'neck': ['neck'],
      'head': ['head'],
      'jaw': ['jaw'],
      'lefteye': ['leftEye'],
      'righteye': ['rightEye'],
      'leftshoulder': ['leftShoulder'],
      'leftupperarm': ['leftUpperArm'],
      'leftarm': ['leftUpperArm'],
      'leftforearm': ['leftLowerArm'],
      'leftlowerarm': ['leftLowerArm'],
      'lefthand': ['leftHand'],
      'rightshoulder': ['rightShoulder'],
      'rightupperarm': ['rightUpperArm'],
      'rightarm': ['rightUpperArm'],
      'rightforearm': ['rightLowerArm'],
      'rightlowerarm': ['rightLowerArm'],
      'righthand': ['rightHand'],
      'leftupleg': ['leftUpperLeg'],
      'leftthigh': ['leftUpperLeg'],
      'leftupperleg': ['leftUpperLeg'],
      'leftleg': ['leftLowerLeg'],
      'leftlowerleg': ['leftLowerLeg'],
      'leftfoot': ['leftFoot'],
      'lefttoe': ['leftToes'],
      'lefttoes': ['leftToes'],
      'rightupleg': ['rightUpperLeg'],
      'rightthigh': ['rightUpperLeg'],
      'rightupperleg': ['rightUpperLeg'],
      'rightleg': ['rightLowerLeg'],
      'rightlowerleg': ['rightLowerLeg'],
      'rightfoot': ['rightFoot'],
      'righttoe': ['rightToes'],
      'righttoes': ['rightToes'],
    };

    const usedNodes = new Set<string>();

    for (const nodeName of nodeNames) {
      const normalized = nodeName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const vrmBones = nameMap[normalized];
      if (vrmBones && !usedNodes.has(nodeName)) {
        for (const vrmBone of vrmBones) {
          if (!mappings.some((m) => m.vrmBone === vrmBone)) {
            mappings.push({ vrmBone, nodeName });
            usedNodes.add(nodeName);
            break;
          }
        }
      }
    }

    this.project.boneMappings = mappings;
    return mappings;
  }

  /** Validate bone mappings against VRM requirements */
  validateBoneMappings(): BoneMappingValidation {
    const mapped = new Set(this.project.boneMappings.map((m) => m.vrmBone));
    const missingRequired = VRM_REQUIRED_BONES.filter((b) => !mapped.has(b));
    const warnings: string[] = [];

    // Check for duplicate node assignments
    const nodeNames = this.project.boneMappings.map((m) => m.nodeName);
    const duplicates = nodeNames.filter((n, i) => nodeNames.indexOf(n) !== i);
    if (duplicates.length > 0) {
      warnings.push(`Duplicate node assignments: ${[...new Set(duplicates)].join(', ')}`);
    }

    // Check for bones mapped to nodes not in the model
    if (this.project.sourceModel.nodeNames.length > 0) {
      const available = new Set(this.project.sourceModel.nodeNames);
      for (const mapping of this.project.boneMappings) {
        if (!available.has(mapping.nodeName)) {
          warnings.push(`Bone "${mapping.vrmBone}" mapped to unknown node "${mapping.nodeName}"`);
        }
      }
    }

    return {
      isValid: missingRequired.length === 0,
      missingRequired,
      warnings,
      mappedCount: this.project.boneMappings.length,
      totalRequired: VRM_REQUIRED_BONES.length,
    };
  }

  // ============================
  // Expression / Blend Shape Editing
  // ============================

  /** Get all expressions */
  getExpressions(): VRMExpression[] {
    return [...this.project.expressions];
  }

  /** Add or update an expression */
  setExpression(expression: VRMExpression): void {
    this.saveUndoState();
    const existing = this.project.expressions.findIndex((e) => e.name === expression.name);
    if (existing >= 0) {
      this.project.expressions[existing] = { ...expression };
    } else {
      this.project.expressions.push({ ...expression });
    }
  }

  /** Remove an expression */
  removeExpression(name: string): void {
    this.saveUndoState();
    this.project.expressions = this.project.expressions.filter((e) => e.name !== name);
  }

  /** Create default expression presets */
  createDefaultExpressions(): VRMExpression[] {
    this.saveUndoState();

    const defaults: VRMExpression[] = [
      this.createPresetExpression('neutral', 'neutral'),
      this.createPresetExpression('happy', 'happy'),
      this.createPresetExpression('angry', 'angry'),
      this.createPresetExpression('sad', 'sad'),
      this.createPresetExpression('relaxed', 'relaxed'),
      this.createPresetExpression('surprised', 'surprised'),
      this.createPresetExpression('aa', 'aa'),
      this.createPresetExpression('ih', 'ih'),
      this.createPresetExpression('ou', 'ou'),
      this.createPresetExpression('ee', 'ee'),
      this.createPresetExpression('oh', 'oh'),
      this.createPresetExpression('blink', 'blink'),
      this.createPresetExpression('blinkLeft', 'blinkLeft'),
      this.createPresetExpression('blinkRight', 'blinkRight'),
      this.createPresetExpression('lookUp', 'lookUp'),
      this.createPresetExpression('lookDown', 'lookDown'),
      this.createPresetExpression('lookLeft', 'lookLeft'),
      this.createPresetExpression('lookRight', 'lookRight'),
    ];

    this.project.expressions = defaults;
    return defaults;
  }

  /** Add a morph target binding to an expression */
  addMorphTargetBinding(
    expressionName: string,
    meshName: string,
    morphTargetIndex: number,
    weight: number
  ): void {
    this.saveUndoState();
    const expr = this.project.expressions.find((e) => e.name === expressionName);
    if (!expr) throw new Error(`Expression "${expressionName}" not found`);
    expr.morphTargetBindings.push({ meshName, morphTargetIndex, weight: Math.min(1, Math.max(0, weight)) });
  }

  /** Remove a morph target binding from an expression */
  removeMorphTargetBinding(expressionName: string, meshName: string, morphTargetIndex: number): void {
    this.saveUndoState();
    const expr = this.project.expressions.find((e) => e.name === expressionName);
    if (!expr) return;
    expr.morphTargetBindings = expr.morphTargetBindings.filter(
      (b) => !(b.meshName === meshName && b.morphTargetIndex === morphTargetIndex)
    );
  }

  // ============================
  // Spring Bone Configuration
  // ============================

  /** Get the spring bone configuration */
  getSpringBoneConfig(): SpringBoneConfig {
    return {
      chains: [...this.project.springBoneConfig.chains],
      colliderGroups: [...this.project.springBoneConfig.colliderGroups],
    };
  }

  /** Add a spring bone chain */
  addSpringBoneChain(chain: SpringBoneChain): void {
    this.saveUndoState();
    const existing = this.project.springBoneConfig.chains.findIndex((c) => c.name === chain.name);
    if (existing >= 0) {
      this.project.springBoneConfig.chains[existing] = { ...chain };
    } else {
      this.project.springBoneConfig.chains.push({ ...chain });
    }
  }

  /** Remove a spring bone chain */
  removeSpringBoneChain(name: string): void {
    this.saveUndoState();
    this.project.springBoneConfig.chains = this.project.springBoneConfig.chains.filter(
      (c) => c.name !== name
    );
  }

  /** Add a spring bone joint to an existing chain */
  addJointToChain(
    chainName: string,
    joint: SpringBoneJoint
  ): void {
    this.saveUndoState();
    const chain = this.project.springBoneConfig.chains.find((c) => c.name === chainName);
    if (!chain) throw new Error(`Spring bone chain "${chainName}" not found`);
    chain.joints.push({ ...joint });
  }

  /** Update a spring bone joint in a chain */
  updateJointInChain(
    chainName: string,
    jointIndex: number,
    updates: Partial<SpringBoneJoint>
  ): void {
    this.saveUndoState();
    const chain = this.project.springBoneConfig.chains.find((c) => c.name === chainName);
    if (!chain || jointIndex < 0 || jointIndex >= chain.joints.length) return;
    chain.joints[jointIndex] = { ...chain.joints[jointIndex], ...updates };
  }

  /** Add a collider group */
  addColliderGroup(group: SpringBoneColliderGroup): void {
    this.saveUndoState();
    const existing = this.project.springBoneConfig.colliderGroups.findIndex(
      (g) => g.name === group.name
    );
    if (existing >= 0) {
      this.project.springBoneConfig.colliderGroups[existing] = { ...group };
    } else {
      this.project.springBoneConfig.colliderGroups.push({ ...group });
    }
  }

  /** Remove a collider group */
  removeColliderGroup(name: string): void {
    this.saveUndoState();
    this.project.springBoneConfig.colliderGroups =
      this.project.springBoneConfig.colliderGroups.filter((g) => g.name !== name);
    // Also remove references from chains
    for (const chain of this.project.springBoneConfig.chains) {
      chain.colliderGroupNames = chain.colliderGroupNames.filter((n) => n !== name);
    }
  }

  /** Create a default spring bone setup for hair */
  createDefaultHairSpringBones(hairNodeNames: string[]): SpringBoneChain {
    this.saveUndoState();
    const joints: SpringBoneJoint[] = hairNodeNames.map((nodeName, i) => ({
      nodeName,
      hitRadius: 0.02,
      stiffness: Math.max(0.5, 2.0 - i * 0.3),
      gravityPower: 0.1,
      gravityDir: [0, -1, 0],
      dragForce: 0.4,
    }));

    const chain: SpringBoneChain = {
      name: 'hair_chain',
      joints,
      colliderGroupNames: ['head_collider'],
      centerNodeName: 'head',
    };

    this.addSpringBoneChain(chain);
    return chain;
  }

  // ============================
  // Look-At Configuration
  // ============================

  /** Get look-at configuration */
  getLookAtConfig(): LookAtConfig {
    return { ...this.project.lookAtConfig };
  }

  /** Update look-at configuration */
  updateLookAtConfig(updates: Partial<LookAtConfig>): void {
    this.saveUndoState();
    this.project.lookAtConfig = { ...this.project.lookAtConfig, ...updates };
  }

  // ============================
  // First Person Configuration
  // ============================

  /** Get first-person configuration */
  getFirstPersonConfig(): FirstPersonConfig {
    return { ...this.project.firstPersonConfig };
  }

  /** Set mesh annotation for first-person rendering */
  setMeshAnnotation(
    meshName: string,
    type: 'auto' | 'both' | 'thirdPersonOnly' | 'firstPersonOnly'
  ): void {
    this.saveUndoState();
    const existing = this.project.firstPersonConfig.meshAnnotations.findIndex(
      (a) => a.meshName === meshName
    );
    if (existing >= 0) {
      this.project.firstPersonConfig.meshAnnotations[existing].type = type;
    } else {
      this.project.firstPersonConfig.meshAnnotations.push({ meshName, type });
    }
  }

  // ============================
  // Validation
  // ============================

  /** Validate the complete avatar project */
  validate(): AvatarValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Metadata validation
    if (!this.project.metadata.name) errors.push('Avatar name is required');
    if (this.project.metadata.authors.length === 0) errors.push('At least one author is required');

    // Bone validation
    const boneValidation = this.validateBoneMappings();
    if (!boneValidation.isValid) {
      errors.push(`Missing required bones: ${boneValidation.missingRequired.join(', ')}`);
    }
    warnings.push(...boneValidation.warnings);

    // Expression validation
    const hasVisemeExpressions = ['aa', 'ih', 'ou', 'ee', 'oh'].every(
      (preset) => this.project.expressions.some((e) => e.preset === preset)
    );
    if (!hasVisemeExpressions) {
      warnings.push('Missing viseme expressions (aa, ih, ou, ee, oh). Lip sync will not work.');
    }

    const hasBlinkExpr = this.project.expressions.some((e) => e.preset === 'blink');
    if (!hasBlinkExpr) {
      warnings.push('Missing blink expression. Eye blinking will not work.');
    }

    // Spring bone validation
    for (const chain of this.project.springBoneConfig.chains) {
      if (chain.joints.length === 0) {
        warnings.push(`Spring bone chain "${chain.name}" has no joints`);
      }
      for (const refName of chain.colliderGroupNames) {
        if (!this.project.springBoneConfig.colliderGroups.some((g) => g.name === refName)) {
          warnings.push(`Spring bone chain "${chain.name}" references missing collider group "${refName}"`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      boneValidation,
      expressionCount: this.project.expressions.length,
      springBoneChainCount: this.project.springBoneConfig.chains.length,
      estimatedTriangleCount: 0, // Would need actual mesh data
      estimatedTextureMemoryMB: 0, // Would need actual texture data
    };
  }

  // ============================
  // Private Helpers
  // ============================

  private saveUndoState(): void {
    this.undoStack.push(JSON.stringify(this.project));
    if (this.undoStack.length > this.maxUndoHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private createPresetExpression(name: string, preset: VRMExpressionPreset): VRMExpression {
    const isMouth = ['aa', 'ih', 'ou', 'ee', 'oh'].includes(preset);
    const isBlink = ['blink', 'blinkLeft', 'blinkRight'].includes(preset);
    const isLookAt = ['lookUp', 'lookDown', 'lookLeft', 'lookRight'].includes(preset);

    return {
      name,
      preset,
      isBinary: isBlink,
      morphTargetBindings: [],
      materialColorBindings: [],
      textureTransformBindings: [],
      overrideBlink: isMouth ? 'blend' : 'none',
      overrideLookAt: isBlink ? 'blend' : 'none',
      overrideMouth: isLookAt ? 'none' : 'none',
    };
  }

  private createDefaultProject(sourceModel?: AvatarProject['sourceModel']): AvatarProject {
    return {
      version: '1.0.0',
      metadata: {
        name: 'New Avatar',
        version: '1.0',
        authors: [],
        avatarPermission: 'Everyone',
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        commercialUsage: 'personalNonProfit',
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
        creditNotation: 'required',
        allowRedistribution: false,
        modification: 'prohibited',
      },
      boneMappings: [],
      expressions: [],
      springBoneConfig: {
        chains: [],
        colliderGroups: [],
      },
      lookAtConfig: {
        type: 'bone',
        offsetFromHeadBone: [0, 0.06, 0],
        rangeMapHorizontalInner: { inputMaxValue: 90, outputScale: 10 },
        rangeMapHorizontalOuter: { inputMaxValue: 90, outputScale: 10 },
        rangeMapVerticalDown: { inputMaxValue: 90, outputScale: 10 },
        rangeMapVerticalUp: { inputMaxValue: 90, outputScale: 10 },
      },
      firstPersonConfig: {
        meshAnnotations: [],
      },
      sourceModel: sourceModel ?? {
        filename: '',
        format: 'glb',
        nodeNames: [],
        meshNames: [],
        morphTargetNames: {},
      },
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new AvatarAuthoringStudio instance.
 */
export function createAvatarStudio(
  sourceModel?: AvatarProject['sourceModel']
): AvatarAuthoringStudio {
  return new AvatarAuthoringStudio(sourceModel);
}
