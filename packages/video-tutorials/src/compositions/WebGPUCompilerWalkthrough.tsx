import React from "react";
import { CompilerWalkthroughTemplate } from "../components/CompilerWalkthroughTemplate";
import { webgpuData } from "../data/compilers/webgpu";

export const WebGPUCompilerWalkthrough: React.FC = () => (
  <CompilerWalkthroughTemplate {...webgpuData} />
);
