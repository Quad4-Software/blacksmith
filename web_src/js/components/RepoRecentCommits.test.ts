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

const {default: RepoRecentCommits} = await import('./RepoRecentCommits.svelte');
const {chartInstances, resetChartInstances} = await import('./chart-test-mock.ts');

const locale = {
  loadingTitle: 'Loading',
  loadingTitleFailed: 'Loading failed',
  loadingInfo: 'Loading info',
  recentCommitsTitle: 'Number of commits in the past year',
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

describe('RepoRecentCommits', () => {
  beforeEach(() => {
    resetChartInstances();
    window.config.pageData.repoLink = '/user2/repo1';
  });

  afterEach(() => {
    delete window.config.pageData.repoLink;
  });

  test('shows the loading state while fetching', async () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('h2')).toBeTruthy());
    expect(container.querySelector('h2').textContent.trim()).toEqual('Loading');
    expect(container.textContent).toContain('Loading info');
    expect(container.querySelector('svg.job-status-rotate')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('fetches the data from the repo link and renders a bar chart', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse());
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    expect(String(fetchSpy.mock.calls[0][0])).toEqual('/user2/repo1/activity/recent-commits/data');
    expect(container.querySelector('.main-graph')).toBeTruthy();
    expect(container.querySelector('h2')).toBeNull();
    expect(chartInstances).toHaveLength(1);
    expect(chartInstances[0].config.type).toEqual('bar');
    const scales = (chartInstances[0].config.options.scales as Record<string, {type?: string}>);
    expect(scales.x.type).toEqual('time');
  });

  test('retries while the server answers 202', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockResponse({status: 202}))
      .mockResolvedValueOnce(mockResponse({status: 202}))
      .mockResolvedValue(mockResponse());
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test('shows the status text of a failed response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse({ok: false, status: 500, statusText: 'Internal Server Error'}));
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('.text.red')).toBeTruthy());

    expect(container.querySelector('h2').textContent.trim()).toEqual('Loading failed');
    expect(container.querySelector('.text.red').textContent).toContain('Internal Server Error');
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('shows the error message when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('.text.red')).toBeTruthy());

    expect(container.querySelector('.text.red').textContent).toContain('offline');
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('renders the title', async () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const {container} = render(RepoRecentCommits, {props: {locale}});
    expect(container.querySelector('h1').textContent).toEqual('Number of commits in the past year');
  });

  test('plots commits per week limited to the last 52 weeks', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse());
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    const dataset = chartInstances[0].config.data.datasets[0] as {label: string, data: Array<{x: number, y: number}>};
    expect(dataset.label).toEqual('Commits');
    expect(dataset.data).toHaveLength(52);
    expect(dataset.data.at(-1).x).toBeGreaterThan(firstSunday + (2 * oneWeek));
    expect(dataset.data.every((p) => p.y === 0)).toBe(true);
  });

  test('keeps the commit counts of weeks inside the window', async () => {
    const lastSunday = new Date();
    lastSunday.setUTCHours(0, 0, 0, 0);
    lastSunday.setUTCDate(lastSunday.getUTCDate() - lastSunday.getUTCDay());
    const week = lastSunday.valueOf();
    const body = {
      [week - (60 * oneWeek)]: {week: week - (60 * oneWeek), additions: 0, deletions: 0, commits: 1},
      [week]: {week, additions: 0, deletions: 0, commits: 9},
    };
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse({json: () => Promise.resolve(body)}));
    const {container} = render(RepoRecentCommits, {props: {locale}});
    await vi.waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());

    const points = (chartInstances[0].config.data.datasets[0] as {data: Array<{x: number, y: number}>}).data;
    expect(points).toHaveLength(52);
    expect(points.find((p) => p.x === week).y).toEqual(9);
    expect(points.some((p) => p.x === week - (60 * oneWeek))).toBe(false);
  });
});
