import {defineConfig} from 'vitest/config';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {svelteTesting} from '@testing-library/svelte/vite';
import {stringPlugin} from 'vite-string-plugin';

export default defineConfig({
  test: {
    include: ['web_src/**/*.test.{ts,js}'],
    setupFiles: ['web_src/js/vitest.setup.ts'],
    environment: 'happy-dom',
    testTimeout: 20000,
    open: false,
    allowOnly: true,
    passWithNoTests: true,
    globals: true,
    watch: false,
    mockReset: true,
  },
  resolve: {
    conditions: ['browser'],
  },
  plugins: [
    svelteTesting(),
    stringPlugin(),
    svelte({
      dynamicCompileOptions: ({filename}) => filename.includes('node_modules') ? undefined : {runes: true},
    }),
  ],
});
