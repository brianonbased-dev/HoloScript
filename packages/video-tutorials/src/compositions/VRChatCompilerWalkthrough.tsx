import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { vrchatData } from '../data/compilers/vrchat';

export const VRChatCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...vrchatData} />
);
