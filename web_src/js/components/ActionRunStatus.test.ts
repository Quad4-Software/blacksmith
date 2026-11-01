import {expect, test} from 'vitest';
import {render} from '@testing-library/svelte';
import ActionRunStatus from './ActionRunStatus.svelte';

const cases: Array<[string, string, string]> = [
  ['success', 'octicon-check-circle-fill', 'text green'],
  ['skipped', 'octicon-skip', 'text grey'],
  ['cancelled', 'octicon-stop', 'text yellow'],
  ['waiting', 'octicon-clock', 'text yellow'],
  ['blocked', 'octicon-blocked', 'text yellow'],
  ['running', 'octicon-meter', 'job-status-rotate'],
  ['failure', 'octicon-x-circle-fill', 'text red'],
  ['unknown', 'octicon-x-circle-fill', 'text red'],
];

test('ActionRunStatus renders each status branch', () => {
  for (const [status, icon, klass] of cases) {
    const {container, unmount} = render(ActionRunStatus, {props: {status}});
    const span = container.querySelector('span');
    expect(span).toBeTruthy();
    const svg = span.querySelector('svg');
    expect(svg.classList.contains(icon)).toBeTruthy();
    for (const cls of klass.split(' ')) {
      expect(svg.classList.contains(cls)).toBeTruthy();
    }
    unmount();
  }
});

test('ActionRunStatus empty status renders nothing', () => {
  const {container} = render(ActionRunStatus, {props: {status: ''}});
  expect(container.querySelector('span')).toBeNull();
});

test('ActionRunStatus props', () => {
  const {container} = render(ActionRunStatus, {
    props: {status: 'success', size: 32, className: 'extra', localeStatus: 'done', inline: true},
  });
  const span = container.querySelector('span');
  expect(span.classList.contains('tw:inline')).toBeTruthy();
  expect(span.getAttribute('data-tooltip-content')).toEqual('done');
  const svg = span.querySelector('svg');
  expect(svg.getAttribute('width')).toEqual('32');
  expect(svg.classList.contains('extra')).toBeTruthy();
});

test('ActionRunStatus non-inline defaults', () => {
  const {container} = render(ActionRunStatus, {props: {status: 'success'}});
  const span = container.querySelector('span');
  expect(span.classList.contains('tw:flex')).toBeTruthy();
  expect(span.classList.contains('tw:items-center')).toBeTruthy();
  expect(span.getAttribute('data-tooltip-content')).toEqual('success');
});
