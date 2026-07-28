/**
 * HSILearningGraph — compiler-emitted projection of HSI-IR for neural processors.
 *
 * Not source truth and not a new format: a pure, deterministic function of the
 * IR. Node/edge IDs are stable and name-derived; the train/eval split is a
 * deterministic hash of (nodeId, worldDigest) so the same world always splits
 * the same way; intervention identities are named here but executed only by
 * the audit plane.
 */

import { createHash } from 'crypto';
import {
  HSI_LEARNING_GRAPH_SCHEMA_VERSION,
  hsiSha256,
  type HSIEffect,
  type HSIIRDocument,
  type HSILearningEdge,
  type HSILearningGraph,
  type HSILearningNode,
} from './HSIIRTypes';

function splitFor(nodeId: string, worldDigest: string): 'train' | 'eval' {
  const digest = createHash('sha256').update(`${nodeId}|${worldDigest}`).digest();
  return digest[0]! % 4 === 0 ? 'eval' : 'train';
}

function collectAssignTargets(effects: HSIEffect[], into: Set<string>, reads: Set<string>): void {
  for (const effect of effects) {
    if (effect.kind === 'assign') {
      into.add(effect.target);
      const stack = [effect.value];
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.kind === 'Identifier') reads.add(node.name);
        else if (node.kind === 'BinaryExpression') stack.push(node.left, node.right);
        else if (node.kind === 'UnaryExpression') stack.push(node.argument);
        else if (node.kind === 'MemberExpression') stack.push(node.object);
        else if (node.kind === 'CallExpression') stack.push(...node.arguments);
      }
    } else if (effect.kind === 'branch') {
      collectAssignTargets(effect.then, into, reads);
      collectAssignTargets(effect.else, into, reads);
    }
  }
}

/** Project an HSI-IR document into the typed LearningGraph. Pure and deterministic. */
export function projectLearningGraph(ir: HSIIRDocument): HSILearningGraph {
  const worldDigest = ir.provenance.deterministicDigest;
  const nodes: HSILearningNode[] = [];
  const edges: HSILearningEdge[] = [];

  const addNode = (node: Omit<HSILearningNode, 'split'>): void => {
    nodes.push({ ...node, split: splitFor(node.id, worldDigest) });
  };
  const addEdge = (
    edgeType: HSILearningEdge['edgeType'],
    from: string,
    to: string,
    label?: string
  ): void => {
    const edge: HSILearningEdge = { id: `edge:${edgeType}:${from}->${to}`, edgeType, from, to };
    if (label !== undefined) edge.label = label;
    edges.push(edge);
  };

  const worldId = `entity:${ir.world.name}`;
  addNode({ id: worldId, nodeType: 'entity', baseline: null, unknowns: [] });

  for (const entity of ir.entities) {
    addNode({
      id: entity.id,
      nodeType: 'entity',
      baseline: null,
      unknowns: entity.opacity === 'unknown' ? ['opacity'] : [],
      sourceSpan: entity.sourceSpan,
    });
    addEdge('contains', worldId, entity.id);
  }

  for (const field of ir.state) {
    addNode({
      id: field.id,
      nodeType: 'state',
      baseline: field.baseline,
      unknowns: [],
      sourceSpan: field.sourceSpan,
    });
    addEdge('contains', worldId, field.id);
  }

  for (const rule of ir.observationPolicy) {
    addNode({
      id: rule.id,
      nodeType: 'observation',
      baseline: null,
      unknowns: rule.access === 'unknown' ? ['access'] : [],
    });
    addEdge('observes', `entity:${rule.observer}`, rule.id, rule.access);
    addEdge('refers-to', rule.id, `entity:${rule.observed}`);
    for (const mediator of rule.mediators) {
      addEdge('refers-to', rule.id, `entity:${mediator}`, 'mediator');
    }
  }

  for (const handler of ir.eventHandlers) {
    addNode({
      id: handler.id,
      nodeType: 'event',
      baseline: null,
      unknowns: [],
      sourceSpan: handler.sourceSpan,
    });
    const targets = new Set<string>();
    const reads = new Set<string>();
    collectAssignTargets(handler.effects, targets, reads);
    for (const target of [...targets].sort()) {
      addEdge('affects', handler.id, `state:world.${target}`);
    }
    for (const read of [...reads].sort()) {
      if (!targets.has(read)) addEdge('requires', handler.id, `state:world.${read}`);
    }
  }

  for (const machine of ir.machines) {
    for (const transition of machine.transitions) {
      addNode({
        id: transition.id,
        nodeType: 'action',
        baseline: null,
        unknowns: [],
        sourceSpan: transition.sourceSpan,
      });
      for (const read of transition.reads) {
        addEdge('requires', transition.id, `input:${machine.name}.${read}`);
      }
      addEdge('causes', transition.id, `machineState:${machine.name}.${transition.target}`);
      if (transition.from !== 'any') {
        addEdge('precedes', `machineState:${machine.name}.${transition.from}`, transition.id);
      }
    }
    for (const stateName of machine.states) {
      addNode({
        id: `machineState:${machine.name}.${stateName}`,
        nodeType: 'state',
        baseline: null,
        unknowns: [],
      });
      addEdge('contains', worldId, `machineState:${machine.name}.${stateName}`);
    }
    for (const input of machine.inputs) {
      addNode({ id: input.id, nodeType: 'state', baseline: input.baseline, unknowns: [] });
      addEdge('contains', worldId, input.id);
    }
  }

  for (const predicate of ir.predicates) {
    addNode({
      id: predicate.id,
      nodeType: 'objective',
      baseline: null,
      unknowns: [],
      sourceSpan: predicate.sourceSpan,
    });
    for (const read of predicate.reads) {
      addEdge('refers-to', predicate.id, `state:world.${read}`);
    }
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  const graphWithoutDigest = {
    schemaVersion: HSI_LEARNING_GRAPH_SCHEMA_VERSION,
    kind: 'HSILearningGraph' as const,
    worldDigest,
    emittedFrom: worldDigest,
    nodes,
    edges,
    interventions: ['intervention:flip-opacity', 'intervention:raise-guard-threshold'],
  };

  return { ...graphWithoutDigest, deterministicDigest: hsiSha256(graphWithoutDigest) };
}
