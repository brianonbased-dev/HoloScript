import { describe, it, expect, beforeEach } from 'vitest';
import { NodeGraphPanel } from '../NodeGraphPanel';
import { NodeGraph } from '../../logic/NodeGraph';

describe('NodeGraphPanel', () => {
  let graph: NodeGraph;
  let panel: NodeGraphPanel;

  beforeEach(() => {
    graph = new NodeGraph();
    panel = new NodeGraphPanel(graph);
  });

  it('generateUI returns background entity', () => {
    const entities = panel.generateUI();
    const bg = entities.find((e) => e.data?.role === 'background');
    expect(bg).toBeDefined();
    expect(bg!.type).toBe('panel');
  });

  it('empty graph produces only background', () => {
    const entities = panel.generateUI();
    expect(entities.length).toBe(1);
  });

  it('adds entities for each node', () => {
    const node = graph.addNode('MathAdd', { x: 0, y: 0 });
    const entities = panel.generateUI();
    const nodeBody = entities.find((e) => e.data?.nodeId === node.id && e.data?.role === 'node');
    expect(nodeBody).toBeDefined();
  });

  it('generates title label for each node', () => {
    const node = graph.addNode('MathAdd', { x: 0, y: 0 });
    const entities = panel.generateUI();
    const title = entities.find((e) => e.data?.role === 'title' && e.data?.nodeId === node.id);
    expect(title).toBeDefined();
    expect(title!.text).toBe('MathAdd');
  });

  it('generates port entities for inputs and outputs', () => {
    const node = graph.addNode('MathAdd', { x: 0, y: 0 });
    const entities = panel.generateUI();
    const inputPorts = entities.filter(
      (e) => e.data?.role === 'input_port' && e.data?.nodeId === node.id
    );
    const outputPorts = entities.filter(
      (e) => e.data?.role === 'output_port' && e.data?.nodeId === node.id
    );
    // MathAdd has 2 inputs (a, b) and 1 output (result)
    expect(inputPorts.length).toBe(2);
    expect(outputPorts.length).toBe(1);
  });

  it('generates connection lines', () => {
    const n1 = graph.addNode('GetState', { x: 0, y: 0 });
    const n2 = graph.addNode('SetState', { x: 5, y: 0 });
    // GetState outputs 'value' (any), SetState inputs 'value' (any)
    graph.connect(n1.id, 'value', n2.id, 'value');
    const entities = panel.generateUI();
    const conn = entities.find((e) => e.data?.role === 'connection');
    expect(conn).toBeDefined();
    expect(conn!.type).toBe('connection_line');
  });

  it('selectNode marks selected node with different color', () => {
    const node = graph.addNode('MathAdd', { x: 0, y: 0 });
    panel.selectNode(node.id);
    const entities = panel.generateUI();
    const body = entities.find((e) => e.data?.nodeId === node.id && e.data?.role === 'node');
    expect(body!.color).toBe('#e94560'); // selection color
  });

  it('getSelectedNode returns null initially', () => {
    expect(panel.getSelectedNode()).toBeNull();
  });

  it('getSelectedNode returns selected id', () => {
    panel.selectNode('abc');
    expect(panel.getSelectedNode()).toBe('abc');
  });

  it('selectNode null deselects', () => {
    panel.selectNode('abc');
    panel.selectNode(null);
    expect(panel.getSelectedNode()).toBeNull();
  });

  it('custom config overrides defaults', () => {
    const customPanel = new NodeGraphPanel(graph, { nodeWidth: 0.5 });
    graph.addNode('Timer', { x: 0, y: 0 });
    const entities = customPanel.generateUI();
    const body = entities.find((e) => e.data?.role === 'node');
    expect(body!.size!.width).toBe(0.5);
  });
});
