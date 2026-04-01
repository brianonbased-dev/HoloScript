/**
 * Wizard Templates — Starter HoloScript compositions for each wizard sub-category.
 *
 * Decoupled implementation. The template definitions are loaded asynchronously to
 * minimize bundle bloat during the initial Studio startup or Wizard load.
 */

import type { SceneTemplate } from '../scene/sceneTemplates';

// Registry maps subcategory IDs to their respective chunk files
const TEMPLATE_REGISTRY: Record<string, () => Promise<{ default: SceneTemplate }>> = {
  'vr-game': () => import('./templates/vr-game'),
  'platformer': () => import('./templates/platformer'),
  'rpg': () => import('./templates/rpg'),
  'puzzle': () => import('./templates/puzzle'),
  'social-vr': () => import('./templates/social-vr'),
  'short-film': () => import('./templates/short-film'),
  'music-video': () => import('./templates/music-video'),
  'product-viz': () => import('./templates/product-viz'),
  'cutscene': () => import('./templates/cutscene'),
  'character-design': () => import('./templates/character-design'),
  'environment-art': () => import('./templates/environment-art'),
  'material-study': () => import('./templates/material-study'),
  'music-visualizer': () => import('./templates/music-visualizer'),
  'ai-composer': () => import('./templates/ai-composer'),
  'portfolio': () => import('./templates/portfolio'),
  'interactive-story': () => import('./templates/interactive-story'),
  'data-dashboard': () => import('./templates/data-dashboard'),
  'product-configurator': () => import('./templates/product-configurator'),
  'sensor-dashboard': () => import('./templates/sensor-dashboard'),
  'digital-twin': () => import('./templates/digital-twin'),
  'control-panel': () => import('./templates/control-panel'),
  'tutorial-creator': () => import('./templates/tutorial-creator'),
  'student-sandbox': () => import('./templates/student-sandbox'),
  'classroom-demo': () => import('./templates/classroom-demo'),
  'robot-arm': () => import('./templates/robot-arm'),
  'factory-automation': () => import('./templates/factory-automation'),
  'drone-sim': () => import('./templates/drone-sim'),
  'warehouse-robotics': () => import('./templates/warehouse-robotics'),
  'molecular-design': () => import('./templates/molecular-design'),
  'narupa-sim': () => import('./templates/narupa-sim'),
  'anatomy-explorer': () => import('./templates/anatomy-explorer'),
  'surgical-training': () => import('./templates/surgical-training'),
  'therapy-vr': () => import('./templates/therapy-vr'),
  'rehab-sim': () => import('./templates/rehab-sim'),
  'clinical-training': () => import('./templates/clinical-training'),
  'patient-education': () => import('./templates/patient-education'),
  'building-walkthrough': () => import('./templates/building-walkthrough'),
  'interior-design': () => import('./templates/interior-design'),
  'urban-planning': () => import('./templates/urban-planning'),
  'smart-home': () => import('./templates/smart-home'),
  'farm-twin': () => import('./templates/farm-twin'),
  'greenhouse-monitor': () => import('./templates/greenhouse-monitor'),
  'precision-agriculture': () => import('./templates/precision-agriculture'),
  'nft-gallery': () => import('./templates/nft-gallery'),
  'token-forge': () => import('./templates/token-forge'),
  'social-avatar': () => import('./templates/social-avatar'),
  'live-stage': () => import('./templates/live-stage'),
  'holographic-gallery': () => import('./templates/holographic-gallery'),
  'memory-wall': () => import('./templates/memory-wall'),
  'video-portal': () => import('./templates/video-portal')
};

/** Get the starter template for a given wizard sub-category ID asynchronously. */
export async function getWizardTemplate(subcategoryId: string): Promise<SceneTemplate | null> {
  const loader = TEMPLATE_REGISTRY[subcategoryId];
  if (!loader) return null;
  try {
    const module = await loader();
    return module.default;
  } catch (err) {
    console.error(`Failed to load template for ${subcategoryId}:`, err);
    return null;
  }
}

/** Get all available wizard template IDs. */
export function getAvailableTemplateIds(): string[] {
  return Object.keys(TEMPLATE_REGISTRY);
}

/** Get all wizard templates as a flat array (for merging into template galleries). */
export async function getAllWizardTemplates(): Promise<SceneTemplate[]> {
  const ids = getAvailableTemplateIds();
  const templates = await Promise.all(ids.map(id => getWizardTemplate(id)));
  return templates.filter((t): t is SceneTemplate => t !== null);
}
