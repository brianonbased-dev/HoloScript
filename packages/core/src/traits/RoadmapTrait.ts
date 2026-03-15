/**
 * RoadmapNode Trait
 *
 * Binds a spatial object to a project milestone.
 * Used for Phase 5 'Spatial Governance'.
 */

import { TraitHandler } from './TraitTypes';
import { roadmapService } from '../services/HololandRoadmapService';

interface RoadmapConfig {
  milestone_id: string;
  show_progress: boolean;
  interactive: boolean;
}

export const roadmapNodeHandler: TraitHandler<RoadmapConfig> = {
  name: 'roadmap_node',

  defaultConfig: {
    milestone_id: '',
    show_progress: true,
    interactive: true,
  },

  onAttach(node, config, context) {
    const milestone = roadmapService.getMilestone(config.milestone_id);
    if (milestone && node.properties) {
      // Sync visual state with milestone status
      node.properties.color = getStatusColor(milestone.status);
      node.properties.text = milestone.title;

      if (config.show_progress) {
        node.properties.progress = milestone.progress;
      }
    }

    context.emit?.('roadmap_node_attached', {
      nodeId: node.id,
      milestone,
    });
  },

  onUpdate(node, config, _context, _delta) {
    // Periodically sync with service state
    const milestone = roadmapService.getMilestone(config.milestone_id);
    if (milestone && node.properties) {
      node.properties.color = getStatusColor(milestone.status);
      if (config.show_progress) {
        node.properties.progress = milestone.progress;
      }
    }
  },

  onEvent(node, config, context, event) {
    if (event.type === 'click' && config.interactive) {
      const milestone = roadmapService.getMilestone(config.milestone_id);
      if (milestone) {
        context.emit?.('show_milestone_details', { milestone });
      }
    }
  },
};

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#4caf50'; // Green
    case 'in-progress':
      return '#2196f3'; // Blue
    case 'blocked':
      return '#f44336'; // Red
    case 'planned':
      return '#9e9e9e'; // Grey
    default:
      return '#ffffff';
  }
}

export default roadmapNodeHandler;
