'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TemplateGrid } from '@/components/templates/TemplateGrid';
import { useSceneStore } from '@/lib/stores';
import type { TemplateInfo } from '@/types';

const TEMPLATES: TemplateInfo[] = [
  {
    id: 'forest-scene',
    name: 'Enchanted Forest',
    description: 'A magical forest with glowing mushrooms, crystal, and a pond',
    category: 'nature',
    filename: 'forest-scene.holo',
  },
  {
    id: 'space-station',
    name: 'Space Station',
    description: 'An orbital station with solar panels, docking port, and antenna',
    category: 'scifi',
    filename: 'space-station.holo',
  },
  {
    id: 'art-gallery',
    name: 'Art Gallery',
    description: 'A marble gallery with sculptures on pedestals and spotlights',
    category: 'art',
    filename: 'art-gallery.holo',
  },
  {
    id: 'zen-garden',
    name: 'Zen Garden',
    description: 'A peaceful Japanese garden with rocks, bamboo, and a water basin',
    category: 'zen',
    filename: 'zen-garden.holo',
  },
  {
    id: 'neon-city',
    name: 'Neon City',
    description: 'A cyberpunk street with neon signs, holograms, and rain puddles',
    category: 'urban',
    filename: 'neon-city.holo',
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const setCode = useSceneStore((s) => s.setCode);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  async function handleSelect(template: TemplateInfo) {
    try {
      const res = await fetch(`/templates/${template.filename}`);
      const code = await res.text();
      setCode(code);
      setMetadata({ name: template.name });
      router.push('/create');
    } catch (err) {
      console.error('Failed to load template:', err);
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/" className="text-studio-muted transition hover:text-studio-text">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Templates</h1>
            <p className="text-sm text-studio-muted">
              Start from a pre-built scene and customize it with AI
            </p>
          </div>
        </div>

        <TemplateGrid templates={TEMPLATES} onSelect={handleSelect} />
      </div>
    </div>
  );
}
