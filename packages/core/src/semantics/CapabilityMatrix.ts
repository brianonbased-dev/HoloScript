/**
 * @holoscript/core Capability Matrix
 *
 * Platform capability detection and feature matrix for cross-platform
 * HoloScript applications. Enables graceful degradation and feature targeting.
 */

// ============================================================================
// Platform Types
// ============================================================================

export type PlatformType =
  | 'web'
  | 'mobile-web'
  | 'ios'
  | 'android'
  | 'visionos'
  | 'androidxr'
  | 'quest'
  | 'steamvr'
  | 'windows'
  | 'macos'
  | 'linux'
  | 'unity'
  | 'godot'
  | 'unreal';

export type RenderingBackend =
  | 'webgl'
  | 'webgl2'
  | 'webgpu'
  | 'opengl'
  | 'vulkan'
  | 'metal'
  | 'directx11'
  | 'directx12';

export type XRMode = 'none' | 'vr' | 'ar' | 'mr' | 'passthrough';

// ============================================================================
// Capability Categories
// ============================================================================

export interface GraphicsCapabilities {
  /** Maximum texture size */
  maxTextureSize: number;

  /** Maximum cube map size */
  maxCubeMapSize: number;

  /** Maximum render targets */
  maxRenderTargets: number;

  /** Maximum vertex attributes */
  maxVertexAttributes: number;

  /** Maximum uniform buffer size */
  maxUniformBufferSize: number;

  /** Supports compressed textures */
  compressedTextures: {
    s3tc: boolean; // DXT
    etc1: boolean;
    etc2: boolean;
    astc: boolean;
    pvrtc: boolean;
    bc7: boolean;
  };

  /** Supports HDR rendering */
  hdr: boolean;

  /** Supports instanced rendering */
  instancing: boolean;

  /** Supports compute shaders */
  computeShaders: boolean;

  /** Supports geometry shaders */
  geometryShaders: boolean;

  /** Supports tessellation */
  tessellation: boolean;

  /** Supports ray tracing */
  rayTracing: boolean;

  /** Supports mesh shaders */
  meshShaders: boolean;

  /** Max MSAA samples */
  maxMSAASamples: number;

  /** Supports anisotropic filtering */
  anisotropicFiltering: boolean;

  /** Max anisotropy level */
  maxAnisotropy: number;
}

export interface XRCapabilities {
  /** XR supported */
  supported: boolean;

  /** Available XR modes */
  modes: XRMode[];

  /** Supports hand tracking */
  handTracking: boolean;

  /** Supports eye tracking */
  eyeTracking: boolean;

  /** Supports body tracking */
  bodyTracking: boolean;

  /** Supports face tracking */
  faceTracking: boolean;

  /** Supports spatial anchors */
  spatialAnchors: boolean;

  /** Supports scene understanding */
  sceneUnderstanding: boolean;

  /** Supports passthrough */
  passthrough: boolean;

  /** Supports depth sensing */
  depthSensing: boolean;

  /** Max refresh rate */
  maxRefreshRate: number;

  /** Supports foveated rendering */
  foveatedRendering: boolean;

  /** Controller haptics */
  haptics: boolean;
}

export interface AudioCapabilities {
  /** Web Audio API supported */
  webAudio: boolean;

  /** Spatial audio supported */
  spatialAudio: boolean;

  /** Max audio sources */
  maxAudioSources: number;

  /** HRTF supported */
  hrtf: boolean;

  /** Supports audio worklets */
  audioWorklets: boolean;

  /** Supports media recording */
  mediaRecording: boolean;

  /** Supports speech recognition */
  speechRecognition: boolean;

  /** Supports speech synthesis */
  speechSynthesis: boolean;
}

export interface InputCapabilities {
  /** Touch input supported */
  touch: boolean;

  /** Multi-touch points */
  maxTouchPoints: number;

  /** Pointer lock supported */
  pointerLock: boolean;

  /** Gamepad API supported */
  gamepad: boolean;

  /** Keyboard supported */
  keyboard: boolean;

  /** Device orientation supported */
  deviceOrientation: boolean;

  /** Device motion supported */
  deviceMotion: boolean;

  /** Pressure sensitivity */
  pressureSensitivity: boolean;

  /** Tilt support */
  tilt: boolean;
}

export interface NetworkCapabilities {
  /** WebSocket supported */
  webSocket: boolean;

  /** WebRTC supported */
  webRTC: boolean;

  /** Server-sent events */
  serverSentEvents: boolean;

  /** Fetch API */
  fetch: boolean;

  /** Network information API */
  networkInformation: boolean;

  /** Background sync */
  backgroundSync: boolean;

  /** Service workers */
  serviceWorker: boolean;
}

export interface StorageCapabilities {
  /** LocalStorage available */
  localStorage: boolean;

  /** LocalStorage quota (bytes) */
  localStorageQuota: number;

  /** IndexedDB available */
  indexedDB: boolean;

  /** Cache API available */
  cacheAPI: boolean;

  /** File system access */
  fileSystemAccess: boolean;

  /** Persistent storage */
  persistentStorage: boolean;
}

export interface PerformanceCapabilities {
  /** Estimated device tier (1-5, 5 being highest) */
  deviceTier: number;

  /** Estimated GPU tier */
  gpuTier: number;

  /** Available memory (MB, if detectable) */
  availableMemory?: number;

  /** Number of logical CPUs */
  logicalProcessors: number;

  /** Supports SharedArrayBuffer */
  sharedArrayBuffer: boolean;

  /** Supports WebAssembly */
  webAssembly: boolean;

  /** Supports SIMD */
  simd: boolean;

  /** Supports multi-threading */
  multiThreading: boolean;

  /** Supports OffscreenCanvas */
  offscreenCanvas: boolean;
}

// ============================================================================
// Platform Capability Profile
// ============================================================================

export interface CapabilityProfile {
  /** Profile ID */
  id: string;

  /** Platform type */
  platform: PlatformType;

  /** Rendering backend */
  renderingBackend: RenderingBackend;

  /** User agent string */
  userAgent: string;

  /** Graphics capabilities */
  graphics: GraphicsCapabilities;

  /** XR capabilities */
  xr: XRCapabilities;

  /** Audio capabilities */
  audio: AudioCapabilities;

  /** Input capabilities */
  input: InputCapabilities;

  /** Network capabilities */
  network: NetworkCapabilities;

  /** Storage capabilities */
  storage: StorageCapabilities;

  /** Performance capabilities */
  performance: PerformanceCapabilities;

  /** Detection timestamp */
  detectedAt: string;

  /** Custom capability flags */
  custom: Record<string, boolean>;
}

// ============================================================================
// Feature Requirements
// ============================================================================

export interface FeatureRequirement {
  /** Feature name */
  name: string;

  /** Required capability checks */
  checks: CapabilityCheck[];

  /** Is this feature critical? */
  critical: boolean;

  /** Fallback feature if not supported */
  fallback?: string;

  /** Description for users */
  description?: string;
}

export interface CapabilityCheck {
  /** Capability path (e.g., 'graphics.rayTracing') */
  capability: string;

  /** Expected value or comparator */
  value: unknown;

  /** Comparison type */
  comparison: 'equals' | 'gte' | 'lte' | 'gt' | 'lt' | 'contains' | 'exists';
}

// ============================================================================
// Capability Matrix
// ============================================================================

export class CapabilityMatrix {
  private static instance: CapabilityMatrix | null = null;
  private profile: CapabilityProfile | null = null;
  private features: Map<string, FeatureRequirement> = new Map();
  private featureSupport: Map<string, boolean> = new Map();

  private constructor() {}

  static getInstance(): CapabilityMatrix {
    if (!CapabilityMatrix.instance) {
      CapabilityMatrix.instance = new CapabilityMatrix();
    }
    return CapabilityMatrix.instance;
  }

  static resetInstance(): void {
    CapabilityMatrix.instance = null;
  }

  // ─── Profile Detection ────────────────────────────────────────────────────

  /**
   * Detect capabilities and create profile
   */
  async detectCapabilities(): Promise<CapabilityProfile> {
    const profile: CapabilityProfile = {
      id: `cap_${Date.now()}`,
      platform: this.detectPlatform(),
      renderingBackend: await this.detectRenderingBackend(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      graphics: await this.detectGraphicsCapabilities(),
      xr: await this.detectXRCapabilities(),
      audio: this.detectAudioCapabilities(),
      input: this.detectInputCapabilities(),
      network: this.detectNetworkCapabilities(),
      storage: this.detectStorageCapabilities(),
      performance: this.detectPerformanceCapabilities(),
      detectedAt: new Date().toISOString(),
      custom: {},
    };

    this.profile = profile;
    this.evaluateAllFeatures();
    return profile;
  }

  /**
   * Set profile manually (for non-web platforms)
   */
  setProfile(profile: CapabilityProfile): void {
    this.profile = profile;
    this.evaluateAllFeatures();
  }

  /**
   * Get current profile
   */
  getProfile(): CapabilityProfile | null {
    return this.profile;
  }

  // ─── Platform Detection ───────────────────────────────────────────────────

  private detectPlatform(): PlatformType {
    if (typeof navigator === 'undefined') return 'web';

    const ua = navigator.userAgent.toLowerCase();

    // Check for XR platforms first
    if (ua.includes('quest')) return 'quest';
    if (ua.includes('visionos') || ua.includes('apple vision')) return 'visionos';

    // Mobile checks
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) {
      return /mobile/.test(ua) ? 'android' : 'androidxr';
    }

    // Desktop checks
    if (ua.includes('windows')) return 'windows';
    if (ua.includes('mac os')) return 'macos';
    if (ua.includes('linux')) return 'linux';

    // Mobile web fallback
    if (/mobile|tablet/.test(ua)) return 'mobile-web';

    return 'web';
  }

  private async detectRenderingBackend(): Promise<RenderingBackend> {
    if (typeof navigator === 'undefined') return 'webgl2';

    // Check WebGPU first
    if ('gpu' in navigator) {
      try {
        const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<GPUAdapter | null> } }).gpu.requestAdapter();
        if (adapter) return 'webgpu';
      } catch {
        // WebGPU not available
      }
    }

    // Check WebGL2
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return 'webgl2';

    // Check WebGL1
    const gl1 = canvas.getContext('webgl');
    if (gl1) return 'webgl';

    return 'webgl';
  }

  // ─── Graphics Detection ───────────────────────────────────────────────────

  private async detectGraphicsCapabilities(): Promise<GraphicsCapabilities> {
    const defaults: GraphicsCapabilities = {
      maxTextureSize: 4096,
      maxCubeMapSize: 4096,
      maxRenderTargets: 4,
      maxVertexAttributes: 16,
      maxUniformBufferSize: 16384,
      compressedTextures: {
        s3tc: false,
        etc1: false,
        etc2: false,
        astc: false,
        pvrtc: false,
        bc7: false,
      },
      hdr: false,
      instancing: true,
      computeShaders: false,
      geometryShaders: false,
      tessellation: false,
      rayTracing: false,
      meshShaders: false,
      maxMSAASamples: 4,
      anisotropicFiltering: false,
      maxAnisotropy: 1,
    };

    if (typeof document === 'undefined') return defaults;

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (!gl) return defaults;

    // Query GL parameters
    defaults.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    defaults.maxCubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    defaults.maxRenderTargets = (gl as WebGL2RenderingContext).MAX_DRAW_BUFFERS
      ? gl.getParameter((gl as WebGL2RenderingContext).MAX_DRAW_BUFFERS)
      : 1;
    defaults.maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

    // Check for compressed texture extensions
    const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc');
    const etc1 = gl.getExtension('WEBGL_compressed_texture_etc1');
    const etc = gl.getExtension('WEBGL_compressed_texture_etc');
    const astc = gl.getExtension('WEBGL_compressed_texture_astc');
    const pvrtc = gl.getExtension('WEBGL_compressed_texture_pvrtc');

    defaults.compressedTextures = {
      s3tc: !!s3tc,
      etc1: !!etc1,
      etc2: !!etc,
      astc: !!astc,
      pvrtc: !!pvrtc,
      bc7: !!s3tc, // BC7 typically available with S3TC
    };

    // Check for anisotropic filtering
    const aniso =
      gl.getExtension('EXT_texture_filter_anisotropic') ||
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (aniso) {
      defaults.anisotropicFiltering = true;
      defaults.maxAnisotropy = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    }

    // WebGL2 specific
    if (gl instanceof WebGL2RenderingContext) {
      defaults.instancing = true;
      defaults.hdr = true;
    }

    // WebGPU capabilities
    if ('gpu' in navigator) {
      try {
        const gpuNav = navigator as unknown as { gpu?: { requestAdapter(): Promise<GPUAdapter | null> } };
        const adapter = await gpuNav.gpu?.requestAdapter();
        if (adapter) {
          defaults.computeShaders = true;
          defaults.meshShaders = adapter.features.has('mesh_shader');
        }
      } catch {
        // WebGPU not available
      }
    }

    return defaults;
  }

  // ─── XR Detection ─────────────────────────────────────────────────────────

  private async detectXRCapabilities(): Promise<XRCapabilities> {
    const defaults: XRCapabilities = {
      supported: false,
      modes: ['none'],
      handTracking: false,
      eyeTracking: false,
      bodyTracking: false,
      faceTracking: false,
      spatialAnchors: false,
      sceneUnderstanding: false,
      passthrough: false,
      depthSensing: false,
      maxRefreshRate: 60,
      foveatedRendering: false,
      haptics: false,
    };

    if (typeof navigator === 'undefined' || !('xr' in navigator)) {
      return defaults;
    }

    const xr = (navigator as unknown as { xr: { isSessionSupported(mode: string): Promise<boolean> } }).xr;

    try {
      // Check VR support
      const vrSupported = await xr.isSessionSupported('immersive-vr');
      if (vrSupported) {
        defaults.supported = true;
        defaults.modes.push('vr');
      }

      // Check AR support
      const arSupported = await xr.isSessionSupported('immersive-ar');
      if (arSupported) {
        defaults.supported = true;
        defaults.modes.push('ar');
      }

      // Remove 'none' if we have real modes
      if (defaults.modes.length > 1) {
        defaults.modes = defaults.modes.filter((m) => m !== 'none');
      }

      // Feature detection would require a session, so we estimate based on platform
      const platform = this.detectPlatform();
      if (platform === 'quest') {
        defaults.handTracking = true;
        defaults.passthrough = true;
        defaults.haptics = true;
        defaults.maxRefreshRate = 120;
      } else if (platform === 'visionos') {
        defaults.handTracking = true;
        defaults.eyeTracking = true;
        defaults.spatialAnchors = true;
        defaults.sceneUnderstanding = true;
        defaults.passthrough = true;
        defaults.maxRefreshRate = 90;
      }
    } catch {
      // XR not available
    }

    return defaults;
  }

  // ─── Audio Detection ──────────────────────────────────────────────────────

  private detectAudioCapabilities(): AudioCapabilities {
    const defaults: AudioCapabilities = {
      webAudio: false,
      spatialAudio: false,
      maxAudioSources: 32,
      hrtf: false,
      audioWorklets: false,
      mediaRecording: false,
      speechRecognition: false,
      speechSynthesis: false,
    };

    if (typeof window === 'undefined') return defaults;

    defaults.webAudio = 'AudioContext' in window || 'webkitAudioContext' in window;

    if (defaults.webAudio) {
      defaults.spatialAudio = true;
      defaults.hrtf = true;
      defaults.audioWorklets = 'AudioWorklet' in window;
    }

    defaults.mediaRecording = 'MediaRecorder' in window;
    defaults.speechRecognition =
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    defaults.speechSynthesis = 'speechSynthesis' in window;

    return defaults;
  }

  // ─── Input Detection ──────────────────────────────────────────────────────

  private detectInputCapabilities(): InputCapabilities {
    const defaults: InputCapabilities = {
      touch: false,
      maxTouchPoints: 0,
      pointerLock: false,
      gamepad: false,
      keyboard: true,
      deviceOrientation: false,
      deviceMotion: false,
      pressureSensitivity: false,
      tilt: false,
    };

    if (typeof navigator === 'undefined') return defaults;

    defaults.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    defaults.maxTouchPoints = navigator.maxTouchPoints || 0;
    defaults.pointerLock = 'pointerLockElement' in document;
    defaults.gamepad = 'getGamepads' in navigator;
    defaults.deviceOrientation = 'DeviceOrientationEvent' in window;
    defaults.deviceMotion = 'DeviceMotionEvent' in window;

    return defaults;
  }

  // ─── Network Detection ────────────────────────────────────────────────────

  private detectNetworkCapabilities(): NetworkCapabilities {
    const defaults: NetworkCapabilities = {
      webSocket: false,
      webRTC: false,
      serverSentEvents: false,
      fetch: false,
      networkInformation: false,
      backgroundSync: false,
      serviceWorker: false,
    };

    if (typeof window === 'undefined') return defaults;

    defaults.webSocket = 'WebSocket' in window;
    defaults.webRTC = 'RTCPeerConnection' in window;
    defaults.serverSentEvents = 'EventSource' in window;
    defaults.fetch = 'fetch' in window;
    defaults.networkInformation = 'connection' in navigator;
    defaults.serviceWorker = 'serviceWorker' in navigator;

    if ('serviceWorker' in navigator) {
      defaults.backgroundSync = 'SyncManager' in window;
    }

    return defaults;
  }

  // ─── Storage Detection ────────────────────────────────────────────────────

  private detectStorageCapabilities(): StorageCapabilities {
    const defaults: StorageCapabilities = {
      localStorage: false,
      localStorageQuota: 0,
      indexedDB: false,
      cacheAPI: false,
      fileSystemAccess: false,
      persistentStorage: false,
    };

    if (typeof window === 'undefined') return defaults;

    try {
      defaults.localStorage = 'localStorage' in window;
      if (defaults.localStorage) {
        // Estimate quota (typically 5-10MB)
        defaults.localStorageQuota = 5 * 1024 * 1024;
      }
    } catch {
      defaults.localStorage = false;
    }

    defaults.indexedDB = 'indexedDB' in window;
    defaults.cacheAPI = 'caches' in window;
    defaults.fileSystemAccess = 'showOpenFilePicker' in window;
    defaults.persistentStorage = 'storage' in navigator && 'persist' in navigator.storage;

    return defaults;
  }

  // ─── Performance Detection ────────────────────────────────────────────────

  private detectPerformanceCapabilities(): PerformanceCapabilities {
    const defaults: PerformanceCapabilities = {
      deviceTier: 3,
      gpuTier: 3,
      logicalProcessors: 4,
      sharedArrayBuffer: false,
      webAssembly: false,
      simd: false,
      multiThreading: false,
      offscreenCanvas: false,
    };

    if (typeof navigator === 'undefined') return defaults;

    defaults.logicalProcessors = navigator.hardwareConcurrency || 4;

    // Estimate device tier based on cores
    if (defaults.logicalProcessors >= 8) {
      defaults.deviceTier = 5;
    } else if (defaults.logicalProcessors >= 4) {
      defaults.deviceTier = 3;
    } else {
      defaults.deviceTier = 2;
    }

    // Check memory if available
    if ('deviceMemory' in navigator) {
      defaults.availableMemory = (navigator as unknown as { deviceMemory: number }).deviceMemory * 1024;
    }

    defaults.sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    defaults.webAssembly = typeof WebAssembly !== 'undefined';
    defaults.multiThreading = defaults.sharedArrayBuffer && 'Worker' in window;
    defaults.offscreenCanvas = 'OffscreenCanvas' in window;

    // SIMD check
    try {
      defaults.simd = WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
          253, 15, 253, 98, 11,
        ])
      );
    } catch {
      defaults.simd = false;
    }

    return defaults;
  }

  // ─── Feature Management ───────────────────────────────────────────────────

  /**
   * Register a feature requirement
   */
  registerFeature(feature: FeatureRequirement): void {
    this.features.set(feature.name, feature);
    if (this.profile) {
      this.featureSupport.set(feature.name, this.evaluateFeature(feature));
    }
  }

  /**
   * Check if a feature is supported
   */
  isFeatureSupported(featureName: string): boolean {
    return this.featureSupport.get(featureName) ?? false;
  }

  /**
   * Get feature with fallback
   */
  getFeatureOrFallback(featureName: string): string {
    if (this.isFeatureSupported(featureName)) {
      return featureName;
    }

    const feature = this.features.get(featureName);
    if (feature?.fallback && this.isFeatureSupported(feature.fallback)) {
      return feature.fallback;
    }

    return featureName;
  }

  /**
   * Get all unsupported critical features
   */
  getUnsupportedCriticalFeatures(): string[] {
    const unsupported: string[] = [];

    for (const [name, feature] of this.features) {
      if (feature.critical && !this.isFeatureSupported(name)) {
        unsupported.push(name);
      }
    }

    return unsupported;
  }

  /**
   * Evaluate all features against profile
   */
  private evaluateAllFeatures(): void {
    for (const [name, feature] of this.features) {
      this.featureSupport.set(name, this.evaluateFeature(feature));
    }
  }

  /**
   * Evaluate a single feature
   */
  private evaluateFeature(feature: FeatureRequirement): boolean {
    if (!this.profile) return false;

    for (const check of feature.checks) {
      if (!this.evaluateCheck(check)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a capability check
   */
  private evaluateCheck(check: CapabilityCheck): boolean {
    if (!this.profile) return false;

    const value = this.getCapabilityValue(check.capability);

    switch (check.comparison) {
      case 'equals':
        return value === check.value;
      case 'gte':
        return (value as number) >= (check.value as number);
      case 'lte':
        return (value as number) <= (check.value as number);
      case 'gt':
        return (value as number) > (check.value as number);
      case 'lt':
        return (value as number) < (check.value as number);
      case 'contains':
        return Array.isArray(value) && value.includes(check.value);
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return false;
    }
  }

  /**
   * Get capability value by path
   */
  private getCapabilityValue(path: string): unknown {
    if (!this.profile) return undefined;

    const parts = path.split('.');
    let current: unknown = this.profile;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Get capability summary
   */
  getSummary(): {
    platform: PlatformType;
    renderingBackend: RenderingBackend;
    xrSupported: boolean;
    deviceTier: number;
    supportedFeatures: string[];
    unsupportedFeatures: string[];
  } {
    const supported: string[] = [];
    const unsupported: string[] = [];

    for (const [name] of this.features) {
      if (this.isFeatureSupported(name)) {
        supported.push(name);
      } else {
        unsupported.push(name);
      }
    }

    return {
      platform: this.profile?.platform ?? 'web',
      renderingBackend: this.profile?.renderingBackend ?? 'webgl2',
      xrSupported: this.profile?.xr.supported ?? false,
      deviceTier: this.profile?.performance.deviceTier ?? 3,
      supportedFeatures: supported,
      unsupportedFeatures: unsupported,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get global capability matrix
 */
export function getCapabilityMatrix(): CapabilityMatrix {
  return CapabilityMatrix.getInstance();
}

/**
 * Detect and get capability profile
 */
export async function detectCapabilities(): Promise<CapabilityProfile> {
  return getCapabilityMatrix().detectCapabilities();
}

/**
 * Create a feature requirement
 */
export function createFeatureRequirement(
  name: string,
  checks: CapabilityCheck[],
  options: Partial<Omit<FeatureRequirement, 'name' | 'checks'>> = {}
): FeatureRequirement {
  return {
    name,
    checks,
    critical: options.critical ?? false,
    fallback: options.fallback,
    description: options.description,
  };
}

// ============================================================================
// Common Feature Definitions
// ============================================================================

export const CommonFeatures = {
  webgpu: createFeatureRequirement(
    'webgpu',
    [{ capability: 'renderingBackend', value: 'webgpu', comparison: 'equals' }],
    { fallback: 'webgl2', description: 'WebGPU rendering' }
  ),

  computeShaders: createFeatureRequirement(
    'computeShaders',
    [{ capability: 'graphics.computeShaders', value: true, comparison: 'equals' }],
    { critical: false, description: 'GPU compute shaders' }
  ),

  rayTracing: createFeatureRequirement(
    'rayTracing',
    [{ capability: 'graphics.rayTracing', value: true, comparison: 'equals' }],
    { fallback: 'rasterization', description: 'Hardware ray tracing' }
  ),

  vrSupport: createFeatureRequirement(
    'vrSupport',
    [{ capability: 'xr.modes', value: 'vr', comparison: 'contains' }],
    { critical: false, description: 'VR headset support' }
  ),

  arSupport: createFeatureRequirement(
    'arSupport',
    [{ capability: 'xr.modes', value: 'ar', comparison: 'contains' }],
    { critical: false, description: 'AR support' }
  ),

  handTracking: createFeatureRequirement(
    'handTracking',
    [{ capability: 'xr.handTracking', value: true, comparison: 'equals' }],
    { fallback: 'controllers', description: 'Hand tracking' }
  ),

  spatialAudio: createFeatureRequirement(
    'spatialAudio',
    [{ capability: 'audio.spatialAudio', value: true, comparison: 'equals' }],
    { fallback: 'stereoAudio', description: '3D spatial audio' }
  ),

  speechRecognition: createFeatureRequirement(
    'speechRecognition',
    [{ capability: 'audio.speechRecognition', value: true, comparison: 'equals' }],
    { critical: false, description: 'Voice input' }
  ),

  multiThreading: createFeatureRequirement(
    'multiThreading',
    [{ capability: 'performance.multiThreading', value: true, comparison: 'equals' }],
    { fallback: 'singleThread', description: 'Web Workers with SharedArrayBuffer' }
  ),

  highEndDevice: createFeatureRequirement(
    'highEndDevice',
    [{ capability: 'performance.deviceTier', value: 4, comparison: 'gte' }],
    { fallback: 'standardDevice', description: 'High-end device capabilities' }
  ),
};
