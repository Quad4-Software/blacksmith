<script lang="ts" module>
export interface WeekStats {
  week: number;
  additions: number;
  deletions: number;
  commits: number;
}

export interface Contributor {
  name: string;
  home_link: string;
  avatar_link: string;
  email?: string;
  weeks: WeekStats[];
  total_commits: number;
  total_additions: number;
  total_deletions: number;
  max_contribution_type: number;
}

export interface ChartEvent {
  chart: {options: {scales: {x: {min?: number, max?: number}}}};
}

// chart.js resolves plain objects found in plugin options as scriptable option containers,
// so the reference handed to the plugin must not be a plain object
class ChartEventTarget {
  updateOtherCharts: (event: ChartEvent, reset?: boolean) => void;

  constructor(updateOtherCharts: (event: ChartEvent, reset?: boolean) => void) {
    this.updateOtherCharts = updateOtherCharts;
  }
}
</script>

<script lang="ts">
import {onMount, untrack} from 'svelte';
import SvgIcon from './SvgIcon.svelte';
import dayjs from 'dayjs';
import {
  Chart as ChartJS,
  LineController,
  Title,
  BarElement,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import {GET} from '../modules/fetch.ts';
import zoomPlugin from 'chartjs-plugin-zoom';
import Chart from './Chart.svelte';
import {
  startDaysBetween,
  firstStartDateAfterDate,
  fillEmptyStartDaysWithZeroes,
} from '../utils/time.js';
import {chartJsColors} from '../utils/color.ts';
import {sleep} from '../utils.ts';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';
import jquery from 'jquery';
import {pathEscapeSegments} from '../utils/url.ts';

const customEventListener = {
  id: 'customEventListener',
  afterEvent: (chart, args, opts) => {
    // event will be replayed from chart.update when reset zoom,
    // so we need to check whether args.replay is true to avoid call loops
    if (args.event.type === 'dblclick' && opts.chartType === 'main' && !args.replay) {
      chart.resetZoom();
      opts.instance.updateOtherCharts(args.event, true);
    }
  },
};

ChartJS.defaults.color = chartJsColors.text;
ChartJS.defaults.borderColor = chartJsColors.border;

ChartJS.register(
  LineController,
  TimeScale,
  LinearScale,
  BarElement,
  Title,
  PointElement,
  LineElement,
  Filler,
  zoomPlugin,
  customEventListener,
);

interface Props {
  locale: {
    filterLabel: string;
    contributionType: {commits: string, additions: string, deletions: string};
    contributorsTitle: string;
    contributorsBetweenTitle: string;
    contributorsSinceTitle: string;
    loadingTitle: string;
    loadingTitleFailed: string;
    loadingInfo: string;
  };
  repoLink: string;
  repoDefaultBranchName: string;
}

const {locale, repoLink, repoDefaultBranchName}: Props = $props();

type ContributionType = 'commits' | 'additions' | 'deletions';
type TotalStats = {weeks?: WeekStats[]};

let isLoading = $state(false);
let errorText = $state('');
let totalStats: TotalStats = $state.raw({});
let sortedContributors: Contributor[] = $state.raw([]);
let type: ContributionType = $state('commits');
let xAxisStart: number | null = $state(null);
let xAxisEnd: number | null = $state(null);
let xAxisMin: number | null = $state(null);
let xAxisMax: number | null = $state(null);
let contributorsStats: Record<string, Contributor> = {};

let dropdownElement: HTMLDivElement | undefined = $state();

/**
 * Composes HTML of a `<relative-time>` element from the given date-time value.
 */
function relativeTimeHTML(datetime: Date): string {
  if (!(datetime instanceof Date)) {
    // Defense-in-depth: until we have tsc checking this for us, we should take care not to allow interpolating untrusted text into HTML.
    // A Date instance always stringifies safely.
    return '';
  }
  return `<relative-time
    format="datetime"
    year="numeric"
    month="short"
    day="numeric"
    weekday=""
    datetime="${datetime}"
  >${datetime}</relative-time>`;
}

const processedTitleHTML = $derived.by(() => {
  if (typeof xAxisMin !== 'number' || xAxisMin <= 0) {
    // a repo's contributions, if there are any, always have a known absolute min, so this not being the case is cause to bail early
    return '';
  }
  const min = new Date(xAxisMin);

  if (typeof xAxisMax !== 'number' || xAxisMax <= 0) {
    // the end date could very well be omittted; this implies a "since" situation
    return locale.contributorsSinceTitle
      .replace('{0}', relativeTimeHTML(min));
  }
  const max = new Date(xAxisMax);
  const now = new Date();

  if (max > now) {
    // contributions are unlikely to be from the future
    return locale.contributorsSinceTitle
      .replace('{0}', relativeTimeHTML(min));
  }

  return locale.contributorsBetweenTitle
    .replace('{0}', relativeTimeHTML(min))
    .replace('{1}', relativeTimeHTML(max));
});

function sortContributors() {
  const contributors = filterContributorWeeksByDateRange();
  const criteria = `total_${type}`;
  sortedContributors = Object.values(contributors)
    .filter((contributor) => contributor[criteria] !== 0)
    .sort((a, b) => a[criteria] > b[criteria] ? -1 : a[criteria] === b[criteria] ? 0 : 1)
    .slice(0, 100);
}

function getContributorSearchQuery(contributorEmail: string): string {
  const min = dayjs(xAxisMin).format('YYYY-MM-DD');
  const max = dayjs(xAxisMax).format('YYYY-MM-DD');
  const params = new URLSearchParams({
    'q': `after:${min}, before:${max}, author:${contributorEmail}`,
  });
  return `${repoLink}/commits/branch/${pathEscapeSegments(repoDefaultBranchName)}/search?${params.toString()}`;
}

async function fetchGraphData() {
  isLoading = true;
  try {
    let response: Response;
    do {
      response = await GET(`${repoLink}/activity/contributors/data`);
      if (response.status === 202) {
        await sleep(1000); // wait for 1 second before retrying
      }
    } while (response.status === 202);
    if (response.ok) {
      const data = await response.json();
      const {total, ...rest} = data;
      // below line might be deleted if we are sure go produces map always sorted by keys
      total.weeks = Object.fromEntries(Object.entries(total.weeks).map((x) => [parseInt(x[0]), x[1]]).sort((a, b) => (a[0] as number) - (b[0] as number)));

      const weekValues = Object.values(total.weeks) as WeekStats[];
      xAxisStart = weekValues[0].week;
      xAxisEnd = firstStartDateAfterDate(new Date());
      const startDays = startDaysBetween(xAxisStart, xAxisEnd);
      total.weeks = fillEmptyStartDaysWithZeroes(startDays, total.weeks);
      xAxisMin = xAxisStart;
      xAxisMax = xAxisEnd;
      contributorsStats = {};
      for (const [email, user] of Object.entries<Contributor>(rest)) {
        user.weeks = fillEmptyStartDaysWithZeroes(startDays, user.weeks);
        contributorsStats[email] = user;
      }
      sortContributors();
      totalStats = total;
      errorText = '';
    } else {
      errorText = response.statusText;
    }
  } catch (err) {
    errorText = err.message;
  } finally {
    isLoading = false;
  }
}

function filterContributorWeeksByDateRange(): Record<string, Contributor> {
  const filteredData: Record<string, Contributor> = {};
  const data = contributorsStats;
  for (const key of Object.keys(data)) {
    const user = data[key];
    user.total_commits = 0;
    user.total_additions = 0;
    user.total_deletions = 0;
    user.max_contribution_type = 0;
    const filteredWeeks = user.weeks.filter((week) => {
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (week.week >= xAxisMin - oneWeek && week.week <= xAxisMax + oneWeek) {
        user.total_commits += week.commits;
        user.total_additions += week.additions;
        user.total_deletions += week.deletions;
        if (week[type] > user.max_contribution_type) {
          user.max_contribution_type = week[type];
        }
        return true;
      }
      return false;
    });
    // this line is required. See https://github.com/sahinakkaya/gitea/pull/3#discussion_r1396495722
    // for details.
    user.max_contribution_type += 1;

    filteredData[key] = {...user, weeks: filteredWeeks, email: key};
  }

  return filteredData;
}

function roundUpMax(maxValue: number): number {
  const [coefficient, exp] = maxValue.toExponential().split('e').map(Number);
  if (coefficient % 1 === 0) return maxValue;
  return (1 - (coefficient % 1)) * 10 ** exp + maxValue;
}

// This function calculates maximum value for Y value of the main graph. If the number
// of maximum contributions for selected contribution type is 15.955 it is probably
// better to round it up to 20.000.This function is responsible for doing that.
// Normally, chartjs handles this automatically, but it will resize the graph when you
// zoom, pan etc. I think resizing the graph makes it harder to compare things visually.
function maxMainGraph(): number {
  return roundUpMax(Math.max(...totalStats.weeks.map((o) => o[type])));
}

// Similar to maxMainGraph this function calculates maximum value for Y value
// for contributors' graph. If I let chartjs do this for me, it will choose different
// maxY value for each contributors' graph which again makes it harder to compare.
function maxContributorGraph(): number {
  return roundUpMax(Math.max(...sortedContributors.map((c) => c.max_contribution_type)));
}

function toGraphData(weeks: WeekStats[]): ChartData<'line'> {
  return {
    datasets: [
      {
        data: weeks.map((i) => ({x: i.week, y: i[type]})),
        pointRadius: 0,
        pointHitRadius: 0,
        fill: 'start',
        backgroundColor: chartJsColors[type],
        borderWidth: 0,
        tension: 0.3,
      },
    ],
  };
}

function updateOtherCharts(event: ChartEvent, reset?: boolean) {
  const minVal = event.chart.options.scales.x.min;
  const maxVal = event.chart.options.scales.x.max;
  if (reset) {
    xAxisMin = xAxisStart;
    xAxisMax = xAxisEnd;
    sortContributors();
  } else if (minVal) {
    xAxisMin = minVal;
    xAxisMax = maxVal;
    sortContributors();
  }
}

const eventTarget = new ChartEventTarget(updateOtherCharts);

function getOptions(chartType: 'main' | 'contributor'): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'dblclick'],
    plugins: {
      title: {
        display: chartType === 'main',
        text: 'drag: zoom, shift+drag: pan, double click: reset zoom',
        position: 'top',
        align: 'center',
      },
      customEventListener: {
        chartType,
        instance: eventTarget,
      },
      zoom: {
        pan: {
          enabled: true,
          modifierKey: 'shift',
          mode: 'x',
          threshold: 20,
          onPanComplete: updateOtherCharts,
        },
        limits: {
          x: {
            // Check https://www.chartjs.org/chartjs-plugin-zoom/latest/guide/options.html#scale-limits
            // to know what each option means
            min: 'original',
            max: 'original',

            // number of milliseconds in 2 weeks. Minimum x range will be 2 weeks when you zoom on the graph
            minRange: 2 * 7 * 24 * 60 * 60 * 1000,
          },
        },
        zoom: {
          drag: {
            enabled: chartType === 'main',
          },
          pinch: {
            enabled: chartType === 'main',
          },
          mode: 'x',
          onZoomComplete: updateOtherCharts,
        },
      },
    },
    scales: {
      x: {
        min: xAxisMin,
        max: xAxisMax,
        type: 'time',
        grid: {
          display: false,
        },
        time: {
          minUnit: 'month',
        },
        ticks: {
          maxRotation: 0,
          maxTicksLimit: chartType === 'main' ? 12 : 6,
        },
      },
      y: {
        min: 0,
        max: chartType === 'main' ? maxMainGraph() : maxContributorGraph(),
        ticks: {
          maxTicksLimit: chartType === 'main' ? 6 : 4,
        },
      },
    },
  } as unknown as ChartOptions<'line'>;
}

const hasTotalStats = $derived(Object.keys(totalStats).length !== 0);

// the main graph is only rebuilt when the totals or the contribution type change, not when the x axis range changes
const mainGraphData = $derived(hasTotalStats ? toGraphData(totalStats.weeks) : null);
const mainGraphOptions = $derived.by(() => {
  if (!hasTotalStats) return null;
  void totalStats.weeks;
  void type;
  return untrack(() => getOptions('main'));
});

onMount(() => {
  fetchGraphData();

  jquery(dropdownElement).dropdown({
    onChange: (val: ContributionType) => {
      xAxisMin = xAxisStart;
      xAxisMax = xAxisEnd;
      type = val;
      sortContributors();
    },
  });
});
</script>

<div>
  <div class="tw:flex tw:items-center tw:justify-between">
    {#if isLoading || errorText}
      <h1 class="tw:m-0">
        {locale.contributorsTitle}
      </h1>
    {:else}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- the string interpolates checked Date instances into a locale template, never arbitrary user-provided strings -->
      <h1 class="tw:m-0">{@html processedTitleHTML}</h1>
    {/if}

    <!-- Contribution type -->
    <div class="ui dropdown jump" id="repo-contributors" bind:this={dropdownElement}>
      <div class="ui basic compact button">
        <span class="not-mobile">{locale.filterLabel}</span> <strong>{locale.contributionType[type]}</strong>
        <SvgIcon name="octicon-triangle-down" size={14}/>
      </div>
      <div class="menu">
        <div class="item" class:selected={type === 'commits'} data-value="commits">
          {locale.contributionType.commits}
        </div>
        <div class="item" class:selected={type === 'additions'} data-value="additions">
          {locale.contributionType.additions}
        </div>
        <div class="item" class:selected={type === 'deletions'} data-value="deletions">
          {locale.contributionType.deletions}
        </div>
      </div>
    </div>
  </div>
  <div class="tw:flex ui segment main-graph">
    {#if isLoading || errorText !== ''}
      <div class="gt-tc tw:m-auto">
        {#if isLoading}
          <h2>
            {locale.loadingTitle}
          </h2>
        {:else if errorText}
          <h2>
            {locale.loadingTitleFailed}
          </h2>
        {/if}
        {#if isLoading}
          <div class="tw:flex tw:justify-center">
            <SvgIcon name="octicon-sync" class="tw:mr-2 job-status-rotate"/>
            {locale.loadingInfo}
          </div>
        {:else}
          <div class="text red tw:flex tw:justify-center">
            <SvgIcon name="octicon-x-circle-fill" class="tw:mr-2"/>
            {errorText}
          </div>
        {/if}
      </div>
    {/if}
    {#if hasTotalStats}
      <Chart type="line" data={mainGraphData} options={mainGraphOptions}/>
    {/if}
  </div>
  <div class="contributor-grid">
    {#each sortedContributors as contributor, index (index)}
      <div>
        <div class="ui top attached header tw:flex tw:flex-1">
          <b class="ui right">#{index + 1}</b>
          <a href={contributor.home_link}>
            <img class="ui avatar tw:align-middle" height="40" width="40" src={contributor.avatar_link} alt="" loading="lazy">
          </a>
          <div class="tw:ml-2">
            {#if contributor.home_link !== ''}
              <a href={contributor.home_link}><h4>{contributor.name}</h4></a>
            {:else}
              <h4 class="contributor-name">
                {contributor.name}
              </h4>
            {/if}
            <p class="tw:text-12 tw:flex tw:gap-1">
              {#if contributor.total_commits}
                <strong>
                  <a class="silenced" href={getContributorSearchQuery(contributor.email)}>
                    {contributor.total_commits.toLocaleString()} {locale.contributionType.commits}
                  </a>
                </strong>
              {/if}
              {#if contributor.total_additions}
                <strong class="text green">{contributor.total_additions.toLocaleString()}&plus;&plus; </strong>
              {/if}
              {#if contributor.total_deletions}
                <strong class="text red">
                  {contributor.total_deletions.toLocaleString()}&minus;&minus;</strong>
              {/if}
            </p>
          </div>
        </div>
        <div class="ui attached segment">
          <div>
            <Chart type="line" data={toGraphData(contributor.weeks)} options={getOptions('contributor')}/>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
.main-graph {
  height: 260px;
  padding-top: 2px;
  cursor: pointer;
}

h2 {
  text-align: center;
}

.contributor-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.contributor-grid > * {
  min-width: 0;
}

@media (max-width: 991.98px) {
  .contributor-grid {
    grid-template-columns: repeat(1, 1fr);
  }
}

.contributor-name {
  margin-bottom: 0;
}
</style>
