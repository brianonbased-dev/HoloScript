/**
 * HoloScript Synthetic Data Generator
 *
 * Generates training examples for Brittney (AI Assistant).
 * Focus areas:
 * 1. VR Design Patterns (Comfort, Ergonomics)
 * 2. Error Correction (Typos, Missing Traits)
 * 3. Architecture Patterns (Events, State Sync)
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  id: string;
  type: 'generation' | 'correction';
  input: string;
  output: string;
  metadata: {
    patterns: string[];
    complexity: number;
  };
}

const TRAITS = ['grabbable', 'throwable', 'pointable', 'hoverable', 'networked', 'sync'];
const SHAPES = ['sphere', 'cube', 'cylinder', 'pyramid', 'plane'];
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];

// =============================================================================
// GENERATORS
// =============================================================================

function generateVRPattern(): TrainingExample {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const trait = TRAITS[Math.floor(Math.random() * TRAITS.length)];
  const name = `${shape}_${Math.floor(Math.random() * 1000)}`;

  const input = `Create a ${shape} that is ${trait}`;

  let code = `orb ${name} {\n  shape: "${shape}"\n  color: "${COLORS[Math.floor(Math.random() * COLORS.length)]}"\n`;
  code += `  @${trait}\n`;

  if (trait === 'grabbable') {
    code += `  on_grab: {\n    haptic.pulse(0.5)\n  }\n`;
  }

  code += `}`;

  return {
    id: `gen_${Date.now()}_${Math.random()}`,
    type: 'generation',
    input: input,
    output: code,
    metadata: {
      patterns: ['vr_trait', trait],
      complexity: 1,
    },
  };
}

function generateErrorPattern(): TrainingExample {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const name = `${shape}_err_${Math.floor(Math.random() * 1000)}`;

  // Error 1: Typo
  const buggyCode = `orb ${name} {\n  shape: "sper"\n  color: "red"\n}`;
  const fixedCode = `orb ${name} {\n  shape: "sphere"\n  color: "#ff0000"\n}`;

  // Error 2: Missing Trait
  if (Math.random() > 0.5) {
    return {
      id: `fix_${Date.now()}_${Math.random()}`,
      type: 'correction',
      input: `orb ${name} {\n  shape: "${shape}"\n  on_grab: { log("Grabbed") }\n}`,
      output: `orb ${name} {\n  shape: "${shape}"\n  @grabbable\n  on_grab: { log("Grabbed") }\n}`,
      metadata: {
        patterns: ['missing_trait', 'grabbable'],
        complexity: 2,
      },
    };
  }

  return {
    id: `fix_${Date.now()}_${Math.random()}`,
    type: 'correction',
    input: buggyCode.replace('sphere', 'sper'), // Simulated typo injection if shapes matched
    output: fixedCode,
    metadata: {
      patterns: ['typo', 'shape_name'],
      complexity: 1,
    },
  };
}

// =============================================================================
// MAIN
// =============================================================================

// =============================================================================
// BEST PRACTICE GENERATORS (Rule 5, 6, 9)
// =============================================================================

function generateErgonomicPattern(): TrainingExample {
  // Rule 5: User "Sweet Spot" (0.5m to 1.5m)
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const zDepth = -(0.5 + Math.random()); // -0.5 to -1.5
  const yHeight = 1.3 + Math.random() * 0.4; // 1.3 to 1.7 (Eye level)

  const input = `Place a ${shape} in a comfortable ergonomic position`;

  const code = `orb ergonomic_${shape} {
  shape: "${shape}"
  position: { x: 0, y: ${yHeight.toFixed(2)}, z: ${zDepth.toFixed(2)} }
  // Best Practice: Keep objects within arm's reach (0.5m-1.5m)
}`;

  return {
    id: `ergo_${Date.now()}_${Math.random()}`,
    type: 'generation',
    input: input,
    output: code,
    metadata: { patterns: ['ergonomics', 'sweet_spot'], complexity: 1 },
  };
}

function generatePhysicsPattern(): TrainingExample {
  // Rule 6: Physics dynamic vs static
  const isDynamic = Math.random() > 0.5;
  const type = isDynamic ? 'dynamic' : 'static';
  const objectType = isDynamic ? 'ball' : 'wall';

  const input = `Create a ${objectType} with appropriate physics`;

  let code = `orb ${objectType}_${Math.floor(Math.random() * 100)} {
  shape: "${isDynamic ? 'sphere' : 'cube'}"
  physics: "${type}"
`;
  if (isDynamic) {
    code += `  @throwable\n  @grabbable\n`;
  }
  code += `}`;

  return {
    id: `phys_${Date.now()}_${Math.random()}`,
    type: 'generation',
    input: input,
    output: code,
    metadata: { patterns: ['physics', type], complexity: 2 },
  };
}

function generateEventPattern(): TrainingExample {
  // Rule 9: Responsive Events
  const _trait = 'grabbable';
  const _shape = 'cube';

  const input = `Make a grabbable cube that gives feedback`;

  const code = `orb responsive_cube {
  shape: "cube"
  @grabbable
  
  // Best Practice: Always provide feedback
  on_grab: {
    haptic.pulse(0.5)
    log("Cube grabbed!")
  }
  
  on_release: {
    game.play_sound("drop.mp3")
  }
}`;

  return {
    id: `event_${Date.now()}_${Math.random()}`,
    type: 'generation',
    input: input,
    output: code,
    metadata: { patterns: ['events', 'feedback'], complexity: 2 },
  };
}

function main() {
  const count = process.argv[2] ? parseInt(process.argv[2]) : 50;
  console.log(`Generating ${count} training examples...`);

  const dataset: TrainingExample[] = [];

  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    if (rand < 0.2) {
      dataset.push(generateVRPattern());
    } else if (rand < 0.4) {
      dataset.push(generateErrorPattern());
    } else if (rand < 0.6) {
      dataset.push(generateErgonomicPattern());
    } else if (rand < 0.8) {
      dataset.push(generatePhysicsPattern());
    } else {
      dataset.push(generateEventPattern());
    }
  }

  const outDir = path.resolve(__dirname, '../../../../datasets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `synthetic_data_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(dataset, null, 2));

  console.log(`✓ Generated ${dataset.length} examples in ${outFile}`);
}

main();
