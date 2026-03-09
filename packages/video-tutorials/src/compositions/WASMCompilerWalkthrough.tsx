import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { wasmData } from '../data/compilers/wasm';

export const WASMCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...wasmData} />
);
