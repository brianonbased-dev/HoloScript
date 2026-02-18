import React from "react";
import { CompilerWalkthroughTemplate } from "../components/CompilerWalkthroughTemplate";
import { visionosData } from "../data/compilers/visionos";

export const VisionOSCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...visionosData} />
);
