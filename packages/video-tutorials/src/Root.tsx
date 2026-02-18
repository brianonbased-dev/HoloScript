import React from "react";
import { Composition } from "remotion";

// ── Beginner Series ─────────────────────────────────────────────────────────
import { SyntaxIntroduction } from "./compositions/SyntaxIntroduction";
import { TraitsDeepDive } from "./compositions/TraitsDeepDive";
import { StateAndLogic } from "./compositions/StateAndLogic";
import { TimelinesAndAnimation } from "./compositions/TimelinesAndAnimation";
import { NPCsAndDialogue } from "./compositions/NPCsAndDialogue";
import { TemplatesAndReuse } from "./compositions/TemplatesAndReuse";

// ── Compiler Series ──────────────────────────────────────────────────────────
import { UnityCompilerWalkthrough } from "./compositions/UnityCompilerWalkthrough";
import { GodotCompilerWalkthrough } from "./compositions/GodotCompilerWalkthrough";
import { BabylonCompilerWalkthrough } from "./compositions/BabylonCompilerWalkthrough";
import { VisionOSCompilerWalkthrough } from "./compositions/VisionOSCompilerWalkthrough";
import { URDFCompilerWalkthrough } from "./compositions/URDFCompilerWalkthrough";
import { VRChatCompilerWalkthrough } from "./compositions/VRChatCompilerWalkthrough";
import { WebGPUCompilerWalkthrough } from "./compositions/WebGPUCompilerWalkthrough";
import { R3FCompilerWalkthrough } from "./compositions/R3FCompilerWalkthrough";
import { iOSCompilerWalkthrough } from "./compositions/iOSCompilerWalkthrough";
import { AndroidCompilerWalkthrough } from "./compositions/AndroidCompilerWalkthrough";
import { OpenXRCompilerWalkthrough } from "./compositions/OpenXRCompilerWalkthrough";
import { DTDLCompilerWalkthrough } from "./compositions/DTDLCompilerWalkthrough";
import { UnrealCompilerWalkthrough } from "./compositions/UnrealCompilerWalkthrough";
import { WASMCompilerWalkthrough } from "./compositions/WASMCompilerWalkthrough";
import { USDCompilerWalkthrough } from "./compositions/USDCompilerWalkthrough";

// ── Advanced Series ──────────────────────────────────────────────────────────
import { PythonBindings } from "./compositions/PythonBindings";
import { MCPServerIntegration } from "./compositions/MCPServerIntegration";
import { LLMProviderSDK } from "./compositions/LLMProviderSDK";
import { SecuritySandbox } from "./compositions/SecuritySandbox";
import { CICDIntegration } from "./compositions/CICDIntegration";
import { CustomTraitCreation } from "./compositions/CustomTraitCreation";

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO REGISTRY
//
// Duration formulas (at 30 fps):
//   Beginner/Advanced (N steps × 5s + 3s title):
//     5 steps → 3 + 5×5 = 28s = 840 frames
//     6 steps → 3 + 6×5 = 33s = 990 frames
//
//   Compiler walkthrough (N total steps × 6s + 3s title + 5s summary):
//     4 steps → 3 + 4×6 + 5 = 32s = 960 frames
//     6 steps → 3 + 6×6 + 5 = 44s = 1320 frames
// ─────────────────────────────────────────────────────────────────────────────

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ── Series 1: Beginner ───────────────────────────────────────────── */}
      <Composition
        id="SyntaxIntroduction"
        component={SyntaxIntroduction}
        durationInFrames={30 * 33}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="TraitsDeepDive"
        component={TraitsDeepDive}
        durationInFrames={30 * 33} // 3s title + 6 steps × 5s
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="StateAndLogic"
        component={StateAndLogic}
        durationInFrames={30 * 28} // 3s title + 5 steps × 5s
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="TimelinesAndAnimation"
        component={TimelinesAndAnimation}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="NPCsAndDialogue"
        component={NPCsAndDialogue}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="TemplatesAndReuse"
        component={TemplatesAndReuse}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />

      {/* ── Series 2: Compiler Demos ─────────────────────────────────────── */}
      <Composition
        id="UnityCompilerWalkthrough"
        component={UnityCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="GodotCompilerWalkthrough"
        component={GodotCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="BabylonCompilerWalkthrough"
        component={BabylonCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="VisionOSCompilerWalkthrough"
        component={VisionOSCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="URDFCompilerWalkthrough"
        component={URDFCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="VRChatCompilerWalkthrough"
        component={VRChatCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="WebGPUCompilerWalkthrough"
        component={WebGPUCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="R3FCompilerWalkthrough"
        component={R3FCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="iOSCompilerWalkthrough"
        component={iOSCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="AndroidCompilerWalkthrough"
        component={AndroidCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="OpenXRCompilerWalkthrough"
        component={OpenXRCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="DTDLCompilerWalkthrough"
        component={DTDLCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="UnrealCompilerWalkthrough"
        component={UnrealCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="WASMCompilerWalkthrough"
        component={WASMCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="USDCompilerWalkthrough"
        component={USDCompilerWalkthrough}
        durationInFrames={30 * 32}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />

      {/* ── Series 4: Advanced ───────────────────────────────────────────── */}
      <Composition
        id="PythonBindings"
        component={PythonBindings}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="MCPServerIntegration"
        component={MCPServerIntegration}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="LLMProviderSDK"
        component={LLMProviderSDK}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="SecuritySandbox"
        component={SecuritySandbox}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="CICDIntegration"
        component={CICDIntegration}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="CustomTraitCreation"
        component={CustomTraitCreation}
        durationInFrames={30 * 28}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
