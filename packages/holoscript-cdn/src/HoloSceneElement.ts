import type { HoloSceneTarget, _HoloSceneFallback } from './types';
import { HoloSceneRenderer } from './HoloSceneRenderer';

export class HoloSceneElement extends HTMLElement {
  private renderer: HoloSceneRenderer | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (!this.shadowRoot) return;
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    this.shadowRoot.appendChild(container);
    this.renderer = new HoloSceneRenderer(container);
  }

  disconnectedCallback() {
    if (this.renderer) {
      this.renderer.cleanup();
    }
  }

  get src(): string {
    return this.getAttribute('src') || '';
  }

  get target(): HoloSceneTarget {
    return (this.getAttribute('target') as HoloSceneTarget) || 'auto';
  }
}

export function registerHoloScene() {
  if (typeof window !== 'undefined' && !customElements.get('holo-scene')) {
    customElements.define('holo-scene', HoloSceneElement);
  }
}
