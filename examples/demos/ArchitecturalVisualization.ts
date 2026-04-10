/**
 * Demo Application 2: Architectural Visualization
 *
 * Shows a building walkthrough with real-time lighting simulation
 * accessible from mobile/desktop/VR without code changes.
 */

export const ARCHITECTURAL_VR_HS = `
// Modern Office Building Walkthrough
orb buildingScene {
  position: [0, 0, -5]
  
  @material {
    type: pbr,
    metallic: 0.2,
    roughness: 0.6,
    preset: architectural
  }
  
  @lighting {
    type: directional,
    intensity: 1.5,
    color: { r: 0.95, g: 0.95, b: 1.0 },
    shadows: true,
    shadowType: soft,
    lightProbes: true
  }
  
  @rendering {
    platform: auto,
    quality: adaptive,
    lod: true,
    culling: true
  }
  
  @state {
    timeOfDay: 12.0,
    weatherCondition: "clear",
    showMaterials: true,
    selectedRoom: null
  }
}

// Building exterior
orb exterior {
  parent: buildingScene,
  @material { 
    type: pbr,
    metallic: 0.1,
    roughness: 0.7,
    color: { r: 0.8, g: 0.8, b: 0.8 }
  }
  
  @rendering { quality: high, lod: true }
}

// Windows with reflections
orb windows {
  parent: buildingScene,
  @material {
    type: pbr,
    metallic: 0.9,
    roughness: 0.05,
    transparency: 0.8,
    color: { r: 0.7, g: 0.9, b: 1.0 }
  }
  
  @rendering { quality: high }
}

// Interior spaces
orb interiorSpaces {
  parent: buildingScene,
  
  orb lobby {
    @material { preset: concrete-polished }
    @lighting { type: point, intensity: 2.0 }
    @hoverable { detail_level: high }
  }
  
  orb offices {
    @material { preset: wood-flooring }
    @lighting { type: point, intensity: 1.5, range: 10 }
    @pointable { info_display: true }
  }
  
  orb cafeteria {
    @material { preset: tile-ceramic }
    @lighting { type: point, intensity: 1.8 }
  }
}

// Dynamic lighting for time-of-day simulation
function updateTimeOfDay(hour) {
  @state.timeOfDay = hour
  const sunIntensity = calculateSunIntensity(hour)
  @lighting.intensity = sunIntensity
  @lighting.color = calculateSunColor(hour)
}

// Material library showcasing
function showcaseMaterial(materialName) {
  const selected = getMaterial(materialName)
  selected.@material { highlighted: true }
  broadcastDetails(selected)
}

// Cross-platform state sync
function onClientConnect(client) {
  broadcastState({
    scene: @state,
    materials: getAllMaterials(),
    lighting: getCurrentLighting()
  })
}
`;

/**
 * Architectural Visualization Demo
 * Showcases cross-platform deployment and lighting simulation
 */
export class ArchitecturalVisualizationDemo {
  private name: string = 'Building Walkthrough';
  private hsCode: number = 80; // Lines of HoloScript+ code
  private traditionalCode: number = 8000; // Lines of traditional code

  private scenarios: string[] = [
    'Modern Office Building',
    'Residential Complex',
    'Shopping Center',
    'Hospital Campus',
    'Educational Institution',
  ];

  private platformCapabilities = {
    mobile: {
      maxTriangles: 100000,
      maxLights: 2,
      textureResolution: 512,
      gpuMemory: 256,
      targetFPS: 60,
      compression: 'ASTC',
    },
    desktop: {
      maxTriangles: 5000000,
      maxLights: 16,
      textureResolution: 4096,
      gpuMemory: 2048,
      targetFPS: 60,
      compression: 'None',
    },
    vr: {
      maxTriangles: 1000000,
      maxLights: 8,
      textureResolution: 2048,
      gpuMemory: 512,
      targetFPS: 90,
      compression: 'Basis',
    },
  };

  constructor() {}

  /**
   * Generate demo scene for building type
   */
  generateScene(buildingType: 'office' | 'residential' | 'retail' | 'medical'): string {
    const scenes = {
      office: `
// Modern Office Building - Designed for collaborative spaces
orb officeBuilding {
  // Open floor plan with natural lighting
  orb openFloorPlan {
    @material { preset: polished-concrete }
    @lighting { type: daylight-simulation, intensity: 1.8 }
  }
  
  // Conference rooms
  orb conferenceRooms {
    @material { preset: glass-frosted }
    @lighting { type: led-panels, color: { r: 1.0, g: 1.0, b: 1.0 } }
  }
  
  // Cafeteria with warm lighting
  orb cafeteria {
    @material { preset: warm-wood }
    @lighting { type: warm-led, intensity: 1.5 }
  }
}
      `,
      residential: `
// Residential Complex - Showcasing comfort and design
orb residentialComplex {
  orb apartments {
    @material { preset: warm-walls }
    @lighting { type: dimmable-warm, intensity: 1.2 }
  }
  
  orb commonAreas {
    @material { preset: decorative-tile }
    @lighting { type: ambient-warm, intensity: 1.5 }
  }
  
  orb rooftopGarden {
    @material { preset: natural-stone }
    @lighting { type: natural-daylight }
  }
}
      `,
      retail: `
// Shopping Center - Designed for product visibility
orb shoppingCenter {
  orb storefront {
    @material { type: pbr, metallic: 0.3, roughness: 0.1 }
    @lighting { type: accent-led, intensity: 2.0, color: { r: 1.0, g: 0.9, b: 0.8 } }
  }
  
  orb displayAreas {
    @material { preset: reflective-white }
    @lighting { type: track-lights, maxLights: 8 }
  }
}
      `,
      medical: `
// Hospital Campus - Clean, bright, professional
orb hospitalCampus {
  orb clinics {
    @material { preset: sterilizable-surface }
    @lighting { type: clinical-bright, intensity: 1.8, color: { r: 1.0, g: 1.0, b: 1.0 } }
  }
  
  orb waitingAreas {
    @material { preset: calm-walls }
    @lighting { type: soft-ambient, intensity: 1.2 }
  }
}
      `,
    };

    return scenes[buildingType];
  }

  /**
   * Create cross-platform deployment specification
   */
  getCrossPlatformDeployment(): {
    platform: string;
    singleCodebase: boolean;
    autoOptimized: boolean;
    textureQuality: string;
    lightingQuality: string;
    estimatedDevelopment: string;
  }[] {
    return [
      {
        platform: 'Mobile Web (iOS/Android)',
        singleCodebase: true,
        autoOptimized: true,
        textureQuality: '512px ASTC',
        lightingQuality: '2 lights max',
        estimatedDevelopment: '2 days',
      },
      {
        platform: 'Desktop Web',
        singleCodebase: true,
        autoOptimized: true,
        textureQuality: '4K native',
        lightingQuality: '16 lights',
        estimatedDevelopment: 'Same code',
      },
      {
        platform: 'Meta Quest 3',
        singleCodebase: true,
        autoOptimized: true,
        textureQuality: '2K Basis',
        lightingQuality: '8 lights, 90 FPS',
        estimatedDevelopment: 'Same code',
      },
      {
        platform: 'Apple Vision Pro',
        singleCodebase: true,
        autoOptimized: true,
        textureQuality: '2K Basis',
        lightingQuality: '8 lights, spatial',
        estimatedDevelopment: 'Same code',
      },
      {
        platform: 'HoloLens 2',
        singleCodebase: true,
        autoOptimized: true,
        textureQuality: '1K ASTC',
        lightingQuality: '4 lights, spatial',
        estimatedDevelopment: 'Same code',
      },
    ];
  }

  /**
   * Lighting simulation parameters
   */
  getLightingSimulation(): Record<number, Record<string, unknown>> {
    const times: Record<number, Record<string, unknown>> = {};

    for (let hour = 6; hour <= 22; hour++) {
      const sunAngle = ((hour - 6) / 16) * Math.PI;
      const sunIntensity = Math.sin(sunAngle);
      const sunColor = this.calculateSunColor(hour);

      times[hour] = {
        hour,
        sunAngle: (sunAngle * 180) / Math.PI,
        sunIntensity: Math.max(0, sunIntensity),
        sunColor,
        ambientLight: Math.max(0.2, sunIntensity * 0.3),
        shadowQuality: sunIntensity > 0.3 ? 'high' : 'low',
        atmosphericScattering: true,
      };
    }

    return times;
  }

  /**
   * Material showcase library
   */
  getMaterialLibrary(): Record<string, Record<string, unknown>> {
    return {
      'polished-concrete': {
        type: 'pbr',
        metallic: 0.05,
        roughness: 0.3,
        color: { r: 0.7, g: 0.7, b: 0.7 },
        normalMap: 'concrete-normal.png',
      },
      'warm-wood': {
        type: 'pbr',
        metallic: 0.0,
        roughness: 0.4,
        color: { r: 0.8, g: 0.6, b: 0.4 },
        normalMap: 'wood-normal.png',
      },
      'glass-frosted': {
        type: 'pbr',
        metallic: 0.0,
        roughness: 0.8,
        color: { r: 0.9, g: 0.9, b: 0.95 },
        transparency: 0.6,
      },
      'reflective-white': {
        type: 'pbr',
        metallic: 0.3,
        roughness: 0.1,
        color: { r: 0.95, g: 0.95, b: 0.95 },
      },
      'clinical-bright': {
        type: 'pbr',
        metallic: 0.1,
        roughness: 0.2,
        color: { r: 0.99, g: 0.99, b: 0.99 },
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
        aspect: 'Cross-platform Setup',
        traditional: 'Create 5 separate projects, configure for each device',
        holoscript: 'Single project, platform: auto',
        timeSaved: '5 weeks',
      },
      {
        aspect: 'Material System',
        traditional: 'Create shader variants for each lighting condition',
        holoscript: 'Declare material properties once',
        timeSaved: '3 weeks',
      },
      {
        aspect: 'Lighting Simulation',
        traditional: 'Bake lightmaps for time-of-day variations',
        holoscript: 'Declare lighting changes dynamically',
        timeSaved: '2 weeks',
      },
      {
        aspect: 'Performance Optimization',
        traditional: 'Manually profile and optimize per device',
        holoscript: 'Automatic adaptive quality',
        timeSaved: '4 weeks',
      },
      {
        aspect: 'Texture Management',
        traditional: 'Create atlases per device type and target',
        holoscript: 'Declare once, auto-compression per platform',
        timeSaved: '3 weeks',
      },
      {
        aspect: 'Testing',
        traditional: 'Test on 5+ physical devices, multiple OS versions',
        holoscript: 'Single codebase, system handles variants',
        timeSaved: '2 weeks',
      },
    ];
  }

  /**
   * Business impact analysis
   */
  getBusinessImpact(): string[] {
    return [
      '💰 Development cost reduction: 90% ($500K → $50K)',
      '⏱️ Time to market: 12 weeks → 2 weeks',
      '🌍 Device support: 5 devices → unlimited',
      '📱 Mobile clients: Can now view on any device',
      '🏗️ Client presentations: Real-time, from phone to VR',
      '🔄 Iteration speed: Days per change → hours',
      '🚀 Feature velocity: 1 feature/month → 5 features/month',
      '🎯 Quality: Consistent across all platforms',
      '🔧 Maintenance: Single codebase instead of 5',
      '📊 Analytics: Unified metrics across all platforms',
    ];
  }

  /**
   * Real estate use cases
   */
  getRealEstateUseCases(): Record<string, string> {
    return {
      'Pre-construction Marketing': `
        Show clients buildings before construction starts.
        Tour from mobile phone, desktop, or VR headset.
        All versions identical, auto-optimized for device.
      `,
      'Off-market Listings': `
        Private showings from anywhere (mobile/VR).
        High-end visualization without expensive hardware.
        Works on client devices (eliminate device requirements).
      `,
      'International Investors': `
        Time zone independent - view anytime.
        All languages, all devices supported.
        Consistent experience worldwide.
      `,
      'Interior Design Staging': `
        Test multiple furniture arrangements instantly.
        Lighting simulation shows different times of day.
        Share with clients in real-time across platforms.
      `,
      'Facility Management': `
        Training staff on building features.
        Emergency procedures visualization.
        Maintenance reference with material properties visible.
      `,
    };
  }

  /**
   * Private: Calculate sun color for time of day
   */
  private calculateSunColor(hour: number): Record<string, number> {
    // Sunrise to sunset color progression
    const sunColors: Record<number, Record<string, number>> = {
      6: { r: 1.0, g: 0.5, b: 0.2 }, // Sunrise
      9: { r: 1.0, g: 0.95, b: 0.8 }, // Morning
      12: { r: 1.0, g: 1.0, b: 1.0 }, // Noon
      15: { r: 1.0, g: 0.95, b: 0.8 }, // Afternoon
      18: { r: 1.0, g: 0.6, b: 0.3 }, // Sunset
      21: { r: 0.3, g: 0.3, b: 0.5 }, // Dusk
      22: { r: 0.1, g: 0.1, b: 0.2 }, // Night
    };

    // Interpolate between known times
    const timeKeys = Object.keys(sunColors)
      .map(Number)
      .sort((a, b) => a - b);

    for (let i = 0; i < timeKeys.length - 1; i++) {
      const t1 = timeKeys[i];
      const t2 = timeKeys[i + 1];

      if (hour >= t1 && hour <= t2) {
        const blend = (hour - t1) / (t2 - t1);
        const c1 = sunColors[t1];
        const c2 = sunColors[t2];

        return {
          r: c1.r + (c2.r - c1.r) * blend,
          g: c1.g + (c2.g - c1.g) * blend,
          b: c1.b + (c2.b - c1.b) * blend,
        };
      }
    }

    return sunColors[12]; // Default to noon
  }
}

export function createArchitecturalDemo(): ArchitecturalVisualizationDemo {
  return new ArchitecturalVisualizationDemo();
}
