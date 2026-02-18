import React from "react";
import { CompilerWalkthroughTemplate } from "../components/CompilerWalkthroughTemplate";
import { urdfData } from "../data/compilers/urdf";

export const URDFCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...urdfData} />
);
