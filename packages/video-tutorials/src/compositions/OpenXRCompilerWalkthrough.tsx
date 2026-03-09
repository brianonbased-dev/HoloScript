import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { openxrData } from '../data/compilers/openxr';

export const OpenXRCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...openxrData} />
);
