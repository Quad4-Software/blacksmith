import {describe, afterEach, expect, test, vi} from 'vitest';
// Copyright 2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {tick} from 'svelte';
import {toAbsoluteUrl} from '../utils.ts';
import {cleanup, fireEvent, render} from '@testing-library/svelte';
import RepoActionView from './RepoActionView.svelte';
import {initMarkupContent} from '../markup/content.js';

vi.mock('../markup/content.js', () => ({initMarkupContent: vi.fn()}));

afterEach(cleanup);

async function flushPromises() {
  // fetch() and .json() each resolve on microtasks; svelte state needs a tick
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
  }
}

const testLocale = {
  approve: 'Locale Approve',
  cancel: 'Locale Cancel',
  rerun: 'Locale Re-run',
  delete: 'Locale Delete',
  confirmDelete: '',
  artifactsTitle: 'artifactTitleHere',
  areYouSure: '',
  confirmDeleteArtifact: '',
  rerun_all: '',
  showTimeStamps: '',
  showLogSeconds: '',
  showFullScreen: '',
  downloadLogs: '',
  logSearchToggle: '', logSearchPlaceholder: '', logSearchCount: '',
  logSearchNoMatches: '', logSearchPrevious: '', logSearchNext: '',
  logSearchCaseSensitive: '', logSearchClose: '',
  logSearchStepsNotLoaded: '', logSearchLoadAll: '',
  logJumpToError: 'Jump to first error', logExpandAll: 'Expand all steps', logCollapseAll: 'Collapse all steps',
  runAttemptLabel: 'Run attempt %[1]s %[2]s',
  viewingOutOfDateRun: 'oh no, out of date since %[1]s give or take or so',
  viewMostRecentRun: '',
  preExecutionError: 'pre-execution error',
  preExecutionWarning: 'pre-execution warning',
  status: {
    unknown: '',
    waiting: '',
    running: '',
    success: '',
    failure: '',
    cancelled: '',
    skipped: '',
    blocked: '',
  },
};
const minimalInitialJobData = {
  state: {
    run: {
      status: 'success',
      estimatedOutcome: 'success',
      commit: {
        pusher: {},
      },
    },
    currentJob: {
      summaries: [],
      steps: [
        {
          summary: 'Test Job',
          duration: '1s',
          status: 'success',
        },
      ],
    },
  },
  logs: {
    stepsLog: [],
  },
};
const minimalInitialArtifactData = {
  artifacts: [],
};
const defaultTestProps = {
  actionsURL: 'https://example.com/example-org/example-repo/actions',
  jobIndex: '1',
  attemptNumber: '1',
  runIndex: '10',
  runID: '1001',
  initialJobData: minimalInitialJobData,
  initialArtifactData: minimalInitialArtifactData,
  locale: testLocale,
  workflowName: 'workflow name',
  workflowURL: 'https://example.com/example-org/example-repo/actions?workflow=test.yml',
  workflowSourceURL: 'https://example.com/example-org/example-repo/src/commit/023babec384/.forgejo/workflows/test.yml',
};

function buttonText(container: Element, text: string) {
  return Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === text);
}

test('load multiple steps on a finished action', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
    if (String(url).endsWith('/artifacts')) {
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({artifacts: []}),
      } as unknown as Response);
    }

    const postBody = JSON.parse(String(opts.body));
    const stepsLog_value = [];
    for (const cursor of postBody.logCursors) {
      if (cursor.expanded) {
        stepsLog_value.push({
          step: cursor.step,
          cursor: 0,
          lines: [
            {index: 1, message: `Step #${cursor.step + 1} Log #1`, timestamp: 0},
            {index: 2, message: `Step #${cursor.step + 1} Log #2`, timestamp: 0},
            {index: 3, message: `Step #${cursor.step + 1} Log #3`, timestamp: 0},
          ],
        });
      }
    }
    const jobs_value = {
      state: {
        run: {
          status: 'success',
          estimatedOutcome: 'success',
          commit: {pusher: {}},
        },
        currentJob: {
          summaries: [],
          title: 'test',
          steps: [
            {summary: 'Test Step #1', duration: '1s', status: 'success'},
            {summary: 'Test Step #2', duration: '1s', status: 'success'},
          ],
          allAttempts: [{number: 1, time_since_started_html: '', status: 'success', status_diagnostics: ['Success']}],
        },
      },
      logs: {
        stepsLog: String(opts.body ?? '').includes('"cursor":null') ? stepsLog_value : [],
      },
    };

    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(jobs_value),
    } as unknown as Response);
  });

  const {container, component} = render(RepoActionView, {props: defaultTestProps});
  await flushPromises();
  await component.loadJob(); // simulate intermittent reload so UI switches from minimalInitialJobData to mock data
  await flushPromises();

  // Click on both steps to start their log loading in fast succession...
  (container.querySelector('.job-step-section:nth-of-type(1) .job-step-summary') as HTMLElement).click();
  (container.querySelector('.job-step-section:nth-of-type(2) .job-step-summary') as HTMLElement).click();
  await flushPromises();

  // Verify both step's logs were loaded
  const lines = container.querySelectorAll('.job-step-section .job-log-line .log-msg');
  const texts = Array.from(lines, (el) => el.textContent);
  expect(texts).toEqual([
    'Step #1 Log #1', 'Step #1 Log #2', 'Step #1 Log #3',
    'Step #2 Log #1', 'Step #2 Log #2', 'Step #2 Log #3',
  ]);

  // Attempt status
  expect(container.querySelector('.job-info-header h3').textContent).toEqual('test');
  expect(container.querySelectorAll('ul.job-info-header-detail li').length).toEqual(1);
  expect(container.querySelector('ul.job-info-header-detail li:nth-child(1)').textContent).toEqual('Success');
});

function configureForMultipleAttemptTests({viewHistorical}: {viewHistorical: boolean}) {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const myJobState = {
    run: {
      canApprove: true,
      canCancel: true,
      canRerun: true,
      canDelete: false,
      status: 'success',
      estimatedOutcome: 'success',
      commit: {
        pusher: {},
      },
    },
    currentJob: {
      summaries: [],
      title: 'test',
      steps: [
        {summary: 'Test Job', duration: '1s', status: 'success'},
      ],
      allAttempts: [
        {number: 3, time_since_started_html: 'yesterday', status: 'success', status_diagnostics: ['Success']},
        // Omit one attempt to simulate the case when a job isn't run because a `needs:` failed.
        {number: 1, time_since_started_html: 'two days ago', status: 'failure', status_diagnostics: ['Failure']},
      ],
    },
  };
  vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
    const artifacts_value = {artifacts: []};
    const stepsLog_value = [
      {step: 0, cursor: 0, lines: []},
    ];
    const jobs_value = {
      state: myJobState,
      logs: {
        stepsLog: String(opts.body ?? '').includes('"cursor":null') ? stepsLog_value : [],
      },
    };

    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(String(url).endsWith('/artifacts') ? artifacts_value : jobs_value),
    } as unknown as Response);
  });

  return render(RepoActionView, {
    props: {
      ...defaultTestProps,
      runIndex: '123',
      attemptNumber: viewHistorical ? '1' : '3',
      actionsURL: toAbsoluteUrl('/user1/repo2/actions'),
      initialJobData: {...minimalInitialJobData, state: myJobState},
    },
  });
}

test('display baseline with most-recent attempt', async () => {
  const {container} = configureForMultipleAttemptTests({viewHistorical: false});
  await flushPromises();

  // Warning dialog for viewing an out-of-date attempt...
  expect(container.querySelectorAll('.job-out-of-date-warning').length).toEqual(0);

  // Approve button should be visible
  expect(buttonText(container, 'Locale Approve').length).toEqual(1);

  // Job list will be visible...
  expect(container.querySelectorAll('.job-group-section').length).toEqual(1);

  // Attempt selector dropdown...
  expect(container.querySelectorAll('.job-attempt-dropdown').length).toEqual(1);
  expect(container.querySelectorAll('.job-attempt-dropdown svg.octicon-check-circle-fill.text.green').length).toEqual(1);
  expect(container.querySelector('.job-attempt-dropdown .ui.dropdown').textContent.trim()).toEqual('Run attempt 3 yesterday');

  // Attempt status
  expect(container.querySelector('.job-info-header h3').textContent).toEqual('test');
  expect(container.querySelectorAll('ul.job-info-header-detail li').length).toEqual(1);
  expect(container.querySelector('ul.job-info-header-detail li:nth-child(1)').textContent).toEqual('Success');
});

test('display reconfigured for historical attempt', async () => {
  const {container} = configureForMultipleAttemptTests({viewHistorical: true});
  await flushPromises();

  // Warning dialog for viewing an out-of-date attempt...
  expect(container.querySelectorAll('.job-out-of-date-warning').length).toEqual(1);
  expect(container.querySelector('.job-out-of-date-warning').textContent.trim()).toEqual('oh no, out of date since two days ago give or take or so');
  (container.querySelector('.job-out-of-date-warning button') as HTMLElement).click();
  expect(window.location.href).toEqual(toAbsoluteUrl('/user1/repo2/actions/runs/123/jobs/1'));
  // eslint-disable-next-line no-restricted-globals
  history.back();
  await flushPromises();

  // Approve, Cancel, Re-run all buttons should all be suppressed...
  expect(buttonText(container, 'Locale Approve').length).toEqual(0);
  expect(buttonText(container, 'Locale Cancel').length).toEqual(0);
  expect(buttonText(container, 'Locale Re-run').length).toEqual(0);

  // Job list will be suppressed...
  expect(container.querySelectorAll('.job-group-section').length).toEqual(0);

  // Attempt selector dropdown...
  expect(container.querySelectorAll('.job-attempt-dropdown').length).toEqual(1);
  expect(container.querySelectorAll('.job-attempt-dropdown svg.octicon-x-circle-fill.text.red').length).toEqual(1);
  expect(container.querySelector('.job-attempt-dropdown .ui.dropdown').textContent.trim()).toEqual('Run attempt 1 two days ago');

  // Attempt status
  expect(container.querySelector('.job-info-header h3').textContent).toEqual('test');
  expect(container.querySelectorAll('ul.job-info-header-detail li').length).toEqual(1);
  expect(container.querySelector('ul.job-info-header-detail li:nth-child(1)').textContent).toEqual('Failure');
});

test('historical attempt dropdown interactions', async () => {
  const {container, component} = configureForMultipleAttemptTests({viewHistorical: true});
  await flushPromises();

  // Check dropdown exists, but isn't expanded.
  const attemptsNotExpanded = () => {
    expect(container.querySelectorAll('.job-attempt-dropdown').length).toEqual(1);
    expect(container.querySelectorAll('.job-attempt-dropdown .action-job-menu').length).toEqual(0);
  };
  attemptsNotExpanded();

  // Click on attempt dropdown
  (container.querySelector('.job-attempt-dropdown .ui.dropdown') as HTMLElement).click();
  await flushPromises();

  // Check dropdown is expanded and both options are displayed
  const attemptsExpanded = () => {
    expect(container.querySelectorAll('.job-attempt-dropdown .action-job-menu').length).toEqual(1);
    expect(container.querySelector('.job-attempt-dropdown .action-job-menu').classList).toContain('visible');
    const links = Array.from(container.querySelectorAll('.job-attempt-dropdown .action-job-menu a'));
    expect(links.filter((a) => a.textContent.trim() === 'Run attempt 3 yesterday').length).toEqual(1);
    expect(links.filter((a) => a.textContent.trim() === 'Run attempt 1 two days ago').length).toEqual(1);
    return links;
  };
  attemptsExpanded();

  // Normally dismiss occurs on a body click event; simulate that by calling closeDropdown()
  component.closeDropdown();
  await flushPromises();

  // Should return to not expanded.
  attemptsNotExpanded();

  // Click on the gear dropdown
  (container.querySelector('.job-gear-dropdown') as HTMLElement).click();
  await flushPromises();

  // Check that gear's menu is expanded, and attempt dropdown isn't.
  expect(container.querySelectorAll('.job-gear-dropdown .action-job-menu').length).toEqual(1);
  expect(container.querySelector('.job-gear-dropdown .action-job-menu').classList).toContain('visible');
  attemptsNotExpanded();

  // Click on attempt dropdown
  (container.querySelector('.job-attempt-dropdown .ui.dropdown') as HTMLElement).click();
  await flushPromises();

  // Check that attempt dropdown expanded again, gear dropdown disappeared (mutually exclusive)
  expect(container.querySelectorAll('.job-gear-dropdown .action-job-menu').length).toEqual(0);
  const links = attemptsExpanded();

  // Click on the other option in the dropdown to verify it navigates to the target attempt
  (links.find((a) => a.textContent.trim() === 'Run attempt 3 yesterday') as HTMLElement).click();
  expect(window.location.href).toEqual(toAbsoluteUrl('/user1/repo2/actions/runs/123/jobs/1/attempt/3'));
});

test('run approval interaction', async () => {
  const pullRequestLink = '/example-org/example-repo/pulls/456';
  const {container} = render(RepoActionView, {
    props: {
      ...defaultTestProps,
      initialJobData: {
        state: {
          run: {
            canApprove: true,
            status: 'waiting',
            estimatedOutcome: 'unknown',
            commit: {
              pusher: {},
              branch: {
                link: toAbsoluteUrl(pullRequestLink),
              },
            },
          },
          currentJob: {
            summaries: [],
            steps: [
              {summary: 'Test Job', duration: '1s', status: 'success'},
            ],
          },
        },
        logs: {stepsLog: []},
      },
    },
  });
  await flushPromises();
  const approve = buttonText(container, 'Locale Approve');
  expect(approve.length).toEqual(1);
  approve[0].click();
  expect(window.location.href).toEqual(toAbsoluteUrl(`${pullRequestLink}#pull-request-trust-panel`));
});

test('artifacts download links', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
    if (String(url).endsWith('/artifacts')) {
      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          artifacts: [
            {name: 'artifactname1', size: 111, status: 'completed'},
            {name: 'artifactname2', size: 222, status: 'expired'},
          ],
        }),
      } as unknown as Response);
    }

    const postBody = JSON.parse(String(opts.body));
    const stepsLog_value = [];
    for (const cursor of postBody.logCursors) {
      if (cursor.expanded) {
        stepsLog_value.push({
          step: cursor.step,
          cursor: 0,
          lines: [{index: 1, message: `Step #${cursor.step + 1} Log #1`, timestamp: 0}],
        });
      }
    }
    const jobs_value = {
      state: {
        run: {
          status: 'success',
          estimatedOutcome: 'success',
          commit: {pusher: {}},
        },
        currentJob: {
          summaries: [],
          title: 'test',
          steps: [
            {summary: 'Test Step #1', duration: '1s', status: 'success'},
          ],
          allAttempts: [{number: 1, time_since_started_html: '', status: 'success', status_diagnostics: ['Success']}],
        },
      },
      logs: {
        stepsLog: String(opts.body ?? '').includes('"cursor":null') ? stepsLog_value : [],
      },
    };

    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(jobs_value),
    } as unknown as Response);
  });

  const {container, component} = render(RepoActionView, {props: defaultTestProps});
  await flushPromises();
  await component.loadJob();
  await flushPromises();

  expect(container.querySelector('.job-artifacts .job-artifacts-title').textContent.trim()).toEqual('artifactTitleHere');

  expect(container.querySelector('.job-artifacts .job-artifacts-item:nth-of-type(1) a')).toBeTruthy();
  // Expired artifacts should be listed, but not be linked, because they no longer exist.
  expect(container.querySelector('.job-artifacts .job-artifacts-item:nth-of-type(2) a')).toBeFalsy();

  expect(container.querySelector('.job-artifacts .job-artifacts-item:nth-of-type(1) .job-artifacts-link').getAttribute('href'))
    .toEqual('https://example.com/example-org/example-repo/actions/runs/1001/artifacts/artifactname1');
});

test('initial load schedules refresh when job is not done', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  vi.spyOn(global, 'fetch').mockImplementation((url, _opts) => {
    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(String(url).endsWith('/artifacts') ? minimalInitialArtifactData : minimalInitialJobData),
    } as unknown as Response);
  });

  // Provide a job that is "done" so that the component doesn't start incremental refresh...
  {
    const doneInitialJobData = structuredClone(minimalInitialJobData) as {state: {run: Record<string, unknown>}};
    doneInitialJobData.state.run.done = true;
    const {container, unmount} = render(RepoActionView, {
      props: {...defaultTestProps, initialJobData: doneInitialJobData},
    });
    await flushPromises();
    const view = container.querySelector('.action-view-container');
    expect(view).toBeTruthy();
    expect(view.classList).not.toContain('interval-pending');
    unmount();
  }

  // Provide a job that is *not* "done" so that the component does start incremental refresh...
  {
    const runningInitialJobData = structuredClone(minimalInitialJobData) as {state: {run: Record<string, unknown>}};
    runningInitialJobData.state.run.done = false;
    const {container, unmount} = render(RepoActionView, {props: defaultTestProps});
    await flushPromises();
    const view = container.querySelector('.action-view-container');
    expect(view).toBeTruthy();
    expect(view.classList).toContain('interval-pending');
    unmount();
  }
});

test('unmount clears the refresh interval and listeners', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  vi.spyOn(global, 'fetch').mockImplementation((url, _opts) => {
    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(String(url).endsWith('/artifacts') ? minimalInitialArtifactData : minimalInitialJobData),
    } as unknown as Response);
  });

  const runningInitialJobData = structuredClone(minimalInitialJobData) as {state: {run: Record<string, unknown>}};
  runningInitialJobData.state.run.done = false;
  const {container, unmount} = render(RepoActionView, {
    props: {...defaultTestProps, initialJobData: runningInitialJobData},
  });
  await flushPromises();
  expect(container.querySelector('.action-view-container').classList).toContain('interval-pending');

  const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
  unmount();
  expect(clearIntervalSpy).toHaveBeenCalled();
});

test('initial load data is used without calling fetch()', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, _opts) => {
    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(String(url).endsWith('/artifacts') ? minimalInitialArtifactData : minimalInitialJobData),
    } as unknown as Response);
  });

  render(RepoActionView, {props: defaultTestProps});
  await flushPromises();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('view non-picked action run job', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const {container} = render(RepoActionView, {
    props: {
      ...defaultTestProps,
      initialJobData: {
        ...minimalInitialJobData,
        // Definitions here should match the same type of content as the related backend test,
        // "TestActionsViewViewPost/attempt out-of-bounds on non-picked task", so that we're sure we can handle in the
        // UI what the backend will deliver in this case.
        state: {
          run: {
            done: false,
            status: 'waiting',
            estimatedOutcome: 'unknown',
            commit: {
              pusher: {},
            },
            jobs: [
              {id: 161, name: 'check-1', status: 'waiting', canRerun: false, duration: '0s'},
              {id: 162, name: 'check-2', status: 'waiting', canRerun: false, duration: '0s'},
              {id: 163, name: 'check-3', status: 'waiting', canRerun: false, duration: '0s'},
            ],
          },
          currentJob: {
            summaries: [],
            title: 'check-1',
            steps: [],
            allAttempts: [{number: 1, time_since_started_html: '', status: 'Waiting', status_diagnostics: ['Waiting']}],
          },
        },
      },
    },
  });
  await flushPromises();

  expect(container.querySelector('.job-info-header-detail li:first-child').textContent).toEqual('Waiting');
  expect(container.querySelector('.job-brief-list .job-brief-item:nth-of-type(1) .job-brief-name').textContent).toEqual('check-1');
  expect(container.querySelector('.job-brief-list .job-brief-item:nth-of-type(2) .job-brief-name').textContent).toEqual('check-2');
  expect(container.querySelector('.job-brief-list .job-brief-item:nth-of-type(3) .job-brief-name').textContent).toEqual('check-3');

  // Attempt status
  expect(container.querySelector('.job-info-header h3').textContent).toEqual('check-1');
  expect(container.querySelectorAll('ul.job-info-header-detail li').length).toEqual(1);
  expect(container.querySelector('ul.job-info-header-detail li:nth-child(1)').textContent).toEqual('Waiting');
});

test('view without pre-execution error', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const {container} = render(RepoActionView, {props: defaultTestProps});
  await flushPromises();
  expect(container.querySelector('.pre-execution-error')).toBeFalsy();
});

test('view with pre-execution error', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const {container} = render(RepoActionView, {
    props: {
      ...defaultTestProps,
      initialJobData: {
        ...minimalInitialJobData,
        state: {
          ...minimalInitialJobData.state,
          run: {
            ...minimalInitialJobData.state.run,
            preExecutionError: 'Oops, I dropped it.',
          },
        },
      },
    },
  });
  await flushPromises();
  const block = container.querySelector('.error.pre-execution-error');
  expect(block).toBeTruthy();
  expect(block.textContent.trim()).toBe('pre-execution error Oops, I dropped it.');
});

test('view with pre-execution warning error', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const {container} = render(RepoActionView, {
    props: {
      ...defaultTestProps,
      initialJobData: {
        ...minimalInitialJobData,
        state: {
          ...minimalInitialJobData.state,
          run: {
            ...minimalInitialJobData.state.run,
            preExecutionWarnings: [
              'Warning 1: Action looks unstable.',
              'Warning 1: Action looks floppy.',
            ],
          },
        },
      },
    },
  });
  await flushPromises();
  const block = container.querySelector('.warning.pre-execution-error');
  expect(block).toBeTruthy();
  expect(block.textContent.replace(/\s+/g, '')).toBe('pre-executionwarningWarning1:Actionlooksunstable.Warning1:Actionlooksfloppy.');
});

test('markup renderer are initialized on changes to the step-summary', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  let summaries = ['<p>first</p>'];
  let steps = [];
  let runStatus = 'running';
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    if (String(url).endsWith('/artifacts')) {
      return Promise.resolve({ok: true, json: vi.fn().mockResolvedValue({artifacts: []})} as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue({
        state: {
          run: {status: runStatus, commit: {pusher: {}}},
          currentJob: {title: 'test', steps, allAttempts: [], summaries},
        },
        logs: {stepsLog: []},
      }),
    } as unknown as Response);
  });

  const {component} = render(RepoActionView, {props: defaultTestProps});
  await flushPromises();
  (initMarkupContent as ReturnType<typeof vi.fn>).mockClear();

  await component.loadJob();
  await flushPromises();
  expect(initMarkupContent).toHaveBeenCalledTimes(1);

  // a poll where the job progressed but the summaries stayed the same
  // does not re-initialize the markup renderer
  // A new step does not magically appear but the intent is to emphasize that initMarkupContent only invokes for changing summaries
  steps = [{summary: 'a new step', duration: '1s', status: 'running'}];
  runStatus = 'success';
  await component.loadJob();
  await flushPromises();
  expect(initMarkupContent).toHaveBeenCalledTimes(1);

  // a grown summary does
  summaries = ['<p>first</p>', '<p>second</p>'];
  await component.loadJob();
  await flushPromises();
  expect(initMarkupContent).toHaveBeenCalledTimes(2);
});

test('attempt dropdown label and items have no stray whitespace', async () => {
  const {container} = configureForMultipleAttemptTests({viewHistorical: true});
  await flushPromises();

  const label = container.querySelector('.job-attempt-dropdown .default.text');
  expect(label.textContent).toEqual('Run attempt 1 two days ago');
  expect(Array.from(label.childNodes).filter((n) => n.nodeType === 3 && n.nodeValue !== '').map((n) => n.nodeValue)).toEqual([]);

  (container.querySelector('.job-attempt-dropdown .ui.dropdown') as HTMLElement).click();
  await flushPromises();
  const items = Array.from(container.querySelectorAll('.job-attempt-dropdown .action-job-menu a.item'));
  expect(items.map((a) => a.textContent)).toEqual(['Run attempt 3 yesterday', 'Run attempt 1 two days ago']);
});

test('attempt dropdown is keyboard focusable but does not take focus on mouse down', async () => {
  const {container} = configureForMultipleAttemptTests({viewHistorical: true});
  await flushPromises();

  const dropdown = container.querySelector('.job-attempt-dropdown .ui.dropdown') as HTMLElement;
  expect(dropdown.getAttribute('role')).toEqual('button');
  expect(dropdown.getAttribute('tabindex')).toEqual('0');
  expect(await fireEvent.mouseDown(dropdown)).toEqual(false);

  await fireEvent.keyDown(dropdown, {key: 'Enter'});
  await flushPromises();
  expect(container.querySelectorAll('.job-attempt-dropdown .action-job-menu').length).toEqual(1);
});

test('gear dropdown uses the inner button for keyboard access and plain item buttons', async () => {
  const {container} = configureForMultipleAttemptTests({viewHistorical: true});
  await flushPromises();

  const gear = container.querySelector('.job-gear-dropdown') as HTMLElement;
  expect(gear.hasAttribute('tabindex')).toBe(false);
  expect(gear.hasAttribute('role')).toBe(false);
  expect(gear.querySelector('button.btn')).toBeTruthy();

  gear.click();
  await flushPromises();
  const items = Array.from(gear.querySelectorAll('.menu > .item'));
  expect(items.map((x) => x.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'A']);
  expect(items.filter((x) => x.tagName === 'BUTTON').map((x) => x.getAttribute('type'))).toEqual(['button', 'button', 'button', 'button', 'button']);

  // like the original anchors, activating a menu item bubbles to the dropdown and closes the menu
  (items[0] as HTMLElement).click();
  await flushPromises();
  expect(gear.querySelectorAll('.action-job-menu').length).toEqual(0);
});

test('artifact delete is a plain button that asks for confirmation', async () => {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url) => {
    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(String(url).endsWith('/artifacts') ? {artifacts: []} : minimalInitialJobData),
    } as unknown as Response);
  });
  const confirmSpy = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirmSpy);
  const jobData = structuredClone(minimalInitialJobData) as {state: {run: Record<string, unknown>}};
  jobData.state.run.canDeleteArtifact = true;
  jobData.state.run.link = '/example-org/example-repo/actions/runs/10';
  const {container} = render(RepoActionView, {
    props: {
      ...defaultTestProps,
      initialJobData: jobData,
      initialArtifactData: {artifacts: [{name: 'artifactname1', size: 111, status: 'completed'}]},
    },
  });
  await flushPromises();

  const del = container.querySelector('.job-artifacts-item .job-artifacts-delete') as HTMLElement;
  expect(del.tagName).toEqual('BUTTON');
  expect(del.getAttribute('type')).toEqual('button');
  expect(del.querySelector('svg.octicon-trash')).toBeTruthy();

  del.click();
  expect(confirmSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy).not.toHaveBeenCalled();

  confirmSpy.mockReturnValue(true);
  del.click();
  await flushPromises();
  expect(fetchSpy.mock.calls.some(([url, opts]) => String(url) === '/example-org/example-repo/actions/runs/10/artifacts/artifactname1' && opts?.method === 'DELETE')).toBe(true);
});

describe('log search bar', () => {
  test('toggle button opens and closes the bar', async () => {
    const {container} = render(RepoActionView, {props: defaultTestProps});
    await flushPromises();
    const toggle = container.querySelector('.job-info-header-right > button.btn');
    expect(toggle).toBeTruthy();
    (toggle as HTMLElement).click();
    await flushPromises();
    expect(container.querySelector('.action-log-search')).toBeTruthy();
    (toggle as HTMLElement).click();
    await flushPromises();
    expect(container.querySelector('.action-log-search')).toBeNull();
  });

  test('pressing "/" opens the bar', async () => {
    const {container} = render(RepoActionView, {props: defaultTestProps});
    await flushPromises();
    await fireEvent.keyDown(document.body, {key: '/'});
    await flushPromises();
    expect(container.querySelector('.action-log-search')).toBeTruthy();
  });

  test('"/" typed inside an input does not open the bar', async () => {
    const {container} = render(RepoActionView, {props: defaultTestProps});
    await flushPromises();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await fireEvent.keyDown(input, {key: '/'});
    await flushPromises();
    expect(container.querySelector('.action-log-search')).toBeNull();
    input.remove();
  });

  test('Esc closes the bar and focus returns to the toggle button', async () => {
    const {container} = render(RepoActionView, {props: defaultTestProps});
    await flushPromises();
    const toggle = container.querySelector('.job-info-header-right > button.btn') as HTMLElement;
    toggle.click();
    await flushPromises();
    expect(container.querySelector('.action-log-search')).toBeTruthy();
    const input = container.querySelector('.action-log-search-input');
    await fireEvent.keyDown(input, {key: 'Escape'});
    await flushPromises();
    expect(container.querySelector('.action-log-search')).toBeNull();
    expect(document.activeElement).toEqual(toggle);
  });
});

function setupFailedStep(lines = [{index: 1, message: 'all ok', timestamp: 0}, {index: 2, message: 'error: boom', timestamp: 1}], jobStatus = 'success') {
  Object.defineProperty(document.documentElement, 'lang', {value: 'en'});
  const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, opts) => {
    if (String(url).endsWith('/artifacts')) {
      return Promise.resolve({ok: true, json: vi.fn().mockResolvedValue({artifacts: []})} as unknown as Response);
    }
    const stepsLog_value = [];
    for (const cursor of JSON.parse(String(opts.body ?? '{}')).logCursors ?? []) {
      if (cursor.expanded) stepsLog_value.push({step: cursor.step, cursor: 0, lines});
    }
    return Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue({
        state: {
          run: {done: true, status: 'success', estimatedOutcome: 'success', commit: {pusher: {}}},
          currentJob: {
            summaries: [],
            title: 'test',
            steps: [
              {summary: 'Step one', duration: '1s', status: 'success'},
              {summary: 'Step two', duration: '1s', status: 'failure'},
            ],
          },
        },
        logs: {stepsLog: stepsLog_value},
      }),
    } as unknown as Response);
  });
  return {fetchSpy, jobStatus};
}

function failedStepProps() {
  return {
    ...defaultTestProps,
    initialJobData: {
      state: {
        run: {done: true, status: 'success', estimatedOutcome: 'failure', commit: {pusher: {}}},
        currentJob: {
          summaries: [],
          title: 'test',
          steps: [
            {summary: 'Step one', duration: '1s', status: 'success'},
            {summary: 'Step two', duration: '1s', status: 'failure'},
          ],
        },
      },
      logs: {stepsLog: []},
    },
  };
}

describe('log features', () => {
  test('jump button hidden without a failed step and shown with one', async () => {
    const {container, unmount} = render(RepoActionView, {props: defaultTestProps});
    await flushPromises();
    expect(container.querySelector('button[aria-label="Jump to first error"]')).toBeNull();
    unmount();

    setupFailedStep();
    const r = render(RepoActionView, {props: failedStepProps()});
    await flushPromises();
    expect(r.container.querySelector('button[aria-label="Jump to first error"]')).toBeTruthy();
  });

  test('jump to first error expands collapsed step and sets hash to first error line', async () => {
    setupFailedStep();
    const {container} = render(RepoActionView, {props: failedStepProps()});
    await flushPromises();
    (container.querySelector('button[aria-label="Jump to first error"]') as HTMLElement).click();
    await vi.waitFor(() => expect(container.querySelector('#jobstep-1-2 .log-msg')?.textContent).toEqual('error: boom'));
    expect(window.location.hash).toEqual('#jobstep-1-2');
  });

  test('jump to first error falls back to last line when no error text matches', async () => {
    setupFailedStep([{index: 1, message: 'all ok', timestamp: 0}, {index: 2, message: 'still fine', timestamp: 1}]);
    const {container} = render(RepoActionView, {props: failedStepProps()});
    await flushPromises();
    (container.querySelector('button[aria-label="Jump to first error"]') as HTMLElement).click();
    await vi.waitFor(() => expect(window.location.hash).toEqual('#jobstep-1-2'));
  });

  test('auto-expand expands first failed step on initial load when done and no hash', async () => {
    setupFailedStep();
    const {container} = render(RepoActionView, {props: failedStepProps()});
    await vi.waitFor(() => expect(container.querySelector('#jobstep-1-1 .log-msg')).toBeTruthy());
  });

  test('no auto-expand when a hash is present', async () => {
    setupFailedStep();
    window.location.hash = '#jobstep-0-1';
    const {container} = render(RepoActionView, {props: failedStepProps()});
    await flushPromises();
    expect(container.querySelector('#jobstep-1-1 .log-msg')).toBeNull();
    window.location.hash = '';
  });

  test('expand all and collapse all via gear menu', async () => {
    setupFailedStep();
    const {container} = render(RepoActionView, {props: failedStepProps()});
    await flushPromises();
    (container.querySelector('.job-gear-dropdown .btn') as HTMLElement).click();
    await flushPromises();
    (buttonText(container, 'Expand all steps')[0]).click();
    await vi.waitFor(() => expect(container.querySelector('#jobstep-0-1 .log-msg')).toBeTruthy());
    (container.querySelector('.job-gear-dropdown .btn') as HTMLElement).click();
    await flushPromises();
    (buttonText(container, 'Collapse all steps')[0]).click();
    await flushPromises();
    expect(container.querySelector<HTMLElement>('#jobstep-0-1')?.closest('.job-step-section').querySelector<HTMLElement>('.job-step-logs').style.display).toEqual('none');
  });
});
