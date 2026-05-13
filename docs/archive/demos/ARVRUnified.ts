/**
 * Demo Application 5: AR/VR Unified Experience
 *
 * Shows seamless transitions between AR and VR modes,
 * physical-digital blending, and context-aware auto-optimization.
 */

export const AR_VR_UNIFIED_HS = `
// Unified AR/VR Experience - Physical World Blending
orb unifiedExperience {
  position: [0, 0, 0]
  
  @rendering {
    platform: auto,
    mode: ar-vr-adaptive,
    qualityPreset: dynamic,
    contextAware: true
  }
  
  @state {
    currentMode: "auto",
    cameraMode: "world",
    physicalEnvironment: "unknown",
    lightingSource: "auto-detect",
    userDistance: 0.0
  }
}

// AR mode - blended with physical world
orb arLayer {
  parent: unifiedExperience,
  visible: @state.currentMode in [auto, ar],
  
  @material {
    type: translucent-pbr,
    transparency: 0.0,
    blendMode: screen
  }
  
  @lighting {
    type: environment-capture,
    estimateLighting: true,
    shadowPlanes: [floor, walls]
  }
  
  @rendering {
    mode: ar,
    occlusionCulling: true,
    depthAwareness: true,
    physicalRaycast: true
  }
}

// VR mode - full immersive environment
orb vrEnvironment {
  parent: unifiedExperience,
  visible: @state.currentMode in [auto, vr],
  
  @material {
    type: pbr,
    metallic: 0.2,
    roughness: 0.6
  }
  
  @lighting {
    type: directional,
    intensity: 1.5,
    environmentMap: dynamic,
    shadowType: soft
  }
  
  @rendering {
    mode: vr,
    targetFPS: 90,
    foveatedRendering: true,
    multiViewRendering: true
  }
}

// Adaptive content based on mode
function updateContentVisibility() {
  match @state.currentMode {
    ar -> {
      hideFullEnvironment()
      showPhysicalAnchorPoints()
      enableOcclusion()
    }
    vr -> {
      showFullEnvironment()
      hidePhysicalElements()
      disableOcclusion()
    }
    auto -> {
      detectPhysicalEnvironment()
      if (physicalEnvironmentDetected()) {
        switchToAR()
      } else {
        switchToVR()
      }
    }
  }
}

// Physical anchor system
orb physicalAnchors {
  parent: unifiedExperience,
  
  @state { detectionMode: spatial }
  
  for(anchor in detectPhysicalSurfaces()) {
    orb anchor {
      position: anchor.position,
      normal: anchor.normal,
      @material { transparency: 0.0 }
      @rendering { occlusionGeometry: true }
    }
  }
}

// Transition between modes with context preservation
function transitionMode(targetMode) {
  // Save current state
  saveViewState()
  saveObjectStates()
  
  // Fade out current mode
  fadeOut(300ms)
  
  // Update rendering mode
  @state.currentMode = targetMode
  
  // Fade in new mode with preserved state
  fadeIn(300ms)
  
  restoreViewState()
}

// Context-aware LOD
function selectLODLevel() {
  const distance = @state.userDistance
  const mode = @state.currentMode
  
  match (mode, distance) {
    (ar, < 1m) -> selectLOD(high_detail, low_triangle_count)
    (ar, 1-5m) -> selectLOD(medium_detail, medium_triangle_count)
    (ar, > 5m) -> selectLOD(billboard, low_triangle_count)
    (vr, any) -> selectLOD(high_detail, high_triangle_count)
  }
}
`;

/**
 * AR/VR Unified Demo
 * Seamless AR/VR transitions with physical environment awareness
 */
export class ARVRUnifiedDemo {
  private name: string = 'AR/VR Unified Platform';
  private hsCode: number = 110; // Lines of HoloScript+ code
  private traditionalCode: number = 18000; // Lines of traditional code

  private useCases: string[] = [
    'Virtual Furniture in Physical Rooms',
    'Remote Collaboration (AR + VR)',
    'Construction Site Visualization',
    'Product Customization',
    'Education and Training',
  ];

  private deviceCapabilities = {
    'phone-ar': {
      arCapability: 'ARKit/ARCore',
      vrCapability: 'Cardboard compatible',
      transitionTime: 0.5,
      occlusionQuality: 'Basic',
      lightingEstimate: 'Automatic',
    },
    'tablet-ar': {
      arCapability: 'Full ARKit',
      vrCapability: 'Passthrough to split-screen',
      transitionTime: 0.3,
      occlusionQuality: 'Advanced',
      lightingEstimate: 'Per-frame',
    },
    'ar-glasses': {
      arCapability: 'Native AR',
      vrCapability: 'Passthrough VR mode',
      transitionTime: 0.1,
      occlusionQuality: 'Premium',
      lightingEstimate: 'Real-time HDR',
    },
    'vr-headset': {
      arCapability: 'Passthrough AR',
      vrCapability: 'Native VR',
      transitionTime: 0.2,
      occlusionQuality: 'VR-grade',
      lightingEstimate: 'Photometric cameras',
    },
  };

  constructor() {}

  /**
   * Mode detection and adaptation
   */
  getAutoModeDetection(): {
    signal: string;
    threshold: string;
    confidence: string;
    action: string;
  }[] {
    return [
      {
        signal: 'Physical environment detected',
        threshold: '> 80% tracking quality',
        confidence: '95%',
        action: 'Switch to AR mode',
      },
      {
        signal: 'No physical environment',
        threshold: 'Tracking lost',
        confidence: '99%',
        action: 'Switch to VR mode',
      },
      {
        signal: 'User removes AR device',
        threshold: 'Accelerometer detects removal',
        confidence: '92%',
        action: 'Pause experience',
      },
      {
        signal: 'User puts on VR headset',
        threshold: 'Device sensors active',
        confidence: '98%',
        action: 'Full immersion mode',
      },
      {
        signal: 'Flip between screens',
        threshold: 'Device rotation detected',
        confidence: '85%',
        action: 'Optional mode change',
      },
    ];
  }

  /**
   * Seamless transition scenarios
   */
  getTransitionScenarios(): {
    scenario: string;
    startMode: string;
    endMode: string;
    preservedState: string[];
    transitionTime: string;
  }[] {
    return [
      {
        scenario: 'Walk from room to outdoor',
        startMode: 'AR in room',
        endMode: 'VR outdoor setting',
        preservedState: ['selected object', 'view angle', 'modification state'],
        transitionTime: '0.5 seconds',
      },
      {
        scenario: 'User puts on VR headset',
        startMode: 'AR on phone',
        endMode: 'VR full experience',
        preservedState: ['all objects', 'scene state', 'user position'],
        transitionTime: '1-2 seconds',
      },
      {
        scenario: 'Remove VR headset',
        startMode: 'VR full immersion',
        endMode: 'AR on phone',
        preservedState: ['selected objects', 'camera view', 'annotations'],
        transitionTime: '0.5 seconds',
      },
      {
        scenario: 'Outdoor to indoor transition',
        startMode: 'AR outdoor',
        endMode: 'AR indoor with relighting',
        preservedState: ['all objects', 'physical anchors', 'annotations'],
        transitionTime: '0.3 seconds',
      },
      {
        scenario: 'Low light to bright environment',
        startMode: 'Any mode',
        endMode: 'Same mode relit',
        preservedState: ['all state maintained'],
        transitionTime: '0.2 seconds',
      },
    ];
  }

  /**
   * Physical environment adaptation
   */
  getPhysicalEnvironmentAdaptation(): Record<string, Record<string, unknown>> {
    return {
      'empty-room': {
        autoMode: 'AR or VR (user choice)',
        occlusion: 'Floor only',
        lighting: 'Detected + augmented',
        contentPlacement: 'Free placement',
        shadowRendering: 'Simple shadow plane',
        recommendation: 'Good for AR demo',
      },
      'furnished-room': {
        autoMode: 'AR (occlusion needed)',
        occlusion: 'Full furniture model required',
        lighting: 'Real room lighting used',
        contentPlacement: 'Surface-aware placement',
        shadowRendering: 'Full occlusion shadows',
        recommendation: 'AR preferred for realism',
      },
      'outdoor-bright': {
        autoMode: 'AR (natural lighting)',
        occlusion: 'Minimal (ground plane)',
        lighting: 'Direct sunlight detected',
        contentPlacement: 'Ground anchored',
        shadowRendering: 'Long dynamic shadows',
        recommendation: 'AR works well',
      },
      'outdoor-low-light': {
        autoMode: 'VR (visibility issues)',
        occlusion: 'Minimal',
        lighting: 'Night mode preset',
        contentPlacement: 'Manual placement',
        shadowRendering: 'Ambient-based',
        recommendation: 'VR recommended',
      },
      'industrial-bright': {
        autoMode: 'AR (high-contrast)',
        occlusion: 'Complex machinery',
        lighting: 'Fluorescent detected',
        contentPlacement: 'Snap to structures',
        shadowRendering: 'Technical overlay',
        recommendation: 'AR with grid assist',
      },
    };
  }

  /**
   * Occlusion handling across devices
   */
  getOcclusionStrategy(): {
    device: string;
    occlusionType: string;
    precision: string;
    updateRate: number;
    fallback: string;
  }[] {
    return [
      {
        device: 'iPhone/Android',
        occlusionType: 'Simple plane (floor)',
        precision: 'Meter-level',
        updateRate: 10,
        fallback: 'Virtual environment switch',
      },
      {
        device: 'iPad',
        occlusionType: 'LiDAR-assisted geometry',
        precision: 'Centimeter-level',
        updateRate: 30,
        fallback: 'Simple plane occlusion',
      },
      {
        device: 'AR Glasses',
        occlusionType: 'Depth camera + mesh',
        precision: 'Millimeter-level',
        updateRate: 60,
        fallback: 'LiDAR-based geometry',
      },
      {
        device: 'VR Headset w/ Passthrough',
        occlusionType: 'Camera passthrough + estimation',
        precision: 'Centimeter-level',
        updateRate: 90,
        fallback: 'Virtual environment only',
      },
    ];
  }

  /**
   * Lighting environment capture
   */
  getLightingEnvironmentSystem(): {
    method: string;
    device: string;
    updateFrequency: string;
    parameters: string[];
    fallback: string;
  }[] {
    return [
      {
        method: 'Automatic light estimation',
        device: 'Smartphone camera',
        updateFrequency: '30 Hz',
        parameters: [
          'Ambient intensity',
          'Light color temperature',
          'Main light direction',
          'Skybox estimation',
        ],
        fallback: 'Default studio lighting',
      },
      {
        method: 'HDR environment map',
        device: 'Tablet with LiDAR',
        updateFrequency: '10 Hz',
        parameters: [
          'Full 360° radiance',
          'Ambient + direct light',
          'Specular highlights',
          'Shadow detection',
        ],
        fallback: 'Automatic light estimation',
      },
      {
        method: 'Real-time photometric capture',
        device: 'AR Glasses',
        updateFrequency: '60 Hz',
        parameters: [
          'Full HDR map',
          'Sub-millisecond precision',
          'Caustics simulation',
          'Time-of-day aware',
        ],
        fallback: 'HDR environment map',
      },
    ];
  }

  /**
   * Use case implementations
   */
  getUseImplementations(): Record<string, Record<string, unknown>> {
    return {
      'furniture-placement': {
        startMode: 'AR',
        devices: ['Smartphone', 'Tablet', 'AR Glasses'],
        workflow: [
          'User points phone at room',
          'Furniture models appear in real space',
          'Tap to place, drag to move',
          'Switch to VR to see in different room',
          'Transition back to AR in actual room',
        ],
        benefits: [
          'See actual scale',
          'Lighting matches room',
          'Shadows on real floor',
          'Try different rooms virtually',
        ],
      },
      'construction-visualization': {
        startMode: 'AR on site',
        devices: ['Tablet on jobsite', 'VR office review'],
        workflow: [
          'Scan building site with tablet AR',
          'Digital building model overlaid on real site',
          'Manager reviews in VR back at office',
          'Annotations sync between AR and VR',
          'Changes update real-time to site crew',
        ],
        benefits: [
          'See final result before construction',
          'Identify conflicts early',
          'Remote team visibility',
          'Scale verification',
        ],
      },
      'product-customization': {
        startMode: 'Auto-detect',
        devices: ['Any device'],
        workflow: [
          'Customer AR preview in their home',
          'Sales rep VR configuration in showroom',
          'Both users see real-time updates',
          'Transition seamlessly between AR/VR',
          'Final review in both modes',
        ],
        benefits: [
          'Customer sees in their space',
          'Sales rep controls options',
          'Both perspectives validated',
          'Increased confidence in purchase',
        ],
      },
      'medical-training': {
        startMode: 'VR',
        devices: ['VR Headset with passthrough'],
        workflow: [
          'Student practices anatomy in VR',
          'Switch to passthrough AR for real cadaver',
          'Overlay labeled structures on actual specimen',
          'Toggle between virtual and real',
          'Reinforces learning through both modes',
        ],
        benefits: [
          'Safe practice environment',
          'Real specimen reference',
          'Instant knowledge reinforcement',
          'Better knowledge retention',
        ],
      },
    };
  }

  /**
   * Comparison: Traditional vs HoloScript+
   */
  getImplementationComparison(): {
    aspect: string;
    traditional: string;
    holoscript: string;
    timeSaved: string;
  }[] {
    return [
      {
        aspect: 'AR Framework Setup',
        traditional: 'ARKit on iOS + ARCore on Android separately',
        holoscript: 'Unified AR abstraction',
        timeSaved: '2 weeks',
      },
      {
        aspect: 'VR Implementation',
        traditional: 'Separate VR engine integration',
        holoscript: 'Unified VR mode',
        timeSaved: '2 weeks',
      },
      {
        aspect: 'Mode Transitions',
        traditional: 'Custom state preservation logic per app',
        holoscript: 'Declarative state with auto preservation',
        timeSaved: '1 week',
      },
      {
        aspect: 'Lighting Adaptation',
        traditional: 'Platform-specific light estimation',
        holoscript: 'Unified light capture API',
        timeSaved: '2 weeks',
      },
      {
        aspect: 'Occlusion System',
        traditional: 'Device-specific mesh generation',
        holoscript: 'Automatic occlusion handling',
        timeSaved: '3 weeks',
      },
      {
        aspect: 'Cross-device Testing',
        traditional: 'Test on 8-10 devices separately',
        holoscript: 'Single codebase',
        timeSaved: '2 weeks',
      },
    ];
  }

  /**
   * Technical requirements comparison
   */
  getTechnicalComparison(): {
    component: string;
    traditional: number | string;
    holoscript: number | string;
    reduction: string;
  }[] {
    return [
      {
        component: 'AR Integration Code',
        traditional: 3000,
        holoscript: 100,
        reduction: '97%',
      },
      {
        component: 'VR Integration Code',
        traditional: 2500,
        holoscript: 100,
        reduction: '96%',
      },
      {
        component: 'Mode Transition Logic',
        traditional: 2000,
        holoscript: 50,
        reduction: '97%',
      },
      {
        component: 'Lighting System',
        traditional: 2500,
        holoscript: 100,
        reduction: '96%',
      },
      {
        component: 'Occlusion Handling',
        traditional: 3000,
        holoscript: 150,
        reduction: '95%',
      },
      {
        component: 'Platform Abstraction',
        traditional: 2000,
        holoscript: 50,
        reduction: '97%',
      },
      {
        component: 'Total Development Time',
        traditional: '20 weeks',
        holoscript: '2 weeks',
        reduction: '90%',
      },
    ];
  }

  /**
   * Device matrix showing AR/VR capabilities
   */
  getDeviceMatrix(): {
    device: string;
    nativeAR: boolean;
    nativeVR: boolean;
    autoMode: boolean;
    occlusionQuality: string;
    recommendedMode: string;
  }[] {
    return [
      {
        device: 'iPhone/Android',
        nativeAR: true,
        nativeVR: false,
        autoMode: true,
        occlusionQuality: 'Basic',
        recommendedMode: 'AR',
      },
      {
        device: 'iPad Pro',
        nativeAR: true,
        nativeVR: false,
        autoMode: true,
        occlusionQuality: 'Advanced',
        recommendedMode: 'AR',
      },
      {
        device: 'Apple Vision Pro',
        nativeAR: true,
        nativeVR: true,
        autoMode: true,
        occlusionQuality: 'Premium',
        recommendedMode: 'Auto',
      },
      {
        device: 'Meta Quest 3',
        nativeAR: true,
        nativeVR: true,
        autoMode: true,
        occlusionQuality: 'VR-grade',
        recommendedMode: 'Auto',
      },
      {
        device: 'HoloLens 2',
        nativeAR: true,
        nativeVR: false,
        autoMode: true,
        occlusionQuality: 'Premium AR',
        recommendedMode: 'AR',
      },
      {
        device: 'Desktop VR',
        nativeAR: false,
        nativeVR: true,
        autoMode: false,
        occlusionQuality: 'N/A',
        recommendedMode: 'VR',
      },
    ];
  }
}

export function createARVRUnifiedDemo(): ARVRUnifiedDemo {
  return new ARVRUnifiedDemo();
}
