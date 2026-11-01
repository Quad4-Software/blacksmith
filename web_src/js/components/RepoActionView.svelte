<!--
Copyright 2025 The Forgejo Authors. All rights reserved.
SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
import SvgIcon from './SvgIcon.svelte';
import ActionRunStatus from './ActionRunStatus.svelte';
import ActionJobStepList from './ActionJobStepList.svelte';
import ActionLogSearch from './ActionLogSearch.svelte';
import {findFirstErrorLine} from '../modules/action-log-search.ts';
import {useEventListener} from 'runed';
import {toggleElem} from '../utils/dom.ts';
import {GET, POST, DELETE} from '../modules/fetch.ts';
import {initMarkupContent} from '../markup/content.js';
import {showErrorToast} from '../modules/toast.ts';
import {onMount, tick} from 'svelte';

interface Attempt {
  index?: number;
  number?: number;
  time_since_started_html?: string;
  status: string;
  status_diagnostics?: string[];
}

interface JobBrief {id: number, name: string, status: string, canRerun: boolean, duration: string}
interface JobStep {summary: string, duration: string, status: string}
interface Artifact {name: string, size?: number, status: string}

interface RunState {
  link: string; title: string; titleHTML: string; status: string;
  estimatedOutcome: string; description: string;
  canCancel: boolean; canApprove: boolean; canRerun: boolean;
  canDelete: boolean; canDeleteArtifact?: boolean; done: boolean;
  preExecutionError: string; preExecutionWarnings: string[];
  jobs: JobBrief[];
  commit: {
    localeWorkflow: string; localeAllRuns: string; shortSHA: string; link: string;
    pusher: {displayName: string, link: string};
    branch: {name: string, link: string, isDeleted?: boolean};
  };
}

interface CurrentJob {
  title: string; details: unknown[]; steps: JobStep[];
  allAttempts?: Attempt[]; summaries?: string[];
}

interface Locale {
  approve: string; cancel: string; rerun: string; delete: string;
  confirmDelete: string; deleteError?: string; artifactsTitle: string;
  areYouSure: string; confirmDeleteArtifact: string; rerun_all: string;
  showTimeStamps: string; showLogSeconds: string; showFullScreen: string;
  downloadLogs: string; runAttemptLabel: string; viewingOutOfDateRun: string;
  logSearchToggle: string; logSearchPlaceholder: string; logSearchCount: string;
  logSearchNoMatches: string; logSearchPrevious: string; logSearchNext: string;
  logSearchCaseSensitive: string; logSearchClose: string;
  logSearchStepsNotLoaded: string; logSearchLoadAll: string;
  logJumpToError: string; logExpandAll: string; logCollapseAll: string;
  viewMostRecentRun: string; preExecutionError: string; preExecutionWarning: string;
  status: Record<string, string>;
}

interface Props {
  initialJobData: unknown;
  initialArtifactData: unknown;
  runIndex: string;
  runID: string;
  jobIndex: string;
  attemptNumber: string;
  actionsURL: string;
  workflowName: string;
  workflowURL: string;
  workflowSourceURL: string;
  locale: Locale;
}

const {
  initialJobData,
  initialArtifactData,
  runIndex,
  runID,
  jobIndex,
  attemptNumber,
  actionsURL,
  workflowName,
  workflowURL,
  workflowSourceURL,
  locale,
}: Props = $props();

// internal state
let loading = false;
let renderedSummaries = '';
let initialLoadComplete = $state(false);
let needLoadingWithLogCursors = null;
let intervalID = $state<ReturnType<typeof setInterval> | null>(null);
let lineNumberOffset = [];
let currentJobStepsStates = $state<Array<{cursor: number | null, expanded: boolean}>>([]);
let searchOpen = $state(false);
let searchRefreshKey = $state(0);
let logsPanelEl = $state<HTMLElement | null>(null);
let searchToggleEl = $state<HTMLButtonElement>();
let autoExpandDone = false;
let artifacts = $state<Artifact[]>([]);
let menuVisible = $state<string | undefined>(undefined);
let isFullScreen = $state(false);
let timeVisible = $state<Record<string, boolean>>({
  'log-time-stamp': false,
  'log-time-seconds': false,
});

// provided by backend
let run = $state<RunState>({
  link: '',
  title: '',
  titleHTML: '',
  status: '',
  estimatedOutcome: '',
  description: '',
  canCancel: false,
  canApprove: false,
  canRerun: false,
  canDelete: false,
  done: false,
  preExecutionError: '',
  preExecutionWarnings: [],
  jobs: [],
  commit: {
    localeWorkflow: '',
    localeAllRuns: '',
    shortSHA: '',
    link: '',
    pusher: {displayName: '', link: ''},
    branch: {name: '', link: ''},
  },
});
let currentJob = $state<CurrentJob>({
  title: '',
  details: [],
  steps: [],
  // All available attempts for the job we're currently viewing.
  //
  // initial value here is configured so that currentlyViewingMostRecentAttempt() -> true on the default `data()`, so that the
  // initial render (before `loadJob`'s first execution is complete) doesn't display "You are viewing an
  // out-of-date run..."
  allAttempts: [],
  summaries: [],
});

let stepList: ActionJobStepList;

const viewingAttemptNumber = $derived(parseInt(attemptNumber));
const currentlyViewingMostRecentAttempt = $derived.by(() => {
  if (!currentJob.allAttempts || currentJob.allAttempts.length === 0) {
    return true;
  }
  const mostRecentAttemptNumber = currentJob.allAttempts[0].number;
  return viewingAttemptNumber === mostRecentAttemptNumber;
});
const shouldShowAttemptDropdown = $derived(initialLoadComplete && currentJob.allAttempts && currentJob.allAttempts.length > 1);
const displayOtherJobs = $derived(currentlyViewingMostRecentAttempt);
const canApprove = $derived(currentlyViewingMostRecentAttempt && run.canApprove);
const canCancel = $derived(currentlyViewingMostRecentAttempt && run.canCancel);
const canRerun = $derived(currentlyViewingMostRecentAttempt && run.canRerun);
const viewingAttempt: Attempt = $derived.by(() => {
  const fallback = {index: 0, time_since_started_html: '', status: 'success'};
  if (!currentJob.allAttempts) {
    return fallback;
  }
  const attempt = currentJob.allAttempts.find((attempt) => attempt.number === viewingAttemptNumber);
  return attempt || fallback;
});
const displayGearDropdown = $derived(menuVisible === 'gear');
const displayAttemptDropdown = $derived(menuVisible === 'attempt');
const viewingOutOfDateRunLabel = $derived(
  locale.viewingOutOfDateRun.replace('%[1]s', viewingAttempt.time_since_started_html),
);
const statusDiagnostics = $derived.by(() => {
  if (!currentJob.allAttempts) {
    return [];
  }
  const useAttempt = currentJob.allAttempts.some((attempt) => attempt.number === viewingAttemptNumber);
  if (useAttempt) {
    return viewingAttempt.status_diagnostics;
  }
  return [];
});
const hasWarnings = $derived(run.preExecutionWarnings && run.preExecutionWarnings.length > 0);

// show/hide the step logs for a step
function toggleStepLogs(idx) {
  currentJobStepsStates[idx].expanded = !currentJobStepsStates[idx].expanded;
  if (currentJobStepsStates[idx].expanded) {
    // request data load immediately instead of waiting for next timer interval (which, if the job is done, will
    // never happen because the interval will have been disabled)
    loadJob();
  }
}

async function deleteRun() {
  if (!window.confirm(locale.confirmDelete)) {
    return;
  }

  const response = await POST(`${run.link}/delete`);

  if (response.ok) {
    window.location.href = workflowURL;
    return;
  }

  showErrorToast(locale.deleteError, {duration: 5000});
}

// cancel a run
function cancelRun() {
  POST(`${run.link}/cancel`);
}

// approve a run
function approveRun() {
  const url = `${run.commit.branch.link}#pull-request-trust-panel`;
  window.location.href = url;
}

async function appendLogs(stepIndex, logLines, startTime) {
  await stepList.appendLogs(stepIndex, logLines, startTime);
}

async function fetchArtifacts() {
  const resp = await GET(`${actionsURL}/runs/${runIndex}/artifacts`);
  return await resp.json();
}

async function deleteArtifact(name) {
  if (!window.confirm(locale.confirmDeleteArtifact.replace('%s', name))) return;
  await DELETE(`${run.link}/artifacts/${name}`);
  await loadJob();
}

function getLogCursors() {
  return currentJobStepsStates.map((it, idx) => {
    // cursor is used to indicate the last position of the logs
    // it's only used by backend, frontend just reads it and passes it back, it and can be any type.
    // for example: make cursor=null means the first time to fetch logs, cursor=eof means no more logs, etc
    return {step: idx, cursor: it.cursor, expanded: it.expanded};
  });
}

async function fetchJob(logCursors) {
  const resp = await POST(
    `${actionsURL}/runs/${runIndex}/jobs/${jobIndex}/attempt/${attemptNumber}`,
    {data: {logCursors}},
  );
  return await resp.json();
}

export async function loadJob(initializationData?) {
  const isInitializing = initializationData !== undefined;
  let myLoadingLogCursors = getLogCursors();
  if (loading) {
    // loadJob is already executing; but it's possible that our log cursor request has changed since it started.  If
    // the interval load is active, that problem would solve itself, but if it isn't (say we're viewing a "done"
    // job), then the change to the requested cursors may never be loaded.  To address this we set our newest
    // requested log cursors into a state property and rely on loadJob to retry at the end of its execution if it
    // notices these have changed.
    needLoadingWithLogCursors = myLoadingLogCursors;
    return;
  }

  try {
    loading = true;
    // Since no async operations occurred since fetching myLoadingLogCursors, we can be sure that we have the most
    // recent needed log cursors, so we can reset needLoadingWithLogCursors -- it could be stale if exceptions
    // occurred in previous load attempts.
    needLoadingWithLogCursors = null;

    let job, artifactsResp;

    while (true) {
      try {
        if (initializationData) {
          job = initializationData.initialJobData;
          artifactsResp = initializationData.initialArtifactData;
          // don't think it's possible that we loop retrying for 'needLoadingWithLogCursors' during initialization,
          // but just in case, we'll ensure initializationData can only be used once and go to the network on retry
          initializationData = undefined;
        } else {
          [job, artifactsResp] = await Promise.all([
            fetchJob(myLoadingLogCursors),
            fetchArtifacts(), // refresh artifacts if upload-artifact step done
          ]);
        }
      } catch (err) {
        if (err instanceof TypeError) return; // avoid network error while unloading page
        throw err;
      }

      // We can be done as long as needLoadingWithLogCursors is null, or the same as what we just loaded.
      if (needLoadingWithLogCursors === null || JSON.stringify(needLoadingWithLogCursors) === JSON.stringify(myLoadingLogCursors)) {
        needLoadingWithLogCursors = null;
        break;
      }

      // Otherwise we need to retry that.
      myLoadingLogCursors = needLoadingWithLogCursors;
    }

    const typedJob = job as {state: {run: RunState, currentJob: CurrentJob}, logs: {stepsLog: Array<{step: number, cursor: number, lines: unknown[], started: number}>}};
    artifacts = (artifactsResp as {artifacts?: Artifact[]}).artifacts || [];

    // save the state, then the UI will be updated
    run = typedJob.state.run;
    currentJob = typedJob.state.currentJob;

    const summaries = currentJob.summaries?.join(' ') ?? '';
    if (summaries && summaries !== renderedSummaries) {
      renderedSummaries = summaries;
      tick().then(() => initMarkupContent());
    }

    // sync the currentJobStepsStates to store the job step states
    for (let i = 0; i < currentJob.steps.length; i++) {
      if (!currentJobStepsStates[i]) {
        // initial states for job steps
        currentJobStepsStates[i] = {cursor: null, expanded: false};
      }
    }
    // append logs to the UI
    for (const logs of typedJob.logs.stepsLog) {
      // save the cursor, it will be passed to backend next time
      lineNumberOffset[logs.step] = 0;
      currentJobStepsStates[logs.step].cursor = logs.cursor;
      await appendLogs(logs.step, logs.lines, logs.started);
      searchRefreshKey++;
    }

    if (!autoExpandDone) {
      autoExpandDone = true;
      if (run.done && !window.location.hash) {
        const failed = currentJob.steps.findIndex((s) => s.status === 'failure' && isExpandable(s.status));
        if (failed !== -1) {
          currentJobStepsStates[failed].expanded = true;
          await loadJob();
        }
      }
    }

    if (run.done) {
      if (intervalID) {
        clearInterval(intervalID);
        intervalID = null;
      }
    } else if (isInitializing) {
      // Begin refresh interval since we know this job isn't done.
      intervalID = setInterval(loadJob, 1000);
    }
  } finally {
    loading = false;
    initialLoadComplete = true;
  }
}

function navigateToMostRecentAttempt() {
  const url = `${actionsURL}/runs/${runIndex}/jobs/${jobIndex}`;
  window.location.href = url;
}

function isDone(status) {
  return ['success', 'skipped', 'failure', 'cancelled'].includes(status);
}

const hasFailedStep = $derived(Boolean(currentJob.steps?.some((s) => s.status === 'failure')));
const unloadedSteps = $derived(
  currentJob.steps ? currentJob.steps.filter((step, i) => isExpandable(step.status) && currentJobStepsStates[i]?.cursor === null).length : 0,
);

async function loadAllSteps() {
  for (let i = 0; i < currentJobStepsStates.length; i++) {
    if (currentJobStepsStates[i] && currentJobStepsStates[i].cursor === null) {
      currentJobStepsStates[i].expanded = true;
    }
  }
  await loadJob();
}

const logSearchLocale = $derived({
  placeholder: locale.logSearchPlaceholder,
  count: locale.logSearchCount,
  noMatches: locale.logSearchNoMatches,
  previous: locale.logSearchPrevious,
  next: locale.logSearchNext,
  caseSensitive: locale.logSearchCaseSensitive,
  close: locale.logSearchClose,
  stepsNotLoaded: locale.logSearchStepsNotLoaded,
  loadAll: locale.logSearchLoadAll,
});

async function expandAllSteps() {
  for (let i = 0; i < currentJob.steps.length; i++) {
    if (isExpandable(currentJob.steps[i].status)) currentJobStepsStates[i].expanded = true;
  }
  await loadJob();
}

function collapseAllSteps() {
  for (let i = 0; i < currentJob.steps.length; i++) {
    if (isExpandable(currentJob.steps[i].status)) currentJobStepsStates[i].expanded = false;
  }
}

async function jumpToFirstError() {
  const idx = currentJob.steps.findIndex((s) => s.status === 'failure');
  if (idx === -1) return;
  if (!currentJobStepsStates[idx]?.expanded || currentJobStepsStates[idx]?.cursor === null) {
    currentJobStepsStates[idx].expanded = true;
    await loadJob();
    await tick();
  }
  const lines = Array.from(logsPanelEl?.querySelectorAll(`.job-log-line[id^="jobstep-${idx}-"]`) ?? []);
  if (!lines.length) {
    logsPanelEl?.querySelector(`.job-step-section:nth-of-type(${idx + 1}) .job-step-summary`)?.scrollIntoView({block: 'center'});
    return;
  }
  const texts = lines.map((el) => el.querySelector('.log-msg')?.textContent ?? '');
  let err = findFirstErrorLine(texts);
  if (err === -1) err = lines.length - 1;
  const m = /^jobstep-\d+-(\d+)$/.exec(lines[err].id);
  if (m) window.location.hash = `#jobstep-${idx}-${m[1]}`;
}

function closeSearch() {
  searchOpen = false;
  searchToggleEl?.focus();
}

useEventListener(() => document, 'keydown', (e: KeyboardEvent) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
  e.preventDefault();
  searchOpen = true;
});

function isExpandable(status) {
  return ['success', 'running', 'failure', 'cancelled'].includes(status);
}

function failFastStatus(status, estimatedOutcome) {
  if (isDone(estimatedOutcome)) {
    return estimatedOutcome;
  }
  return status;
}

function toggleAttemptDropdown() {
  if (menuVisible === 'attempt') {
    menuVisible = undefined;
  } else {
    menuVisible = 'attempt';
  }
}

function toggleGearDropdown() {
  if (menuVisible === 'gear') {
    menuVisible = undefined;
  } else {
    menuVisible = 'gear';
  }
}

export function closeDropdown() {
  menuVisible = undefined;
}

function toggleTimeDisplay(type) {
  timeVisible[`log-time-${type}`] = !timeVisible[`log-time-${type}`];
}

function toggleFullScreen() {
  isFullScreen = !isFullScreen;
  const fullScreenEl = document.querySelector('.action-view-right');
  const outerEl = document.querySelector('.full.height');
  const actionBodyEl = document.querySelector('.action-view-body');
  const headerEl = document.querySelector('#navbar');
  const contentEl = document.querySelector('.page-content.repository');
  const footerEl = document.querySelector('.page-footer');
  toggleElem(headerEl, !isFullScreen);
  toggleElem(contentEl, !isFullScreen);
  toggleElem(footerEl, !isFullScreen);
  // move .action-view-right to new parent
  if (isFullScreen) {
    outerEl.append(fullScreenEl);
  } else {
    actionBodyEl.append(fullScreenEl);
  }
}

async function hashChangeListener() {
  const selectedLogStep = window.location.hash;
  if (!selectedLogStep) return;
  const parts = selectedLogStep.split('-');
  const step = parts[1];
  if (!currentJobStepsStates[step]) return;
  if (!currentJobStepsStates[step].expanded && currentJobStepsStates[step].cursor === null) {
    currentJobStepsStates[step].expanded = true;
    // need to await for load job if the step log is loaded for the first time
    // so logline can be selected by querySelector
    await loadJob();
  }
  stepList.scrollIntoView(step, selectedLogStep);
}

function runAttemptLabel(attempt) {
  if (!attempt) {
    return '';
  }
  return locale.runAttemptLabel
    .replace('%[1]s', attempt.number)
    .replace('%[2]s', attempt.time_since_started_html);
}

onMount(() => {
  // Need to await first loadJob so currentJobStepsStates is initialized and can be used in hashChangeListener,
  // but with the initializing data being passed in this should end up as a synchronous invocation.  loadJob is
  // responsible for setting up its refresh interval during this first invocation.
  const initPromise = loadJob({initialJobData, initialArtifactData});
  document.body.addEventListener('click', closeDropdown);
  initPromise.then(() => hashChangeListener());
  window.addEventListener('hashchange', hashChangeListener);

  return () => {
    document.body.removeEventListener('click', closeDropdown);
    window.removeEventListener('hashchange', hashChangeListener);
    // clear the interval timer when the component is unmounted
    // even our page is rendered once, not spa style
    if (intervalID) {
      clearInterval(intervalID);
      intervalID = null;
    }
  };
});
</script>

<div class="ui container fluid padded action-view-container" class:interval-pending={!!intervalID}>
  {#if !currentlyViewingMostRecentAttempt}
    <div class="action-view-header job-out-of-date-warning">
      <div class="ui warning message">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- locale text with a server-provided timestamp fragment -->
        <span>{@html viewingOutOfDateRunLabel}</span>
        <button class="tw:ml-8 ui basic small compact button" onclick={navigateToMostRecentAttempt}>
          {locale.viewMostRecentRun}
        </button>
      </div>
    </div>
  {/if}
  <div class="action-view-header">
    <div class="action-info-summary">
      <div class="action-info-summary-title">
        <ActionRunStatus
          localeStatus={locale.status[failFastStatus(run.status, run.estimatedOutcome)]}
          status={failFastStatus(run.status, run.estimatedOutcome)}
          size={20}
        />
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered markdown from the backend -->
        <h1 class="action-info-summary-title-text">{@html run.titleHTML}</h1>
      </div>
      {#if canApprove}
        <button class="ui basic small compact button primary" onclick={approveRun}>
          {locale.approve}
        </button>
      {:else}
        <div class="action-info-summary-actions">
          {#if run.canDelete}
            <button id="delete-run" class="ui basic small compact button red" onclick={deleteRun}>
              {locale.delete}
            </button>
          {/if}
          {#if canCancel}
            <button class="ui basic small compact button red" onclick={cancelRun}>
              {locale.cancel}
            </button>
          {/if}
          {#if canRerun}
            <button class="ui basic small compact button tw:mr-0 tw:whitespace-nowrap link-action" data-url={`${run.link}/rerun`}>
              {locale.rerun_all}
            </button>
          {/if}
        </div>
      {/if}
    </div>
    <div class="action-summary">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered markdown from the backend -->
      <span>{@html run.description}</span>
      {#if run.commit.shortSHA}
        <span class="ui label tw:max-w-full">
          {#if run.commit.branch.isDeleted}
            <span class="gt-ellipsis tw:line-through" data-tooltip-content={run.commit.branch.name}>{run.commit.branch.name}</span>
          {:else}
            <a class="gt-ellipsis" href={run.commit.branch.link} data-tooltip-content={run.commit.branch.name}>{run.commit.branch.name}</a>
          {/if}
        </span>
      {/if}
    </div>
    <div class="action-summary">
      {run.commit.localeWorkflow}
      <a href={workflowSourceURL}>{workflowName}</a> <span>(<a href={workflowURL}>{run.commit.localeAllRuns}</a>)</span>
    </div>
    {#if run.preExecutionError}
      <div class="ui error message pre-execution-error">
        <div class="header">
          {locale.preExecutionError}
        </div>
        {run.preExecutionError}
      </div>
    {/if}
    {#if hasWarnings}
      <div class="ui warning message pre-execution-error">
        <div class="header">
          {locale.preExecutionWarning}
        </div>
        {#each run.preExecutionWarnings as warning (warning)}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered markdown from the backend -->
          <div>{@html warning}</div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="action-view-body">
    {#if displayOtherJobs}
      <div class="action-view-left">
        <div class="job-group-section">
          <div class="job-brief-list">
            {#each run.jobs as job, index (job.id)}
              <a class="job-brief-item" href={run.link + '/jobs/' + index} class:selected={parseInt(jobIndex) === index}>
                <div class="job-brief-item-left">
                  <ActionRunStatus localeStatus={locale.status[job.status]} status={job.status}/>
                  <span class="job-brief-name tw:mx-2 gt-ellipsis">{job.name}</span>
                </div>
                <span class="job-brief-item-right">
                  {#if job.canRerun}
                    <SvgIcon name="octicon-sync" role="button" data-tooltip-content={locale.rerun} class="job-brief-rerun tw:mx-3 link-action" data-url={`${run.link}/jobs/${index}/rerun`}/>
                  {/if}
                  <span class="step-summary-duration">{job.duration}</span>
                </span>
              </a>
            {/each}
          </div>
        </div>
        {#if artifacts.length > 0}
          <div class="job-artifacts">
            <div class="job-artifacts-title">
              {locale.artifactsTitle}
            </div>
            <ul class="job-artifacts-list">
              {#each artifacts as artifact (artifact.name)}
                <li class="job-artifacts-item">
                  {#if artifact.status === 'expired'}
                    <div>
                      <SvgIcon name="octicon-file" class="ui text black job-artifacts-icon"/>{artifact.name}
                    </div>
                  {:else}
                    <a class="job-artifacts-link" target="_blank" rel="noopener" href={actionsURL + '/runs/' + runID + '/artifacts/' + artifact.name}>
                      <SvgIcon name="octicon-file" class="ui text black job-artifacts-icon"/>{artifact.name}
                    </a>
                    {#if run.canDeleteArtifact}
                      <button type="button" onclick={() => deleteArtifact(artifact.name)} class="job-artifacts-delete">
                        <SvgIcon name="octicon-trash" class="ui text black job-artifacts-icon"/>
                      </button>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}

    <div class="action-view-right">
      <div class="job-info-header">
        <div class="job-info-header-left gt-ellipsis">
          <h3 class="job-info-header-title gt-ellipsis">
            {currentJob.title}
          </h3>
          <ul class="job-info-header-detail">
            {#each statusDiagnostics as detail (detail)}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- server-provided diagnostics HTML -->
              <li>{@html detail}</li>
            {/each}
          </ul>
        </div>
        {#if shouldShowAttemptDropdown}
          <div class="job-info-header-right job-attempt-dropdown tw:mr-8">
            <div class="ui dropdown selection" role="button" tabindex="0" onmousedown={(e) => e.preventDefault()} onclick={(e) => { e.stopPropagation(); toggleAttemptDropdown(); }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleAttemptDropdown(); } }}>
              <SvgIcon name="octicon-triangle-down" class="dropdown icon"/>
              <div class="default text">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- locale label with server-provided fragments -->
                <ActionRunStatus localeStatus={locale.status[viewingAttempt.status]} status={viewingAttempt.status} inline={true}/><span class="tw:ml-2">{@html runAttemptLabel(viewingAttempt)}</span>
              </div>
              {#if displayAttemptDropdown}
                <div class="menu transition action-job-menu" class:visible={displayAttemptDropdown}>
                  {#each currentJob.allAttempts as attempt (attempt.number)}
                    <a href={`${actionsURL}/runs/${runIndex}/jobs/${jobIndex}/attempt/${attempt.number}`} class:item={true} class:selected={attempt.number === viewingAttemptNumber}>
                      <!-- eslint-disable-next-line svelte/no-at-html-tags -- locale label with server-provided fragments -->
                      <ActionRunStatus localeStatus={locale.status[attempt.status]} status={attempt.status} inline={true}/><span class="tw:ml-2">{@html runAttemptLabel(attempt)}</span>
                    </a>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
        <div class="job-info-header-right">
          {#if hasFailedStep}
            <button type="button" class="btn interact-bg tw:p-2" aria-label={locale.logJumpToError} data-tooltip-content={locale.logJumpToError} onclick={(e) => { e.stopPropagation(); jumpToFirstError(); }}>
              <SvgIcon name="octicon-alert" size={18}/>
            </button>
          {/if}
          <button type="button" class="btn interact-bg tw:p-2" bind:this={searchToggleEl} aria-label={locale.logSearchToggle} data-tooltip-content={locale.logSearchToggle} aria-expanded={searchOpen} aria-pressed={searchOpen} onclick={(e) => { e.stopPropagation(); searchOpen = !searchOpen; }}>
            <SvgIcon name="octicon-search" size={18}/>
          </button>
          <!-- the click comes from the keyboard accessible gear button inside, the container only forwards it -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="ui top right pointing dropdown dark-dropdown custom jump item job-gear-dropdown" onclick={(e) => { e.stopPropagation(); toggleGearDropdown(); }}>
            <button class="btn interact-bg tw:p-2">
              <SvgIcon name="octicon-gear" size={18}/>
            </button>
            {#if displayGearDropdown}
              <div class="menu transition action-job-menu" class:visible={displayGearDropdown}>
                <button type="button" class="item" onclick={() => toggleTimeDisplay('seconds')}>
                  <i class="icon"><SvgIcon name={timeVisible['log-time-seconds'] ? 'octicon-check' : 'gitea-empty-checkbox'}/></i>
                  {locale.showLogSeconds}
                </button>
                <button type="button" class="item" onclick={() => toggleTimeDisplay('stamp')}>
                  <i class="icon"><SvgIcon name={timeVisible['log-time-stamp'] ? 'octicon-check' : 'gitea-empty-checkbox'}/></i>
                  {locale.showTimeStamps}
                </button>
                <button type="button" class="item" onclick={toggleFullScreen}>
                  <i class="icon"><SvgIcon name={isFullScreen ? 'octicon-check' : 'gitea-empty-checkbox'}/></i>
                  {locale.showFullScreen}
                </button>
                <button type="button" class="item" onclick={() => expandAllSteps()}>
                  <i class="icon"><SvgIcon name="octicon-sidebar-expand"/></i>
                  {locale.logExpandAll}
                </button>
                <button type="button" class="item" onclick={() => collapseAllSteps()}>
                  <i class="icon"><SvgIcon name="octicon-sidebar-collapse"/></i>
                  {locale.logCollapseAll}
                </button>
                <div class="divider"></div>
                <a class={['item', !currentJob.steps.length ? 'disabled' : ''].filter(Boolean).join(' ')} href={run.link + '/jobs/' + jobIndex + '/attempt/' + viewingAttemptNumber + '/logs'} target="_blank" rel="noopener">
                  <i class="icon"><SvgIcon name="octicon-download"/></i>
                  {locale.downloadLogs}
                </a>
              </div>
            {/if}
          </div>
        </div>
      </div>
      {#if currentJob.summaries?.length}
        <div class="job-summary markup">
          {#each currentJob.summaries as stepSummary, index (index)}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered markdown from the backend -->
            <div class="step-summary">{@html stepSummary}</div>
          {/each}
        </div>
      {/if}
      <div class="job-logs-panel" bind:this={logsPanelEl}>
      {#if searchOpen}
        <ActionLogSearch root={logsPanelEl} {unloadedSteps} refreshKey={searchRefreshKey} onclose={closeSearch} onloadall={loadAllSteps} locale={logSearchLocale}/>
      {/if}
      <ActionJobStepList
        bind:this={stepList}
        steps={currentJob.steps}
        stepStates={currentJobStepsStates}
        runStatus={run.status}
        {isExpandable}
        {isDone}
        timeVisibleTimestamp={timeVisible['log-time-stamp']}
        timeVisibleSeconds={timeVisible['log-time-seconds']}
        onToggleStepLogs={toggleStepLogs}
      />
      </div>
    </div>
  </div>
</div>
<style>
.action-view-body {
  padding-top: 12px;
  padding-bottom: 12px;
  display: flex;
  gap: 12px;
}

/* ================ */
/* action view header */

.action-view-header {
  margin-top: 8px;
}

.action-info-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.action-info-summary-title {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.action-info-summary-actions {
  display: flex;
  align-items: center;
  gap: var(--button-spacing);
  margin-inline-start: auto;
}

.action-info-summary-actions > button {
  margin: 0;
}

.action-info-summary-title-text {
  font-size: 20px;
  margin: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.action-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-inline-start: 28px;
}

/* ================ */
/* action view left */

.action-view-left {
  width: 30%;
  max-width: 400px;
  position: sticky;
  top: 12px;
  max-height: 100vh;
  overflow-block: auto;
  background: var(--color-body);
  z-index: 2; /* above .job-info-header */
}

@media (max-width: 767.98px) {
  .action-view-left {
    position: static; /* can not sticky because multiple jobs would overlap into right view */
  }
}

.job-artifacts-title {
  font-size: 18px;
  margin-top: 16px;
  padding: 16px 10px 0 20px;
  border-top: 1px solid var(--color-secondary);
}

.job-artifacts-item {
  margin: 5px 0;
  padding: 6px;
  display: flex;
  justify-content: space-between;
}

.job-artifacts-delete {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.job-artifacts-list {
  padding-inline-start: 12px;
  list-style: none;
}

.job-artifacts-item :global(.job-artifacts-icon), .job-artifacts-link :global(.job-artifacts-icon), .job-artifacts-delete :global(.job-artifacts-icon) {
  padding-inline-end: 3px;
}

.job-brief-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-brief-item {
  padding: 10px;
  border-radius: var(--border-radius);
  text-decoration: none;
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  color: var(--color-text);
}

.job-brief-item:hover {
  background-color: var(--color-hover);
}

.job-brief-item.selected {
  font-weight: var(--font-weight-bold);
  background-color: var(--color-active);
}

.job-brief-item:first-of-type {
  margin-top: 0;
}

.job-brief-item :global(.job-brief-rerun) {
  cursor: pointer;
  transition: transform 0.2s;
}

.job-brief-item :global(.job-brief-rerun:hover) {
  transform: scale(130%);
}

.job-brief-item .job-brief-item-left {
  display: flex;
  width: 100%;
  min-width: 0;
}

.job-brief-item .job-brief-item-left span {
  display: flex;
  align-items: center;
}

.job-brief-item .job-brief-item-left .job-brief-name {
  display: block;
  width: 70%;
}

.job-brief-item .job-brief-item-right {
  display: flex;
  align-items: center;
}

/* ================ */
/* action view right */

.action-view-right {
  flex: 1;
  color: var(--color-console-fg-subtle);
  max-height: 100%;
  width: 70%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-console-border);
  border-radius: var(--border-radius);
  background: var(--color-console-bg);
  align-self: flex-start;
}

.action-view-right .job-summary {
  margin: 12px;
  padding: 16px;
  border: 1px solid var(--color-console-border);
  border-radius: var(--border-radius);
  background: var(--color-box-body);
  color: var(--color-text);
}

.action-view-right .job-summary .step-summary + .step-summary {
  margin-top: 16px;
}

/* begin fomantic button overrides */

.action-view-right .ui.button,
.action-view-right .ui.button:focus {
  background: transparent;
  color: var(--color-console-fg-subtle);
}

.action-view-right .ui.button:hover {
  background: var(--color-console-hover-bg);
  color: var(--color-console-fg);
}

.action-view-right .ui.button:active {
  background: var(--color-console-active-bg);
  color: var(--color-console-fg);
}

/* end fomantic button overrides */

/* begin fomantic dropdown menu overrides */

.action-view-right .ui.dropdown.dark-dropdown .menu {
  background: var(--color-console-menu-bg);
  border-color: var(--color-console-menu-border);
}

/* button.item needs the browser defaults reset so it renders like the Fomantic a.item */
.action-view-right .ui.dropdown.dark-dropdown .menu > button.item {
  background: none;
  border: none;
  font-family: inherit;
  width: 100%;
  cursor: pointer;
}
.action-view-right .ui.dropdown.dark-dropdown .menu > .item {
  color: var(--color-console-fg);
}

.action-view-right .ui.dropdown.dark-dropdown .menu > .item:hover {
  color: var(--color-console-fg);
  background: var(--color-console-hover-bg);
}

.action-view-right .ui.dropdown.dark-dropdown .menu > .item:active {
  color: var(--color-console-fg);
  background: var(--color-console-active-bg);
}

.action-view-right .ui.dropdown.dark-dropdown .menu > .divider {
  border-block-start-color: var(--color-console-menu-border);
}

.action-view-right .ui.pointing.dropdown.dark-dropdown > .menu:not(.hidden)::after {
  background: var(--color-console-menu-bg);
  box-shadow: -1px -1px 0 0 var(--color-console-menu-border);
}

/* end fomantic dropdown menu overrides */

.job-info-header-right .btn {
  color: #d0d7de;
}

.job-info-header-right .btn:hover,
.job-info-header-right .btn:active {
  background: rgba(255, 255, 255, 0.12) !important;
  color: #ffffff;
}

.job-info-header-right .btn:focus-visible {
  outline: 2px solid #58a6ff;
  outline-offset: 1px;
}

.job-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  position: sticky;
  top: 0;
  z-index: 1; /* above .job-step-container */
  background: var(--color-console-bg);
  border-radius: 3px;
}

.job-info-header:has(+ :global(.job-step-container)) {
  border-radius: var(--border-radius) var(--border-radius) 0 0;
}

.job-info-header .job-info-header-title {
  color: var(--color-console-fg);
  font-size: 16px;
  margin: 0;
}

.job-info-header .job-info-header-detail {
  color: var(--color-console-fg-subtle);
  font-size: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.job-info-header-left {
  flex: 1;
}

@media (max-width: 767.98px) {
  .action-view-body {
    flex-direction: column;
  }
  .action-view-left, .action-view-right {
    width: 100%;
  }
  .action-view-left {
    max-width: none;
  }
}

/* global styles: the fullscreen state reparents elements outside this component */

:global(.full.height > .action-view-right) {
  width: 100%;
  height: 100%;
  padding: 0;
  border-radius: 0;
}

:global(.full.height > .action-view-right > .job-info-header) {
  border-radius: 0;
}

:global(.full.height > .action-view-right > .job-step-container) {
  height: calc(100% - 60px);
  border-radius: 0;
}

:global(.job-log-list.hidden) {
  display: none;
}
</style>
