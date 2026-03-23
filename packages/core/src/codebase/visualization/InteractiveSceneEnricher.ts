/**
 * Interactive Scene Enricher
 *
 * Post-processes a SceneComposition from CodebaseSceneCompiler to add
 * interactive capabilities: hover highlighting, click selection, edge
 * tracing, tooltips, and camera fly-to.
 *
 * Generates event handlers in the composition for:
 *   on graph:hover   → highlight node + show tooltip
 *   on graph:select  → highlight node + connected edges
 *   on graph:focus   → fly camera to node
 *
 * @version 1.0.0
 */

import type { SceneComposition, SceneObject } from './CodebaseSceneTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface InteractionEvent {
  /** Event name (e.g., 'graph:hover', 'graph:select') */
  event: string;
  /** Handler description for compiler backends */
  handler: string;
  /** Target node pattern ('*' for all, or specific node ID) */
  target: string;
  /** Action to perform */
  action: InteractionAction;
}

export type InteractionAction =
  | { type: 'highlight'; color?: string; emissiveIntensity?: number; scale?: number }
  | { type: 'tooltip'; content: string[] }
  | { type: 'edge_highlight'; edgeType?: 'import' | 'call' | 'all'; color?: string; width?: number }
  | { type: 'camera_fly_to'; offset?: { x: number; y: number; z: number }; duration?: number }
  | { type: 'select'; multiSelect?: boolean };

export interface InteractiveSceneComposition extends SceneComposition {
  /** Event handlers for interactive behavior */
  interactionEvents: InteractionEvent[];
  /** Trait attachment metadata */
  traits: Array<{ name: string; config: Record<string, unknown> }>;
}

export interface EnricherOptions {
  /** Enable hover highlighting (default: true) */
  hoverHighlight?: boolean;
  /** Enable click selection (default: true) */
  clickSelect?: boolean;
  /** Enable edge highlighting on hover/select (default: true) */
  edgeHighlight?: boolean;
  /** Enable camera fly-to on double-click (default: true) */
  cameraFlyTo?: boolean;
  /** Enable tooltips (default: true) */
  tooltips?: boolean;
  /** Tooltip delay in ms (default: 300) */
  tooltipDelay?: number;
  /** Hover highlight color (default: '#ffffff') */
  hoverColor?: string;
  /** Selected highlight color (default: '#00ff88') */
  selectColor?: string;
  /** Edge highlight color for import edges (default: '#88ccff') */
  importHighlightColor?: string;
  /** Edge highlight color for call edges (default: '#ffcc44') */
  callHighlightColor?: string;
}

// =============================================================================
// ENRICHER
// =============================================================================

export class InteractiveSceneEnricher {
  private options: Required<EnricherOptions>;

  constructor(options: EnricherOptions = {}) {
    this.options = {
      hoverHighlight: options.hoverHighlight ?? true,
      clickSelect: options.clickSelect ?? true,
      edgeHighlight: options.edgeHighlight ?? true,
      cameraFlyTo: options.cameraFlyTo ?? true,
      tooltips: options.tooltips ?? true,
      tooltipDelay: options.tooltipDelay ?? 300,
      hoverColor: options.hoverColor ?? '#ffffff',
      selectColor: options.selectColor ?? '#00ff88',
      importHighlightColor: options.importHighlightColor ?? '#88ccff',
      callHighlightColor: options.callHighlightColor ?? '#ffcc44',
    };
  }

  /**
   * Enrich a SceneComposition with interactive capabilities.
   * Returns a new composition with interaction events and trait metadata.
   */
  enrich(scene: SceneComposition): InteractiveSceneComposition {
    const events: InteractionEvent[] = [];

    // Hover events
    if (this.options.hoverHighlight) {
      events.push({
        event: 'graph:hover',
        handler: 'Highlight hovered node with emissive glow and scale-up',
        target: '*',
        action: {
          type: 'highlight',
          color: this.options.hoverColor,
          emissiveIntensity: 0.6,
          scale: 1.15,
        },
      });
    }

    // Tooltip events
    if (this.options.tooltips) {
      for (const obj of scene.objects) {
        const tooltipContent = this.buildTooltipContent(obj);
        events.push({
          event: 'graph:hover',
          handler: `Show tooltip for ${obj.name}`,
          target: obj.name,
          action: { type: 'tooltip', content: tooltipContent },
        });
      }
    }

    // Click selection events
    if (this.options.clickSelect) {
      events.push({
        event: 'graph:select',
        handler: 'Select node and highlight with accent color',
        target: '*',
        action: {
          type: 'select',
          multiSelect: true,
        },
      });

      events.push({
        event: 'graph:select',
        handler: 'Apply selection visual style',
        target: '*',
        action: {
          type: 'highlight',
          color: this.options.selectColor,
          emissiveIntensity: 0.8,
        },
      });
    }

    // Edge highlighting
    if (this.options.edgeHighlight) {
      events.push({
        event: 'graph:edge_highlight',
        handler: 'Highlight import edges connected to focused node',
        target: '*',
        action: {
          type: 'edge_highlight',
          edgeType: 'import',
          color: this.options.importHighlightColor,
          width: 3,
        },
      });

      events.push({
        event: 'graph:edge_highlight',
        handler: 'Highlight call edges connected to focused node',
        target: '*',
        action: {
          type: 'edge_highlight',
          edgeType: 'call',
          color: this.options.callHighlightColor,
          width: 4,
        },
      });
    }

    // Camera fly-to
    if (this.options.cameraFlyTo) {
      events.push({
        event: 'graph:focus',
        handler: 'Fly camera to focused node position',
        target: '*',
        action: {
          type: 'camera_fly_to',
          offset: { x: 0, y: 2, z: 5 },
          duration: 0.8,
        },
      });
    }

    return {
      ...scene,
      interactionEvents: events,
      traits: [
        {
          name: 'interactive_graph',
          config: {
            hoverHighlight: this.options.hoverHighlight,
            clickInspect: this.options.clickSelect,
            edgeHighlight: this.options.edgeHighlight,
            multiSelect: true,
            tooltipDelay: this.options.tooltipDelay,
            raycastDistance: 100,
            hoverScale: 1.15,
            selectedEmissive: 0.5,
            flyToDuration: 0.8,
          },
        },
      ],
    };
  }

  // ── Private ────────────────────────────────────────────────────────────

  /**
   * Build tooltip content lines from a scene object's properties.
   */
  private buildTooltipContent(obj: SceneObject): string[] {
    const lines: string[] = [];
    const props = obj.properties;

    lines.push(obj.name);

    if (props.symbolType) {
      lines.push(`Type: ${props.symbolType}`);
    }
    if (props.language) {
      lines.push(`Language: ${props.language}`);
    }
    if (props.file) {
      lines.push(`File: ${props.file}`);
    }
    if (props.signature) {
      lines.push(`Signature: ${props.signature}`);
    }
    if (props.loc) {
      lines.push(`Lines: ${props.loc}`);
    }
    if (props.visibility) {
      lines.push(`Visibility: ${props.visibility}`);
    }
    if (props.owner) {
      lines.push(`Owner: ${props.owner}`);
    }

    return lines;
  }
}
