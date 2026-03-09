/**
 * HoloScript Interactive Language Tour
 *
 * Manages 10-lesson progression with localStorage persistence,
 * completion certificates, and mobile-friendly progress tracking.
 */

export interface Lesson {
  id: number;
  slug: string;
  title: string;
  markdownPath: string;
  starterCode: string;
  solutionCode: string;
  hints: string[];
}

export interface TourProgress {
  completedLessons: number[];
  currentLesson: number;
  startedAt: string;
  completedAt?: string;
}

export const LESSONS: Lesson[] = [
  {
    id: 1,
    slug: '01-hello-orb',
    title: 'Hello Orb',
    markdownPath: './lessons/01-hello-orb.md',
    starterCode: 'orb "HelloWorld" {\n  color: "red"\n}',
    solutionCode: 'orb "HelloWorld" {\n  color: "green"\n  scale: 2.0\n}',
    hints: ['Change the color property value', 'Try "green" as the color string'],
  },
  {
    id: 2,
    slug: '02-properties',
    title: 'Properties',
    markdownPath: './lessons/02-properties.md',
    starterCode: 'orb "Floating" {\n  color: "#ff6600"\n  scale: 0.5\n  position: [0, 2, -3]\n}',
    solutionCode: [
      'orb "Orb1" { color: "white"  position: [-2, 0, 0] }',
      'orb "Orb2" { color: "white"  position: [0, 0, 0] }',
      'orb "Orb3" { color: "white"  position: [2, 0, 0] }',
    ].join('\n'),
    hints: ['Create three separate orb blocks', 'Use position: [-2,0,0], [0,0,0], [2,0,0]'],
  },
  {
    id: 3,
    slug: '03-traits',
    title: 'Traits',
    markdownPath: './lessons/03-traits.md',
    starterCode:
      'orb "PhysicsBall" {\n  color: "red"\n  scale: 0.4\n  position: [0, 2, -2]\n  @physics { mass: 0.5 }\n}',
    solutionCode:
      'orb "PhysicsBall" {\n  color: "red"\n  scale: 0.4\n  position: [0, 2, -2]\n  @grabbable\n  @physics { mass: 0.5 }\n}',
    hints: ['Add @grabbable before @physics', '@grabbable has no block, just the keyword'],
  },
  {
    id: 4,
    slug: '04-templates',
    title: 'Templates',
    markdownPath: './lessons/04-templates.md',
    starterCode:
      'template "Furniture" {\n  // Add traits here\n}\n\norb "Chair" {\n  ...Furniture\n  color: "brown"\n}',
    solutionCode:
      'template "Furniture" {\n  @physics { mass: 5.0 }\n}\n\norb "Chair" {\n  ...Furniture\n  color: "brown"\n}',
    hints: ['Add @physics { mass: 5.0 } inside the template', 'Use ...Furniture in the orb'],
  },
  {
    id: 5,
    slug: '05-logic-blocks',
    title: 'Logic Blocks',
    markdownPath: './lessons/05-logic-blocks.md',
    starterCode:
      'orb "SpinBox" {\n  color: "cyan"\n  logic "spin" {\n    on_tick: (dt) => {\n      this.rotation.y += 90 * dt\n    }\n  }\n}',
    solutionCode:
      'orb "SpinBox" {\n  color: "cyan"\n  logic "spin" {\n    let isRed = false\n    on_tick: (dt) => { this.rotation.y += 90 * dt }\n    on_click: () => {\n      isRed = !isRed\n      this.color = isRed ? "red" : "cyan"\n    }\n  }\n}',
    hints: ['Add an on_click handler', 'Use a boolean variable to toggle color'],
  },
  {
    id: 6,
    slug: '06-directives',
    title: 'Directives',
    markdownPath: './lessons/06-directives.md',
    starterCode:
      '@manifest {\n  title: "My First Scene"\n  version: "0.1.0"\n}\n\norb "Floor" {\n  scale: [10, 0.1, 10]\n  color: "#888"\n  position: [0, -0.05, 0]\n  @physics { isStatic: true }\n}',
    solutionCode:
      '@manifest {\n  title: "My First Scene"\n  version: "0.1.0"\n}\n\n@zones {\n  play_area: { bounds: [[-3, -1, -3], [3, 3, 3]] }\n}\n\norb "Floor" {\n  scale: [10, 0.1, 10]\n  color: "#888"\n  position: [0, -0.05, 0]\n  @physics { isStatic: true }\n}',
    hints: ['Add @zones after @manifest', 'bounds takes [[min], [max]] arrays'],
  },
  {
    id: 7,
    slug: '07-environment',
    title: 'Environment',
    markdownPath: './lessons/07-environment.md',
    starterCode:
      'environment "Night" {\n  skybox: "starry_night.hdr"\n  ambientColor: "#0a0a2e"\n  ambientIntensity: 0.2\n  sun {\n    direction: [0, -1, 0]\n    color: "#ffffff"\n    intensity: 0.1\n  }\n}',
    solutionCode:
      'environment "Night" {\n  skybox: "starry_night.hdr"\n  ambientColor: "#0a0a2e"\n  ambientIntensity: 0.2\n  fog: { color: "#0a0a2e" near: 10 far: 50 }\n  sun {\n    direction: [0, -1, 0]\n    color: "#ffffff"\n    intensity: 0.1\n  }\n}',
    hints: ['Add fog: { color near far } inside environment', 'near: 10 and far: 50'],
  },
  {
    id: 8,
    slug: '08-networking',
    title: 'Networking',
    markdownPath: './lessons/08-networking.md',
    starterCode:
      'orb "SharedCube" {\n  color: "magenta"\n  @synced { properties: ["color"] authority: "last" }\n  logic "colorSync" {\n    on_click: () => {\n      this.color = this.color === "magenta" ? "cyan" : "magenta"\n    }\n  }\n}',
    solutionCode:
      'orb "SharedCube" {\n  color: "magenta"\n  @networked\n  @synced { properties: ["color"] authority: "last" }\n  logic "colorSync" {\n    on_click: () => {\n      this.color = this.color === "magenta" ? "cyan" : "magenta"\n    }\n  }\n}',
    hints: ['Add @networked before @synced', '@networked has no block, just the keyword'],
  },
  {
    id: 9,
    slug: '09-accessibility',
    title: 'Accessibility',
    markdownPath: './lessons/09-accessibility.md',
    starterCode:
      'orb "Door" {\n  color: "#8B4513"\n  scale: [1, 2, 0.1]\n  @accessible {\n    role: "door"\n    label: "Gallery entrance door"\n  }\n}',
    solutionCode:
      'orb "Door" {\n  color: "#8B4513"\n  scale: [1, 2, 0.1]\n  @accessible {\n    role: "door"\n    label: "Gallery entrance door"\n  }\n  @alt_text {\n    description: "A wooden door leading into the gallery"\n    context: "navigation"\n  }\n}',
    hints: ['Add @alt_text after @accessible', 'Provide description and context fields'],
  },
  {
    id: 10,
    slug: '10-full-scene',
    title: 'Full Scene',
    markdownPath: './lessons/10-full-scene.md',
    starterCode: '// Build your complete scene!\n@manifest {\n  title: "My Gallery"\n}\n',
    solutionCode: '// See lesson 10 for full example',
    hints: ['Combine all concepts from lessons 1-9', 'Start with @manifest and environment'],
  },
];

// ---------------------------------------------------------------------------
// Progress Management (localStorage-backed)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'holoscript-tour-progress';

export function loadProgress(): TourProgress {
  if (typeof localStorage === 'undefined') {
    return { completedLessons: [], currentLesson: 1, startedAt: new Date().toISOString() };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh: TourProgress = {
      completedLessons: [],
      currentLesson: 1,
      startedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  return JSON.parse(raw) as TourProgress;
}

export function saveProgress(progress: TourProgress): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }
}

export function completeLesson(lessonId: number): TourProgress {
  const progress = loadProgress();
  if (!progress.completedLessons.includes(lessonId)) {
    progress.completedLessons.push(lessonId);
  }
  const allIds = LESSONS.map((l) => l.id);
  const allDone = allIds.every((id) => progress.completedLessons.includes(id));
  if (allDone && !progress.completedAt) {
    progress.completedAt = new Date().toISOString();
  }
  progress.currentLesson = Math.min(lessonId + 1, LESSONS.length);
  saveProgress(progress);
  return progress;
}

export function isComplete(progress: TourProgress): boolean {
  return !!progress.completedAt;
}

export function completionPercentage(progress: TourProgress): number {
  return Math.round((progress.completedLessons.length / LESSONS.length) * 100);
}

// ---------------------------------------------------------------------------
// Certificate generation
// ---------------------------------------------------------------------------

export interface Certificate {
  recipientId: string; // anonymous UUID
  completedAt: string;
  lessonCount: number;
  badgeUrl: string;
}

export function generateCertificate(progress: TourProgress): Certificate | null {
  if (!isComplete(progress)) return null;
  const id = typeof crypto !== 'undefined' ? crypto.randomUUID() : `cert-${Date.now()}`;
  return {
    recipientId: id,
    completedAt: progress.completedAt!,
    lessonCount: LESSONS.length,
    badgeUrl: `https://holoscript.net/badges/tour-complete?id=${id}`,
  };
}
