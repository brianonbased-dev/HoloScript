import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TitleCard } from "../components/TitleCard";
import { CodeStep } from "../components/CodeStep";

const STEPS = [
  {
    title: "Adding State to a Scene",
    description: "The state block declares reactive variables — when they change, the scene updates.",
    lines: [
      { content: "scene DoorPuzzle {", highlight: true },
      { content: "  state {", type: "added" as const, annotation: "reactive data" },
      { content: "    doorOpen: boolean = false", type: "added" as const },
      { content: "    score: number = 0", type: "added" as const },
      { content: "    playerName: string = \"Hero\"", type: "added" as const },
      { content: "  }", type: "added" as const },
      { content: "" },
      { content: "  object Door { ... }" },
      { content: "}" },
    ],
  },
  {
    title: "Reacting to State Changes",
    description: "Use when() blocks to bind visual state to data — the door opens when doorOpen is true.",
    lines: [
      { content: "  object Door {" },
      { content: "    mesh: Box { size: [1, 2, 0.1] }" },
      { content: "    rotation: [0, 0, 0]" },
      { content: "" },
      { content: "    when (state.doorOpen) {", highlight: true, annotation: "reactive binding" },
      { content: "      rotation: [0, 90, 0]", type: "added" as const, annotation: "door swings open" },
      { content: "      animate: RotateTo { duration: 0.5, easing: easeOut }", type: "added" as const },
      { content: "    }" },
      { content: "  }" },
    ],
  },
  {
    title: "Event Handlers",
    description: "on() handlers fire when user events occur — clicks, collisions, proximity, timers.",
    lines: [
      { content: "  object KeyItem {" },
      { content: "    traits: [Interactable, Grabbable]" },
      { content: "" },
      { content: "    on click {", highlight: true, annotation: "user interaction" },
      { content: "      state.doorOpen = true", type: "added" as const },
      { content: "      state.score += 10", type: "added" as const },
      { content: "      this.visible = false  // hide the key", type: "added" as const },
      { content: "    }" },
      { content: "  }" },
    ],
  },
  {
    title: "Timers and Intervals",
    description: "Schedule logic with after() and every() — spawn enemies, run countdowns, pulse effects.",
    lines: [
      { content: "scene ArenaFight {" },
      { content: "  state { wave: number = 1, enemyCount: number = 0 }" },
      { content: "" },
      { content: "  after (3s) {", highlight: true, annotation: "one-time delay" },
      { content: "    spawnEnemy(state.wave * 2)", type: "added" as const },
      { content: "  }" },
      { content: "" },
      { content: "  every (30s) {", highlight: true, annotation: "repeating timer" },
      { content: "    state.wave += 1", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
  {
    title: "Computed Properties",
    description: "Derived values update automatically when their dependencies change.",
    lines: [
      { content: "scene Shop {" },
      { content: "  state {" },
      { content: "    cartItems: Item[] = []", annotation: "source data" },
      { content: "    taxRate: number = 0.1" },
      { content: "  }" },
      { content: "" },
      { content: "  computed {", highlight: true, annotation: "auto-derived" },
      { content: "    subtotal = state.cartItems.sum(i => i.price)", type: "added" as const },
      { content: "    total = computed.subtotal * (1 + state.taxRate)", type: "added" as const },
      { content: "  }" },
      { content: "}" },
    ],
  },
];

export const StateAndLogic: React.FC = () => {
  const { fps } = useVideoConfig();
  const TITLE_FRAMES = fps * 3;
  const STEP_FRAMES = fps * 5;
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          title="State & Logic"
          subtitle="Reactive state, event handlers, and computed properties in HoloScript"
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
