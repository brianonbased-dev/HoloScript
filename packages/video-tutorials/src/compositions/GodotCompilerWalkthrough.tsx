import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { godotData } from '../data/compilers/godot';

export const GodotCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...godotData} />
);
