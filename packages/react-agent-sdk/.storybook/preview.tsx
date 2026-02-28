import type { Preview } from '@storybook/react';
import React from 'react';
import { AgentProvider } from '../src/components/AgentProvider';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
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
