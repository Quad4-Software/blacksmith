import {expect, test} from 'vitest';
import {svg, svgParseOuterInner} from './svg.ts';

test('svg', () => {
  expect(svg('octicon-repo')).toMatch(/^<svg/);
  expect(svg('octicon-repo', 16)).toContain('width="16"');
  expect(svg('octicon-repo', 32)).toContain('width="32"');
});

test('svgParseOuterInner', () => {
  const {svgOuter, svgInnerHtml} = svgParseOuterInner('octicon-repo');
  expect(svgOuter.nodeName).toMatch('svg');
  expect(svgOuter.classList.contains('octicon-repo')).toBeTruthy();
  expect(svgInnerHtml).toContain('<path');
});

test('SvgIcon.svelte', async () => {
  const {default: SvgIconSvelte} = await import('./components/SvgIcon.svelte');
  const {render} = await import('@testing-library/svelte');
  const {container} = render(SvgIconSvelte, {
    props: {name: 'octicon-link', size: 24, class: 'base', 'aria-hidden': 'true'},
  });
  const node = container.firstElementChild;
  expect(node.nodeName).toEqual('svg');
  expect(node.getAttribute('width')).toEqual('24');
  expect(node.getAttribute('height')).toEqual('24');
  expect(node.getAttribute('aria-hidden')).toEqual('true');
  expect(node.classList.contains('octicon-link')).toBeTruthy();
  expect(node.classList.contains('base')).toBeTruthy();
});

test('SvgIcon.svelte symbolId', async () => {
  const {default: SvgIconSvelte} = await import('./components/SvgIcon.svelte');
  const {render} = await import('@testing-library/svelte');
  const {container} = render(SvgIconSvelte, {
    props: {name: 'octicon-link', symbolId: 'icon-link'},
  });
  const node = container.firstElementChild;
  expect(node.classList.contains('tw:hidden')).toBeTruthy();
  expect(node.classList.contains('svg-symbol-container')).toBeTruthy();
  const symbol = node.querySelector('symbol');
  expect(symbol.getAttribute('id')).toEqual('icon-link');
  expect(symbol.innerHTML).toContain('<path');
});
