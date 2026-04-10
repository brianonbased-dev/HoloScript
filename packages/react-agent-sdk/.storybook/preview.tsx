import type { Preview } from '@storybook/react-vite';
import React from 'react';
import { AgentProvider } from '../src/components/AgentProvider';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  decorators: [
    (Story) => (
      <AgentProvider
        config={{
          apiUrl: 'http://localhost:3000',
        }}
      >
        <Story />
      </AgentProvider>
    ),
  ],
};

export default preview;
