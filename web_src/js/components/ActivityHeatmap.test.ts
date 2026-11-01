import {afterEach, describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import {tick} from 'svelte';
// tsc cannot see named exports of .svelte modules; svelte-check types them
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- an expect-error would fail in svelte-check where the exports are visible
// @ts-ignore
import ActivityHeatmap, {buildCalendar, getColorIndex, type HeatmapLocale} from './ActivityHeatmap.svelte';

const locale: HeatmapLocale = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  contributions_in_the_last_12_months: '12 contributions in the last 12 months',
  contributions_zero: 'No contributions',
  contributions_format: '{contributions} on {month} {day}, {year}',
  contributions_one: 'contribution',
  contributions_few: 'contributions',
  more: 'More',
  less: 'Less',
};

function daysAgo(n: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - n);
  return date;
}

function formatDate(date: Date): string {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().substring(0, 10);
}

function mockLocationSearch(initial: string) {
  const setSearch = vi.fn();
  const originalLocation = window.location;
  const originalUrl = window.location.href;
  window.history.replaceState({}, '', `/${initial}`);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get search() { return originalLocation.search },
      set search(v: string) { setSearch(v) },
    },
  });
  return {
    setSearch,
    restore: () => {
      Object.defineProperty(window, 'location', {configurable: true, value: originalLocation});
      window.history.replaceState({}, '', originalUrl);
    },
  };
}

function squareOf(container: HTMLElement, target: Date, count: number): Element {
  const {calendar} = buildCalendar(new Date(), [{date: target, count}]);
  const weekIndex = calendar.findIndex((w) => w.some((d) => d.date.getTime() === target.getTime()));
  const dayIndex = calendar[weekIndex].findIndex((d) => d.date.getTime() === target.getTime());
  return container.querySelector(`rect[data-week-index="${weekIndex}"][data-day-index="${dayIndex}"]`);
}

describe('buildCalendar', () => {
  test('covers a full year in whole weeks starting on sunday', () => {
    const end = new Date(2024, 6, 15);
    const {calendar, weekCount} = buildCalendar(end, []);
    expect(calendar.length).toEqual(weekCount);
    expect(Number.isInteger(weekCount)).toBeTruthy();
    expect(calendar[0][0].date.getDay()).toEqual(0);
    expect(calendar.at(-1).at(-1).date.getDay()).toEqual(6);
    const days = calendar.flat().map((d) => d.date.getTime());
    expect(new Set(days).size).toEqual(days.length);
  });

  test('maps values to days and color levels', () => {
    const end = new Date(2024, 6, 15);
    const {calendar} = buildCalendar(end, [
      {date: new Date(2024, 6, 1), count: 10},
      {date: new Date(2024, 6, 2), count: 1},
    ]);
    const flat = calendar.flat();
    const big = flat.find((d) => d.date.getMonth() === 6 && d.date.getDate() === 1);
    const small = flat.find((d) => d.date.getMonth() === 6 && d.date.getDate() === 2);
    const none = flat.find((d) => d.date.getMonth() === 6 && d.date.getDate() === 3);
    expect(big.count).toEqual(10);
    expect(big.colorIndex).toEqual(5);
    expect(small.count).toEqual(1);
    expect(small.colorIndex).toBeGreaterThan(1);
    expect(none.count).toBeUndefined();
    expect(none.colorIndex).toEqual(0);
  });

  test('lists the first full week of each month', () => {
    const {firstFullWeekOfMonths, calendar} = buildCalendar(new Date(2024, 6, 15), []);
    expect(firstFullWeekOfMonths.length).toBeGreaterThanOrEqual(11);
    for (const month of firstFullWeekOfMonths) {
      expect(calendar[month.index][0].date.getMonth()).toEqual(month.value);
      expect(calendar[month.index - 1][0].date.getMonth()).not.toEqual(month.value);
    }
  });
});

describe('getColorIndex', () => {
  test('levels', () => {
    expect(getColorIndex(undefined, 10)).toEqual(0);
    expect(getColorIndex(0, 10)).toEqual(1);
    expect(getColorIndex(10, 10)).toEqual(5);
    expect(getColorIndex(100, 10)).toEqual(5);
    expect(getColorIndex(1, 10)).toEqual(2);
  });
});

describe('ActivityHeatmap', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test.each([
    ['sunday', new Date(2026, 10, 1, 12)],
    ['wednesday', new Date(2026, 10, 4, 12)],
    ['saturday', new Date(2026, 9, 31, 12)],
  ])('renders the expected square count when today is a %s', (_name, today) => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
    const {container, unmount} = render(ActivityHeatmap, {props: {values: [], locale}});
    const squares = container.querySelectorAll('rect.vch__day__square');
    const start = new Date(today);
    start.setDate(start.getDate() - 365);
    expect(squares.length).toEqual(366 + start.getDay());
    unmount();
  });

  test('renders total text, labels, squares and legend', () => {
    const {container} = render(ActivityHeatmap, {props: {values: [{date: daysAgo(3), count: 4}], locale}});
    expect(container.querySelector('.total-contributions').textContent.trim()).toEqual(locale.contributions_in_the_last_12_months);

    const monthLabels = Array.from(container.querySelectorAll('.vch__month__label'), (e) => e.textContent.trim());
    expect(monthLabels.length).toBeGreaterThanOrEqual(11);
    for (const label of monthLabels) expect(locale.months).toContain(label);

    const dayLabels = Array.from(container.querySelectorAll('.vch__day__label'), (e) => e.textContent.trim());
    expect(dayLabels).toEqual(['Mon', 'Wed', 'Fri']);

    const squares = container.querySelectorAll('rect.vch__day__square');
    const start = new Date();
    start.setDate(start.getDate() - 365);
    expect(squares.length).toEqual(366 + start.getDay());

    const legend = container.querySelector('.vch__legend .vch__legend');
    expect(legend.textContent).toContain('Less');
    expect(legend.textContent).toContain('More');
    expect(legend.querySelectorAll('rect').length).toEqual(7);
    expect(container.querySelector('.vch__external-legend-wrapper').getAttribute('viewBox')).toEqual('12 0 80 10');
  });

  test('does not render future days', () => {
    const {container} = render(ActivityHeatmap, {props: {values: [], locale}});
    const lastSquare = Array.from(container.querySelectorAll<SVGElement>('rect.vch__day__square')).at(-1);
    const week = Number(lastSquare.dataset.weekIndex);
    const day = Number(lastSquare.dataset.dayIndex);
    const {calendar} = buildCalendar(new Date(), []);
    expect(calendar[week][day].date.getTime()).toBeLessThan(Date.now());
  });

  test('colors squares by level', () => {
    const {container} = render(ActivityHeatmap, {props: {values: [{date: daysAgo(2), count: 7}, {date: daysAgo(5), count: 1}], locale}});
    const fills = new Set(Array.from(container.querySelectorAll<SVGElement>('rect.vch__day__square'), (r) => r.style.fill));
    expect(fills.size).toBeGreaterThanOrEqual(3);
    expect(Array.from(fills).some((f) => f.includes('--color-primary-dark-2'))).toBeTruthy();
  });

  test('renders without values', () => {
    const {container} = render(ActivityHeatmap, {props: {locale}});
    expect(container.querySelectorAll('rect.vch__day__square').length).toBeGreaterThan(300);
  });

  test('click on a day sets the date filter and drops page', async () => {
    const {setSearch, restore} = mockLocationSearch('?page=3&foo=bar');
    try {
      const target = daysAgo(2);
      const {container} = render(ActivityHeatmap, {props: {values: [{date: target, count: 2}], locale}});
      await tick();
      squareOf(container, target, 2).dispatchEvent(new MouseEvent('click', {bubbles: true}));
      expect(setSearch).toHaveBeenCalledWith(`?foo=bar&date=${formatDate(target)}`);
    } finally {
      restore();
    }
  });

  test('click on the active date clears the filter', async () => {
    const target = daysAgo(4);
    const {setSearch, restore} = mockLocationSearch(`?date=${formatDate(target)}`);
    try {
      const {container} = render(ActivityHeatmap, {props: {values: [{date: target, count: 2}], locale}});
      await tick();
      squareOf(container, target, 2).dispatchEvent(new MouseEvent('click', {bubbles: true}));
      expect(setSearch).toHaveBeenCalledWith('');
    } finally {
      restore();
    }
  });

  test('hover creates a tooltip with the formatted text', async () => {
    const target = daysAgo(2);
    const {container} = render(ActivityHeatmap, {props: {values: [{date: target, count: 1}], locale}});
    await tick();
    const square = squareOf(container, target, 1) as SVGElement & {_tippy?: {props: {content: string}}};
    square.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    expect(square._tippy.props.content).toEqual(`<b>1 contribution</b> on ${locale.months[target.getMonth()]} ${target.getDate()}, ${target.getFullYear()}`);
  });

  test('hover on an empty day shows the zero text', async () => {
    const {container} = render(ActivityHeatmap, {props: {values: [], locale}});
    await tick();
    const square = container.querySelector('rect.vch__day__square') as SVGElement & {_tippy?: {props: {content: string}}};
    square.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    expect(square._tippy.props.content).toEqual('No contributions');
  });
});
