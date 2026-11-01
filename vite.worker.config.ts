import {fileURLToPath} from 'node:url';
import {env} from 'node:process';
import {defineConfig} from 'vite';

const isProduction = env.NODE_ENV !== 'development';

// eventsource.sharedworker.js is loaded via new SharedWorker(url) as a classic
// worker, so it must be a single self-contained non-module file.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    target: 'es2020',
    outDir: 'public/assets',
    emptyOutDir: false,
    minify: isProduction,
    sourcemap: false,
    rolldownOptions: {
      input: {
        'eventsource.sharedworker': fileURLToPath(new URL('web_src/js/features/eventsource.sharedworker.js', import.meta.url)),
      },
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'js/[name].js',
      },
    },
  },
});
