<script lang="ts">
import {Chart, type ChartData, type ChartOptions, type ChartType, type Plugin, type UpdateMode} from 'chart.js';
import {untrack} from 'svelte';

type Dataset = ChartData['datasets'][number];

interface Props {
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
  plugins?: Plugin[];
  datasetIdKey?: string;
  updateMode?: UpdateMode;
  ariaLabel?: string;
  ariaDescribedby?: string;
  [key: string]: unknown;
}

const {
  type,
  data,
  options = {},
  plugins = [],
  datasetIdKey = 'label',
  updateMode,
  ariaLabel,
  ariaDescribedby,
  ...restProps
}: Props = $props();

let canvas: HTMLCanvasElement | undefined = $state();
let chart: Chart | undefined;
let applied: {data: ChartData, options: ChartOptions} | undefined;

function mergeDatasets(current: Dataset[], next: Dataset[]): Dataset[] {
  const added: Dataset[] = [];
  return next.map((nextDataset) => {
    const currentDataset = current.find((dataset) => dataset[datasetIdKey] === nextDataset[datasetIdKey]);
    if (!currentDataset || !nextDataset.data || added.includes(currentDataset)) {
      return {...nextDataset};
    }
    added.push(currentDataset);
    Object.assign(currentDataset, nextDataset);
    return currentDataset;
  });
}

$effect(() => {
  const element = canvas;
  if (!element) return;
  const instance = untrack(() => {
    applied = {data, options};
    return new Chart(element, {
      type,
      data: {labels: data.labels, datasets: mergeDatasets([], data.datasets)},
      options: {...options},
      plugins,
    });
  });
  chart = instance;
  return () => {
    instance.destroy();
    chart = undefined;
    applied = undefined;
  };
});

$effect(() => {
  const nextData = data;
  const nextOptions = options;
  untrack(() => {
    if (!chart || !applied) return;
    let shouldUpdate = false;
    if (nextOptions !== applied.options) {
      Object.assign(chart.options, nextOptions);
      shouldUpdate = true;
    }
    if (nextData !== applied.data) {
      if (nextData.labels !== applied.data.labels) {
        chart.config.data.labels = nextData.labels;
      }
      if (nextData.datasets !== applied.data.datasets) {
        chart.config.data.datasets = mergeDatasets(chart.config.data.datasets, nextData.datasets);
      }
      shouldUpdate = true;
    }
    applied = {data: nextData, options: nextOptions};
    if (shouldUpdate) chart.update(updateMode);
  });
});
</script>

<canvas role="img" aria-label={ariaLabel} aria-describedby={ariaDescribedby} bind:this={canvas} {...restProps}><p></p></canvas>
