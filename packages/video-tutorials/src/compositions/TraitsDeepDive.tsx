import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TitleCard } from '../components/TitleCard';
import { CodeStep } from '../components/CodeStep';

const STEPS = [
  {
    title: 'What Are Traits?',
    description:
      'Traits are named behaviors — attach them to any object to add physics, interaction, AI, or animation.',
    lines: [
      { content: '  object Crate {' },
      { content: '    mesh: Box { size: 1 }' },
      { content: '    material: StandardMaterial { color: #8B4513 }' },
      { content: '    traits: [', highlight: true, annotation: 'behavior list' },
      { content: '      PhysicsBody,', type: 'added' as const, annotation: 'gravity + mass' },
      { content: '      Interactable,', type: 'added' as const, annotation: 'clickable/grabbable' },
      {
        content: '      Breakable { hp: 3 }',
        type: 'added' as const,
        annotation: 'can be destroyed',
      },
      { content: '    ]' },
      { content: '  }' },
    ],
  },
  {
    title: 'Physics Traits',
    description:
      'PhysicsBody, Kinematic, StaticCollider — three modes for different physics use cases.',
    lines: [
      { content: '// Falling, colliding object', annotation: 'dynamic physics' },
      { content: 'traits: [PhysicsBody { mass: 2.5, friction: 0.6 }]', highlight: true },
      { content: '' },
      { content: '// Moves by code, not gravity', annotation: 'code-driven' },
      { content: 'traits: [Kinematic]', highlight: true },
      { content: '' },
      { content: '// Never moves, always collides', annotation: 'environment' },
      { content: 'traits: [StaticCollider]', highlight: true },
    ],
  },
  {
    title: 'Interaction Traits',
    description:
      'Make objects respond to the user — hover highlights, grab-and-throw, proximity triggers.',
    lines: [
      { content: '  object MagicOrb {' },
      { content: '    mesh: Sphere { radius: 0.3 }' },
      { content: '    material: EmissiveMaterial { color: #00BFFF, intensity: 2.0 }' },
      { content: '    traits: [', highlight: true },
      { content: '      Hoverable { highlight: #00FFFF },', type: 'added' as const },
      {
        content: '      Grabbable { throwable: true },',
        type: 'added' as const,
        annotation: 'VR grab support',
      },
      {
        content: '      ProximityTrigger { radius: 2.0, onEnter: "glow" }',
        type: 'added' as const,
      },
      { content: '    ]' },
      { content: '  }' },
    ],
  },
  {
    title: 'Animation Traits',
    description: 'Rotate, float, pulse — attach animations without writing keyframe code.',
    lines: [
      { content: '  object SpinningCoin {' },
      { content: '    mesh: Cylinder { radius: 0.4, height: 0.05 }' },
      { content: '    material: StandardMaterial { color: #FFD700 }' },
      { content: '    traits: [', highlight: true },
      {
        content: '      Rotate { axis: [0,1,0], speed: 180 },',
        type: 'added' as const,
        annotation: 'deg/sec',
      },
      { content: '      Float { amplitude: 0.2, frequency: 1.5 },', type: 'added' as const },
      { content: '      Pulse { property: "scale", min: 0.9, max: 1.1 }', type: 'added' as const },
      { content: '    ]' },
      { content: '  }' },
    ],
  },
  {
    title: 'Trait Parameters',
    description: 'Most traits accept optional parameters to fine-tune behavior.',
    lines: [
      { content: '// Minimal — all defaults', annotation: 'zero config' },
      { content: 'traits: [PhysicsBody]' },
      { content: '' },
      { content: '// With parameters', annotation: 'customized' },
      { content: 'traits: [', highlight: true },
      { content: '  PhysicsBody {', type: 'added' as const },
      { content: '    mass: 5.0,', type: 'added' as const, annotation: 'kg' },
      { content: '    restitution: 0.8,', type: 'added' as const, annotation: 'bounciness 0-1' },
      { content: '    linearDamping: 0.2', type: 'added' as const, annotation: 'air resistance' },
      { content: '  }', type: 'added' as const },
      { content: ']' },
    ],
  },
  {
    title: '1,525+ Traits in the Library',
    description: 'Search the full trait library with npx holoscript traits --search <keyword>.',
    lines: [
      { content: '$ npx holoscript traits --search audio', highlight: true },
      { content: '  AudioSource      — Spatial 3D audio emitter', annotation: 'found 12 traits' },
      { content: '  AudioListener     — Receives spatial audio' },
      { content: "  Reverb { room: 'cave' } — Acoustic simulation" },
      { content: '  BackgroundMusic   — Looping ambient track' },
      { content: '' },
      { content: '$ npx holoscript traits --count', highlight: true },
      { content: '  1,525 traits across 48 categories' },
    ],
  },
];

export const TraitsDeepDive: React.FC = () => {
  const { fps } = useVideoConfig();
  const TITLE_FRAMES = fps * 3;
  const STEP_FRAMES = fps * 5;
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          title="HoloScript Traits"
          subtitle="1,525+ built-in behaviors — physics, interaction, animation, AI, and more"
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
