import React from "react";
import { CompilerWalkthroughTemplate } from "../components/CompilerWalkthroughTemplate";
import { usdData } from "../data/compilers/usd";

export const USDCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...usdData} />
);
