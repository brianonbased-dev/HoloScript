import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { babylonData } from '../data/compilers/babylon';

export const BabylonCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...babylonData} />
);
