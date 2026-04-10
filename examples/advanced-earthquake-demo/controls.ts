import { EarthquakeRuntimeExecutor, PostProcessingManager, SceneInspector } from '@holoscript/core';

export interface DemoContext {
  earthquakeExecutor: EarthquakeRuntimeExecutor;
  inspector: SceneInspector;
  postProcessing: PostProcessingManager;
}

export function showHelp(): void {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ADVANCED EARTHQUAKE DEMO - CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

R - Reset earthquake simulation
B - Toggle bounding boxes
G - Toggle grid
P - Toggle post-processing
Q - Cycle quality (Low/Medium/High/Ultra)
S - Export scene statistics
H - Show this help

Features Enabled:
✓ GPU Instancing (100x performance)
✓ Custom Shaders (5x faster particles)
✓ Post-Processing (SSAO, Bloom, TAA)
✓ Scene Inspector (FPS, Memory tracking)
✓ Earthquake Simulation (Richter 7.5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

export function setupControls(context: DemoContext): void {
  window.addEventListener('keydown', (event) => {
    switch (event.key.toLowerCase()) {
      case 'r':
        // Reset earthquake simulation
        console.log('🔄 Resetting earthquake simulation...');
        context.earthquakeExecutor.resetSimulation();
        break;

      case 'b':
        // Toggle bounding boxes
        context.inspector.toggleFeature('showBoundingBoxes');
        console.log(
          '📦 Bounding boxes:',
          context.inspector.getConfig().showBoundingBoxes ? 'ON' : 'OFF'
        );
        break;

      case 'g':
        // Toggle grid
        context.inspector.toggleFeature('showGrid');
        console.log('📏 Grid:', context.inspector.getConfig().showGrid ? 'ON' : 'OFF');
        break;

      case 'p':
        // Toggle post-processing
        const currentState = context.postProcessing.getStats().enabled;
        context.postProcessing.setEnabled(!currentState);
        console.log('🎨 Post-processing:', !currentState ? 'ON' : 'OFF');
        break;

      case 'q':
        // Cycle quality presets
        const qualities = ['low', 'medium', 'high', 'ultra'] as const;
        const currentQuality = context.postProcessing.getStats().quality;
        const currentIndex = qualities.indexOf(currentQuality);
        const nextQuality = qualities[(currentIndex + 1) % qualities.length];
        context.postProcessing.setQuality(nextQuality);
        console.log(`🎯 Quality: ${nextQuality.toUpperCase()}`);
        break;

      case 's':
        // Export scene stats
        const stats = context.inspector.exportStats();
        console.log('📊 Scene statistics exported:', stats);
        break;

      case 'h':
        // Show help
        showHelp();
        break;
    }
  });

  // Show help on startup
  setTimeout(() => showHelp(), 1000);
}
