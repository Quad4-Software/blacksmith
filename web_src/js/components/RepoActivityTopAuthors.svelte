<script lang="ts" module>
export function calcImageSizeAndShift(img: {naturalWidth: number, naturalHeight: number}): [number, number, number, number] {
  const targetSize = 20;
  const [imgWidth, imgHeight] = [img.naturalWidth, img.naturalHeight];

  // The image should be contained in a square,
  // so the scale depends on the longer dimension.
  const scale = targetSize / (Math.max(imgWidth, imgHeight));
  const calcScale = (size: number) => size * scale;
  const [width, height] = [calcScale(imgWidth), calcScale(imgHeight)];

  // The image should be centered in the 20x20 square.
  const calcShift = (size: number) => (targetSize - size) / 2;
  const [dx, dy] = [calcShift(width), calcShift(height)];

  return [width, height, dx, dy];
}
</script>

<script lang="ts">
import {onMount} from 'svelte';
import {
  Chart as ChartJS,
  BarController,
  Tooltip,
  BarElement,
  CategoryScale,
  LinearScale,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import Chart from './Chart.svelte';
import {chartJsColors} from '../utils/color.ts';

ChartJS.defaults.color = chartJsColors.text;
ChartJS.defaults.borderColor = chartJsColors.border;

ChartJS.register(
  BarController,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
);

interface TopAuthor {
  avatar_link: string;
  commits: number;
  home_link: string;
  login: string;
  name: string;
  avatar_img?: HTMLImageElement;
}

interface Props {
  locale: {commitActivity: string};
}

const {locale}: Props = $props();

let styleElement: HTMLDivElement | undefined = $state();
let barColor = $state('green');

// possible keys:
// * avatar_link: (...)
// * commits: (...)
// * home_link: (...)
// * login: (...)
// * name: (...)
const activityTopAuthors: TopAuthor[] = (window.config.pageData.repoActivityTopAuthors as TopAuthor[]) || [];

for (const item of activityTopAuthors) {
  const img = new Image();
  img.src = item.avatar_link;
  item.avatar_img = img;
}

const graphPoints: ChartData<'bar'> = $derived({
  datasets: [{
    label: locale.commitActivity,
    data: activityTopAuthors.map((item) => item.commits),
    backgroundColor: barColor,
    barThickness: 40,
    borderWidth: 0,
  }],
  labels: activityTopAuthors.map((item) => item.name),
});

const options = {
  responsive: true,
  maintainAspectRatio: false,
  animation: true,
  scales: {
    x: {
      type: 'category',
      grid: {
        display: false,
      },
      ticks: {
        // Disable the drawing of the labels on the x-asis and force them all
        // of them to be 'shown', this avoids them being internally skipped
        // for some data points. We rely on the internally generated ticks
        // to know where to draw our own ticks. Set rotation to 90 degree
        // and disable autoSkip. autoSkip is disabled to ensure no ticks are
        // skipped and rotation is set to avoid messing with the width of the chart.
        color: 'transparent',
        minRotation: 90,
        maxRotation: 90,
        autoSkip: false,
      },
    },
    y: {
      ticks: {
        stepSize: 1,
      },
    },
  },
  plugins: {
    tooltip: {
      intersect: false,
    },
  },
} as unknown as ChartOptions<'bar'>;

const imageLabelPlugin: Plugin<'bar'> = {
  id: 'image_label',
  afterDraw: (chart) => {
    const xAxis = chart.boxes[0] as unknown as {ticks: unknown[], getPixelForTick: (i: number) => number};
    const yAxis = chart.boxes[1];
    for (const [index] of xAxis.ticks.entries()) {
      const x = xAxis.getPixelForTick(index);
      const img = activityTopAuthors[index].avatar_img;

      chart.ctx.save();
      const [width, height, dx, dy] = calcImageSizeAndShift(img);
      chart.ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x - 10 + dx, yAxis.bottom + 10 + dy, width, height);
      chart.ctx.restore();
    }
  },
  beforeEvent: (chart, args) => {
    const event = args.event;
    if (event.type !== 'mousemove' && event.type !== 'click') return;

    const yAxis = chart.boxes[1];
    if (event.y < yAxis.bottom + 10 || event.y > yAxis.bottom + 30) {
      chart.canvas.style.cursor = '';
      return;
    }

    const xAxis = chart.boxes[0] as unknown as {ticks: unknown[], getPixelForTick: (i: number) => number};
    const pointIdx = xAxis.ticks.findIndex((_, index) => {
      const x = xAxis.getPixelForTick(index);
      return event.x >= x - 10 && event.x <= x + 10;
    });

    if (pointIdx === -1) {
      chart.canvas.style.cursor = '';
      return;
    }

    chart.canvas.style.cursor = 'pointer';
    if (event.type === 'click' && activityTopAuthors[pointIdx].home_link) {
      window.location.href = activityTopAuthors[pointIdx].home_link;
    }
  },
};

onMount(() => {
  barColor = window.getComputedStyle(styleElement).backgroundColor;
});
</script>

<div>
  <div class="activity-bar-graph" bind:this={styleElement} style="width: 0; height: 0;"></div>
  <Chart type="bar" height="150px" data={graphPoints} {options} plugins={[imageLabelPlugin]}/>
</div>
