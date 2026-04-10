/**
 * DOM2DRenderer - HoloScript to HTML Element Renderer
 *
 * Maps HoloScript AST nodes to native HTML elements.
 * This enables HoloScript to render to 2D web UI instead of VR/3D.
 *
 * @example
 * ```typescript
 * import { DOM2DRenderer, createDOM2DRenderer } from '@holoscript/runtime';
 * import { parseHoloScriptPlus } from '@holoscript/core';
 *
 * const ast = parseHoloScriptPlus(source);
 * const renderer = createDOM2DRenderer({
 *   onAction: (action, nodeId) => console.log(`Action: ${action}`),
 * });
 *
 * renderer.renderTree(ast, document.getElementById('app'));
 * ```
 *
 * @version 1.0.0
 */

export interface HSNode {
  type: string;
  id?: string;
  properties: Record<string, unknown>;
  directives: Array<{ type: string; name?: string }>;
  children: HSNode[];
}

export interface RenderedElement {
  element: HTMLElement;
  node: HSNode;
  children: RenderedElement[];
}

export interface DOM2DRendererOptions {
  /** CSS class prefix for all elements (default: 'hs') */
  classPrefix?: string;
  /** Click handler for interactive elements */
  onAction?: (action: string, nodeId: string) => void;
  /** Custom element creators by node type */
  customCreators?: Record<string, (node: HSNode, options: DOM2DRendererOptions) => HTMLElement>;
  /** Parent document (default: window.document) */
  document?: Document;
}

const DEFAULT_OPTIONS: Required<DOM2DRendererOptions> = {
  classPrefix: 'hs',
  onAction: () => {},
  customCreators: {},
  document: typeof window !== 'undefined' ? window.document : (null as unknown as Document),
};

/**
 * DOM2DRenderer implements the Renderer interface for HoloScript
 * but renders to 2D HTML elements instead of 3D objects.
 */
export class DOM2DRenderer {
  private options: Required<DOM2DRendererOptions>;
  private elements: Map<HTMLElement, RenderedElement> = new Map();
  private doc: Document;

  constructor(options: DOM2DRendererOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.doc = this.options.document;
  }

  /**
   * Create an HTML element from a HoloScript node
   */
  createElement(node: HSNode): HTMLElement {
    const type = node.type.toLowerCase();

    // Check for custom creator
    if (this.options.customCreators[type]) {
      return this.options.customCreators[type](node, this.options);
    }

    // Default element mappings
    switch (type) {
      case 'scene':
        return this.createScene(node);
      case 'group':
        return this.createGroup(node);
      case 'orb':
        return this.createOrb(node);
      case 'panel':
        return this.createPanel(node);
      case 'modal':
        return this.createModal(node);
      case 'text':
        return this.createText(node);
      case 'button':
        return this.createButton(node);
      case 'cube':
      case 'sphere':
      case 'cylinder':
        return this.createShape(node);
      default:
        return this.createGeneric(node);
    }
  }

  /**
   * Update an existing element's properties
   */
  updateElement(element: HTMLElement, properties: Record<string, unknown>): void {
    this.applyProperties(element, properties);
  }

  /**
   * Append a child element
   */
  appendChild(parent: HTMLElement, child: HTMLElement): void {
    parent.appendChild(child);
  }

  /**
   * Remove a child element
   */
  removeChild(parent: HTMLElement, child: HTMLElement): void {
    parent.removeChild(child);
  }

  /**
   * Destroy an element and clean up
   */
  destroy(element: HTMLElement): void {
    element.remove();
    this.elements.delete(element);
  }

  // ============================================================
  // Element Creators
  // ============================================================

  private createScene(node: HSNode): HTMLElement {
    const scene = this.doc.createElement('div');
    scene.className = `${this.options.classPrefix}-scene`;
    if (node.id) scene.id = node.id;
    this.applyProperties(scene, node.properties);
    return scene;
  }

  private createGroup(node: HSNode): HTMLElement {
    const group = this.doc.createElement('div');
    group.className = `${this.options.classPrefix}-group`;
    if (node.id) {
      group.id = node.id;
      group.classList.add(`${this.options.classPrefix}-${node.id}`);
    }
    this.applyProperties(group, node.properties);
    return group;
  }

  private createOrb(node: HSNode): HTMLElement {
    const hasClickable = node.directives?.some(
      (d) => d.type === 'clickable' || d.name === 'clickable'
    );
    const element = hasClickable ? this.doc.createElement('button') : this.doc.createElement('div');

    element.className = `${this.options.classPrefix}-orb`;
    if (node.id) {
      element.id = node.id;
      element.classList.add(`${this.options.classPrefix}-${node.id}`);
    }

    // Apply orb-specific styling
    const color = (node.properties.color as string) || '#00ffff';
    const scale = (node.properties.scale as number) || 1;

    element.style.setProperty('--orb-color', color);
    element.style.setProperty('--orb-scale', String(scale));
    element.style.backgroundColor = color;
    element.style.transform = `scale(${scale})`;

    // Handle action
    const action = node.properties.action as string;
    if (action && hasClickable) {
      element.addEventListener('click', () => {
        this.options.onAction(action, node.id || '');
      });
      element.setAttribute('data-action', action);
    }

    // Handle tooltip
    const tooltip = node.properties.tooltip as string;
    if (tooltip) {
      element.setAttribute('title', tooltip);
      element.setAttribute('data-tooltip', tooltip);

      // Add tooltip text as inner content
      const tooltipDiv = this.doc.createElement('span');
      tooltipDiv.className = `${this.options.classPrefix}-orb-tooltip`;
      tooltipDiv.textContent = tooltip;
      element.appendChild(tooltipDiv);
    }

    // Add trait classes
    if (node.directives) {
      for (const directive of node.directives) {
        const traitName = directive.name || directive.type;
        element.classList.add(`${this.options.classPrefix}-trait-${traitName}`);
      }
    }

    this.applyProperties(element, node.properties);
    return element;
  }

  private createPanel(node: HSNode): HTMLElement {
    const panel = this.doc.createElement('div');
    panel.className = `${this.options.classPrefix}-panel`;
    if (node.id) {
      panel.id = node.id;
      panel.classList.add(`${this.options.classPrefix}-${node.id}`);
    }

    // Panel header
    const title = node.properties.title as string;
    if (title) {
      const header = this.doc.createElement('div');
      header.className = `${this.options.classPrefix}-panel-header`;
      header.textContent = title;
      panel.appendChild(header);
    }

    // Panel content area
    const content = this.doc.createElement('div');
    content.className = `${this.options.classPrefix}-panel-content`;
    panel.appendChild(content);

    this.applyProperties(panel, node.properties);
    return panel;
  }

  private createModal(node: HSNode): HTMLElement {
    const modal = this.doc.createElement('div');
    modal.className = `${this.options.classPrefix}-modal`;
    if (node.id) modal.id = node.id;

    // Modal backdrop
    const backdrop = this.doc.createElement('div');
    backdrop.className = `${this.options.classPrefix}-modal-backdrop`;

    // Modal content
    const content = this.doc.createElement('div');
    content.className = `${this.options.classPrefix}-modal-content`;

    // Title
    const title = node.properties.title as string;
    if (title) {
      const header = this.doc.createElement('h2');
      header.className = `${this.options.classPrefix}-modal-title`;
      header.textContent = title;
      content.appendChild(header);
    }

    modal.appendChild(backdrop);
    modal.appendChild(content);
    modal.style.display = 'none'; // Hidden by default

    this.applyProperties(modal, node.properties);
    return modal;
  }

  private createText(node: HSNode): HTMLElement {
    const text = this.doc.createElement('span');
    text.className = `${this.options.classPrefix}-text`;
    text.textContent =
      (node.properties.content as string) || (node.properties.text as string) || '';
    this.applyProperties(text, node.properties);
    return text;
  }

  private createButton(node: HSNode): HTMLElement {
    const button = this.doc.createElement('button');
    button.className = `${this.options.classPrefix}-button`;
    if (node.id) button.id = node.id;

    button.textContent =
      (node.properties.label as string) || (node.properties.text as string) || '';

    const action = node.properties.action as string;
    if (action) {
      button.addEventListener('click', () => {
        this.options.onAction(action, node.id || '');
      });
      button.setAttribute('data-action', action);
    }

    this.applyProperties(button, node.properties);
    return button;
  }

  private createShape(node: HSNode): HTMLElement {
    // 2D representations of 3D shapes
    const shape = this.doc.createElement('div');
    const type = node.type.toLowerCase();
    shape.className = `${this.options.classPrefix}-shape ${this.options.classPrefix}-${type}`;
    if (node.id) shape.id = node.id;

    const color = node.properties.color as string;
    if (color) {
      shape.style.backgroundColor = color;
    }

    // Round for sphere
    if (type === 'sphere' || type === 'orb') {
      shape.style.borderRadius = '50%';
    }

    this.applyProperties(shape, node.properties);
    return shape;
  }

  private createGeneric(node: HSNode): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = `${this.options.classPrefix}-${node.type.toLowerCase()}`;
    if (node.id) element.id = node.id;
    this.applyProperties(element, node.properties);
    return element;
  }

  // ============================================================
  // Property Application
  // ============================================================

  private applyProperties(element: HTMLElement, properties: Record<string, unknown>): void {
    if (!properties) return;

    for (const [key, value] of Object.entries(properties)) {
      switch (key) {
        case 'color':
          element.style.setProperty('--hs-color', value as string);
          break;
        case 'backgroundColor':
          element.style.backgroundColor = value as string;
          break;
        case 'position':
          // Convert 3D position to CSS grid/flex positioning hint
          if (Array.isArray(value)) {
            element.setAttribute('data-position', value.join(','));
            element.style.setProperty('--hs-pos-x', String(value[0]));
            element.style.setProperty('--hs-pos-y', String(value[1]));
            element.style.setProperty('--hs-pos-z', String(value[2] ?? 0));
          }
          break;
        case 'scale':
          element.style.setProperty('--hs-scale', String(value));
          break;
        case 'visible':
          element.style.display = value ? '' : 'none';
          break;
        case 'opacity':
          element.style.opacity = String(value);
          break;
        case 'width':
          element.style.width = typeof value === 'number' ? `${value}px` : String(value);
          break;
        case 'height':
          element.style.height = typeof value === 'number' ? `${value}px` : String(value);
          break;
        case 'className':
          element.classList.add(...String(value).split(' '));
          break;
        // Skip non-visual properties
        case 'action':
        case 'tooltip':
        case 'title':
        case 'text':
        case 'content':
        case 'label':
          break;
        default:
          // Store as data attribute for custom handling
          if (typeof value !== 'object') {
            element.setAttribute(`data-${key}`, String(value));
          }
      }
    }
  }

  // ============================================================
  // Full Tree Rendering
  // ============================================================

  /**
   * Render an entire AST tree to a container
   */
  renderTree(ast: HSNode, container: HTMLElement): RenderedElement {
    const rootElement = this.createElement(ast);
    const rendered: RenderedElement = {
      element: rootElement,
      node: ast,
      children: [],
    };

    // Recursively render children
    if (ast.children && ast.children.length > 0) {
      for (const child of ast.children) {
        const childRendered = this.renderTree(child, rootElement);
        rendered.children.push(childRendered);
        this.appendChild(rootElement, childRendered.element);
      }
    }

    // Mount to container
    container.appendChild(rootElement);
    this.elements.set(rootElement, rendered);

    return rendered;
  }

  /**
   * Get all rendered elements with a specific action
   */
  getElementsByAction(action: string): HTMLElement[] {
    const result: HTMLElement[] = [];
    for (const [element] of this.elements) {
      if (element.getAttribute('data-action') === action) {
        result.push(element);
      }
      // Also check children
      const children = element.querySelectorAll(`[data-action="${action}"]`);
      children.forEach((child) => result.push(child as HTMLElement));
    }
    return result;
  }

  /**
   * Clear all rendered content
   */
  clear(): void {
    for (const [element] of this.elements) {
      element.remove();
    }
    this.elements.clear();
  }

  /**
   * Get the rendered element for a node by ID
   */
  getElementById(id: string): HTMLElement | null {
    return this.doc.getElementById(id);
  }

  /**
   * Show a modal by ID
   */
  showModal(id: string): void {
    const modal = this.getElementById(id);
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('data-visible', 'true');
    }
  }

  /**
   * Hide a modal by ID
   */
  hideModal(id: string): void {
    const modal = this.getElementById(id);
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('data-visible', 'false');
    }
  }
}

/**
 * Create a DOM2DRenderer instance
 */
export function createDOM2DRenderer(options?: DOM2DRendererOptions): DOM2DRenderer {
  return new DOM2DRenderer(options);
}

/**
 * Transform a HoloScript parser AST to the HSNode format expected by DOM2DRenderer
 */
export function transformASTToHSNode(parserResult: unknown): HSNode {
  // Handle { ast: {...}, errors: [...] } format from parser
  const ast = (parserResult as { ast?: unknown }).ast || parserResult;

  // Find the scene node
  const astWithChildren = ast as { children?: Array<{ type: string }> };
  const sceneNode =
    astWithChildren.children?.find((c) => c.type === 'scene') ||
    astWithChildren.children?.[0] ||
    ast;

  function transformNode(node: Record<string, unknown>): HSNode {
    const children: HSNode[] = [];

    // Handle different child property names
    const childNodes = (node.children || node.elements || []) as Array<Record<string, unknown>>;
    for (const child of childNodes) {
      if (child && typeof child === 'object') {
        children.push(transformNode(child));
      }
    }

    // Extract directives (traits like @clickable)
    const directives: Array<{ type: string; name?: string }> = [];
    const nodeDirectives = (node.directives || node.traits || []) as Array<unknown>;
    for (const d of nodeDirectives) {
      if (typeof d === 'string') {
        directives.push({ type: d, name: d });
      } else if (typeof d === 'object' && d !== null) {
        const directive = d as { type?: string; name?: string };
        if (directive.type === 'trait' && directive.name) {
          directives.push({ type: directive.name, name: directive.name });
        } else if (directive.name) {
          directives.push({ type: directive.name, name: directive.name });
        } else if (directive.type) {
          directives.push({ type: directive.type, name: directive.type });
        }
      }
    }

    // Extract ID from node.id or node.name
    const id = (node.id || node.name) as string | undefined;

    // Flatten properties
    const properties: Record<string, unknown> = {};

    // Copy from properties object
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, value] of Object.entries(node.properties as Record<string, unknown>)) {
        properties[key] = value;
      }
    }

    // Also check for direct properties on node
    const directProps = [
      'position',
      'color',
      'scale',
      'action',
      'tooltip',
      'title',
      'visible',
      'label',
      'placeholder',
      'text',
      'content',
    ];
    for (const key of directProps) {
      if (node[key] !== undefined && properties[key] === undefined) {
        properties[key] = node[key];
      }
    }

    return {
      type: (node.type as string) || 'unknown',
      id,
      properties,
      directives,
      children,
    };
  }

  return transformNode(sceneNode as Record<string, unknown>);
}
