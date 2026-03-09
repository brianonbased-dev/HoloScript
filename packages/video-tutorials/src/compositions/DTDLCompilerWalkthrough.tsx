import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { dtdlData } from '../data/compilers/dtdl';

export const DTDLCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...dtdlData} />
);
