// Standalone preview harness for the photorealistic Lotus — mounts ONLY the
// compiled canvas so the retired LotusProgram bespoke renderer can't creep back.
// Reachable at /lotus-preview.html on the vite dev server.
// I.007 dogfooding closure: scene is now compiled from .holo via useScenePipeline.
import { createRoot } from 'react-dom/client';
import './src/index.css';
import './src/custom.css';
import { LotusCompiledCanvas } from './src/components/LotusCompiledCanvas';

const el = document.getElementById('root');
if (el) {
  // No StrictMode — its double-mount confuses R3F's canvas measure in this isolated harness.
  createRoot(el).render(
    <LotusCompiledCanvas paused={false} reducedMotion={false} restartKey={0} />
  );
}
