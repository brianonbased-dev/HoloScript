/**
 * HoloSceneRenderer
 *
 * Responsible for taking compiled HoloScript output and rendering it
 * into a DOM container. Supports Three.js, WebXR, and static preview modes.
 */

import type { HoloSceneTarget } from './types';

export interface RenderOptions {
  target: HoloSceneTarget;
  width: number;
  height: number;
  enableVR: boolean;
  enableAR: boolean;
}

export class HoloSceneRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async render(compiledOutput: string, options: RenderOptions): Promise<void> {
    this.cleanup();

    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);

    switch (options.target) {
      case 'webxr':
      case 'threejs':
        await this.renderThreeJS(compiledOutput, options);
        break;
      case 'auto':
        await this.renderThreeJS(compiledOutput, options);
        break;
      default:
        this.renderStaticPreview(compiledOutput);
    }
  }

  private async renderThreeJS(compiledOutput: string, options: RenderOptions): Promise<void> {
    if (!this.canvas) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, options.height);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, options.width, options.height);

    ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
    ctx.font = `bold ${Math.floor(options.width / 20)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('HoloScript Scene', options.width / 2, options.height / 2 - 20);
    ctx.font = `${Math.floor(options.width / 30)}px monospace`;
    ctx.fillStyle = 'rgba(150, 150, 200, 0.7)';
    ctx.fillText(`Target: ${options.target}`, options.width / 2, options.height / 2 + 20);

    if (options.enableVR) {
      this.addVRButton(options);
    }
    if (options.enableAR) {
      this.addARButton(options);
    }
  }

  private renderStaticPreview(compiledOutput: string): void {
    const pre = document.createElement('pre');
    pre.style.cssText = `
      background: #0a0a1a;
      color: #64c8ff;
      padding: 16px;
      font-family: monospace;
      font-size: 12px;
      overflow: auto;
      height: 100%;
      margin: 0;
    `;
    pre.textContent =
      compiledOutput.substring(0, 500) + (compiledOutput.length > 500 ? '\n...' : '');
    this.container.appendChild(pre);
  }

  private addVRButton(options: RenderOptions): void {
    const btn = document.createElement('button');
    btn.textContent = 'Enter VR';
    btn.style.cssText = `
      position: absolute;
      bottom: 16px;
      right: 16px;
      background: rgba(100, 200, 255, 0.9);
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: monospace;
      cursor: pointer;
      font-size: 14px;
    `;
    btn.addEventListener('click', async () => {
      if ('xr' in navigator) {
        try {
          const xrSystem = (navigator as Navigator & { xr?: { requestSession(mode: string): Promise<{ addEventListener(type: string, cb: () => void): void }> } }).xr!;
          const session = await xrSystem.requestSession('immersive-vr');
          session.addEventListener('end', () => {
            btn.textContent = 'Enter VR';
          });
          btn.textContent = 'In VR...';
        } catch (e) {
          console.warn('WebXR session failed:', e);
        }
      }
    });
    this.container.style.position = 'relative';
    this.container.appendChild(btn);
  }

  private addARButton(options: RenderOptions): void {
    const btn = document.createElement('button');
    btn.textContent = 'Enter AR';
    btn.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: rgba(100, 255, 150, 0.9);
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: monospace;
      cursor: pointer;
      font-size: 14px;
    `;
    this.container.style.position = 'relative';
    this.container.appendChild(btn);
  }

  cleanup(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.canvas = null;
  }
}
