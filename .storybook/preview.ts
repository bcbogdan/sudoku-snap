import type { Preview } from '@storybook/react-vite';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
  loaders: [
    async () => {
      await Promise.all([
        document.fonts.load('400 16px "Bricolage Grotesque"'),
        document.fonts.load('600 24px "Bricolage Grotesque"'),
        document.fonts.load('700 40px "Bricolage Grotesque"'),
        document.fonts.load('500 13px "JetBrains Mono"'),
        document.fonts.load('600 22px "JetBrains Mono"'),
      ]);
      await document.fonts.ready;
      return {};
    },
  ],
};

export default preview;
