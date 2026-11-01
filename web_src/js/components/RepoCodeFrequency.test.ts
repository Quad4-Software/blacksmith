import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';

vi.mock('chart.js', async (importOriginal) => {
  const {fakeChartModule} = await import('./chart-test-mock.ts');
  return fakeChartModule(await importOriginal());
});

vi.mock('../utils.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sleep: () => Promise.resolve(),
}));

const {default: RepoCodeFrequency} = await import('./RepoCodeFrequency.svelte');
const {chartInstances, resetChartInstances} = await import('./chart-test-mock.ts');

const locale = {
  loadingTitle: 'Loading',
  loadingTitleFailed: 'Loading failed',
  loadingInfo: 'Loading info',
  codeFrequencyTitle: 'Code frequency over the history of {0}',
};

const firstSunday = Date.UTC(2024, 0, 7);
const oneWeek = 7 * 24 * 60 * 60 * 1000;

function weekData() {
  return {
    [firstSunday]: {week: firstSunday, additions: 10, deletions: 4, commits: 3},
    [firstSunday + (2 * oneWeek)]: {week: firstSunday + (2 * oneWeek), additions: 7, deletions: 1, commits: 5},
  };
}

function mockResponse(overrides: Record<string, unknown> = {}) {
  return {ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(weekData()), ...overrides} as unknown as Response;
}

describe('RepoCodeFrequency', () => {
  beforeEach(() => {
    resetChartInstances();
    window.config.pageData.repoLink = '/user2/repo1';
  });

  afterEach(() => {
    delete window.config.pageData.repoLink;
  });

  test('shows the loading state while fetching', async () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('h2')).toBeTruthy());
    expect(container.querySelector('h2').textContent.trim()).toEqual('Loading');
    expect(container.textContent).toContain('Loading info');
    expect(container.querySelector('svg.job-status-rotate')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('fetches the data from the repo link and renders a line chart', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse());
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    expect(String(fetchSpy.mock.calls[0][0])).toEqual('/user2/repo1/activity/code-frequency/data');
    expect(container.querySelector('.main-graph')).toBeTruthy();
    expect(container.querySelector('h2')).toBeNull();
    expect(chartInstances).toHaveLength(1);
    expect(chartInstances[0].config.type).toEqual('line');
    const scales = (chartInstances[0].config.options.scales as Record<string, {type?: string}>);
    expect(scales.x.type).toEqual('time');
  });

  test('fills missing weeks with zeroes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse());
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    const points = chartInstances[0].config.data.datasets[0].data as Array<{x: number, y: number}>;
    expect(points.length).toBeGreaterThan(2);
    expect(points[0].x).toEqual(firstSunday);
    expect(points.find((p) => p.x === firstSunday + oneWeek).y).toEqual(0);
  });

  test('retries while the server answers 202', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockResponse({status: 202}))
      .mockResolvedValueOnce(mockResponse({status: 202}))
      .mockResolvedValue(mockResponse());
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test('shows the status text of a failed response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse({ok: false, status: 500, statusText: 'Internal Server Error'}));
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('.text.red')).toBeTruthy());

    expect(container.querySelector('h2').textContent.trim()).toEqual('Loading failed');
    expect(container.querySelector('.text.red').textContent).toContain('Internal Server Error');
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('shows the error message when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('.text.red')).toBeTruthy());

    expect(container.querySelector('.text.red').textContent).toContain('offline');
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('renders the title with the repo name', async () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    expect(container.querySelector('h1').textContent).toEqual('Code frequency over the history of user2/repo1');
  });

  test('uses additions and negated deletions as datasets', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse());
    const {container} = render(RepoCodeFrequency, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    const [additions, deletions] = chartInstances[0].config.data.datasets as Array<{label: string, data: Array<{x: number, y: number}>}>;
    expect(additions.label).toEqual('Additions');
    expect(deletions.label).toEqual('Deletions');
    expect(additions.data[0].y).toEqual(10);
    expect(deletions.data[0].y).toEqual(-4);
  });
});
