import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { CodeStep } from '../components/CodeStep';

const STEPS = [
  {
    title: 'Defining an NPC',
    description:
      'NPCs are objects with the NPC trait — they get a name, avatar mesh, and navigation by default.',
    lines: [
      { content: '  object WizardNPC {', highlight: true },
      { content: '    mesh: Humanoid { preset: Wizard }', type: 'added' as const },
      { content: '    position: [3, 0, -2]', type: 'added' as const },
      { content: '    traits: [', type: 'added' as const },
      {
        content: '      NPC { name: "Merlin", role: quest_giver },',
        type: 'added' as const,
        annotation: 'core NPC trait',
      },
      { content: '      Idle { animation: breathe, loop: true },', type: 'added' as const },
      {
        content: '      NavMeshAgent { speed: 2.0 }',
        type: 'added' as const,
        annotation: 'pathfinding',
      },
      { content: '    ]' },
      { content: '  }' },
    ],
  },
  {
    title: 'Dialogue Trees',
    description:
      'Define dialogue inline with the dialogue block — branches, conditions, and actions.',
    lines: [
      { content: '  object WizardNPC {' },
      { content: '    dialogue Greeting {', highlight: true, annotation: 'dialogue block' },
      { content: '      say: "Welcome, adventurer!"', type: 'added' as const },
      { content: '      options: [', type: 'added' as const },
      { content: '        "Tell me about quests" -> QuestInfo,', type: 'added' as const },
      { content: '        "What is this place?" -> LoreInfo,', type: 'added' as const },
      { content: '        "Goodbye" -> End', type: 'added' as const },
      { content: '      ]', type: 'added' as const },
      { content: '    }' },
      { content: '  }' },
    ],
  },
  {
    title: 'Conditional Dialogue',
    description: 'Branches can check state — different dialogue when the player has the key item.',
    lines: [
      { content: '    dialogue QuestInfo {' },
      { content: '      if (state.hasKey) {', highlight: true, annotation: 'condition' },
      { content: '        say: "You found the key! Now open the vault."', type: 'added' as const },
      { content: '        action: { state.questStage = 2 }', type: 'added' as const },
      { content: '      } else {', highlight: true },
      {
        content: '        say: "Find the golden key hidden in the forest."',
        type: 'added' as const,
      },
      { content: '        action: { state.questStage = 1 }', type: 'added' as const },
      { content: '      }' },
      { content: '    }' },
    ],
  },
  {
    title: 'NPC Patrol and Wander',
    description: 'Set patrol waypoints or wander radius — NPCs move naturally through the scene.',
    lines: [
      { content: '  object GuardNPC {' },
      { content: '    traits: [' },
      { content: '      NPC { name: "Guard" },' },
      { content: '      Patrol {', highlight: true, annotation: 'waypoint patrol' },
      { content: '        waypoints: [', type: 'added' as const },
      { content: '          [0, 0, 0], [5, 0, 0],', type: 'added' as const },
      { content: '          [5, 0, 5], [0, 0, 5]', type: 'added' as const },
      { content: '        ],', type: 'added' as const },
      { content: '        speed: 1.5, pauseAt: 1s', type: 'added' as const },
      { content: '      }' },
      { content: '    ]' },
      { content: '  }' },
    ],
  },
  {
    title: 'Triggering Dialogue',
    description: 'Start dialogue on approach, click, or custom event.',
    lines: [
      { content: '  object WizardNPC {' },
      { content: '    traits: [' },
      { content: '      NPC { name: "Merlin" },' },
      { content: '      ProximityTrigger {', highlight: true, annotation: 'approach trigger' },
      { content: '        radius: 3.0,' },
      { content: '        onEnter: startDialogue("Greeting")', type: 'added' as const },
      { content: '      },' },
      { content: '      Interactable {', highlight: true, annotation: 'click trigger' },
      { content: '        onClick: startDialogue("Greeting")', type: 'added' as const },
      { content: '      }' },
      { content: '    ]' },
      { content: '  }' },
    ],
  },
];

export const NPCsAndDialogue: React.FC = () => {
  const { fps } = useVideoConfig();
  const TITLE_FRAMES = fps * 3;
  const STEP_FRAMES = fps * 5;
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          title="NPCs & Dialogue"
          subtitle="Create AI characters with patrol, dialogue trees, and conditional branching"
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
