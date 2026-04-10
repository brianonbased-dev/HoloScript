/**
 * @holoscript/core Semantic System
 *
 * Property-level semantic annotations, data binding, and platform capabilities.
 */

// Semantic Annotations
export {
  SemanticAnnotation,
  SemanticCategory,
  SemanticIntent,
  SemanticFlags,
  SemanticConstraints,
  SemanticRelation,
  RelationType,
  SemanticSchema,
  SemanticRegistry,
  createAnnotation,
  createSchema,
  createDefaultFlags,
  createEmptyConstraints,
  getSemanticRegistry,
} from './SemanticAnnotation';

// Property Annotations
export {
  PropertyAnnotations,
  positionAnnotation,
  rotationAnnotation,
  scaleAnnotation,
  colorAnnotation,
  opacityAnnotation,
  toggleAnnotation,
  enumAnnotation,
  rangeAnnotation,
  textAnnotation,
  referenceAnnotation,
  massAnnotation,
  velocityAnnotation,
  frictionAnnotation,
  restitutionAnnotation,
  aiStateAnnotation,
  aiGoalAnnotation,
  emotionAnnotation,
  dialogAnnotation,
  syncPriorityAnnotation,
  ownershipAnnotation,
  volumeAnnotation,
  pitchAnnotation,
  audioDistanceAnnotation,
  altTextAnnotation,
  ariaRoleAnnotation,
} from './PropertyAnnotations';

// Data Binding Schema
export {
  BindingManager,
  BindingConfig,
  BindingDirection,
  BindingSource,
  BindingTransform,
  TransformType,
  ReactiveExpression,
  DataStore,
  StoreSlice,
  createBinding,
  createTwoWayBinding,
  createComputedBinding,
  createStoreSlice,
  createDataStore,
  getBindingManager,
  createFollowBinding,
  createInputBinding,
  createNetworkBinding,
} from './DataBindingSchema';

// Capability Matrix
export {
  CapabilityMatrix,
  CapabilityProfile,
  CapabilityCheck,
  FeatureRequirement,
  PlatformType,
  RenderingBackend,
  XRMode,
  GraphicsCapabilities,
  XRCapabilities,
  AudioCapabilities,
  InputCapabilities,
  NetworkCapabilities,
  StorageCapabilities,
  PerformanceCapabilities,
  getCapabilityMatrix,
  detectCapabilities,
  createFeatureRequirement,
  CommonFeatures,
} from './CapabilityMatrix';
