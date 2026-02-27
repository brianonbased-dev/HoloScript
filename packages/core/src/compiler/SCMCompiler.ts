/**
 * HoloScript → SCM-DAG (Structural Causal Model) Compiler
 *
 * Exports HoloScript compositions to JSON causal formats for offline ML processing.
 * Maps object proximity, explicit behavioral traits, and logic blocks as Directed Acyclic Graphs supporting `do-calculus` intervention.
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup
} from '../parser/HoloCompositionTypes';

export interface AffectiveState {
    valence: number;
    arousal: number;
    dominantEmotion: 'calm' | 'excited' | 'frustrated' | 'engaged' | 'bored' | 'anxious';
}

export interface SCMCompilerOptions {
  modelName?: string;
  affectiveContext?: AffectiveState;
  privacyMask?: boolean;
}

export interface SCMNode {
  id: string;
  type: string;
  properties: Record<string, any>;
  do_capable: boolean;
}

export interface SCMEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface SCMDAG {
  metadata: {
    model_name: string;
    generated_at: string;
    affective_context?: AffectiveState;
  };
  nodes: SCMNode[];
  edges: SCMEdge[];
}

export class SCMCompiler {
  private options: Required<SCMCompilerOptions>;
  private nodes: SCMNode[] = [];
  private edges: SCMEdge[] = [];

  constructor(options: SCMCompilerOptions = {}) {
    this.options = {
      modelName: options.modelName || 'HoloScript_SCM_DAG',
      affectiveContext: options.affectiveContext || { valence: 0, arousal: 0, dominantEmotion: 'calm' },
      privacyMask: options.privacyMask || false
    };
  }

  // Helper to extract traits consistently
  private getTraitName(trait: string | { name: string }): string {
    return typeof trait === 'string' ? trait : trait.name;
  }

  private hasTrait(obj: HoloObjectDecl, traitName: string): boolean {
    return obj.traits?.some((t) => this.getTraitName(t) === traitName) ?? false;
  }

  compile(composition: HoloComposition): string {
    this.nodes = [];
    this.edges = [];

    // Parse absolute boundaries into DAG roots natively
    this.extractNodes(composition);
    
    // Extract explicit relation mapping
    this.extractEdges(composition);

    // Dynamic Pruning (Affective Causality Mapping)
    // If the agent is in a high-arousal negative-valence state, narrow the causal window mathematically.
    this.applyAffectivePruning();

    // Privacy Differential Masking (Cycle 10)
    this.applyPrivacyMask();

    const dag: SCMDAG = {
      metadata: {
        model_name: this.options.modelName,
        generated_at: new Date().toISOString(),
        affective_context: this.options.affectiveContext
      },
      nodes: this.nodes,
      edges: this.edges
    };

    return JSON.stringify(dag, null, 2);
  }

  private applyAffectivePruning(): void {
      const state = this.options.affectiveContext;
      
      // "Tunnel Vision" Simulation: Under high stress (frustration/anxiety), agents drop awareness of passive/distant edges.
      if (state.dominantEmotion === 'frustrated' || state.dominantEmotion === 'anxious') {
          // Keep only mechanisms and their direct edges, cull static_variables with low weights
          this.nodes = this.nodes.filter(n => n.do_capable || (n.properties.context_group === 'global'));
          this.edges = this.edges.filter(e => {
             const targetNode = this.nodes.find(n => n.id === e.target);
             return targetNode && (targetNode.do_capable === true || e.weight > 1.0); 
          });
      }
      
      // "Exploratory" Simulation: Under high engagement, artificially increase causal boundary weights
      if (state.dominantEmotion === 'engaged') {
          this.edges = this.edges.map(e => ({
              ...e,
              weight: e.weight * 1.5 // Engaged awareness strengthens correlations
          }));
      }
  }

  private applyPrivacyMask(): void {
      if (!this.options.privacyMask) return;

      const idMap = new Map<string, string>();
      let counter = 0;

      // Map unique, anonymous identifiers
      for (const node of this.nodes) {
          if (!idMap.has(node.id)) {
              idMap.set(node.id, `NODE_${counter++}`);
          }
          node.id = idMap.get(node.id)!;
          // Purge descriptive properties entirely
          node.properties = {};
      }

      for (const edge of this.edges) {
          edge.source = idMap.get(edge.source) || `UNKNOWN_${Math.random()}`;
          edge.target = idMap.get(edge.target) || `UNKNOWN_${Math.random()}`;
      }
  }

  private extractNodes(composition: HoloComposition): void {
    if (composition.objects) {
      for (const obj of composition.objects) {
        this.processNode(obj, 'global');
      }
    }

    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        if (group.objects) {
          for (const obj of group.objects) {
            this.processNode(obj, group.name);
          }
        }
      }
    }
  }

  private processNode(obj: HoloObjectDecl, contextGroup: string): void {
    // Entities capable of independent state mutation
    const isInterventionCapable = this.hasTrait(obj, 'ai_agent') || this.hasTrait(obj, 'interactive') || this.hasTrait(obj, 'causal');

    const node: SCMNode = {
      id: obj.name,
      type: isInterventionCapable ? 'mechanism_variable' : 'static_variable',
      do_capable: isInterventionCapable,
      properties: {
        context_group: contextGroup
      }
    };
    
    // Extract property weights 
    for(const prop of obj.properties) {
      if(typeof prop.value === 'number' || typeof prop.value === 'string' || typeof prop.value === 'boolean') {
        node.properties[prop.key] = prop.value;
      }
    }

    this.nodes.push(node);
  }

  private extractEdges(composition: HoloComposition): void {
     // A simplified pass mapping parent-child structural bounds as explicit causality rules.
     // e.g. An AI Agent's structural nested inventory explicitly dictates capability trees.

     if (composition.spatialGroups) {
       for (const group of composition.spatialGroups) {
         if (group.objects) {
            for (const childObj of group.objects) {
                // SCM Edge: The specific context Group dictates bounds of the child Object recursively
                this.edges.push({
                   source: group.name,
                   target: childObj.name,
                   relation: 'dictates_context',
                   weight: 1.0
                });
            }
         }
       }
     }
  }
}

export default SCMCompiler;
