import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../app/**/*.stories.tsx'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  staticDirs: [{ from: '../public/fonts', to: '/fonts' }],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    config.resolve = { ...config.resolve, tsconfigPaths: true };
    // Vite otherwise serves/copies Next's public directory, including OCR binaries.
    config.publicDir = false;
    return config;
  },
};

export default config;
