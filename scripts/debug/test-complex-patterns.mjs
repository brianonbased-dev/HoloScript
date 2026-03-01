/**
 * Test complex patterns that might cause issues
 */

import { HoloScriptPlusParser } from '../packages/core/dist/index.js';

console.log('Complex Pattern Parser Test\n');

const parser = new HoloScriptPlusParser();

// Test arrow function handlers
console.log('Test 1: Arrow function handler...');
try {
  const start = Date.now();
  const r = parser.parse(`
camera#main {
  @on_record_start => {
    state.isRecording = true
  }
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test nested objects in arrays
console.log('Test 2: Nested objects in arrays...');
try {
  const start = Date.now();
  const r = parser.parse(`
panel#survey {
  @survey(
    questions: [
      {
        id: "rating",
        type: "scale"
      }
    ]
  )
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test time literals
console.log('Test 3: Time literals (30s)...');
try {
  const start = Date.now();
  const r = parser.parse(`
@trail(fade_time: 2s)
orb#test { }
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test expression interpolation
console.log('Test 4: Expression interpolation...');
try {
  const start = Date.now();
  const r = parser.parse(`
screen#video {
  @video(src: "\${state.selectedClip}")
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test larger nested structure
console.log('Test 5: Larger nested structure...');
try {
  const start = Date.now();
  const r = parser.parse(`
scene {
  group#zone {
    position: [0, 0, 0]
    
    camera#cam {
      @camera(mode: "cinematic", fov: 75)
    }
    
    orb#ball {
      @grabbable
      @throwable
    }
  }
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test with actual problematic section
console.log('Test 6: Complex trait with multiple properties...');
try {
  const start = Date.now();
  const r = parser.parse(`
camera#mainCamera {
  position: [0, 2, -3]
  @camera(
    mode: "cinematic",
    fov: 75,
    auto_focus: true,
    depth_of_field: true,
    aperture: 2.8
  )
  @recordable(
    format: "mp4",
    resolution: [1920, 1080],
    fps: 60
  )
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test full first section of the problematic file
console.log('Test 7: Full @state section from researcher file...');
try {
  const start = Date.now();
  const r = parser.parse(`
@state {
  isRecording: false
  recordingDuration: 0
  clipCount: 0
  viewCount: 0
  engagementScore: 0
  heatmapData: []
  surveyResponses: []
  currentVariant: "A"
  activeCollaborators: []
  selectedObjects: []
  particleIntensity: 1
  currentFilter: "none"
  timelinePosition: 0
  isPlaying: false
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

console.log('\n✅ All complex pattern tests completed');
