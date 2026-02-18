import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TitleCard } from "../components/TitleCard";
import { CodeStep } from "../components/CodeStep";

// Step definitions — edit these to update the video content
const STEPS = [
  {
    title: "Define a Scene",
    description: "Every HoloScript file starts with a named scene declaration.",
    lines: [
      { content: "scene VirtualGarden {", highlight: true, annotation: "scene keyword + name" },
      { content: "  // objects, lights, camera go here" },
      { content: "}", highlight: true },
    ],
  },
  {
    title: "Add an Object",
    description: "Objects are the building blocks. Give them a mesh and a material.",
    lines: [
      { content: "scene VirtualGarden {" },
      { content: "  object FlowerBed {", highlight: true, annotation: "object declaration" },
      { content: "    mesh: Plane { scale: [4, 1, 4] }", type: "added" as const, annotation: "geometry" },
      { content: "    material: StandardMaterial { color: #7CFC00 }", type: "added" as const, annotation: "surface" },
      { content: "    position: [0, 0, 0]", type: "added" as const, annotation: "world coords" },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Add More Objects",
    description: "Compose your scene by nesting objects — parent transforms inherit to children.",
    lines: [
      { content: "scene VirtualGarden {" },
      { content: "  object FlowerBed {" },
      { content: "    mesh: Plane { scale: [4, 1, 4] }", dim: true },
      { content: "    material: StandardMaterial { color: #7CFC00 }", dim: true },
      { content: "    position: [0, 0, 0]", dim: true },
      { content: "  }" },
      { content: "  object RedRose {", highlight: true, annotation: "new object" },
      { content: "    mesh: Cylinder { radius: 0.05, height: 1.2 }", type: "added" as const },
      { content: "    material: StandardMaterial { color: #DC143C }", type: "added" as const },
      { content: "    position: [0, 0.6, 0]", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Add Lighting",
    description: "Scenes need light. HoloScript supports 6 light types — directional is the most common.",
    lines: [
      { content: "scene VirtualGarden {" },
      { content: "  object FlowerBed { ... }", dim: true },
      { content: "  object RedRose { ... }", dim: true },
      { content: "  light: DirectionalLight {", highlight: true, annotation: "lighting" },
      { content: "    intensity: 1.0", type: "added" as const },
      { content: "    direction: [0, -1, 0.3]", type: "added" as const, annotation: "angled down" },
      { content: "    castShadows: true", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Add a Camera",
    description: "Cameras define the viewer's perspective. Position and point it at your scene.",
    lines: [
      { content: "scene VirtualGarden {" },
      { content: "  object FlowerBed { ... }", dim: true },
      { content: "  object RedRose { ... }", dim: true },
      { content: "  light: DirectionalLight { ... }", dim: true },
      { content: "  camera: PerspectiveCamera {", highlight: true, annotation: "perspective view" },
      { content: "    fov: 60", type: "added" as const },
      { content: "    position: [0, 3, 8]", type: "added" as const, annotation: "above and behind" },
      { content: "    lookAt: [0, 0, 0]", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Apply Traits",
    description: "Traits add behavior without writing logic. Over 1,525 traits available.",
    lines: [
      { content: "  object RedRose {" },
      { content: "    mesh: Cylinder { radius: 0.05, height: 1.2 }", dim: true },
      { content: "    material: StandardMaterial { color: #DC143C }", dim: true },
      { content: "    position: [0, 0.6, 0]", dim: true },
      { content: "    traits: [", highlight: true, annotation: "behavior traits" },
      { content: "      Interactable,", type: "added" as const, annotation: "user can click/grab" },
      { content: "      Hoverable,", type: "added" as const, annotation: "highlight on hover" },
      { content: "      PhysicsBody { mass: 0.2 }", type: "added" as const, annotation: "gravity + collisions" },
      { content: "    ]" },
      { content: "  }" },
    ],
  },
];

export const SyntaxIntroduction: React.FC = () => {
  const { fps } = useVideoConfig();

  const TITLE_FRAMES = fps * 3;        // 3 seconds
  const STEP_FRAMES = fps * 5;         // 5 seconds per step

  return (
    <AbsoluteFill>
      {/* Title card */}
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          title="HoloScript Syntax"
          subtitle="Build 3D scenes with a clean, readable language that compiles to 18 platforms"
          tag="Beginner"
        />
      </Sequence>

      {/* Code walkthrough steps */}
      {STEPS.map((step, i) => (
        <Sequence
          key={i}
          from={TITLE_FRAMES + i * STEP_FRAMES}
          durationInFrames={STEP_FRAMES}
        >
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
