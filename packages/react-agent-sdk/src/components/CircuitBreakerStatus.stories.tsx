/**
 * CircuitBreakerStatus Storybook Stories
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircuitBreakerStatus } from './CircuitBreakerStatus';

const meta: Meta<typeof CircuitBreakerStatus> = {
  title: 'Components/CircuitBreakerStatus',
  component: CircuitBreakerStatus,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    showMetrics: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof CircuitBreakerStatus>;

export const Closed: Story = {
  args: {
    queryName: 'test-agent',
    showMetrics: true,
  },
};

export const WithoutMetrics: Story = {
  args: {
    queryName: 'test-agent',
    showMetrics: false,
  },
};
