import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.tsx'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  staticDirs: [],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    // Vite otherwise serves/copies Next's public directory, including OCR binaries.
    config.publicDir = false;
    return config;
  },
};

export default config;
