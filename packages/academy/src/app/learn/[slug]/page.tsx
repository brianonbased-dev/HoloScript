'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { TutorialEngineWrapper, TutorialStep } from '@/components/tutorial/TutorialEngineWrapper';

// Mock Data: In a real app, this would be fetched based on the slug
const DEMO_TUTORIAL: TutorialStep[] = [
  {
    title: 'Welcome to HoloScript',
    markdown: '<p>HoloScript is the premier language for defining declarative spatial computing interfaces, agents, and worlds.</p><p>Instead of manipulating complex raw 3D engine APIs, you use high-level "Traits" bound to a semantic scene graph.</p><p><strong>Goal:</strong> Let\'s start by instantiating an empty World.</p>',
    initialCode: 'import { World } from "@holoscript/core";\n\n// TODO: Create a new World instance\n',
    solutionCode: 'import { World } from "@holoscript/core";\n\nconst world = new World();',
    validationRule: (code) => code.includes('new World()')
  },
  {
    title: 'Spawning an Entity',
    markdown: '<p>Every object in HoloScript is an <code>Entity</code>. Entities are empty containers until you attach <code>Traits</code> to them.</p><p><strong>Goal:</strong> Create a new Entity named "Player".</p>',
    initialCode: 'import { World, Entity } from "@holoscript/core";\n\nconst world = new World();\n// TODO: Spawn an entity named "Player"\n',
    solutionCode: 'import { World, Entity } from "@holoscript/core";\n\nconst world = new World();\nconst player = new Entity("Player");\nworld.add(player);',
    validationRule: (code) => code.includes('new Entity') && code.includes('Player')
  },
  {
    title: 'Adding a Visual Trait',
    markdown: '<p>Let\'s give our Player a physical form. We\'ll use the <code>Box</code> trait to render a simple cube.</p><p><strong>Goal:</strong> Attach a <code>Box</code> trait to your Player entity.</p>',
    initialCode: 'import { World, Entity } from "@holoscript/core";\nimport { Box } from "@holoscript/traits";\n\nconst world = new World();\nconst player = new Entity("Player");\nworld.add(player);\n\n// TODO: Add a Box trait to player\n',
    solutionCode: 'import { World, Entity } from "@holoscript/core";\nimport { Box } from "@holoscript/traits";\n\nconst world = new World();\nconst player = new Entity("Player");\nworld.add(player);\n\nplayer.addTrait(new Box({ size: [1, 1, 1], color: "blue" }));',
    validationRule: (code) => code.includes('addTrait') && code.includes('Box')
  }
];

export default function TutorialPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  
  // Real app: const tutorial = await fetchTutorial(params.slug);
  const tutorialSteps = DEMO_TUTORIAL;

  return (
    <TutorialEngineWrapper
      title={`Course: ${params.slug.replace('-', ' ')}`}
      moduleName="HoloScript Fundamentals"
      steps={tutorialSteps}
      onComplete={() => alert('Tutorial Completed! 🎉 You earned 50XP.')}
      onExit={() => router.push('/learn')}
    />
  );
}
