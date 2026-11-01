import {beforeEach, describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import {tick} from 'svelte';

vi.mock('chart.js', async (importOriginal) => {
  const {fakeChartModule} = await import('./chart-test-mock.ts');
  return fakeChartModule(await importOriginal());
});

const {default: Chart} = await import('./Chart.svelte');
const {chartInstances, resetChartInstances} = await import('./chart-test-mock.ts');

const baseData = {labels: ['a', 'b'], datasets: [{label: 'one', data: [1, 2]}]};

describe('Chart', () => {
  beforeEach(() => {
    resetChartInstances();
  });

  test('renders a canvas and creates the chart with the given config', async () => {
    const plugin = {id: 'test'};
    const {container} = render(Chart, {props: {type: 'bar', data: baseData, options: {responsive: true}, plugins: [plugin], ariaLabel: 'my chart', height: '150px'}});
    await tick();
    const canvas = container.querySelector('canvas');
    expect(canvas.getAttribute('role')).toEqual('img');
    expect(canvas.getAttribute('aria-label')).toEqual('my chart');
    expect(canvas.getAttribute('height')).toEqual('150px');
    expect(chartInstances).toHaveLength(1);
    const chart = chartInstances[0];
    expect(chart.canvas).toBe(canvas);
    expect(chart.config.type).toEqual('bar');
    expect(chart.config.data.labels).toEqual(['a', 'b']);
    expect(chart.config.data.datasets[0].data).toEqual([1, 2]);
    expect(chart.config.options).toEqual({responsive: true});
    expect(chart.config.plugins).toEqual([plugin]);
    expect(chart.updateCount).toEqual(0);
  });

  test('updates the chart when data changes and keeps matching datasets', async () => {
    const {rerender} = render(Chart, {props: {type: 'line', data: baseData}});
    await tick();
    const chart = chartInstances[0];
    const firstDataset = chart.config.data.datasets[0];

    await rerender({data: {labels: ['a', 'b', 'c'], datasets: [{label: 'one', data: [1, 2, 3]}]}});
    await tick();

    expect(chartInstances).toHaveLength(1);
    expect(chart.updateCount).toEqual(1);
    expect(chart.config.data.labels).toEqual(['a', 'b', 'c']);
    expect(chart.config.data.datasets[0]).toBe(firstDataset);
    expect(chart.config.data.datasets[0].data).toEqual([1, 2, 3]);
  });

  test('adds new datasets when the label does not match', async () => {
    const {rerender} = render(Chart, {props: {type: 'line', data: baseData}});
    await tick();
    const chart = chartInstances[0];
    const firstDataset = chart.config.data.datasets[0];

    await rerender({data: {labels: ['a', 'b'], datasets: [{label: 'other', data: [5, 6]}]}});
    await tick();

    expect(chart.config.data.datasets).toHaveLength(1);
    expect(chart.config.data.datasets[0]).not.toBe(firstDataset);
    expect(chart.config.data.datasets[0].label).toEqual('other');
  });

  test('applies new options onto the existing chart options', async () => {
    const {rerender} = render(Chart, {props: {type: 'bar', data: baseData, options: {animation: false}}});
    await tick();
    const chart = chartInstances[0];

    await rerender({options: {responsive: false}});
    await tick();

    expect(chart.updateCount).toEqual(1);
    expect(chart.options).toEqual({animation: false, responsive: false});
  });

  test('does not update when props are unchanged', async () => {
    const {rerender} = render(Chart, {props: {type: 'bar', data: baseData}});
    await tick();
    await rerender({type: 'bar'});
    await tick();
    expect(chartInstances[0].updateCount).toEqual(0);
  });

  test('destroys the chart on unmount', async () => {
    const {unmount} = render(Chart, {props: {type: 'bar', data: baseData}});
    await tick();
    expect(chartInstances[0].destroyed).toBe(false);
    unmount();
    expect(chartInstances[0].destroyed).toBe(true);
  });
});
