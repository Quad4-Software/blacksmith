import fastGlob from 'fast-glob';
import wrapAnsi from 'wrap-ansi';
import {init as licenseChecker} from 'license-checker-rseidelsohn';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcssVite from '@tailwindcss/vite';
import {stringPlugin} from 'vite-string-plugin';
import {parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync, writeFileSync} from 'node:fs';
import {env} from 'node:process';
import {defineConfig, type Plugin} from 'vite';
import goJson from './assets/go-licenses.json' with {type: 'json'};

const formatLicenseText = (licenseText: string) => wrapAnsi(licenseText || '', 80).trim();

const baseDirectory = import.meta.dirname;
const absPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const isProduction = env.NODE_ENV !== 'development';

// ENABLE_SOURCEMAP accepts the following values:
// true - all enabled, the default in development
// reduced - minimal sourcemaps, the default in production
// false - all disabled
let sourceMaps: string;
if ('ENABLE_SOURCEMAP' in env) {
  sourceMaps = ['true', 'false'].includes(env.ENABLE_SOURCEMAP) ? env.ENABLE_SOURCEMAP : 'reduced';
} else {
  sourceMaps = isProduction ? 'reduced' : 'true';
}

// define which web components we use for Vue to not interpret them as Vue components

// Entries that are made of several modules whose evaluation order matters are
// wrapped in a virtual module that imports them in order.
const entrySources: Record<string, string[]> = {
  index: [
    'web_src/js/jquery.js',
    'web_src/fomantic/build/semantic.js',
    'web_src/js/index.js',
    'node_modules/easymde/dist/easymde.min.css',
    'web_src/fomantic/build/semantic.css',
    'web_src/css/index.css',
  ],
  forgejoswagger: [ // Forgejo swagger is OpenAPI 3.0.0 and has specific parameters
    'web_src/js/standalone/forgejo-swagger.js',
    'web_src/css/standalone/swagger.css',
  ],
  swagger: [
    'web_src/js/standalone/swagger.js',
    'web_src/css/standalone/swagger.css',
  ],
  ...(!isProduction && {
    demo: [
      'web_src/js/standalone/demo.ts',
      'web_src/css/standalone/demo.css',
    ],
  }),
};

const VIRTUAL_ENTRY_PREFIX = 'virtual:forgejo-entry/';

function virtualEntryPlugin(): Plugin {
  return {
    name: 'forgejo-virtual-entries',
    resolveId(id) {
      if (!id.startsWith(VIRTUAL_ENTRY_PREFIX)) return;
      return `\0${id}`;
    },
    load(id) {
      if (!id.startsWith(`\0${VIRTUAL_ENTRY_PREFIX}`)) return;
      const name = id.slice(VIRTUAL_ENTRY_PREFIX.length + 1);
      const sources = entrySources[name];
      if (!sources) throw new Error(`unknown virtual entry: ${name}`);
      return sources.map((source) => `import ${JSON.stringify(absPath(source))};`).join('\n');
    },
  };
}

function licensesPlugin(): Plugin {
  return {
    name: 'forgejo-licenses',
    apply: 'build',
    async closeBundle() {
      if (!isProduction) {
        writeFileSync('public/assets/licenses.txt', 'Licenses are disabled during development');
        return;
      }
      const dependencies: Record<string, {licenses?: string, licenseFile?: string}> = await new Promise((resolve, reject) => {
        licenseChecker({
          start: baseDirectory,
          production: true,
          onlyAllow: 'Apache-2.0; 0BSD; BSD-2-Clause; BSD-3-Clause; BlueOak-1.0.0; MIT; ISC; Unlicense; CC-BY-4.0',
          // argparse@2.0.1 - Python-2.0. It's used in the CLI file of markdown-it and js-yaml and not in the library code.
          excludePackages: 'argparse@2.0.1',
        }, (err, dependencies) => err ? reject(err) : resolve(dependencies as Record<string, {licenses?: string, licenseFile?: string}>));
      });
      const line = '-'.repeat(80);
      const goModules = goJson.map(({name, licenseText}) => {
        return {name, licenseName: '', body: formatLicenseText(licenseText)};
      });
      const jsModules = Object.keys(dependencies).map((packageName) => {
        const {licenses, licenseFile} = dependencies[packageName];
        const licenseText = (licenseFile && !licenseFile?.toLowerCase().includes('readme')) ? readFileSync(licenseFile, 'utf-8') : '[no license file]';
        return {name: packageName, licenseName: licenses, body: formatLicenseText(licenseText)};
      });
      const modules = [...goModules, ...jsModules];
      const licenseTxt = modules.map(({name, licenseName, body}) => {
        const title = licenseName ? `${name} - ${licenseName}` : name;
        return `${line}\n${title}\n${line}\n${body}`;
      }).join('\n');
      writeFileSync('public/assets/licenses.txt', licenseTxt);
    },
  };
}

// web_src/js/jquery.js sets window.$/window.jQuery, but code-split chunks that use
// jQuery plugins relying on the global (vendor scripts, fomantic) can evaluate
// before the entry module that contains that assignment. Export the globals at the
// point the jquery package itself is first required so they are always available.
function jqueryGlobalsPlugin(): Plugin {
  return {
    name: 'forgejo-jquery-globals',
    transform(code, id) {
      if (!/node_modules\/jquery\/dist\/jquery\.js$/.test(id)) return;
      return {
        code: `${code}\n;globalThis.$ = globalThis.jQuery = module.exports;\n`,
        map: null,
      };
    },
  };
}

// implements the ENABLE_SOURCEMAP=reduced behavior: only js/index.js keeps its map
function reducedSourcemapsPlugin(): Plugin {
  return {
    name: 'forgejo-reduced-sourcemaps',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName.endsWith('.map') && fileName !== 'js/index.js.map') {
          delete bundle[fileName];
        } else if (item.type === 'chunk' && fileName !== 'js/index.js') {
          item.code = item.code.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
        }
      }
    },
  };
}

const input: Record<string, string> = {
  ...Object.fromEntries(Object.keys(entrySources).map((name) => [name, `${VIRTUAL_ENTRY_PREFIX}${name}`])),
  webcomponents: absPath('web_src/js/webcomponents/index.ts'),
};

// one css/theme-*.css per file in web_src/css/themes
for (const path of fastGlob.sync('web_src/css/themes/*.css', {cwd: baseDirectory, absolute: true})) {
  input[parse(path).name] = path;
}

const entryNames = new Set(Object.keys(input));

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    tailwindcssVite(),
    virtualEntryPlugin(),
    jqueryGlobalsPlugin(),
    licensesPlugin(),
    sourceMaps === 'reduced' && reducedSourcemapsPlugin(),
    stringPlugin({match: /public\/assets\/img\/svg\/.*\.svg$/i}),
    svelte({
      dynamicCompileOptions: ({filename}) => filename.includes('node_modules') ? undefined : {runes: true},
    }),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
  },
  build: {
    target: 'es2020',
    outDir: 'public/assets',
    emptyOutDir: false,
    cssCodeSplit: true,
    minify: isProduction,
    sourcemap: sourceMaps !== 'false',
    rolldownOptions: {
      input,
      // lazy chunks reference the entry file by its bare name (./index.js) while the
      // page loads it with a cache-busting query (index.js?v=...), which would make
      // the browser evaluate the entry twice. strict signatures move shared code
      // out of the entry chunk so lazy chunks never import it.
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].[hash:8].js',
        assetFileNames(assetInfo) {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? '';
          if (/\.(ttf|woff2?)$/i.test(name)) {
            return 'fonts/[name].[hash:8].[ext]';
          }
          if (/\.css$/i.test(name)) {
            // entry css files keep a fixed name, lazy css chunks get a content hash
            return entryNames.has(name.replace(/\.css$/i, '')) ? 'css/[name].[ext]' : 'css/[name].[hash:8].[ext]';
          }
          return 'assets/[name].[hash:8].[ext]';
        },
      },
    },
  },
});
