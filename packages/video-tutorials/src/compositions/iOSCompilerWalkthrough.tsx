import React from 'react';
import { CompilerWalkthroughTemplate } from '../components/CompilerWalkthroughTemplate';
import { iosData } from '../data/compilers/ios';

export const iOSCompilerWalkthrough: React.FC = () => <CompilerWalkthroughTemplate {...iosData} />;
