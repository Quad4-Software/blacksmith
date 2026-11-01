<!--
Copyright 2025 The Forgejo Authors. All rights reserved.
SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
import SvgIcon from './SvgIcon.svelte';
import ActionRunStatus from './ActionRunStatus.svelte';
import {formatDatetime} from '../utils/time.js';
import {renderAnsiWithLinks} from '../render/ansi.js';
import {htmlEscape} from 'escape-goat';

interface Props {
  stepId: number;
  status: string;
  runStatus: string;
  expanded: boolean;
  isExpandable: (status: string) => boolean;
  isDone: (status: string) => boolean;
  cursor?: number | null;
  summary: string;
  duration: string;
  timeVisibleTimestamp: boolean;
  timeVisibleSeconds: boolean;
  ontoggle?: () => void;
}

const {
  stepId,
  status,
  runStatus,
  expanded,
  isExpandable,
  isDone,
  cursor = null,
  summary,
  duration,
  timeVisibleTimestamp,
  timeVisibleSeconds,
  ontoggle,
}: Props = $props();

let lineNumberOffset = 0;
let logsContainer: HTMLDivElement;

export function createLogLine(line, startTime, group) {
  const lineNo = line.index - lineNumberOffset;

  // Text chunk HTML construction is used here because it is faster than creating multiple DOM nodes, which can be
  // relevant when viewing large collections of logs.  Special care must be taken to ensure that none of the data
  // allows unescaped used-generated content, or else XSS-style vulnerabilities may exist.
  const chunks = [];

  if (group.isHeader) {
    chunks.push(`<details class="log-msg" style="padding-left: ${group.depth}em"><summary>`);
  }

  chunks.push(
    `<div class="job-log-line" id="jobstep-${stepId}-${lineNo}">`,
    `<a class="line-num muted" href="#jobstep-${stepId}-${lineNo}">${lineNo}</a>`,
  );

  // for "Show timestamps"
  const date = new Date(Number(line.timestamp) * 1000);
  const timeStamp = htmlEscape(formatDatetime(date));
  const timeStampHidden = timeVisibleTimestamp ? '' : 'tw:hidden';
  chunks.push(`<span class="log-time-stamp ${timeStampHidden}">${timeStamp}</span>`);

  const renderedMessage = renderAnsiWithLinks(line.message);
  // If the input to renderAnsi is not empty and the output is empty we can
  // assume the input was only ANSI escape codes that have been removed. In
  // that case we should not display this message
  if (line.message !== '' && renderedMessage === '') {
    lineNumberOffset++;
    return [];
  }
  chunks.push(`<span class="log-msg" style="padding-left: ${group.depth}em">${renderedMessage}</span>`);

  // for "Show seconds"
  const secondsHidden = timeVisibleSeconds ? '' : 'tw:hidden';
  const seconds = Math.max(Math.floor(Number(line.timestamp) - Number(startTime)));
  chunks.push(
    `<span class="log-time-seconds ${secondsHidden}">${seconds}s</span>`,
    '</div>',
  );

  if (group.isHeader) {
    chunks.push('</summary></details>');
  }

  const tmpl = document.createElement('template');
  tmpl.innerHTML = chunks.join('');
  return tmpl.content.firstElementChild;
}

export async function appendLogs(logLines, startTime) {
  lineNumberOffset = 0;

  const groupStack = [];
  const container = logsContainer;
  for (const line of logLines) {
    const el = groupStack.length > 0 ? groupStack[groupStack.length - 1] : container;
    const group = {
      depth: groupStack.length,
      isHeader: false,
    };
    if (line.message.startsWith('##[group]')) {
      group.isHeader = true;

      const logLine = createLogLine(
        {
          ...line,
          message: line.message.substring(9),
        },
        startTime, group,
      );
      el.append(logLine);
      groupStack.push(logLine);
    } else if (line.message.startsWith('##[endgroup]')) {
      groupStack.pop();
    } else {
      el.append(createLogLine(line, startTime, group));
    }

    // When a user opens up a completed action step with many (100k+) log entries, we can end up invoking
    // `appendLogs` with big chunks of data.  When a long JS tasks runs, it causes the browser UI to freeze up.  In
    // order to provide a responsive user experience, invoke `scheduler.yield()` occasionally to allow the browser
    // to suspend this task, layout and display the contents that have been updated, and then return to the task to
    // continue appending more log lines.  Every 1000 lines is an frequency derived from experimental testing when
    // viewing 100,000 log lines -- the more we yield the longer the overall process takes, and the less we yield
    // the more the UI appears frozen.
    //
    // `scheduler.yield` is not supported in Safari, so its availability is checked before executing.
    //
    // The downside of yielding is that the logs appear in the browser while we're still appending them -- if you
    // immediately do a "Find in page" search for something, you might not find results that are present and just
    // haven't been rendered yet.
    if ((line.index % 1000) === 0 && typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
      await scheduler.yield();
    }
  }
}

export function scrollIntoView(lineID) {
  const logLine = logsContainer.querySelector(lineID);
  if (!logLine) {
    return;
  }
  logLine.querySelector('.line-num').scrollIntoView();
}

function handleToggle() {
  if (isExpandable(status)) ontoggle?.();
}
</script>

<div
  class="job-step-summary"
  role="button"
  tabindex="0"
  onclick={(e) => { e.stopPropagation(); handleToggle(); }}
  onkeyup={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleToggle(); } }}
  class:selected={expanded}
  class:step-expandable={isExpandable(status)}
>
  <!-- If the job is done and the job step log is loaded for the first time, show the loading icon
    currentJobStepsStates[i].cursor === null means the log is loaded for the first time
  -->
  {#if isDone(runStatus) && expanded && cursor === null}
    <SvgIcon name="octicon-sync" class="tw:mr-2 job-status-rotate"/>
  {:else}
    <SvgIcon
      name={expanded ? 'octicon-chevron-down': 'octicon-chevron-right'}
      class={['tw:mr-2', !isExpandable(status) && 'tw:invisible'].filter(Boolean).join(' ')}
    />
  {/if}
  <ActionRunStatus {status} class="tw:mr-2"/>

  <span class="step-summary-msg gt-ellipsis">{summary}</span>
  <span class="step-summary-duration">{duration}</span>
</div>

<!-- the log elements could be a lot, do not remove/recreate the DOM when hiding,
use native DOM elements for "log line" to improve performance -->
<div class="job-step-logs" bind:this={logsContainer} style:display={expanded ? '' : 'none'}></div>

<style>
.job-step-summary {
  padding: 5px 10px;
  display: flex;
  align-items: center;
  border-radius: var(--border-radius);
}

.job-step-summary.step-expandable {
  cursor: pointer;
}

.job-step-summary.step-expandable:hover {
  color: var(--color-console-fg);
  background: var(--color-console-hover-bg);
}

.job-step-summary .step-summary-msg {
  flex: 1;
}

.job-step-summary .step-summary-duration {
  margin-inline-start: 16px;
}

.job-step-summary.selected {
  color: var(--color-console-fg);
  background-color: var(--color-console-active-bg);
  position: sticky;
  top: 60px;
}

.job-step-logs {
  font-family: var(--fonts-monospace);
  margin: 8px 0;
  font-size: 12px;
}

/* some elements are not managed by svelte, so we need to use global style */

:global(.job-step-logs .job-log-line) {
  display: flex;
}

:global(.job-step-logs .job-log-line .log-msg) {
  flex: 1;
  word-break: break-all;
  white-space: break-spaces;
  margin-inline-start: 10px;
  overflow-wrap: anywhere;
  color: var(--color-console-fg);
}

/* For log grouping, disable the default `::marker` from `<details><summary>...`; it appears in the wrong location to
  the far left of the log view... */
:global(details.log-msg summary::marker) {
  content: "";
}
/* ... then reinsert expand/contract markers before the log message in the group's summary line.  These markers won't
  be identical to the browser's default markers but they look very close. */
:global(details.log-msg[open] summary span.log-msg::before) {
  content: "▼";
  font-size: 0.9em;
  padding-inline-end: 0.5em;
}
:global(details.log-msg summary span.log-msg::before) {
  content: "▶";
  font-size: 0.9em;
  padding-inline-end: 0.5em;
}

:global(.job-log-line:hover),
:global(.job-log-line:target) {
  background-color: var(--color-console-hover-bg);
}

:global(.job-log-line:target) {
  scroll-margin-top: 95px;
}

/* class names 'log-time-seconds' and 'log-time-stamp' are used in the method toggleTimeDisplay */
:global(.job-log-line .line-num),
:global(.log-time-seconds) {
  width: 48px;
  color: var(--color-text-light-3);
  text-align: end;
  user-select: none;
}

:global(.job-log-line:target > .line-num) {
  color: var(--color-primary);
  text-decoration: underline;
}

:global(.log-time-seconds) {
  padding-inline-end: 2px;
}

:global(.job-log-line .log-time),
:global(.log-time-stamp) {
  color: var(--color-text-light-3);
  margin-inline-start: 10px;
  white-space: nowrap;
}
</style>
