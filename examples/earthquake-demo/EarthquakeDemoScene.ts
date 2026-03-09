/**
 * Earthquake Demo Scene
 *
 * Complete interactive earthquake demonstration with UI controls,
 * camera modes, and spectacular visual effects.
 *
 * @module demos/earthquake/EarthquakeDemoScene
 */

import type { WebGPUContext } from '../../gpu/WebGPUContext.js';
import { EarthquakeSimulation, type EarthquakeSimulationConfig } from './EarthquakeSimulation.js';
import { CameraController, type CameraMode } from './CameraEffects.js';
import type { EarthquakeConfig } from './FracturePhysics.js';

export interface DemoControls {
  /** Earthquake intensity (1-10) */
  intensity: number;

  /** Earthquake duration (seconds) */
  duration: number;

  /** Camera mode */
  cameraMode: CameraMode;

  /** Slow motion enabled */
  slowMotion: boolean;

  /** Slow motion factor (0.1 = 10× slower) */
  slowMotionFactor: number;

  /** Show debug info */
  showDebug: boolean;
}

export interface DemoUI {
  /** Trigger earthquake button */
  triggerButton: HTMLButtonElement;

  /** Reset button */
  resetButton: HTMLButtonElement;

  /** Intensity slider */
  intensitySlider: HTMLInputElement;

  /** Intensity value display */
  intensityValue: HTMLElement;

  /** Duration slider */
  durationSlider: HTMLInputElement;

  /** Duration value display */
  durationValue: HTMLElement;

  /** Camera mode selector */
  cameraModeSelect: HTMLSelectElement;

  /** Slow motion toggle */
  slowMotionCheckbox: HTMLInputElement;

  /** Debug info toggle */
  debugInfoCheckbox: HTMLInputElement;

  /** Stats display */
  statsDisplay: HTMLElement;

  /** Status message */
  statusMessage: HTMLElement;
}

/**
 * Earthquake Demo Scene
 *
 * Complete interactive demonstration combining all earthquake systems
 * with user controls and real-time visualization.
 */
export class EarthquakeDemoScene {
  private context: WebGPUContext;
  private simulation: EarthquakeSimulation;
  private cameraController: CameraController;
  private controls: DemoControls;
  private ui: DemoUI | null = null;

  private isRunning: boolean = false;
  private lastUpdateTime: number = 0;
  private animationFrameId: number | null = null;

  constructor(context: WebGPUContext, simulation: EarthquakeSimulation, canvas: HTMLCanvasElement) {
    this.context = context;
    this.simulation = simulation;
    this.cameraController = new CameraController(canvas);

    // Default controls
    this.controls = {
      intensity: 7,
      duration: 5,
      cameraMode: 'overview',
      slowMotion: false,
      slowMotionFactor: 0.25,
      showDebug: true,
    };
  }

  /**
   * Setup UI elements
   */
  setupUI(container: HTMLElement): void {
    // Create UI container
    const uiContainer = document.createElement('div');
    uiContainer.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 12px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = '🌊 Earthquake Demo';
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 20px;';
    uiContainer.appendChild(title);

    // Trigger button
    const triggerButton = document.createElement('button');
    triggerButton.textContent = '▶️ Trigger Earthquake';
    triggerButton.style.cssText = `
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 12px;
      transition: transform 0.2s;
    `;
    triggerButton.onmouseenter = () => {
      triggerButton.style.transform = 'translateY(-2px)';
    };
    triggerButton.onmouseleave = () => {
      triggerButton.style.transform = 'translateY(0)';
    };
    triggerButton.onclick = () => this.handleTriggerEarthquake();
    uiContainer.appendChild(triggerButton);

    // Reset button
    const resetButton = document.createElement('button');
    resetButton.textContent = '🔄 Reset';
    resetButton.style.cssText = `
      width: 100%;
      padding: 10px;
      background: rgba(100, 100, 100, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 16px;
    `;
    resetButton.onclick = () => this.handleReset();
    uiContainer.appendChild(resetButton);

    // Intensity control
    const intensityGroup = this.createSliderControl(
      'Earthquake Intensity',
      'intensity',
      1,
      10,
      this.controls.intensity,
      1
    );
    uiContainer.appendChild(intensityGroup.container);

    // Duration control
    const durationGroup = this.createSliderControl(
      'Duration (seconds)',
      'duration',
      1,
      15,
      this.controls.duration,
      1
    );
    uiContainer.appendChild(durationGroup.container);

    // Camera mode selector
    const cameraModeGroup = document.createElement('div');
    cameraModeGroup.style.cssText = 'margin-bottom: 16px;';

    const cameraModeLabel = document.createElement('label');
    cameraModeLabel.textContent = 'Camera Mode';
    cameraModeLabel.style.cssText = `
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      opacity: 0.7;
    `;
    cameraModeGroup.appendChild(cameraModeLabel);

    const cameraModeSelect = document.createElement('select');
    cameraModeSelect.style.cssText = `
      width: 100%;
      padding: 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      color: white;
      font-size: 14px;
    `;

    const modes: CameraMode[] = ['overview', 'street', 'topdown', 'cinematic', 'free'];
    for (const mode of modes) {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      option.selected = mode === this.controls.cameraMode;
      cameraModeSelect.appendChild(option);
    }

    cameraModeSelect.onchange = () => {
      this.controls.cameraMode = cameraModeSelect.value as CameraMode;
      this.cameraController.transitionToPreset(this.controls.cameraMode, 1.5);
    };

    cameraModeGroup.appendChild(cameraModeSelect);
    uiContainer.appendChild(cameraModeGroup);

    // Slow motion toggle
    const slowMotionGroup = this.createCheckboxControl(
      'Slow Motion (0.25×)',
      'slowMotion',
      this.controls.slowMotion
    );
    uiContainer.appendChild(slowMotionGroup.container);

    // Debug info toggle
    const debugInfoGroup = this.createCheckboxControl(
      'Show Debug Info',
      'debugInfo',
      this.controls.showDebug
    );
    uiContainer.appendChild(debugInfoGroup.container);

    // Stats display
    const statsDisplay = document.createElement('div');
    statsDisplay.style.cssText = `
      margin-top: 16px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      font-size: 12px;
      font-family: monospace;
    `;
    uiContainer.appendChild(statsDisplay);

    // Status message
    const statusMessage = document.createElement('div');
    statusMessage.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      padding: 16px 20px;
      border-radius: 12px;
      color: white;
      font-size: 14px;
      display: none;
    `;
    container.appendChild(statusMessage);

    container.appendChild(uiContainer);

    // Store UI references
    this.ui = {
      triggerButton,
      resetButton,
      intensitySlider: intensityGroup.slider,
      intensityValue: intensityGroup.value,
      durationSlider: durationGroup.slider,
      durationValue: durationGroup.value,
      cameraModeSelect,
      slowMotionCheckbox: slowMotionGroup.checkbox,
      debugInfoCheckbox: debugInfoGroup.checkbox,
      statsDisplay,
      statusMessage,
    };

    console.log('✅ UI setup complete');
  }

  /**
   * Create slider control
   */
  private createSliderControl(
    label: string,
    name: string,
    min: number,
    max: number,
    value: number,
    step: number
  ): { container: HTMLElement; slider: HTMLInputElement; value: HTMLElement } {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 16px;';

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.style.cssText = `
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      opacity: 0.7;
    `;
    container.appendChild(labelElement);

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = value.toString();
    valueDisplay.style.cssText = `
      float: right;
      font-weight: 600;
      color: #f59e0b;
    `;
    labelElement.appendChild(valueDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min.toString();
    slider.max = max.toString();
    slider.value = value.toString();
    slider.step = step.toString();
    slider.style.cssText = 'width: 100%;';

    slider.oninput = () => {
      valueDisplay.textContent = slider.value;
      (this.controls as any)[name] = parseFloat(slider.value);
    };

    container.appendChild(slider);

    return { container, slider, value: valueDisplay };
  }

  /**
   * Create checkbox control
   */
  private createCheckboxControl(
    label: string,
    name: string,
    checked: boolean
  ): { container: HTMLElement; checkbox: HTMLInputElement } {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom: 12px;';

    const labelElement = document.createElement('label');
    labelElement.style.cssText = `
      display: flex;
      align-items: center;
      cursor: pointer;
      font-size: 14px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.cssText = 'margin-right: 8px;';

    checkbox.onchange = () => {
      (this.controls as any)[name] = checkbox.checked;
    };

    labelElement.appendChild(checkbox);
    labelElement.appendChild(document.createTextNode(label));
    container.appendChild(labelElement);

    return { container, checkbox };
  }

  /**
   * Handle trigger earthquake
   */
  private handleTriggerEarthquake(): void {
    console.log(`🌊 Triggering earthquake: intensity ${this.controls.intensity}`);

    const config: EarthquakeConfig = {
      intensity: this.controls.intensity,
      duration: this.controls.duration,
      frequency: 2 + Math.random(),
      epicenter: [0, 0, 0],
      verticalComponent: 0.3,
    };

    this.simulation.triggerEarthquake(config);

    // Apply camera shake
    this.cameraController.applyEarthquakeShake({
      intensity: this.controls.intensity * 0.5,
      frequency: config.frequency,
      duration: config.duration,
      falloff: 'exponential',
      horizontalAmount: 1.0,
      verticalAmount: 0.5,
    });

    this.showStatus(`Earthquake triggered! Intensity: ${this.controls.intensity}`);
  }

  /**
   * Handle reset
   */
  private handleReset(): void {
    console.log('🔄 Resetting simulation');
    this.simulation.reset();
    this.cameraController.stopShake();
    this.showStatus('Simulation reset');
  }

  /**
   * Show status message
   */
  private showStatus(message: string, duration: number = 3000): void {
    if (!this.ui) return;

    this.ui.statusMessage.textContent = message;
    this.ui.statusMessage.style.display = 'block';

    setTimeout(() => {
      if (this.ui) {
        this.ui.statusMessage.style.display = 'none';
      }
    }, duration);
  }

  /**
   * Update stats display
   */
  private updateStats(): void {
    if (!this.ui || !this.controls.showDebug) {
      if (this.ui) this.ui.statsDisplay.style.display = 'none';
      return;
    }

    this.ui.statsDisplay.style.display = 'block';

    const state = this.simulation.getState();

    this.ui.statsDisplay.innerHTML = `
      <div>FPS: ${state.fps}</div>
      <div>Structural Integrity: ${state.structuralIntegrity.toFixed(1)}%</div>
      <div>Active Debris: ${state.activeDebrisCount} / ${state.totalDebrisCount}</div>
      <div>Collapse Events: ${state.collapseEventCount}</div>
      <div>Status: ${state.earthquakeActive ? '🌊 Earthquake' : state.collapseStarted ? '💥 Collapsing' : '✅ Stable'}</div>
    `;
  }

  /**
   * Start demo
   */
  start(): void {
    if (this.isRunning) return;

    console.log('▶️ Starting earthquake demo');
    this.isRunning = true;
    this.lastUpdateTime = performance.now();

    // Set initial camera
    this.cameraController.transitionToPreset(this.controls.cameraMode, 0);

    this.animate();
  }

  /**
   * Stop demo
   */
  stop(): void {
    if (!this.isRunning) return;

    console.log('⏸️ Stopping earthquake demo');
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    let dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // Apply slow motion
    if (this.controls.slowMotion) {
      dt *= this.controls.slowMotionFactor;
    }

    // Clamp dt to prevent large jumps
    dt = Math.min(dt, 0.033); // Max 33ms (30 FPS minimum)

    // Update camera
    this.cameraController.update(dt);

    // Update simulation
    this.simulation.update(dt);

    // Render
    const camera = this.cameraController.getCamera();
    this.simulation.render(camera);

    // Update UI
    this.updateStats();

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /**
   * Handle keyboard input
   */
  handleKeyboard(event: KeyboardEvent): void {
    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.handleTriggerEarthquake();
        break;
      case 'r':
      case 'R':
        this.handleReset();
        break;
      case 's':
      case 'S':
        this.controls.slowMotion = !this.controls.slowMotion;
        if (this.ui) this.ui.slowMotionCheckbox.checked = this.controls.slowMotion;
        break;
      case '1':
        this.controls.cameraMode = 'overview';
        this.cameraController.transitionToPreset('overview', 1.5);
        break;
      case '2':
        this.controls.cameraMode = 'street';
        this.cameraController.transitionToPreset('street', 1.5);
        break;
      case '3':
        this.controls.cameraMode = 'topdown';
        this.cameraController.transitionToPreset('topdown', 1.5);
        break;
      case '4':
        this.controls.cameraMode = 'cinematic';
        this.cameraController.transitionToPreset('cinematic', 1.5);
        break;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.simulation.destroy();
  }
}
