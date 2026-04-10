/**
 * AgentMetricsDashboard Storybook Stories
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentMetricsDashboard } from './AgentMetricsDashboard';

const meta: Meta<typeof AgentMetricsDashboard> = {
  title: 'Components/AgentMetricsDashboard',
  component: AgentMetricsDashboard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    refreshInterval: { control: 'number' },
    showDetailed: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof AgentMetricsDashboard>;

export const Default: Story = {
  args: {
    agentName: 'brittney',
    refreshInterval: 5000,
    showDetailed: true,
  },
};

export const Compact: Story = {
  args: {
    agentName: 'brittney',
    refreshInterval: 5000,
    showDetailed: false,
  },
};

export const FastRefresh: Story = {
  args: {
    agentName: 'brittney',
    refreshInterval: 1000,
    showDetailed: true,
  },
};
