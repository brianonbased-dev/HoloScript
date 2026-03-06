'use client';
/**
 * useShaderGraph — Hook for node-based shader editing
 */
import { useState, useCallback, useRef } from 'react';
import {
  ShaderGraph, SHADER_NODES,
  type ShaderNode, type ShaderConnection, type CompiledShader,
} from '@holoscript/core';

export interface UseShaderGraphReturn {
  graph: ShaderGraph;
  nodes: ShaderNode[];
  connections: ShaderConnection[];
  compiled: CompiledShader | null;
  nodeTypes: string[];
  addNode: (type: string) => ShaderNode | null;
  removeNode: (id: string) => void;
  connect: (fromNode: string, fromPort: string, toNode: string, toPort: string) => void;
  compile: () => CompiledShader;
  buildDemo: () => void;
  clear: () => void;
}

export function useShaderGraph(): UseShaderGraphReturn {
  const graphRef = useRef(new ShaderGraph());
  const [nodes, setNodes] = useState<ShaderNode[]>([]);
  const [connections, setConnections] = useState<ShaderConnection[]>([]);
  const [compiled, setCompiled] = useState<CompiledShader | null>(null);

  const sync = useCallback(() => {
    setNodes(graphRef.current.getNodes());
    setConnections(graphRef.current.getConnections());
  }, []);

  const addNode = useCallback((type: string) => {
    const x = Math.random() * 200;
    const y = Math.random() * 200;
    const n = graphRef.current.addNode(type, x, y);
    sync();
    return n;
  }, [sync]);

  const removeNode = useCallback((id: string) => { graphRef.current.removeNode(id); sync(); }, [sync]);

  const connect = useCallback((fromNode: string, fromPort: string, toNode: string, toPort: string) => {
    graphRef.current.connect(fromNode, fromPort, toNode, toPort);
    sync();
  }, [sync]);

  const compile = useCallback(() => {
    const result = graphRef.current.compile();
    setCompiled(result);
    return result;
  }, []);

  const buildDemo = useCallback(() => {
    graphRef.current = new ShaderGraph('demo');
    const color = graphRef.current.addNode('Color', 0, 0, { color: [0.2, 0.5, 1.0, 1.0] });
    const tex = graphRef.current.addNode('Texture', 200, 0);
    const mix = graphRef.current.addNode('Mix', 400, 0, { t: 0.5 });
    const fresnel = graphRef.current.addNode('Fresnel', 200, 200);
    const output = graphRef.current.addNode('Output', 600, 100);
    if (color && tex && mix && fresnel && output) {
      graphRef.current.connect(color.id, 'rgba', mix.id, 'a');
      graphRef.current.connect(tex.id, 'rgba', mix.id, 'b');
      graphRef.current.connect(mix.id, 'result', output.id, 'albedo');
    }
    sync();
    compile();
  }, [sync, compile]);

  const clear = useCallback(() => { graphRef.current = new ShaderGraph(); setNodes([]); setConnections([]); setCompiled(null); }, []);

  return { graph: graphRef.current, nodes, connections, compiled, nodeTypes: Object.keys(SHADER_NODES), addNode, removeNode, connect, compile, buildDemo, clear };
}
