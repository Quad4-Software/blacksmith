// Test helper: replaces the chart.js Chart class (which needs a real canvas) by a recording fake.
type Config = {type: string, data: {labels?: unknown[], datasets: Array<Record<string, unknown>>}, options: Record<string, unknown>, plugins: Array<Record<string, unknown>>};

export const chartInstances: FakeChart[] = [];

export class FakeChart {
  static defaults: Record<string, unknown> = {};
  static register() {}
  static getChart() {}

  config: Config;
  options: Record<string, unknown>;
  canvas: HTMLCanvasElement;
  destroyed = false;
  updateCount = 0;

  constructor(canvas: HTMLCanvasElement, config: Config) {
    this.canvas = canvas;
    this.config = config;
    this.options = config.options;
    chartInstances.push(this);
  }

  update() {
    this.updateCount++;
  }

  destroy() {
    this.destroyed = true;
  }

  resetZoom() {}
}

export function resetChartInstances() {
  chartInstances.length = 0;
}

export function fakeChartModule(actual: Record<string, unknown>) {
  return {...actual, Chart: FakeChart};
}
