import {readFileSync, readdirSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {describe, expect, test} from 'vitest';
import {compile} from 'tailwindcss';

const ROOT = process.cwd();
const SCAN_DIRS = [
  'templates',
  'web_src/js',
  'models/avatars',
  'modules/markup',
  'services/auth/source/oauth2',
  'routers/web/repo',
  'options',
  'docs',
  'contrib',
];
// Intentional marker classes: used for behavior/selection, never meant to generate CSS.
const ALLOWLIST = new Set<string>(['tw:group']);
const CANDIDATE_RE = /(?<![-A-Za-z0-9_\\])tw:(?:[A-Za-z0-9_()#%/:.-]|\[[^\]\s]*\])+!?/g;
const OLD_STYLE_RE = /(?<![A-Za-z0-9_-])-?tw-[A-Za-z0-9[]/g;
const OLD_STYLE_SCAN_DIRS = [
  ...SCAN_DIRS,
  'web_src',
  'tests',
  'tools',
  'cmd',
  'models',
  'modules',
  'routers',
  'services',
  'custom',
  'build',
];
const OLD_STYLE_EXT_RE = /\.(tmpl|html|js|mjs|cjs|ts|svelte|go|css|md|yml|yaml|json)$/;
const MISORDERED_RE = /(?<![-A-Za-z0-9_\\])[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*:tw:/g;

function collectFiles(dirs = SCAN_DIRS, extRe = /\.(tmpl|js|ts|svelte|go)$/): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (!/node_modules|fomantic|\.git|assets/.test(p.slice(ROOT.length))) walk(p);
      } else if (extRe.test(name) && name !== 'tailwind-candidates.test.ts') {
        out.push(p);
      }
    }
  };
  for (const d of dirs) {
    try {
      walk(join(ROOT, d));
    } catch {
      // directory may not exist
    }
  }
  return out;
}

async function compileIndexCss() {
  const css = readFileSync(join(ROOT, 'web_src/css/index.css'), 'utf8');
  return compile(css, {
    base: join(ROOT, 'web_src/css'),
    loadStylesheet: async (id, base) => {
      const path = id.startsWith('.') ? resolve(base, id) : createRequire(import.meta.url).resolve(id);
      return {path, base: dirname(path), content: readFileSync(path, 'utf8')};
    },
  });
}

describe('tailwind candidates', () => {
  const files = collectFiles();

  test('no old style tw- class tokens', () => {
    const bad: string[] = [];
    for (const f of collectFiles(OLD_STYLE_SCAN_DIRS, OLD_STYLE_EXT_RE)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(OLD_STYLE_RE)) {
          bad.push(`${f.slice(ROOT.length + 1)}:${i + 1}: ${line.slice(Math.max(0, m.index - 20), m.index + 30).trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  test('no variant-before-prefix candidates', () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(MISORDERED_RE)) {
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('every tw: candidate generates CSS', async () => {
    const compiler = await compileIndexCss();
    const candidates = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(CANDIDATE_RE)) {
        candidates.add(m[0]);
      }
    }
    const dead: string[] = [];
    let previous = compiler.build([]);
    for (const cand of candidates) {
      const next = compiler.build([cand]);
      if (next === previous && !ALLOWLIST.has(cand)) dead.push(cand);
      previous = next;
    }
    expect(dead).toEqual([]);
  });

  test('variants keep the semantics of tailwind 3', async () => {
    const compiler = await compileIndexCss();
    const css = compiler.build(['tw:max-sm:flex-col', 'tw:max-[391px]:w-full', 'tw:sm:max-w-60', 'tw:hover:bg-blue']);
    expect(css).toContain('@media (width < 40rem)');
    expect(css).toContain('@media (width < 391px)');
    expect(css).toContain('@media (width >= 40rem)');
    expect(css).toContain('.tw\\:hover\\:bg-blue:hover {');
    expect(css).not.toContain('(hover: hover)');
  });
});
