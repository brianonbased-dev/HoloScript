import {
  Gamepad2,
  Film,
  Palette,
  Globe,
  Radio,
  GraduationCap,
  Wrench,
  FlaskConical,
  Heart,
  Building2,
  Leaf,
  Crown,
  Layers,
} from 'lucide-react';
import type { ExperienceLevel } from '@/lib/presets/studioPresets';

export interface CategoryCard {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export const CATEGORIES: CategoryCard[] = [
  {
    id: 'game',
    label: 'Game / Interactive',
    description: 'VR games, platformers, social worlds',
    icon: <Gamepad2 className="h-6 w-6" />,
  },
  {
    id: 'film',
    label: 'Film / Animation',
    description: 'Short films, music videos, cutscenes',
    icon: <Film className="h-6 w-6" />,
  },
  {
    id: 'art',
    label: '3D Art / Design',
    description: 'Characters, materials, visualizers',
    icon: <Palette className="h-6 w-6" />,
  },
  {
    id: 'web',
    label: 'Web Experience',
    description: 'Portfolios, stories, configurators',
    icon: <Globe className="h-6 w-6" />,
  },
  {
    id: 'iot',
    label: 'IoT / Data Viz',
    description: 'Sensors, digital twins, dashboards',
    icon: <Radio className="h-6 w-6" />,
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Tutorials, sandboxes, demos',
    icon: <GraduationCap className="h-6 w-6" />,
  },
  {
    id: 'robotics',
    label: 'Robotics / Industrial',
    description: 'URDF robots, ROS2, factory twins',
    icon: <Wrench className="h-6 w-6" />,
  },
  {
    id: 'science',
    label: 'Science / Medical',
    description: 'Molecular design, Narupa, anatomy',
    icon: <FlaskConical className="h-6 w-6" />,
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    description: 'Therapy VR, rehab, patient education',
    icon: <Heart className="h-6 w-6" />,
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'Walkthroughs, interiors, urban planning',
    icon: <Building2 className="h-6 w-6" />,
  },
  {
    id: 'agriculture',
    label: 'Agriculture',
    description: 'Farm twins, greenhouses, precision ag',
    icon: <Leaf className="h-6 w-6" />,
  },
  {
    id: 'creator',
    label: 'Creator Economy',
    description: 'NFT galleries, avatars, live stages',
    icon: <Crown className="h-6 w-6" />,
  },
  {
    id: 'hologram',
    label: 'Hologram / 3D Media',
    description: 'Photos, GIFs, and videos as 3D holograms',
    icon: <Layers className="h-6 w-6" />,
  },
];

export interface LevelCard {
  id: ExperienceLevel;
  label: string;
  emoji: string;
  description: string;
}

export const LEVELS: LevelCard[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    emoji: '🌱',
    description: "I'm new to 3D — show me the essentials",
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    emoji: '🔧',
    description: 'I know the basics — give me more tools',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    emoji: '🚀',
    description: "Show me everything — I'll customize from there",
  },
];
