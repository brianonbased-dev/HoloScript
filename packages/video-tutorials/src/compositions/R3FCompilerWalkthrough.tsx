import React from "react";
import { CompilerWalkthroughTemplate } from "../components/CompilerWalkthroughTemplate";
import { r3fData } from "../data/compilers/r3f";

export const R3FCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...r3fData} />
);
