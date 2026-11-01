<script lang="ts">
import {onMount} from 'svelte';
import SvgIcon from './SvgIcon.svelte';
import {
  Chart as ChartJS,
  BarController,
  Tooltip,
  BarElement,
  LinearScale,
  TimeScale,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import Chart from './Chart.svelte';
import {GET} from '../modules/fetch.ts';
import {
  startDaysBetween,
  firstStartDateAfterDate,
  fillEmptyStartDaysWithZeroes,
} from '../utils/time.js';
import {chartJsColors} from '../utils/color.ts';
import {sleep} from '../utils.ts';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';

ChartJS.defaults.color = chartJsColors.text;
ChartJS.defaults.borderColor = chartJsColors.border;

ChartJS.register(
  BarController,
  TimeScale,
  LinearScale,
  BarElement,
  Tooltip,
);

interface WeekData {
  week: number;
  commits: number;
}

interface Props {
  locale: {
    loadingTitle: string;
    loadingTitleFailed: string;
    recentCommitsTitle: string;
    loadingInfo: string;
  };
}

const {locale}: Props = $props();

const repoLink = (window.config.pageData.repoLink as string) || '';

let isLoading = $state(false);
let errorText = $state('');
let data: WeekData[] = $state.raw([]);

async function fetchGraphData() {
  isLoading = true;
  try {
    let response: Response;
    do {
      response = await GET(`${repoLink}/activity/recent-commits/data`);
      if (response.status === 202) {
        await sleep(1000); // wait for 1 second before retrying
      }
    } while (response.status === 202);
    if (response.ok) {
      const json = await response.json();
      const start = (Object.values(json)[0] as WeekData).week;
      const end = firstStartDateAfterDate(new Date());
      const startDays = startDaysBetween(start, end);
      data = fillEmptyStartDaysWithZeroes(startDays, json).slice(-52);
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

const graphData = $derived.by((): ChartData<'bar', Array<{x: number, y: number}>> => ({
  datasets: [
    {
      data: data.map((i) => ({x: i.week, y: i.commits})),
      label: 'Commits',
      backgroundColor: chartJsColors.commits,
      borderWidth: 0,
    },
  ],
}));

const options = {
  responsive: true,
  maintainAspectRatio: false,
  animation: true,
  scales: {
    x: {
      type: 'time',
      grid: {
        display: false,
      },
      time: {
        minUnit: 'week',
      },
      ticks: {
        maxRotation: 0,
        maxTicksLimit: 52,
      },
    },
    y: {
      ticks: {
        maxTicksLimit: 6,
      },
    },
  },
} as unknown as ChartOptions<'bar'>;

onMount(() => {
  fetchGraphData();
});
</script>

<div>
  <h1>{locale.recentCommitsTitle}</h1>
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
    {#if data.length !== 0}
      <Chart type="bar" data={graphData} {options}/>
    {/if}
  </div>
</div>

<style>
.main-graph {
  height: 250px;
}

h2 {
  text-align: center;
}
</style>
