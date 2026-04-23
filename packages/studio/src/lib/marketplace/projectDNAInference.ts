import { DaemonProjectDNA } from '@holoscript/types';

/**
 * Infer project DNA from uploaded file
 * Detects file type, stack, and recommends daemon profile
 */
export function inferProjectDNA(file: File): DaemonProjectDNA {
  const name = file.name.toLowerCase();
  const type = file.type;
  const size = file.size;

  let kind = 'unknown';
  const detectedStack: string[] = [];
  let confidence = 0;
  let recommendedProfile: 'quick' | 'balanced' | 'thorough' = 'balanced';
  let notes = '';

  // HoloScript files
  if (name.endsWith('.holo')) {
    kind = 'scene';
    detectedStack.push('HoloScript');
    confidence = 0.95;
    recommendedProfile = 'balanced';
    notes = 'HoloScript composition detected. Will validate syntax and check for optimization opportunities.';
  } else if (name.endsWith('.hsplus')) {
    kind = 'component';
    detectedStack.push('HoloScript', 'Traits');
    confidence = 0.95;
    recommendedProfile = 'thorough';
    notes = 'HoloScript component with traits detected. Deep analysis recommended for trait optimization.';
  } else if (name.endsWith('.hs')) {
    kind = 'pipeline';
    detectedStack.push('HoloScript', 'Data');
    confidence = 0.95;
    recommendedProfile = 'balanced';
    notes = 'HoloScript data pipeline detected.';
  }
  // 3D Models
  else if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    kind = 'model_3d';
    detectedStack.push('glTF');
    confidence = 0.9;
    recommendedProfile = size > 50 * 1024 * 1024 ? 'thorough' : 'balanced';
    notes = 'glTF 3D model detected. Will optimize geometry, materials, and compression.';
  } else if (name.endsWith('.vrm')) {
    kind = 'avatar';
    detectedStack.push('VRM', '3D Model');
    confidence = 0.95;
    recommendedProfile = 'thorough';
    notes = 'VRM avatar detected. Comprehensive analysis recommended for rigging and materials.';
  } else if (name.endsWith('.fbx')) {
    kind = 'model_3d';
    detectedStack.push('FBX');
    confidence = 0.85;
    recommendedProfile = 'thorough';
    notes = 'FBX file detected. Will convert to glTF and optimize for web.';
  }
  // Archives
  else if (name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.tar.gz') || name.endsWith('.tgz')) {
    kind = 'archive';
    detectedStack.push('Archive');
    confidence = 0.8;
    recommendedProfile = 'quick';
    notes = 'Archive file detected. Will extract and analyze contents.';
  }
  // Data/Scientific
  else if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    kind = 'dataset';
    detectedStack.push('Tabular Data');
    confidence = 0.85;
    recommendedProfile = 'quick';
    notes = 'Tabular data file detected. Will validate format and suggest visualizations.';
  } else if (name.endsWith('.json') || name.endsWith('.jsonl')) {
    kind = 'dataset';
    detectedStack.push('JSON', 'Data');
    confidence = 0.85;
    recommendedProfile = 'quick';
    notes = 'JSON data file detected.';
  } else if (name.endsWith('.py') || name.endsWith('.ipynb')) {
    kind = 'script';
    detectedStack.push('Python');
    confidence = 0.85;
    recommendedProfile = 'thorough';
    notes = name.endsWith('.ipynb') 
      ? 'Jupyter notebook detected. Will analyze code cells and outputs.'
      : 'Python script detected. Will analyze dependencies and code quality.';
  }
  // Frontend/Code
  else if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
    kind = 'component';
    detectedStack.push('TypeScript/JavaScript', 'Frontend');
    confidence = 0.85;
    recommendedProfile = 'balanced';
    notes = 'Frontend code detected. Will validate syntax and analyze dependencies.';
  } else if (name.endsWith('.tsx')) {
    kind = 'component';
    detectedStack.push('React', 'TypeScript');
    confidence = 0.9;
    recommendedProfile = 'balanced';
    notes = 'React component detected. Will analyze component structure and performance.';
  }
  // Fallback
  else {
    kind = 'other';
    confidence = 0.5;
    recommendedProfile = 'quick';
    notes = `Unknown file type: ${type || 'unspecified'}. Will attempt generic analysis.`;
  }

  return {
    kind,
    confidence,
    detectedStack: detectedStack.length > 0 ? detectedStack : ['Unknown'],
    recommendedProfile,
    notes,
  };
}
