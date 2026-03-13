/**
 * TaskMonitor Storybook Stories
 */

import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskMonitor } from './TaskMonitor';

const meta: Meta<typeof TaskMonitor> = {
  title: 'Components/TaskMonitor',
  component: TaskMonitor,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    showLogs: { control: 'boolean' },
    showProgress: { control: 'boolean' },
    showPhase: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof TaskMonitor>;

export const Running: Story = {
  args: {
    taskId: 'task-123',
    showLogs: true,
    showProgress: true,
    showPhase: true,
  },
};

export const WithoutLogs: Story = {
  args: {
    taskId: 'task-123',
    showLogs: false,
    showProgress: true,
    showPhase: true,
  },
};

export const MinimalView: Story = {
  args: {
    taskId: 'task-123',
    showLogs: false,
    showProgress: true,
    showPhase: false,
  },
};
