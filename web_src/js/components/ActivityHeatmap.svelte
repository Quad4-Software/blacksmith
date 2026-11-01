<script lang="ts" module>
export interface HeatmapValue {
  date: Date;
  count: number;
}

export interface HeatmapLocale {
  months: string[];
  days: string[];
  contributions_in_the_last_12_months?: string;
  contributions_zero?: string;
  contributions_format?: string;
  contributions_one?: string;
  contributions_few?: string;
  more?: string;
  less?: string;
}

export interface CalendarDay {
  date: Date;
  count: number | undefined;
  colorIndex: number;
}

export interface MonthMarker {
  value: number;
  index: number;
}

const DAYS_IN_ONE_YEAR = 365;
const DAYS_IN_WEEK = 7;

const SQUARE_BASE_SIZE = 10;
const SQUARE_BORDER_SIZE = SQUARE_BASE_SIZE / 5;
const SQUARE_SIZE = SQUARE_BASE_SIZE + SQUARE_BORDER_SIZE;
const LEFT_SECTION_WIDTH = Math.ceil(SQUARE_BASE_SIZE * 2.5);
const TOP_SECTION_HEIGHT = SQUARE_BASE_SIZE + (SQUARE_BASE_SIZE / 2);

const COLOR_RANGE = [
  'var(--color-secondary-alpha-60)',
  'var(--color-secondary-alpha-60)',
  'var(--color-primary-light-4)',
  'var(--color-primary-light-2)',
  'var(--color-primary)',
  'var(--color-primary-dark-2)',
  'var(--color-primary-dark-4)',
];

function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function dayKey(date: Date): string {
  return String(date.getFullYear()) + String(date.getMonth()).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
}

export function getColorIndex(count: number | undefined, max: number): number {
  if (count == null) return 0;
  if (count <= 0) return 1;
  if (count >= max) return 5;
  return Math.ceil(count * 100 / max * 0.03) + 1;
}

export function buildCalendar(endDate: Date, values: HeatmapValue[]) {
  const max = Math.ceil(Math.max(...values.map((v) => v.count)) / 5 * 4);
  const startDate = shiftDate(endDate, -DAYS_IN_ONE_YEAR);

  const activities = new Map<string, {count: number, colorIndex: number}>();
  for (const value of values) {
    activities.set(dayKey(value.date), {count: value.count, colorIndex: getColorIndex(value.count, max)});
  }

  const emptyDaysAtStart = startDate.getDay();
  const emptyDaysAtEnd = DAYS_IN_WEEK - 1 - endDate.getDay();
  const weekCount = (DAYS_IN_ONE_YEAR + 1 + emptyDaysAtStart + emptyDaysAtEnd) / DAYS_IN_WEEK;

  const first = shiftDate(startDate, -emptyDaysAtStart);
  const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const calendar: CalendarDay[][] = [];
  for (let week = 0; week < weekCount; week++) {
    const days: CalendarDay[] = [];
    for (let day = 0; day < DAYS_IN_WEEK; day++) {
      const activity = activities.get(dayKey(cursor));
      days.push({
        date: new Date(cursor.valueOf()),
        count: activity ? activity.count : undefined,
        colorIndex: activity ? activity.colorIndex : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    calendar.push(days);
  }

  const firstFullWeekOfMonths: MonthMarker[] = [];
  for (let week = 1; week < calendar.length; week++) {
    const prev = calendar[week - 1][0].date;
    const cur = calendar[week][0].date;
    if (prev.getFullYear() < cur.getFullYear() || prev.getMonth() < cur.getMonth()) {
      firstFullWeekOfMonths.push({value: cur.getMonth(), index: week});
    }
  }

  return {calendar, firstFullWeekOfMonths, weekCount};
}
</script>

<script lang="ts">
import tippy, {createSingleton, type CreateSingletonInstance, type Instance} from 'tippy.js';
import {useEventListener} from 'runed';

interface Props {
  values?: HeatmapValue[];
  locale: HeatmapLocale;
}

const {values = [], locale}: Props = $props();

const endDate = new Date();
const now = new Date();

const heatmap = $derived(buildCalendar(endDate, values));

const width = $derived(LEFT_SECTION_WIDTH + (SQUARE_SIZE * heatmap.weekCount) + SQUARE_BORDER_SIZE);
const height = TOP_SECTION_HEIGHT + (SQUARE_SIZE * DAYS_IN_WEEK);
const viewBox = $derived(` 0 0 ${width} ${height}`);

const dayLabels = [
  {index: 1, y: 20},
  {index: 3, y: 44},
  {index: 5, y: 69},
];

let svgElement: SVGSVGElement | undefined = $state();
const tippyInstances = new Map<Element, Instance>();
let tippySingleton: CreateSingletonInstance | undefined;

function tooltipContent(day: CalendarDay): string | undefined {
  if (day.count !== undefined) {
    return locale.contributions_format
      .replace(
        '{contributions}',
        `<b>${day.count} ${day.count === 1 ? locale.contributions_one : locale.contributions_few}</b>`,
      )
      .replace('{month}', locale.months[day.date.getMonth()])
      .replace('{day}', String(day.date.getDate()))
      .replace('{year}', String(day.date.getFullYear()));
  }
  if (locale.contributions_zero) return locale.contributions_zero;
  return `<b>No contributions</b> on ${locale.months[day.date.getMonth()]} ${day.date.getDate()}, ${day.date.getFullYear()}`;
}

function resetTippy() {
  for (const instance of tippyInstances.values()) instance.destroy();
  tippyInstances.clear();
  tippySingleton?.setInstances([]);
}

$effect(() => {
  tippySingleton = createSingleton([], {
    overrides: [],
    moveTransition: 'transform 0.1s ease-out',
    allowHTML: true,
  });
  return () => {
    tippySingleton?.destroy();
    tippySingleton = undefined;
    for (const instance of tippyInstances.values()) instance.destroy();
    tippyInstances.clear();
  };
});

$effect(() => {
  void heatmap;
  void values;
  void locale;
  resetTippy();
});

function squareFromEvent(e: Event): {weekIndex: number, dayIndex: number, target: SVGElement} | undefined {
  const target = e.target as SVGElement | null;
  if (!target?.classList?.contains('vch__day__square')) return undefined;
  if (target.dataset.weekIndex === undefined || target.dataset.dayIndex === undefined) return undefined;
  const weekIndex = Number(target.dataset.weekIndex);
  const dayIndex = Number(target.dataset.dayIndex);
  if (Number.isNaN(weekIndex) || Number.isNaN(dayIndex)) return undefined;
  return {weekIndex, dayIndex, target};
}

function handleDayHover(e: MouseEvent) {
  if (!tippySingleton) return;
  const square = squareFromEvent(e);
  if (!square) return;
  const content = tooltipContent(heatmap.calendar[square.weekIndex][square.dayIndex]);
  if (!content) return;
  const instance = tippyInstances.get(square.target);
  if (instance) {
    instance.setContent(content);
  } else {
    tippyInstances.set(square.target, tippy(square.target, {content}));
    tippySingleton.setInstances(Array.from(tippyInstances.values()));
  }
}

function handleDayClick(e: MouseEvent) {
  const square = squareFromEvent(e);
  if (!square) return;
  const day = heatmap.calendar[square.weekIndex][square.dayIndex];

  // Reset filter if same date is clicked
  const params = new URLSearchParams(document.location.search);
  const queryDate = params.get('date');
  // Timezone has to be stripped because toISOString() converts to UTC
  const clickedDate = new Date(day.date.getTime() - (day.date.getTimezoneOffset() * 60000)).toISOString().substring(0, 10);

  if (queryDate && queryDate === clickedDate) {
    params.delete('date');
  } else {
    params.set('date', clickedDate);
  }

  params.delete('page');

  const newSearch = params.toString();
  window.location.search = newSearch.length ? `?${newSearch}` : '';
}

useEventListener(() => svgElement, 'mouseover', handleDayHover);
useEventListener(() => svgElement, 'click', handleDayClick);
</script>

<div class="total-contributions">
  {locale.contributions_in_the_last_12_months}
</div>
<div class="vch__container">
  <svg class="vch__wrapper" bind:this={svgElement} {viewBox}>
    <g class="vch__months__labels__wrapper" transform="translate({LEFT_SECTION_WIDTH}, 0)">
      {#each heatmap.firstFullWeekOfMonths as month, index (index)}
        <text class="vch__month__label" x={SQUARE_SIZE * month.index} y={SQUARE_SIZE - SQUARE_BORDER_SIZE}>
          {locale.months[month.value]}
        </text>
      {/each}
    </g>

    <g class="vch__days__labels__wrapper" transform="translate(0, {TOP_SECTION_HEIGHT})">
      {#each dayLabels as label (label.index)}
        <text class="vch__day__label" x="0" y={label.y}>
          {locale.days[label.index]}
        </text>
      {/each}
    </g>

    <g class="vch__year__wrapper" transform="translate({LEFT_SECTION_WIDTH}, {TOP_SECTION_HEIGHT})">
      {#each heatmap.calendar as week, weekIndex (weekIndex)}
        <g class="vch__month__wrapper" transform="translate({weekIndex * SQUARE_SIZE}, 0)">
          {#each week as day, dayIndex (dayIndex)}
            {#if day.date < now}
              <rect
                class="vch__day__square"
                transform="translate(0, {dayIndex * SQUARE_SIZE})"
                width={SQUARE_SIZE - SQUARE_BORDER_SIZE}
                height={SQUARE_SIZE - SQUARE_BORDER_SIZE}
                style:fill={COLOR_RANGE[day.colorIndex]}
                data-week-index={weekIndex}
                data-day-index={dayIndex}
              />
            {/if}
          {/each}
        </g>
      {/each}
    </g>
  </svg>
  <div class="vch__legend">
    <div class="vch__legend-left"></div>
    <div class="vch__legend-right">
      <div class="vch__legend">
        <div>{locale.less}</div>
        <!-- the first legend color is rendered twice, so the viewBox is shifted to cut it off -->
        <svg class="vch__external-legend-wrapper" viewBox="12 0 80 10" height={SQUARE_SIZE - SQUARE_BORDER_SIZE} style:margin-right="-12px">
          <g class="vch__legend__wrapper">
            {#each COLOR_RANGE as color, index (index)}
              <rect
                style:fill={color}
                width={SQUARE_SIZE - SQUARE_BORDER_SIZE}
                height={SQUARE_SIZE - SQUARE_BORDER_SIZE}
                x={SQUARE_SIZE * index}
              />
            {/each}
          </g>
        </svg>
        <div>{locale.more}</div>
      </div>
    </div>
  </div>
</div>
