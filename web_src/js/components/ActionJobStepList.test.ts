// Copyright 2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import ActionJobStepList from './ActionJobStepList.svelte';

vi.mock('../utils/time.js', () => ({
  formatDatetime: vi.fn((date) => date.toISOString()),
}));

describe('ActionJobStepList', () => {
  const mockIsExpandable = vi.fn(() => true);
  const mockIsDone = vi.fn(() => true);

  const defaultProps = {
    steps: [
      {status: 'success', summary: 'step 1 - go grocery shopping', duration: '3601s'},
      {status: 'running', summary: 'step 2 - cook food', duration: '301s'},
      {status: 'waiting', summary: 'step 3 - eat food', duration: ''},
    ],
    stepStates: [
      {cursor: null, expanded: false},
      {cursor: null, expanded: false},
      {cursor: null, expanded: false},
    ],
    runStatus: 'running',
    isExpandable: mockIsExpandable,
    isDone: mockIsDone,
    timeVisibleTimestamp: false,
    timeVisibleSeconds: false,
  };

  function createWrapper(props = {}) {
    return render(ActionJobStepList, {
      props: {
        ...defaultProps,
        ...props,
      },
    });
  }

  test('pass-through to ActionJobStep', () => {
    // ActionJobStepList's tests don't need to validate the functionality of ActionJobStep -- that is the responsibility
    // of its own tests.  But we should validate that ActionJobStepList invokes the child element and passes in relevant
    // data.
    const {container} = createWrapper();
    const summaries = container.querySelectorAll('.job-step-summary');
    expect(summaries).toHaveLength(3);
    expect(summaries[0].querySelector('.step-summary-msg').textContent).toEqual('step 1 - go grocery shopping');
    expect(summaries[0].querySelector('.step-summary-duration').textContent).toEqual('3601s');
  });

  test('render list elements', () => {
    const {container} = createWrapper();
    expect(container.querySelectorAll('.job-step-container')).toHaveLength(1);
    expect(container.querySelectorAll('.job-step-section')).toHaveLength(3);
  });

  test('render empty', () => {
    const {container} = createWrapper({steps: []});
    expect(container.querySelectorAll('.job-step-container')).toHaveLength(0);
    expect(container.querySelectorAll('.job-step-section')).toHaveLength(0);
  });

  test('pass-through appendLogs', async () => {
    const {container, component} = createWrapper({
      stepStates: [
        {cursor: 0, expanded: true},
        {cursor: null, expanded: false},
        {cursor: null, expanded: false},
      ],
    });

    expect(container.querySelectorAll('.job-log-line').length).toEqual(0);

    const logLines = [
      {index: 1, timestamp: 1765163618, message: 'Starting build'},
      {index: 2, timestamp: 1765163619, message: 'Running tests'},
      {index: 3, timestamp: 1765163620, message: 'Build complete'},
    ];
    await component.appendLogs(0, logLines, 1765163618);

    expect(container.querySelectorAll('.job-log-line').length).toEqual(3);
  });

  test('toggle visibility of timestamp', async () => {
    const {container, component, rerender} = createWrapper({
      stepStates: [
        {cursor: 0, expanded: true},
        {cursor: null, expanded: false},
        {cursor: null, expanded: false},
      ],
    });
    const logLines = [
      {index: 1, timestamp: 1765163618, message: 'Starting build'},
    ];
    await component.appendLogs(0, logLines, 1765163618);

    // pre-condition - expect log timestamps are hidden
    expect(container.querySelector('.log-time-stamp')).toBeTruthy();
    expect(container.querySelector('.log-time-stamp').classList).toContain('tw:hidden');

    await rerender({...defaultProps, timeVisibleTimestamp: true, stepStates: [
      {cursor: 0, expanded: true},
      {cursor: null, expanded: false},
      {cursor: null, expanded: false},
    ]});

    expect(container.querySelector('.log-time-stamp')).toBeTruthy();
    expect(container.querySelector('.log-time-stamp').classList).not.toContain('tw:hidden');
  });

  test('toggle visibility of duration seconds', async () => {
    const {container, component, rerender} = createWrapper({
      stepStates: [
        {cursor: 0, expanded: true},
        {cursor: null, expanded: false},
        {cursor: null, expanded: false},
      ],
    });
    const logLines = [
      {index: 1, timestamp: 1765163618, message: 'Starting build'},
    ];
    await component.appendLogs(0, logLines, 1765163618);

    // pre-condition - expect log time seconds are hidden
    expect(container.querySelector('.log-time-seconds')).toBeTruthy();
    expect(container.querySelector('.log-time-seconds').classList).toContain('tw:hidden');

    await rerender({...defaultProps, timeVisibleSeconds: true, stepStates: [
      {cursor: 0, expanded: true},
      {cursor: null, expanded: false},
      {cursor: null, expanded: false},
    ]});

    expect(container.querySelector('.log-time-seconds')).toBeTruthy();
    expect(container.querySelector('.log-time-seconds').classList).not.toContain('tw:hidden');
  });

  test('calls onToggleStepLogs with step index on click', async () => {
    const onToggleStepLogs = vi.fn();
    const {container} = createWrapper({onToggleStepLogs});
    (container.querySelector('.job-step-summary') as HTMLElement).click();
    expect(onToggleStepLogs).toHaveBeenCalledTimes(1);
    expect(onToggleStepLogs).toHaveBeenCalledWith(0);
  });

  test('scrollIntoView focuses on a line from the log', async () => {
    const {container, component} = createWrapper({
      stepStates: [
        {cursor: 0, expanded: true},
        {cursor: null, expanded: false},
        {cursor: null, expanded: false},
      ],
    });
    const logLines = [];
    for (let i = 0; i < 1000; i++) {
      logLines.push({index: 1 + i, timestamp: 1765163618 + i, message: `Line ${i}`});
    }
    await component.appendLogs(0, logLines, 1765163618);

    const scrollIntoViewMock = vi.fn();
    const targetElement = container.querySelector('#jobstep-0-999 .line-num') as HTMLElement;
    targetElement.scrollIntoView = scrollIntoViewMock;

    component.scrollIntoView(0, '#jobstep-0-999');

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});
