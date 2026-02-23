/**
 * Shader Compilation Hook
 *
 * Live compilation with debouncing and error handling
 */

import { useState, useEffect, useCallback } from 'react';
import { ShaderGraphCompiler } from '@holoscript/core/shader/graph/ShaderGraphCompiler';
import type { ICompiledShader } from '@holoscript/core/shader/graph/ShaderGraphTypes';
import { useShaderGraph } from './useShaderGraph';

interface CompilationState {
  compiled: ICompiledShader | null;
  isCompiling: boolean;
  lastCompileTime: number;
}

export function useShaderCompilation(debounceMs: number = 300) {
  const graph = useShaderGraph((state) => state.graph);
  const [state, setState] = useState<CompilationState>({
    compiled: null,
    isCompiling: false,
    lastCompileTime: 0,
  });

  const compile = useCallback(() => {
    setState((prev) => ({ ...prev, isCompiling: true }));

    try {
      const startTime = performance.now();
      const compiler = new ShaderGraphCompiler(graph, {
        target: 'wgsl',
        optimize: true,
        debug: false,
      });

      const compiled = compiler.compile();
      const compileTime = performance.now() - startTime;

      setState({
        compiled,
        isCompiling: false,
        lastCompileTime: compileTime,
      });
    } catch (error) {
      console.error('Shader compilation error:', error);
      setState((prev) => ({
        ...prev,
        isCompiling: false,
        compiled: {
          vertexCode: '',
          fragmentCode: '',
          uniforms: [],
          textures: [],
          warnings: [],
          errors: [error instanceof Error ? error.message : 'Unknown compilation error'],
        },
      }));
    }
  }, [graph]);

  // Debounced compilation
  useEffect(() => {
    const timer = setTimeout(() => {
      compile();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [graph, debounceMs, compile]);

  return {
    ...state,
    recompile: compile,
  };
}
