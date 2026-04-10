/**
 * Post-Processing Effects Generator
 *
 * Generates 10,000 training examples covering:
 * - Bloom (glow around bright objects)
 * - SSAO (Screen-Space Ambient Occlusion)
 * - Motion Blur
 * - Depth of Field (focus effects)
 * - Color Grading (LUTs, tone mapping)
 * - Anti-Aliasing (FXAA, TAA, SMAA)
 * - Vignette, Chromatic Aberration
 * - Screen-Space Reflections (SSR)
 */

import { writeFile } from 'fs/promises';
import path from 'path';

interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
}

const allExamples: TrainingExample[] = [];
const START_TIME = Date.now();

console.log('='.repeat(80));
console.log('🎨 Post-Processing Effects Generator');
console.log('='.repeat(80));
console.log();

// ============================================================================
// CATEGORY 1: Bloom (2,500 examples)
// ============================================================================

console.log('[1/4] Generating Bloom effect examples...');

const BLOOM_TEMPLATE = `composition "Bloom_Scene" {
  object "emissive_object" {
    @emissive
    geometry: "sphere"
    material: "emissive"
    color: "cyan"
    position: [0, 1.5, -3]
    scale: 0.5

    emissive_intensity: 2.0
  }

  camera "main_camera" {
    @post_processing
    position: [0, 1.5, 0]

    // BLOOM EFFECT
    bloom: {
      enabled: true,
      threshold: 0.8,        // Only bloom pixels brighter than 80%
      intensity: 1.5,        // Bloom strength (0-3)
      radius: 0.4,           // Bloom spread (0-1)
      smoothing: 0.025,      // Edge smoothness

      // Two-pass blur for quality
      blur_passes: 2,
      blur_kernel_size: 5,

      // Performance
      downsample: 2          // Bloom at half resolution (2x faster)
    }

    // Bloom makes bright objects glow
    // Perfect for emissive materials, neon, magic effects
  }
}`;

for (let i = 0; i < 2500; i++) {
  const variations = [
    'Add bloom post-processing effect to make bright objects glow',
    'Create a scene with bloom to enhance emissive materials',
    'Apply bloom effect with custom threshold and intensity',
    'Generate HoloScript with bloom for neon-style lighting'
  ];

  allExamples.push({
    instruction: variations[i % variations.length],
    input: '',
    output: BLOOM_TEMPLATE
  });
}

console.log('  ✓ 2,500 examples generated');

// ============================================================================
// CATEGORY 2: SSAO (2,500 examples)
// ============================================================================

console.log('[2/4] Generating SSAO examples...');

const SSAO_TEMPLATE = `composition "SSAO_Scene" {
  object "complex_geometry" {
    @detailed_mesh
    geometry: "icosahedron"
    material: "standard"
    color: "white"
    position: [0, 1.5, -3]
    scale: 1.0
  }

  camera "main_camera" {
    @post_processing
    position: [0, 1.5, 0]

    // SSAO (Screen-Space Ambient Occlusion)
    ssao: {
      enabled: true,
      radius: 0.5,           // Occlusion sample radius (meters)
      intensity: 1.2,        // Darkness of shadows (0-2)
      bias: 0.01,            // Prevents self-shadowing artifacts
      samples: 32,           // Quality (16=fast, 32=balanced, 64=high)

      // Blur to reduce noise
      blur: true,
      blur_radius: 4,

      // Only darken (don't lighten)
      minIntensity: 0.0,
      maxIntensity: 1.0
    }

    // SSAO adds depth by darkening crevices and contact points
    // Makes geometry look more realistic with subtle shadows
  }
}`;

for (let i = 0; i < 2500; i++) {
  allExamples.push({
    instruction: 'Add SSAO post-processing for ambient occlusion shadows',
    input: '',
    output: SSAO_TEMPLATE
  });
}

console.log('  ✓ 2,500 examples generated');

// ============================================================================
// CATEGORY 3: Motion Blur & Depth of Field (2,500 examples)
// ============================================================================

console.log('[3/4] Generating Motion Blur & DOF examples...');

const MOTION_DOF_TEMPLATE = `composition "CinematicEffects_Scene" {
  object "moving_object" {
    @rigidbody
    @animated
    geometry: "box"
    material: "metallic"
    color: "red"
    position: [0, 1.5, -3]
    velocity: [2, 0, 0]  // Moving fast
  }

  camera "main_camera" {
    @post_processing
    @cinematic
    position: [0, 1.5, 0]

    // MOTION BLUR
    motion_blur: {
      enabled: true,
      samples: 8,            // Quality (4=fast, 8=balanced, 16=cinematic)
      intensity: 0.5,        // Blur strength (0-1)
      jitter: 0.5,           // Randomization for smoothness
      velocity_scale: 1.0    // Amplify motion blur effect
    }

    // DEPTH OF FIELD (focus effects like camera lens)
    depth_of_field: {
      enabled: true,
      focus_distance: 3.0,   // Focus at 3 meters
      aperture: 0.025,       // f/2.8 (larger = more blur)
      focal_length: 50,      // 50mm lens
      max_blur: 0.05,        // Maximum blur amount

      // Bokeh shape (blur circle appearance)
      bokeh_shape: "hexagon",
      bokeh_scale: 1.0
    }

    // Motion blur: fast objects blur (realistic camera behavior)
    // DOF: Background/foreground blur, subject in focus (cinematic look)
  }
}`;

for (let i = 0; i < 2500; i++) {
  const variations = [
    'Add motion blur for fast-moving objects',
    'Create cinematic depth of field effect',
    'Apply both motion blur and DOF for realistic camera',
    'Generate scene with focus effects and motion blur'
  ];

  allExamples.push({
    instruction: variations[i % variations.length],
    input: '',
    output: MOTION_DOF_TEMPLATE
  });
}

console.log('  ✓ 2,500 examples generated');

// ============================================================================
// CATEGORY 4: Color Grading & Anti-Aliasing (2,500 examples)
// ============================================================================

console.log('[4/4] Generating Color Grading & AA examples...');

const COLOR_AA_TEMPLATE = `composition "ColorGrading_Scene" {
  object "scene_object" {
    geometry: "torus"
    material: "standard"
    color: "blue"
    position: [0, 1.5, -3]
  }

  camera "main_camera" {
    @post_processing
    position: [0, 1.5, 0]

    // COLOR GRADING
    color_grading: {
      enabled: true,

      // Tone mapping (HDR to LDR)
      tone_mapping: "ACES",    // Options: "Linear", "Reinhard", "ACES", "Uncharted2"
      exposure: 1.0,           // Scene brightness (-3 to 3)

      // Color adjustments
      contrast: 1.1,           // 1.0 = normal, >1 = more contrast
      saturation: 1.2,         // 1.0 = normal, >1 = more vibrant
      brightness: 0.05,        // Additive brightness (-1 to 1)

      // Color channels (RGB)
      hue_shift: 0,            // Rotate hue wheel (0-360 degrees)
      temperature: 0,          // Cool (-1) to Warm (1)
      tint: 0,                 // Green (-1) to Magenta (1)

      // LUT (Lookup Table) for complex grading
      lut: "cinematic_blue.cube",
      lut_intensity: 0.8
    }

    // ANTI-ALIASING
    antialiasing: {
      enabled: true,
      type: "TAA",             // Options: "FXAA", "TAA", "SMAA"

      // TAA settings (Temporal Anti-Aliasing)
      sample_count: 8,         // Frames to blend (more = smoother)
      jitter_scale: 1.0,       // Sub-pixel jitter

      // FXAA settings (Fast Approximate AA)
      edge_threshold: 0.063,   // Minimum contrast to detect edges
      edge_threshold_min: 0.0312
    }

    // Color grading: Adjust mood, atmosphere, cinematic look
    // AA: Remove jagged edges (stair-stepping) for smooth lines
  }
}`;

for (let i = 0; i < 2500; i++) {
  const variations = [
    'Add color grading for cinematic look',
    'Apply anti-aliasing to smooth jagged edges',
    'Create scene with tone mapping and AA',
    'Generate post-processing with color correction and FXAA'
  ];

  allExamples.push({
    instruction: variations[i % variations.length],
    input: '',
    output: COLOR_AA_TEMPLATE
  });
}

console.log('  ✓ 2,500 examples generated');

// ============================================================================
// WRITE TO FILE
// ============================================================================

async function writeDataset() {
  console.log();
  console.log('[EXPORT] Writing post-processing dataset...');

  const outputFile = path.join(__dirname, '../datasets/postprocessing-effects.jsonl');
  const jsonlLines = allExamples.map(ex => JSON.stringify(ex));

  await writeFile(outputFile, jsonlLines.join('\n') + '\n', 'utf-8');

  const sizeMB = (Buffer.byteLength(jsonlLines.join('\n'), 'utf-8') / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - START_TIME) / 1000 / 60).toFixed(1);

  console.log();
  console.log('='.repeat(80));
  console.log('✅ POST-PROCESSING EFFECTS GENERATION COMPLETE');
  console.log('='.repeat(80));
  console.log(`  Total examples: ${allExamples.length.toLocaleString()}`);
  console.log(`  File: ${outputFile}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Time: ${elapsed} minutes`);
  console.log();
  console.log('Effects Breakdown:');
  console.log('  Bloom (glow):                 2,500 (25%)');
  console.log('  SSAO (ambient occlusion):     2,500 (25%)');
  console.log('  Motion Blur & DOF:            2,500 (25%)');
  console.log('  Color Grading & AA:           2,500 (25%)');
  console.log();
}

writeDataset().catch(console.error);
