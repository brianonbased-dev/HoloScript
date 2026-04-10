import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { unrealData } from '../data/compilers/unreal';

export const UnrealCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...unrealData} />
);
