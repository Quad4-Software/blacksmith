<!--
Copyright 2025 The Forgejo Authors. All rights reserved.
SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
import ActionJobStep from './ActionJobStep.svelte';
import {toggleElem} from '../utils/dom.ts';
import {watch} from 'runed';

interface Props {
  steps: Array<{status: string, summary: string, duration: string}>;
  stepStates: Array<{cursor: number | null, expanded: boolean}>;
  runStatus: string;
  isExpandable: (status: string) => boolean;
  isDone: (status: string) => boolean;
  timeVisibleTimestamp: boolean;
  timeVisibleSeconds: boolean;
  onToggleStepLogs?: (index: number) => void;
}

const {
  steps,
  stepStates,
  runStatus,
  isExpandable,
  isDone,
  timeVisibleTimestamp,
  timeVisibleSeconds,
  onToggleStepLogs,
}: Props = $props();

let stepsEl: HTMLDivElement = $state();
const jobSteps: ActionJobStep[] = $state([]);

watch(() => timeVisibleTimestamp, (visible) => {
  if (!stepsEl) return;
  for (const el of stepsEl.querySelectorAll('.log-time-stamp')) {
    toggleElem(el, visible);
  }
});
watch(() => timeVisibleSeconds, (visible) => {
  if (!stepsEl) return;
  for (const el of stepsEl.querySelectorAll('.log-time-seconds')) {
    toggleElem(el, visible);
  }
});

export async function appendLogs(stepIndex, logLines, startTime) {
  await jobSteps[stepIndex].appendLogs(logLines, startTime);
}

export function scrollIntoView(stepIndex, lineID) {
  jobSteps[stepIndex].scrollIntoView(lineID);
}
</script>

{#if steps.length}
  <div class="job-step-container" bind:this={stepsEl}>
    {#each steps as jobStep, i (i)}
      <div class="job-step-section">
        <ActionJobStep
          bind:this={jobSteps[i]}
          {runStatus}
          {isExpandable}
          {isDone}
          stepId={i}
          status={jobStep.status}
          summary={jobStep.summary}
          duration={jobStep.duration}
          expanded={stepStates[i].expanded}
          cursor={stepStates[i].cursor}
          {timeVisibleTimestamp}
          {timeVisibleSeconds}
          ontoggle={() => onToggleStepLogs?.(i)}
        />
      </div>
    {/each}
  </div>
{/if}

<style>
.job-step-container {
  max-height: 100%;
  border-radius: 0 0 var(--border-radius) var(--border-radius);
  border-top: 1px solid var(--color-console-border);
  z-index: 0;
}

.job-step-section {
  margin: 10px;
}
</style>
