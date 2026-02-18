import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TitleCard } from "../components/TitleCard";
import { CodeStep } from "../components/CodeStep";

const STEPS = [
  {
    title: "Defining a Template",
    description: "Templates are reusable object blueprints — define once, instantiate anywhere.",
    lines: [
      { content: "template TreeTemplate {", highlight: true, annotation: "reusable blueprint" },
      { content: "  param height: number = 4", type: "added" as const, annotation: "with defaults" },
      { content: "  param color: color = #2d5a1b", type: "added" as const },
      { content: "" },
      { content: "  object Trunk {" },
      { content: "    mesh: Cylinder { radius: 0.2, height: param.height }" },
      { content: "    material: StandardMaterial { color: #5c3d1e }" },
      { content: "  }" },
      { content: "  object Leaves {" },
      { content: "    mesh: Sphere { radius: param.height * 0.4 }" },
      { content: "    material: StandardMaterial { color: param.color }" },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Instantiating Templates",
    description: "Use the template keyword to place instances — override any param.",
    lines: [
      { content: "scene Forest {" },
      { content: "  use TreeTemplate as OakTree {", highlight: true, annotation: "instance" },
      { content: "    height: 6, color: #3a7d24", type: "added" as const },
      { content: "    position: [0, 3, -5]", type: "added" as const },
      { content: "  }" },
      { content: "  use TreeTemplate as PineTree {", highlight: true },
      { content: "    height: 10, color: #1a5c2a", type: "added" as const },
      { content: "    position: [4, 5, -8]", type: "added" as const },
      { content: "  }" },
      { content: "  use TreeTemplate as Sapling {", highlight: true },
      { content: "    height: 1.5  // uses default color", type: "added" as const },
      { content: "    position: [-3, 0.75, -3]", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Scatter — Mass Instantiation",
    description: "The scatter keyword places hundreds of template instances procedurally.",
    lines: [
      { content: "scene ForestFloor {" },
      { content: "  scatter TreeTemplate {", highlight: true, annotation: "procedural placement" },
      { content: "    count: 200", type: "added" as const },
      { content: "    area: Circle { center: [0,0,0], radius: 50 }", type: "added" as const },
      { content: "    randomize: {", type: "added" as const },
      { content: "      height: [2, 8],", type: "added" as const, annotation: "random range" },
      { content: "      rotation.y: [0, 360],", type: "added" as const },
      { content: "      scale: [0.8, 1.3]", type: "added" as const },
      { content: "    }", type: "added" as const },
      { content: "    avoidOverlap: true", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Scene Imports",
    description: "Import entire scenes as objects — compose large worlds from reusable sub-scenes.",
    lines: [
      { content: "import { TavernInterior } from \"./tavern.holo\"", highlight: true },
      { content: "import { VillageSquare } from \"./village.holo\"", highlight: true },
      { content: "" },
      { content: "scene FullVillage {" },
      { content: "  use TavernInterior {", type: "added" as const, annotation: "embedded scene" },
      { content: "    position: [10, 0, 0]" },
      { content: "    scale: 1.2" },
      { content: "  }" },
      { content: "  use VillageSquare {", type: "added" as const },
      { content: "    position: [0, 0, 0]" },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Template Libraries",
    description: "Publish templates as npm packages — import the @holoscript/templates-fantasy library.",
    lines: [
      { content: "// Install", annotation: "one-time setup" },
      { content: "$ npm install @holoscript/templates-fantasy", highlight: true },
      { content: "" },
      { content: "import {", highlight: true },
      { content: "  CastleWall, DrawbridgeGate,", type: "added" as const },
      { content: "  TorchSconce, BattlementParapet", type: "added" as const },
      { content: "} from \"@holoscript/templates-fantasy\"" },
      { content: "" },
      { content: "scene MedievalCastle {" },
      { content: "  scatter CastleWall { count: 4, around: Perimeter }" },
      { content: "  use DrawbridgeGate { position: [0, 0, -20] }" },
      { content: "}" },
    ],
  },
];

export const TemplatesAndReuse: React.FC = () => {
  const { fps } = useVideoConfig();
  const TITLE_FRAMES = fps * 3;
  const STEP_FRAMES = fps * 5;
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          title="Templates & Reuse"
          subtitle="Reusable blueprints, scatter placement, scene imports, and template libraries"
          tag="Beginner"
        />
      </Sequence>
      {STEPS.map((step, i) => (
        <Sequence key={i} from={TITLE_FRAMES + i * STEP_FRAMES} durationInFrames={STEP_FRAMES}>
          <CodeStep
            title={step.title}
            description={step.description}
            language="holo"
            lines={step.lines}
            stepNumber={i + 1}
            totalSteps={STEPS.length}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
