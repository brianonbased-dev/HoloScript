import React from "react";
import { CompilerWalkthroughTemplate } from "../components/CompilerWalkthroughTemplate";
import { androidData } from "../data/compilers/android";

export const AndroidCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...androidData} />
);
