'use client';

import React from 'react';
import { Github, Smartphone, Glasses, Bot, Monitor, Sparkles } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuggestionCard {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'Import' | 'Build' | 'Create' | 'Explore';
  prompt: string;
}

interface SuggestionCardsProps {
  onSelect: (prompt: string) => void;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CARDS: readonly SuggestionCard[] = [
  {
    id: 'github-repo',
    label: 'I have a GitHub repo',
    icon: Github,
    category: 'Import',
    prompt:
      'I have a GitHub repo I want to turn into a spatial experience. Can you help me import it?',
  },
  {
    id: 'mobile-app',
    label: 'Build me a mobile app',
    icon: Smartphone,
    category: 'Build',
    prompt:
      'I want to build a mobile app. Help me describe what it does and generate the right compositions.',
  },
  {
    id: 'vr-experience',
    label: 'Create a VR experience',
    icon: Glasses,
    category: 'Create',
    prompt:
      'I want to create an immersive VR experience. Let me describe the scene and interactions.',
  },
  {
    id: 'ai-agent',
    label: 'I need an AI agent',
    icon: Bot,
    category: 'Create',
    prompt:
      'I need an AI agent that can reason, act, and connect to tools. Help me design its behavior tree.',
  },
  {
    id: 'web-dashboard',
    label: 'Build a web dashboard',
    icon: Monitor,
    category: 'Build',
    prompt:
      'I want to build a web dashboard with real-time data visualization. What data should we start with?',
  },
  {
    id: 'something-else',
    label: 'Something else...',
    icon: Sparkles,
    category: 'Explore',
    prompt: '',
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl mx-auto">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            onClick={() => onSelect(card.prompt)}
            className="group flex flex-col items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-left transition-all duration-200 hover:border-studio-accent/30 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-studio-accent/5 focus:outline-none focus:ring-1 focus:ring-studio-accent/40"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 transition-colors group-hover:bg-studio-accent/10 group-hover:text-studio-accent"
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                {card.label}
              </span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-white/20">
                {card.category}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
