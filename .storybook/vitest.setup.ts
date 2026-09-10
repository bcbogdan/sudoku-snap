import { setProjectAnnotations } from '@storybook/react-vite';
import { afterEach, decorators, initialGlobals, parameters } from '@storybook/addon-a11y/preview';
import preview from './preview';

setProjectAnnotations([{ afterEach, decorators, initialGlobals, parameters }, preview]);
