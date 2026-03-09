'use client';

/**
 * useEnvironment — reads/writes the @environment block in the current HoloScript scene code.
 */

import { useCallback, useMemo } from 'react';
import { useSceneStore } from '@/lib/stores';

export interface EnvironmentState {
  hasEnvironment: boolean;
  rawBlock: string | null;
}

const ENV_BLOCK_RE = /environment\s*\{([\s\S]*?)\}/;

function parseEnvBlock(code: string): string | null {
  const m = code.match(ENV_BLOCK_RE);
  return m ? m[0] : null;
}

export function useEnvironment() {
  const code = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  const rawBlock = useMemo(() => parseEnvBlock(code), [code]);
  const hasEnvironment = rawBlock !== null;

  /** Replace or insert the environment block in the scene code */
  const applyPreset = useCallback(
    (traitSnippet: string) => {
      const block = `environment {\n${traitSnippet}\n}\n`;
      if (ENV_BLOCK_RE.test(code)) {
        setCode(code.replace(ENV_BLOCK_RE, block.trimEnd()));
      } else {
        setCode(`${code}\n\n${block}`);
      }
    },
    [code, setCode]
  );

  /** Remove the environment block entirely */
  const removeEnvironment = useCallback(() => {
    setCode(code.replace(/environment\s*\{[\s\S]*?\}\n?/, '').trimEnd());
  }, [code, setCode]);

  return { hasEnvironment, rawBlock, applyPreset, removeEnvironment };
}
