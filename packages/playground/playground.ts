/**
 * HoloScript Playground
 *
 * Interactive web-based editor for trying HoloScript in the browser
 */

import type * as Monaco from 'monaco-editor';

// Example HoloScript code snippets
const EXAMPLES: Record<string, { name: string; desc: string; runtime: string; code: string }> = {
  demolition: {
    name: 'Building Demolition',
    desc: 'Realistic building collapse with physics',
    runtime: 'demolition',
    code: `composition BuildingDemolition {
  traits {
    physics {
      gravity: [0, -9.8, 0],
      timeScale: 1.0,
      demolition: {
        maxFragments: 1000,
        maxParticles: 50000,
        particlesPerVolume: 100
      }
    }

    camera {
      position: [0, 20, 50],
      target: [0, 10, 0],
      fov: 60,
      effects: {
        shake: { intensity: 1.0, decay: 0.9 },
        autoFollow: true
      }
    }

    structural {
      damageThreshold: 1000,
      collapseDelay: 0.5
    }
  }

  entities {
    structure Building {
      floors: 5,
      columnsPerFloor: 4,
      columnSpacing: 5.0,
      position: [0, 0, 0]
    }

    behavior ExplosionControl {
      trigger: "click",
      explosionForce: 3000,
      explosionRadius: 15
    }
  }
}`,
  },

  avalanche: {
    name: 'Snow Avalanche',
    desc: 'Realistic snow avalanche simulation',
    runtime: 'avalanche',
    code: `composition SnowAvalanche {
  traits {
    avalanche {
      gravity: [0, -9.8, 0],
      friction: 0.1
    }

    terrain {
      width: 100,
      depth: 100,
      seed: 12345
    }

    camera {
      position: [0, 60, 80],
      target: [0, 20, 0],
      fov: 60
    }
  }

  entities {
    terrain Mountain {
      type: "mountainous",
      snowDepth: 5.0
    }

    trigger AvalancheTrigger {
      position: [0, 50, -20],
      radius: 10,
      trigger: "click"
    }
  }
}`,
  },

  erosion: {
    name: 'Water Erosion',
    desc: 'Real-time terrain erosion with water flow',
    runtime: 'erosion',
    code: `composition WaterErosion {
  traits {
    erosion {
      preset: "mountain",
      timeScale: 1.5
    }

    terrain {
      resolution: 128,
      size: 100
    }

    camera {
      position: [0, 80, 100],
      target: [0, 0, 0],
      fov: 60
    }
  }

  entities {
    terrain Landscape {
      type: "procedural"
    }

    water RainSource {
      position: [0, 50, 0],
      radius: 15,
      amount: 10.0,
      trigger: "continuous"
    }
  }
}`,
  },

  earthquake: {
    name: 'Earthquake Simulation',
    desc: 'Seismic wave propagation and building damage',
    runtime: 'earthquake',
    code: `composition CityEarthquake {
  traits {
    earthquake {
      intensity: 8,
      duration: 6
    }

    city {
      buildingCount: 10,
      buildingHeight: 50,
      buildingSpacing: 25
    }

    camera {
      position: [80, 60, 80],
      target: [0, 20, 0],
      fov: 60
    }
  }

  entities {
    city Downtown {
      layout: "grid"
    }

    seismicEvent MainShock {
      epicenter: [0, 0, 0],
      magnitude: 8.0,
      trigger: "click"
    }
  }
}`,
  },
};

// Runtime options
const RUNTIMES = [
  { id: 'demolition', name: 'Demolition', icon: '💥', desc: 'Building collapse physics' },
  { id: 'avalanche', name: 'Avalanche', icon: '❄️', desc: 'Snow and terrain dynamics' },
  { id: 'erosion', name: 'Erosion', icon: '🌊', desc: 'Water erosion simulation' },
  { id: 'earthquake', name: 'Earthquake', icon: '🏗️', desc: 'Seismic wave propagation' },
];

// Playground state
class PlaygroundState {
  editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  currentExample: string = 'demolition';
  currentRuntime: string = 'demolition';
  isRunning: boolean = false;
  autoRun: boolean = true;
  showConsole: boolean = false;
  stats = {
    fps: 0,
    particles: 0,
    status: 'Ready',
  };
}

const state = new PlaygroundState();

/**
 * Initialize Monaco Editor
 */
async function initializeEditor(): Promise<void> {
  return new Promise((resolve) => {
    (window as any).require.config({
      paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' },
    });

    (window as any).require(['vs/editor/editor.main'], () => {
      const monaco = (window as any).monaco;

      // Register HoloScript language
      monaco.languages.register({ id: 'holoscript' });

      // Define syntax highlighting
      monaco.languages.setMonarchTokensProvider('holoscript', {
        keywords: [
          'composition',
          'traits',
          'entities',
          'behavior',
          'structure',
          'terrain',
          'water',
          'camera',
          'physics',
          'trigger',
          'seismicEvent',
        ],
        operators: [':', ',', '[', ']', '{', '}'],
        tokenizer: {
          root: [
            [
              /[a-zA-Z_]\w*/,
              {
                cases: {
                  '@keywords': 'keyword',
                  '@default': 'identifier',
                },
              },
            ],
            [/"[^"]*"/, 'string'],
            [/\d+(\.\d+)?/, 'number'],
            [/\/\/.*$/, 'comment'],
            [/[{}()\[\]]/, '@brackets'],
          ],
        },
      });

      // Create editor
      const editor = monaco.editor.create(document.getElementById('editor')!, {
        value: EXAMPLES[state.currentExample].code,
        language: 'holoscript',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
      });

      state.editor = editor;

      // Auto-run on change
      editor.onDidChangeModelContent(() => {
        if (state.autoRun) {
          debounce(runCode, 1000)();
        }
      });

      resolve();
    });
  });
}

/**
 * Initialize UI
 */
function initializeUI(): void {
  // Load examples
  const exampleList = document.getElementById('example-list')!;
  Object.entries(EXAMPLES).forEach(([id, example]) => {
    const item = document.createElement('div');
    item.className = `example-item ${id === state.currentExample ? 'active' : ''}`;
    item.innerHTML = `
      <div class="example-name">${example.name}</div>
      <div class="example-desc">${example.desc}</div>
    `;
    item.onclick = () => loadExample(id);
    exampleList.appendChild(item);
  });

  // Load runtimes
  const runtimeSelector = document.getElementById('runtime-selector')!;
  RUNTIMES.forEach((runtime) => {
    const option = document.createElement('div');
    option.className = `runtime-option ${runtime.id === state.currentRuntime ? 'active' : ''}`;
    option.innerHTML = `
      <div class="runtime-radio"></div>
      <span>${runtime.icon}</span>
      <div style="flex: 1;">
        <div style="font-size: 14px; font-weight: 500;">${runtime.name}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${runtime.desc}</div>
      </div>
    `;
    option.onclick = () => selectRuntime(runtime.id);
    runtimeSelector.appendChild(option);
  });

  // Event listeners
  document.getElementById('run-btn')!.onclick = runCode;
  document.getElementById('reset-btn')!.onclick = resetSimulation;
  document.getElementById('share-btn')!.onclick = shareCode;
  document.getElementById('download-btn')!.onclick = downloadCode;

  document.getElementById('auto-run')!.onchange = (e) => {
    state.autoRun = (e.target as HTMLInputElement).checked;
  };

  document.getElementById('show-console')!.onchange = (e) => {
    state.showConsole = (e.target as HTMLInputElement).checked;
    const consoleEl = document.getElementById('console')!;
    consoleEl.classList.toggle('visible', state.showConsole);
  };
}

/**
 * Load example code
 */
function loadExample(exampleId: string): void {
  if (!state.editor) return;

  state.currentExample = exampleId;
  const example = EXAMPLES[exampleId];

  // Update editor
  state.editor.setValue(example.code);

  // Update runtime if needed
  if (example.runtime !== state.currentRuntime) {
    selectRuntime(example.runtime);
  }

  // Update UI
  document.querySelectorAll('.example-item').forEach((item, index) => {
    item.classList.toggle('active', Object.keys(EXAMPLES)[index] === exampleId);
  });

  // Run code if auto-run enabled
  if (state.autoRun) {
    runCode();
  }
}

/**
 * Select runtime
 */
function selectRuntime(runtimeId: string): void {
  state.currentRuntime = runtimeId;

  // Update UI
  document.querySelectorAll('.runtime-option').forEach((option, index) => {
    option.classList.toggle('active', RUNTIMES[index].id === runtimeId);
  });

  logConsole('info', `Switched to ${runtimeId} runtime`);
}

/**
 * Run HoloScript code
 */
async function runCode(): Promise<void> {
  if (!state.editor) return;

  const code = state.editor.getValue();
  const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
  const overlay = document.getElementById('canvas-overlay')!;

  try {
    runBtn.disabled = true;
    runBtn.innerHTML = '<div class="loading"></div><span>Running...</span>';
    state.stats.status = 'Running';
    updateStats();

    overlay.style.display = 'none';

    // Parse and execute (placeholder - would integrate with actual runtime)
    logConsole('log', 'Parsing HoloScript code...');
    await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate parsing

    logConsole('info', `Initializing ${state.currentRuntime} runtime...`);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate initialization

    logConsole('success', 'Runtime started successfully!');

    // Start animation loop (placeholder)
    startAnimationLoop();

    state.isRunning = true;
    state.stats.status = 'Running';
  } catch (error) {
    logConsole('error', `Error: ${(error as any).message}`);
    state.stats.status = 'Error';
    overlay.style.display = 'flex';
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = '<span>▶</span><span>Run</span>';
    updateStats();
  }
}

/**
 * Reset simulation
 */
function resetSimulation(): void {
  state.isRunning = false;
  state.stats = { fps: 0, particles: 0, status: 'Ready' };
  updateStats();

  const overlay = document.getElementById('canvas-overlay')!;
  overlay.style.display = 'flex';

  const ctx = (document.getElementById('preview-canvas') as HTMLCanvasElement).getContext('2d')!;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  logConsole('log', 'Simulation reset');
}

/**
 * Share code
 */
function shareCode(): void {
  if (!state.editor) return;

  const code = state.editor.getValue();
  const encoded = btoa(encodeURIComponent(code));
  const url = `${window.location.origin}${window.location.pathname}?code=${encoded}&runtime=${state.currentRuntime}`;

  navigator.clipboard.writeText(url).then(() => {
    logConsole('success', 'Share URL copied to clipboard!');
    alert('Share URL copied to clipboard!');
  });
}

/**
 * Download code
 */
function downloadCode(): void {
  if (!state.editor) return;

  const code = state.editor.getValue();
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.currentExample}.holo`;
  a.click();
  URL.revokeObjectURL(url);

  logConsole('log', `Downloaded ${state.currentExample}.holo`);
}

/**
 * Start animation loop (placeholder)
 */
function startAnimationLoop(): void {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  let frame = 0;
  let lastTime = performance.now();

  function animate() {
    if (!state.isRunning) return;

    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    // Clear canvas
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw placeholder visualization
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    // Draw rotating grid (placeholder for actual runtime visualization)
    ctx.strokeStyle = '#007acc';
    ctx.lineWidth = 2;
    const rotation = (frame * 0.01) % (Math.PI * 2);
    ctx.rotate(rotation);

    for (let i = -200; i <= 200; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, -200);
      ctx.lineTo(i, 200);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-200, i);
      ctx.lineTo(200, i);
      ctx.stroke();
    }

    ctx.restore();

    // Draw info text
    ctx.fillStyle = '#cccccc';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${RUNTIMES.find((r) => r.id === state.currentRuntime)?.name} Runtime`,
      canvas.width / 2,
      30
    );
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.fillStyle = '#969696';
    ctx.fillText('Preview: Full runtime integration coming soon', canvas.width / 2, 55);

    // Update stats
    state.stats.fps = Math.round(1 / deltaTime);
    state.stats.particles = Math.floor(Math.random() * 10000) + 5000; // Placeholder
    updateStats();

    frame++;
    requestAnimationFrame(animate);
  }

  animate();
}

/**
 * Update stats display
 */
function updateStats(): void {
  document.getElementById('fps-stat')!.textContent = state.stats.fps.toString();
  document.getElementById('particles-stat')!.textContent = state.stats.particles.toLocaleString();
  document.getElementById('status-stat')!.textContent = state.stats.status;
}

/**
 * Log to console
 */
function logConsole(level: 'log' | 'info' | 'warn' | 'error' | 'success', message: string): void {
  const consoleEl = document.getElementById('console')!;
  const entry = document.createElement('div');
  entry.className = 'console-entry';

  const timestamp = new Date().toLocaleTimeString();
  const levelClass = level === 'success' ? 'info' : level;

  entry.innerHTML = `
    <span class="console-timestamp">[${timestamp}]</span>
    <span class="console-level ${levelClass}">${level.toUpperCase()}</span>
    <span>${message}</span>
  `;

  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;

  // Console.log for debugging
  console[level === 'success' ? 'info' : level](message);
}

/**
 * Debounce helper
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Load code from URL
 */
function loadFromURL(): void {
  const params = new URLSearchParams(window.location.search);
  const encodedCode = params.get('code');
  const runtime = params.get('runtime');

  if (encodedCode && state.editor) {
    try {
      const code = decodeURIComponent(atob(encodedCode));
      state.editor.setValue(code);
      logConsole('info', 'Loaded code from share URL');
    } catch (error) {
      logConsole('error', 'Failed to load code from URL');
    }
  }

  if (runtime && RUNTIMES.find((r) => r.id === runtime)) {
    selectRuntime(runtime);
  }
}

/**
 * Initialize playground
 */
async function init(): Promise<void> {
  console.log('🌐 HoloScript Playground v1.0.0');

  try {
    await initializeEditor();
    initializeUI();
    loadFromURL();

    logConsole('success', 'Playground ready! 🎉');
    logConsole('info', 'Select an example or write your own HoloScript code');
  } catch (error) {
    console.error('Failed to initialize playground:', error);
    logConsole('error', `Initialization failed: ${(error as any).message}`);
  }
}

// Start playground when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
