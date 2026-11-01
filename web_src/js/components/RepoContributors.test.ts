import {beforeEach, describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import {tick} from 'svelte';
import jquery from 'jquery';

vi.mock('chart.js', async (importOriginal) => {
  const {fakeChartModule} = await import('./chart-test-mock.ts');
  return fakeChartModule(await importOriginal());
});

vi.mock('../utils.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sleep: () => Promise.resolve(),
}));

const {default: RepoContributors} = await import('./RepoContributors.svelte');
const {chartInstances, resetChartInstances} = await import('./chart-test-mock.ts');

const locale = {
  filterLabel: 'Filter',
  contributionType: {
    commits: 'Commits',
    additions: 'Additions',
    deletions: 'Deletions',
  },
  contributorsTitle: 'Contributors',
  contributorsBetweenTitle: 'Contributors between {0} and {1}',
  contributorsSinceTitle: 'Contributors since {0}',
  loadingTitle: 'Loading',
  loadingTitleFailed: 'Loading failed',
  loadingInfo: 'Loading info',
};

const oneWeek = 7 * 24 * 60 * 60 * 1000;
const y2000 = 946166400000;
const y2025 = 1754179200000;

function weeks(entries: Array<[number, number, number, number]>) {
  return Object.fromEntries(entries.map(([week, additions, deletions, commits]) => [week, {week, additions, deletions, commits}]));
}

function mockData(overrides: Record<string, unknown> = {}) {
  const body = {
    'daniel@haxx.se': {
      name: 'Daniel Stenberg',
      home_link: '/daniel',
      avatar_link: '/avatars/daniel',
      weeks: weeks([[y2025, 4330, 47, 10], [y2000, 37273, 0, 1]]),
    },
    'nobody@example.com': {
      name: 'No Home',
      home_link: '',
      avatar_link: '/avatars/nobody',
      weeks: weeks([[y2025, 5, 100, 2]]),
    },
    total: {
      name: 'Total',
      weeks: weeks([[y2025, 4335, 147, 12], [y2000, 37273, 0, 1]]),
    },
    ...overrides,
  };
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    json: vi.fn().mockResolvedValue(body),
    ok: true,
    status: 200,
  } as unknown as Response);
}

function renderComponent() {
  return render(RepoContributors, {props: {repoLink: '/user2/repo1', repoDefaultBranchName: 'main', locale}});
}

async function loaded(container: HTMLElement) {
  await vi.waitFor(() => expect(container.querySelector('.contributor-grid').children.length).toBeGreaterThan(0));
}

function mainChart() {
  return chartInstances[0];
}

describe('RepoContributors', () => {
  let dropdownOptions: {onChange: (val: string) => void};

  beforeEach(() => {
    resetChartInstances();
    jquery.fn.dropdown = vi.fn(function(this: unknown, options) {
      dropdownOptions = options;
      return this;
    }) as unknown as typeof jquery.fn.dropdown;
  });

  test('has commits from before 2001', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    expect((mainChart().config.options.scales as {x: {min: number}}).x.min).toBe(y2000);
    const daniel = chartInstances[1].config.data.datasets[0].data as Array<{x: number}>;
    expect(daniel[0].x).toBe(y2000);
  });

  test('shows the loading state while fetching', async () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));
    const {container} = renderComponent();
    await vi.waitFor(() => expect(container.querySelector('h2')).toBeTruthy());

    expect(container.querySelector('h1').textContent.trim()).toEqual('Contributors');
    expect(container.querySelector('h2').textContent.trim()).toEqual('Loading');
    expect(container.textContent).toContain('Loading info');
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('fetches the contributors data of the repo', async () => {
    const fetchSpy = mockData();
    const {container} = renderComponent();
    await loaded(container);
    expect(String(fetchSpy.mock.calls[0][0])).toEqual('/user2/repo1/activity/contributors/data');
  });

  test('retries while the server answers 202', async () => {
    const fetchSpy = mockData();
    fetchSpy.mockResolvedValueOnce({status: 202} as Response);
    const {container} = renderComponent();
    await loaded(container);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('shows the status text of a failed response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ok: false, status: 500, statusText: 'Internal Server Error'} as Response);
    const {container} = renderComponent();
    await vi.waitFor(() => expect(container.querySelector('.text.red')).toBeTruthy());

    expect(container.querySelector('h2').textContent.trim()).toEqual('Loading failed');
    expect(container.querySelector('.text.red').textContent).toContain('Internal Server Error');
    expect(container.querySelector('h1').textContent.trim()).toEqual('Contributors');
  });

  test('shows the error message when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const {container} = renderComponent();
    await vi.waitFor(() => expect(container.querySelector('.text.red')).toBeTruthy());
    expect(container.querySelector('.text.red').textContent).toContain('offline');
  });

  test('renders a since title with relative time and omits the future', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const h1 = container.querySelector('h1');
    expect(h1.textContent).toContain('Contributors since');
    expect(h1.textContent).not.toContain(' and ');
    const time = h1.querySelector('relative-time');
    expect(time.getAttribute('format')).toEqual('datetime');
    expect(time.getAttribute('datetime')).toContain('1999');
  });

  test('renders the contributor cards sorted by commits', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const cards = Array.from(container.querySelector('.contributor-grid').children);
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('b.ui.right').textContent).toEqual('#1');
    expect(cards[0].querySelector('h4').textContent.trim()).toEqual('Daniel Stenberg');
    expect(cards[0].querySelector('a').getAttribute('href')).toEqual('/daniel');
    expect(cards[0].querySelector('img.ui.avatar').getAttribute('src')).toEqual('/avatars/daniel');
    expect(cards[0].querySelector('strong a.silenced').textContent.trim()).toEqual('11 Commits');
    expect(cards[0].querySelector('.text.green').textContent).toContain('41,603');
    expect(cards[0].querySelector('.text.red').textContent).toContain('47');
    expect(cards[1].querySelector('b.ui.right').textContent).toEqual('#2');
  });

  test('contributors without a home link have no profile link', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const card = container.querySelector('.contributor-grid').children[1];
    expect(card.querySelector('h4.contributor-name').textContent.trim()).toEqual('No Home');
    expect(card.querySelector('.tw\\:ml-2 > a')).toBeNull();
  });

  test('commit link searches the default branch of the repo', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const href = container.querySelector('a.silenced').getAttribute('href');
    expect(href).toContain('/user2/repo1/commits/branch/main/search?q=');
    const query = decodeURIComponent(href.split('q=')[1].replaceAll('+', ' '));
    expect(query).toMatch(/^after:1999-12-\d\d, before:\d{4}-\d\d-\d\d, author:daniel@haxx\.se$/);
  });

  test('plots one chart for the totals and one per contributor', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    expect(chartInstances).toHaveLength(3);
    for (const chart of chartInstances) expect(chart.config.type).toEqual('line');
    const mainOptions = mainChart().config.options;
    expect((mainOptions.plugins as {title: {display: boolean}}).title.display).toBe(true);
    expect((chartInstances[1].config.options.plugins as {title: {display: boolean}}).title.display).toBe(false);
  });

  test('keeps the contributor type dropdown contract', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const dropdown = container.querySelector('#repo-contributors');
    expect(dropdown.classList.contains('ui')).toBe(true);
    expect(dropdown.classList.contains('dropdown')).toBe(true);
    expect(dropdown.querySelector('.button strong').textContent).toEqual('Commits');
    const items = Array.from(dropdown.querySelectorAll('.menu .item'));
    expect(items.map((i) => i.getAttribute('data-value'))).toEqual(['commits', 'additions', 'deletions']);
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(jquery.fn.dropdown).toHaveBeenCalledTimes(1);
  });

  test('changing the contribution type resorts and redraws', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    dropdownOptions.onChange('deletions');
    await tick();

    const dropdown = container.querySelector('#repo-contributors');
    expect(dropdown.querySelector('.button strong').textContent).toEqual('Deletions');
    const items = Array.from(dropdown.querySelectorAll('.menu .item'));
    expect(items[2].classList.contains('selected')).toBe(true);
    expect(items[0].classList.contains('selected')).toBe(false);

    const names = Array.from(container.querySelectorAll('.contributor-grid h4'), (h) => h.textContent.trim());
    expect(names).toEqual(['No Home', 'Daniel Stenberg']);

    const points = mainChart().config.data.datasets[0].data as Array<{x: number, y: number}>;
    expect(points.find((p) => p.x === y2025).y).toEqual(147);
  });

  test('zooming the main chart filters the contributors and updates the title', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const zoom = (mainChart().config.options.plugins as {zoom: {zoom: {onZoomComplete: (e: unknown) => void}}}).zoom.zoom;
    zoom.onZoomComplete({chart: {options: {scales: {x: {min: y2025 - (4 * oneWeek), max: y2025 + (4 * oneWeek)}}}}});
    await tick();

    const names = Array.from(container.querySelectorAll('.contributor-grid h4'), (h) => h.textContent.trim());
    expect(names).toEqual(['Daniel Stenberg', 'No Home']);
    expect(container.querySelector('a.silenced').textContent.trim()).toEqual('10 Commits');
    expect(container.querySelector('h1').textContent).toContain('Contributors between');
    expect(container.querySelectorAll('h1 relative-time')).toHaveLength(2);
  });

  test('zooming to a range without contributions removes the cards', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const zoom = (mainChart().config.options.plugins as {zoom: {zoom: {onZoomComplete: (e: unknown) => void}}}).zoom.zoom;
    zoom.onZoomComplete({chart: {options: {scales: {x: {min: y2000 + (100 * oneWeek), max: y2000 + (110 * oneWeek)}}}}});
    await tick();

    expect(container.querySelector('.contributor-grid').children).toHaveLength(0);
  });

  test('resetting the zoom restores the full range', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const plugins = mainChart().config.options.plugins as {
      zoom: {zoom: {onZoomComplete: (e: unknown) => void}},
      customEventListener: {instance: {updateOtherCharts: (e: unknown, reset?: boolean) => void}},
    };
    plugins.zoom.zoom.onZoomComplete({chart: {options: {scales: {x: {min: y2025 - oneWeek, max: y2025 + oneWeek}}}}});
    await tick();
    expect(container.querySelector('.contributor-grid').children).toHaveLength(2);
    expect(container.querySelector('a.silenced').textContent.trim()).toEqual('10 Commits');

    plugins.customEventListener.instance.updateOtherCharts({chart: {options: {scales: {x: {}}}}}, true);
    await tick();
    expect(container.querySelector('a.silenced').textContent.trim()).toEqual('11 Commits');
    expect(container.querySelector('h1').textContent).not.toContain(' and ');
  });

  test('the plugin reference is not a plain object so chart.js does not treat it as scriptable options', async () => {
    mockData();
    const {container} = renderComponent();
    await loaded(container);

    const instance = (mainChart().config.options.plugins as {customEventListener: {instance: object}}).customEventListener.instance;
    expect(Object.getPrototypeOf(instance)).not.toBe(Object.prototype);
  });
});
