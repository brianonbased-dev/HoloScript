import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TitleCard } from "../components/TitleCard";
import { CodeStep } from "../components/CodeStep";

const STEPS = [
  {
    title: "Keyframe Animations",
    description: "Define animations inline with from/to keyframes — no separate animation files needed.",
    lines: [
      { content: "  object Door {" },
      { content: "    mesh: Box { size: [1, 2, 0.1] }" },
      { content: "" },
      { content: "    animation OpenDoor {", highlight: true, annotation: "named animation" },
      { content: "      duration: 0.6s", type: "added" as const },
      { content: "      easing: easeInOut", type: "added" as const },
      { content: "      keyframes: {", type: "added" as const },
      { content: "        0%: { rotation: [0, 0, 0] }", type: "added" as const },
      { content: "        100%: { rotation: [0, 90, 0] }", type: "added" as const },
      { content: "      }", type: "added" as const },
      { content: "    }" },
      { content: "  }" },
    ],
  },
  {
    title: "Timelines",
    description: "Sequence multiple animations with timeline blocks — control order, delay, and overlap.",
    lines: [
      { content: "scene Intro {" },
      { content: "  timeline Entrance {", highlight: true, annotation: "sequence block" },
      { content: "    at (0s) { Logo.fadeIn(0.5s) }", type: "added" as const },
      { content: "    at (0.3s) { Tagline.slideUp(0.4s) }", type: "added" as const },
      { content: "    at (0.7s) { CTA.appear(0.3s) }", type: "added" as const },
      { content: "    at (2s) { all.pulse(1s, loop: true) }", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Easing Functions",
    description: "14 built-in easing functions — linear, ease, spring, bounce, elastic, and more.",
    lines: [
      { content: "// Smooth deceleration", annotation: "most natural" },
      { content: "animation Slide { easing: easeOut, duration: 0.4s }", highlight: true },
      { content: "" },
      { content: "// Snappy, physical feel", annotation: "game UIs" },
      { content: "animation Pop { easing: spring(stiffness: 400), duration: 0.3s }", highlight: true },
      { content: "" },
      { content: "// Energetic entry", annotation: "notifications" },
      { content: "animation Bounce { easing: bounceOut, duration: 0.6s }", highlight: true },
    ],
  },
  {
    title: "Procedural Animations with Traits",
    description: "For repeating, code-driven animations — use animation traits instead of keyframes.",
    lines: [
      { content: "  object WindmillBlade {" },
      { content: "    traits: [", highlight: true },
      { content: "      Rotate {", type: "added" as const, annotation: "continuous spin" },
      { content: "        axis: [0, 0, 1]," },
      { content: "        speed: 120,   // degrees/sec" },
      { content: "        easing: linear" },
      { content: "      }," },
      { content: "      Float { amplitude: 0.05, frequency: 2 }", type: "added" as const },
      { content: "    ]" },
      { content: "  }" },
    ],
  },
  {
    title: "Trigger Animations from Events",
    description: "Play named animations in response to user events or state changes.",
    lines: [
      { content: "  object Chest {" },
      { content: "    animation Open { ... }", dim: true },
      { content: "    animation Shake { ... }", dim: true },
      { content: "" },
      { content: "    on click {", highlight: true },
      { content: "      if (state.hasKey) {", type: "added" as const },
      { content: "        this.play(\"Open\")", type: "added" as const, annotation: "named animation" },
      { content: "        state.treasureFound = true", type: "added" as const },
      { content: "      } else {", type: "added" as const },
      { content: "        this.play(\"Shake\")", type: "added" as const, annotation: "locked!" },
      { content: "      }", type: "added" as const },
      { content: "    }" },
      { content: "  }" },
    ],
  },
];

export const TimelinesAndAnimation: React.FC = () => {
  const { fps } = useVideoConfig();
  const TITLE_FRAMES = fps * 3;
  const STEP_FRAMES = fps * 5;
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          title="Timelines & Animation"
          subtitle="Keyframes, timelines, easing, and event-driven animations in HoloScript"
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
