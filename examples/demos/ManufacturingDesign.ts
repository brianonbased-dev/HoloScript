/**
 * Demo Application 3: Manufacturing Design
 *
 * Shows a product assembly walkthrough with real-time quality inspection
 * and stress visualization accessible from factory floor, office, and remote locations.
 */

export const MANUFACTURING_DESIGN_HS = `
// Precision Manufacturing - Assembly Line Visualization
orb manufacturingScene {
  position: [0, 0, 0]
  
  @material {
    type: pbr,
    metallic: 0.7,
    roughness: 0.3,
    preset: industrial-metal
  }
  
  @lighting {
    type: directional,
    intensity: 1.8,
    color: { r: 1.0, g: 1.0, b: 1.0 },
    shadows: true,
    shadowType: sharp,
    lightProbes: true
  }
  
  @rendering {
    platform: auto,
    quality: adaptive,
    lod: true,
    culling: true
  }
  
  @state {
    assemblyStep: 0,
    toleranceMode: "nominal",
    stressVisualization: false,
    selectedComponent: null
  }
}

// Assembly workstation
orb workstation {
  parent: manufacturingScene,
  
  @material { 
    type: pbr,
    metallic: 0.6,
    roughness: 0.4,
    color: { r: 0.8, g: 0.8, b: 0.8 }
  }
  
  @lighting { type: task-lighting, intensity: 2.0 }
}

// Product assembly - Engine block example
orb engineBlock {
  parent: manufacturingScene,
  
  orb crankshaft {
    @material { type: pbr, metallic: 0.9, roughness: 0.2 }
    @hoverable { detail_level: full, tolerance: true }
  }
  
  orb pistonAssembly {
    @material { type: pbr, metallic: 0.8, roughness: 0.25 }
    @pointable { info_display: true, stress_display: true }
  }
  
  orb cylinderHead {
    @material { type: pbr, metallic: 0.7, roughness: 0.3 }
    @hoverable { cross_section: true, material_layers: true }
  }
}

// Stress visualization overlay
function visualizeStress(component) {
  component.@rendering {
    overlay: stress-heatmap,
    colorScale: stress-intensity
  }
}

// Quality inspection mode
function inspectionMode(enabled) {
  if (enabled) {
    @rendering.overlay = tolerance-zones
    @lighting.intensity = 2.5
    @material { roughness: 0.1, highlight: true }
  }
}

// Step-by-step assembly walkthrough
function nextAssemblyStep() {
  @state.assemblyStep += 1
  highlightComponent(getComponent(@state.assemblyStep))
  centerCamera(getComponent(@state.assemblyStep))
}

// Remote collaborative annotation
function annotateIssue(position, severity, description) {
  createAnnotation({
    position,
    severity,
    description,
    timestamp: now(),
    userId: getCurrentUser()
  })
}
`;

/**
 * Manufacturing Design Demo
 * Showcases precision engineering, stress analysis, and remote collaboration
 */
export class ManufacturingDesignDemo {
  private name: string = 'Advanced Manufacturing';
  private hsCode: number = 90; // Lines of HoloScript+ code
  private traditionalCode: number = 12000; // Lines of traditional code

  private industries: string[] = [
    'Automotive',
    'Aerospace',
    'Medical Devices',
    'Consumer Electronics',
    'Industrial Equipment',
  ];

  private deviceScenarios = {
    'factory-floor': {
      device: 'Tablet',
      use: 'Real-time assembly guidance',
      resolution: 1024,
      fps: 60,
      latency: '< 100ms',
      accuracy: 'High precision',
    },
    'engineering-office': {
      device: 'Desktop Workstation',
      use: 'Detailed CAD review and annotation',
      resolution: 4096,
      fps: 60,
      latency: '< 50ms',
      accuracy: 'Design specification',
    },
    'remote-inspection': {
      device: 'Mobile Phone',
      use: 'Quality inspector from anywhere',
      resolution: 512,
      fps: 30,
      latency: '< 200ms',
      accuracy: 'Tolerance zones',
    },
    'vr-training': {
      device: 'VR Headset',
      use: 'Assembly procedure training',
      resolution: 1024,
      fps: 90,
      latency: '< 11ms',
      accuracy: 'Spatial accuracy',
    },
  };

  constructor() {}

  /**
   * Generate product assembly specification
   */
  generateAssemblySpecification(productType: 'engine' | 'phone' | 'prosthetic' | 'turbine'): {
    component: string;
    quantity: number;
    material: string;
    tolerance: string;
    estimatedTime: string;
  }[] {
    const specs = {
      engine: [
        {
          component: 'Crankshaft',
          quantity: 1,
          material: 'Ductile Iron',
          tolerance: '±0.05mm',
          estimatedTime: '45 minutes',
        },
        {
          component: 'Piston Assembly',
          quantity: 4,
          material: 'Aluminum Alloy',
          tolerance: '±0.02mm',
          estimatedTime: '30 minutes per',
        },
        {
          component: 'Cylinder Head',
          quantity: 1,
          material: 'Cast Iron',
          tolerance: '±0.1mm',
          estimatedTime: '60 minutes',
        },
        {
          component: 'Valves',
          quantity: 8,
          material: 'Steel',
          tolerance: '±0.01mm',
          estimatedTime: '15 minutes per',
        },
      ],
      phone: [
        {
          component: 'Display Assembly',
          quantity: 1,
          material: 'Gorilla Glass + OLED',
          tolerance: '±0.01mm',
          estimatedTime: '20 minutes',
        },
        {
          component: 'Main PCB',
          quantity: 1,
          material: 'FR-4',
          tolerance: '±0.001mm',
          estimatedTime: '30 minutes',
        },
        {
          component: 'Battery Module',
          quantity: 1,
          material: 'Li-Po',
          tolerance: '±0.05mm',
          estimatedTime: '15 minutes',
        },
        {
          component: 'Antenna Array',
          quantity: 1,
          material: 'Copper Trace',
          tolerance: '±0.0001mm',
          estimatedTime: '25 minutes',
        },
      ],
      prosthetic: [
        {
          component: 'Socket Interface',
          quantity: 1,
          material: 'Carbon Fiber',
          tolerance: '±0.5mm',
          estimatedTime: '40 minutes',
        },
        {
          component: 'Actuator Assembly',
          quantity: 1,
          material: 'Titanium Alloy',
          tolerance: '±0.1mm',
          estimatedTime: '50 minutes',
        },
        {
          component: 'Control Electronics',
          quantity: 1,
          material: 'Custom PCB',
          tolerance: '±0.01mm',
          estimatedTime: '35 minutes',
        },
        {
          component: 'Sensory Feedback Unit',
          quantity: 1,
          material: 'MEMS Sensors',
          tolerance: '±0.001mm',
          estimatedTime: '30 minutes',
        },
      ],
      turbine: [
        {
          component: 'Rotor Assembly',
          quantity: 1,
          material: 'High-Temp Steel',
          tolerance: '±0.01mm',
          estimatedTime: '120 minutes',
        },
        {
          component: 'Blade Cluster',
          quantity: 4,
          material: 'Single Crystal Ni Superalloy',
          tolerance: '±0.001mm',
          estimatedTime: '180 minutes per',
        },
        {
          component: 'Bearing Assembly',
          quantity: 2,
          material: 'Ceramic Hybrid',
          tolerance: '±0.005mm',
          estimatedTime: '90 minutes each',
        },
        {
          component: 'Sealing Systems',
          quantity: 3,
          material: 'Advanced Composites',
          tolerance: '±0.02mm',
          estimatedTime: '60 minutes each',
        },
      ],
    };

    return specs[productType];
  }

  /**
   * Stress analysis visualization modes
   */
  getStressVisualizationModes(): Record<string, Record<string, unknown>> {
    return {
      'von-mises': {
        name: 'Von Mises Stress',
        colorScale: 'hot-to-cold',
        unit: 'MPa',
        safetyFactor: 3.0,
        criticalZones: true,
      },
      'principal-stress': {
        name: 'Principal Stress',
        colorScale: 'directional',
        unit: 'MPa',
        vectors: true,
        criticalPoints: true,
      },
      'fatigue-life': {
        name: 'Fatigue Life Prediction',
        colorScale: 'cycle-count',
        unit: 'Cycles',
        failureZones: true,
        worstCase: true,
      },
      'thermal-strain': {
        name: 'Thermal Strain Distribution',
        colorScale: 'thermal-gradient',
        unit: 'Microstrain',
        hotspots: true,
        coolingPaths: true,
      },
      deflection: {
        name: 'Deflection Magnitude',
        colorScale: 'magnitude',
        unit: 'Micrometers',
        vectors: true,
        exaggeration: 10,
      },
    };
  }

  /**
   * Assembly step-by-step procedure
   */
  getAssemblyProcedure(productType: 'engine' | 'phone' | 'prosthetic' | 'turbine'): {
    step: number;
    action: string;
    component: string;
    expectedTime: string;
    qualityCriteria: string[];
    warningPoints: string[];
  }[] {
    const procedures = {
      engine: [
        {
          step: 1,
          action: 'Inspect',
          component: 'Crankshaft',
          expectedTime: '5 min',
          qualityCriteria: ['No visible damage', 'Runout < 0.05mm', 'Surface finish Ra < 0.8'],
          warningPoints: ['Check for cracks with penetrant dye', 'Verify all journals present'],
        },
        {
          step: 2,
          action: 'Install',
          component: 'Main Bearings',
          expectedTime: '15 min',
          qualityCriteria: ['Correct orientation', 'No foreign material', 'Proper torque 45-50 Nm'],
          warningPoints: ['Do not drop bearings', 'Keep clean - no fingerprints'],
        },
        {
          step: 3,
          action: 'Install',
          component: 'Crankshaft Assembly',
          expectedTime: '10 min',
          qualityCriteria: ['Smooth rotation', 'No binding', 'Runout verification passed'],
          warningPoints: ['Support at all points', 'Verify clearance < 0.15mm'],
        },
        {
          step: 4,
          action: 'Install',
          component: 'Piston Rods',
          expectedTime: '20 min',
          qualityCriteria: ['Correct length', 'Pin clearance perfect', 'No scratches on pin bore'],
          warningPoints: ['Use press with support', 'Verify orientation arrows match'],
        },
        {
          step: 5,
          action: 'Install',
          component: 'Pistons',
          expectedTime: '15 min',
          qualityCriteria: ['Correct ring orientation', 'Top mark visible', 'Free ring movement'],
          warningPoints: ['Ring gaps must be staggered', 'Apply thin oil layer'],
        },
      ],
      phone: [
        {
          step: 1,
          action: 'Prepare',
          component: 'Main PCB',
          expectedTime: '5 min',
          qualityCriteria: [
            'No visible corrosion',
            'All components soldered',
            'No cold solder joints',
          ],
          warningPoints: ['Static precautions required', 'Ground wrist strap before touching'],
        },
        {
          step: 2,
          action: 'Install',
          component: 'Battery Module',
          expectedTime: '3 min',
          qualityCriteria: ['Correct polarity', 'Secure connection', 'No pinched wires'],
          warningPoints: ['Do not short terminals', 'Verify voltage with multimeter'],
        },
        {
          step: 3,
          action: 'Install',
          component: 'Display Assembly',
          expectedTime: '8 min',
          qualityCriteria: [
            'No dust under display',
            'Color accuracy verified',
            'Touch response good',
          ],
          warningPoints: ['Handle by edges only', 'Verify 100% pixel coverage'],
        },
        {
          step: 4,
          action: 'Test',
          component: 'All Systems',
          expectedTime: '10 min',
          qualityCriteria: ['Boot successful', 'All sensors responsive', 'Battery holds charge'],
          warningPoints: ['Run full diagnostic suite', 'Temperature check OK'],
        },
      ],
      prosthetic: [
        {
          step: 1,
          action: 'Calibrate',
          component: 'Sensor Array',
          expectedTime: '20 min',
          qualityCriteria: ['All axes responding', 'Drift < 1%', 'Response time < 10ms'],
          warningPoints: ['Temperature stabilization required', 'Zero offset must be set'],
        },
        {
          step: 2,
          action: 'Install',
          component: 'Actuator Assembly',
          expectedTime: '15 min',
          qualityCriteria: ['Full range motion', 'Smooth response', 'No grinding sounds'],
          warningPoints: ['Verify load capacity', 'Check safety limits'],
        },
        {
          step: 3,
          action: 'Program',
          component: 'Control Algorithm',
          expectedTime: '30 min',
          qualityCriteria: [
            'User training complete',
            'Response intuitive',
            'Safety protocols active',
          ],
          warningPoints: ['Backup settings before update', 'Verify emergency stop'],
        },
      ],
      turbine: [
        {
          step: 1,
          action: 'Balance',
          component: 'Rotor Assembly',
          expectedTime: '60 min',
          qualityCriteria: ['Imbalance < 0.5g·mm', 'Runout < 0.01mm', 'Vibration < 2 mils'],
          warningPoints: ['Use precision balancer', 'Temperature must be stable'],
        },
        {
          step: 2,
          action: 'Install',
          component: 'Blade Cluster',
          expectedTime: '120 min',
          qualityCriteria: [
            'Pitch angle within spec',
            'No blade rubbing',
            'Clearance verified at all points',
          ],
          warningPoints: ['Critical safety - measure 3x', 'Use CMM for verification'],
        },
        {
          step: 3,
          action: 'Install',
          component: 'Bearing Assembly',
          expectedTime: '45 min',
          qualityCriteria: ['Preload correct', 'Axial float verified', 'Thermal growth calculated'],
          warningPoints: [
            'Bearing temperature monitoring essential',
            'Oil supply pressure checked',
          ],
        },
        {
          step: 4,
          action: 'Test',
          component: 'Full System',
          expectedTime: '90 min',
          qualityCriteria: ['No unusual vibration', 'Temperature stable', 'Oil analysis passed'],
          warningPoints: ['Run endurance test', 'Monitor for hot spots'],
        },
      ],
    };

    return procedures[productType];
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
        aspect: 'Assembly Documentation',
        traditional: 'Create PDF/video for each workstation and language',
        holoscript: 'Single 3D model in any language, any device',
        timeSaved: '4 weeks',
      },
      {
        aspect: 'Quality Inspection',
        traditional: 'Separate app for tablet, desktop, mobile',
        holoscript: 'One codebase, all devices',
        timeSaved: '3 weeks',
      },
      {
        aspect: 'Stress Visualization',
        traditional: 'Render on high-end workstation only',
        holoscript: 'Stream to tablet/phone real-time',
        timeSaved: '2 weeks',
      },
      {
        aspect: 'Tolerance Zone Display',
        traditional: 'Custom shaders for each tolerance type',
        holoscript: 'Material declarations handle all types',
        timeSaved: '2 weeks',
      },
      {
        aspect: 'Multi-language Support',
        traditional: 'Duplicate UI and documentation for each language',
        holoscript: 'Translate text labels only',
        timeSaved: '3 weeks',
      },
      {
        aspect: 'Remote Collaboration',
        traditional: 'Requires enterprise VR system',
        holoscript: 'Works on any device user has',
        timeSaved: '5 weeks',
      },
    ];
  }

  /**
   * Cross-platform deployment
   */
  getCrossPlatformDeployment(): {
    location: string;
    devices: string[];
    buildTime: string;
    updateTime: string;
    trainTime: string;
  }[] {
    return [
      {
        location: 'Factory Floor',
        devices: ['Tablet', 'VR Headset'],
        buildTime: '4 hours',
        updateTime: 'Real-time sync',
        trainTime: '1 day per procedure',
      },
      {
        location: 'Quality Lab',
        devices: ['Desktop', 'Tablet', 'Mobile'],
        buildTime: '4 hours',
        updateTime: 'Real-time sync',
        trainTime: '2 hours per employee',
      },
      {
        location: 'Remote Inspectors',
        devices: ['Mobile Phone'],
        buildTime: '4 hours',
        updateTime: 'Automatic',
        trainTime: '1 hour (mobile familiar)',
      },
      {
        location: 'Engineering Office',
        devices: ['Desktop Workstation'],
        buildTime: '4 hours',
        updateTime: 'On-demand',
        trainTime: '30 minutes (CAD familiar)',
      },
      {
        location: 'Customer Support',
        devices: ['Mobile', 'Tablet', 'Web'],
        buildTime: '4 hours',
        updateTime: 'Automatic',
        trainTime: '2 hours',
      },
    ];
  }

  /**
   * Manufacturing use cases
   */
  getUseCases(): Record<string, string> {
    return {
      'assembly-guidance': `
        Workers see step-by-step instructions overlaid on real product.
        Highlights next component, tool needed, expected time.
        Same app works on tablet at workstation, phone for reference.
      `,
      'quality-inspection': `
        Inspectors view CAD models overlaid with tolerance zones.
        Tap any measurement to see spec limits.
        Photograph actual part, compare 3D model overlay.
      `,
      'remote-troubleshooting': `
        Support engineer reviews assembly via phone camera.
        Can see CAD model, stress analysis, design intent.
        Annotate issues that sync to factory floor in real-time.
      `,
      'supplier-training': `
        New suppliers train on exact specs with 3D visualization.
        See stress zones, tolerance requirements, material properties.
        Works offline for remote locations.
      `,
      'field-service': `
        Technicians service products with full CAD reference.
        See exploded views, part lists, common issues.
        Phone app works in customer locations.
      `,
    };
  }

  /**
   * ROI Analysis
   */
  getROIAnalysis(): {
    metric: string;
    traditional: string;
    holoscript: string;
    improvement: string;
  }[] {
    return [
      {
        metric: 'Documentation Cost',
        traditional: '$50K (PDFs + videos)',
        holoscript: '$5K (3D model only)',
        improvement: '90% reduction',
      },
      {
        metric: 'Development Time',
        traditional: '12 weeks (5 apps)',
        holoscript: '1 week (1 app)',
        improvement: '92% faster',
      },
      {
        metric: 'Quality Error Rate',
        traditional: '5-10% assembly errors',
        holoscript: '< 1% with step-by-step guide',
        improvement: '90% fewer errors',
      },
      {
        metric: 'Staff Training',
        traditional: '2 weeks per person',
        holoscript: '2 days per person',
        improvement: '86% faster',
      },
      {
        metric: 'Multi-language',
        traditional: '$30K per language',
        holoscript: '$2K per language',
        improvement: '93% cost reduction',
      },
      {
        metric: 'Update Deployment',
        traditional: '3 days (push to 100 devices)',
        holoscript: 'Instant (cloud sync)',
        improvement: '100% faster',
      },
    ];
  }
}

export function createManufacturingDemo(): ManufacturingDesignDemo {
  return new ManufacturingDesignDemo();
}
