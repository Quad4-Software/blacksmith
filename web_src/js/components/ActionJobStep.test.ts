// Copyright 2025 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

import {describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import ActionJobStep from './ActionJobStep.svelte';

vi.mock('../utils/time.js', () => ({
  formatDatetime: vi.fn((date) => date.toISOString()),
}));

function firstIconClass(container: Element) {
  return container.querySelector('.job-step-summary > svg').classList;
}

describe('ActionJobStep', () => {
  const defaultProps = {
    stepId: 12321,
    status: 'success',
    runStatus: 'success',
    expanded: false,
    isExpandable: vi.fn(() => true),
    isDone: vi.fn(() => true),
    cursor: null,
    summary: 'Build project',
    duration: '2m 30s',
    timeVisibleTimestamp: false,
    timeVisibleSeconds: false,
  };

  function createWrapper(props = {}) {
    return render(ActionJobStep, {
      props: {
        ...defaultProps,
        ...props,
      },
    });
  }

  describe('rendering', () => {
    test('renders job step summary correctly', () => {
      const {container} = createWrapper();
      expect(container.querySelector('.job-step-summary')).toBeTruthy();
      expect(container.querySelector('.step-summary-msg').textContent).toBe('Build project');
      expect(container.querySelector('.step-summary-duration').textContent).toBe('2m 30s');
    });

    test('shows loading icon when expanded and cursor is null', () => {
      const {container} = createWrapper({expanded: true, cursor: null});
      expect(firstIconClass(container).contains('octicon-sync')).toBeTruthy();
    });

    test('shows chevron-down when expanded', () => {
      const {container} = createWrapper({expanded: true, cursor: 10});
      expect(firstIconClass(container).contains('octicon-chevron-down')).toBeTruthy();
    });

    test('shows chevron-right when not expanded', () => {
      const {container} = createWrapper({expanded: false});
      expect(firstIconClass(container).contains('octicon-chevron-right')).toBeTruthy();
    });

    test('adds step-expandable class when step is expandable', () => {
      const {container} = createWrapper();
      expect(container.querySelector('.job-step-summary').classList).toContain('step-expandable');
    });

    test('does not add step-expandable class when step is not expandable', () => {
      const {container} = createWrapper({isExpandable: vi.fn(() => false)});
      expect(container.querySelector('.job-step-summary').classList).not.toContain('step-expandable');
    });

    test('adds selected class when expanded', () => {
      const {container} = createWrapper({expanded: true});
      expect(container.querySelector('.job-step-summary').classList).toContain('selected');
    });

    test('hides logs container when not expanded', () => {
      const {container} = createWrapper({expanded: false});
      expect((container.querySelector('.job-step-logs') as HTMLElement).style.display).toBe('none');
    });

    test('shows logs container when expanded', () => {
      const {container} = createWrapper({expanded: true});
      expect((container.querySelector('.job-step-logs') as HTMLElement).style.display).not.toBe('none');
    });
  });

  describe('events', () => {
    test('calls ontoggle on click when expandable', async () => {
      const ontoggle = vi.fn();
      const {container} = createWrapper({ontoggle});
      (container.querySelector('.job-step-summary') as HTMLElement).click();
      expect(ontoggle).toHaveBeenCalledTimes(1);
    });

    test('does not call ontoggle on click when not expandable', async () => {
      const ontoggle = vi.fn();
      const {container} = createWrapper({isExpandable: vi.fn(() => false), ontoggle});
      (container.querySelector('.job-step-summary') as HTMLElement).click();
      expect(ontoggle).not.toHaveBeenCalled();
    });

    test('calls ontoggle on Enter key when expandable', async () => {
      const ontoggle = vi.fn();
      const {container} = createWrapper({ontoggle});
      container.querySelector('.job-step-summary').dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', bubbles: true}));
      expect(ontoggle).toHaveBeenCalled();
    });

    test('calls ontoggle on Space key when expandable', async () => {
      const ontoggle = vi.fn();
      const {container} = createWrapper({ontoggle});
      container.querySelector('.job-step-summary').dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}));
      expect(ontoggle).toHaveBeenCalled();
    });
  });

  describe('appendLogs method', () => {
    test('creates log lines and appends them to container', async () => {
      const {container, component} = createWrapper();
      const logLines = [
        {index: 1, timestamp: 1765163618, message: 'Starting build'},
        {index: 2, timestamp: 1765163619, message: 'Running tests'},
        {index: 3, timestamp: 1765163620, message: 'Build complete'},
      ];

      await component.appendLogs(logLines, 1765163618);

      expect(container.querySelector('.job-step-logs').children.length).toBe(3);
    });

    test('renders OSC 8 hyperlinks in appended log messages as clickable links', async () => {
      const {container, component} = createWrapper();
      const logLines = [
        // OSC 8 hyperlink: ESC ] 8 ; ; <url> ESC \ <text> ESC ] 8 ; ; ESC \
        {index: 1, timestamp: 1765163618, message: 'See \x1b]8;;https://example.com/build\x1b\\the build\x1b]8;;\x1b\\'},
      ];

      await component.appendLogs(logLines, 1765163618);

      const logMessage = container.querySelector('.log-msg');
      const link = logMessage.querySelector('a');
      expect(link.getAttribute('href')).toEqual('https://example.com/build');
      expect(link.getAttribute('target')).toEqual('_blank');
      expect(link.getAttribute('rel')).toEqual('noopener noreferrer nofollow');
      expect(logMessage.textContent).toEqual('See the build');
    });

    test('if ANSI renders empty line, skip line & line number', async () => {
      const {container, component} = createWrapper({expanded: true});
      const logLines = [
        {index: 1, message: ']9;4;3\rM[?2026l[?2026h[J', timestamp: 0},
        {index: 2, message: 'second line', timestamp: 0},
        {index: 3, message: ']9;4;3\rM[?2026l[J]9;4;0[?2026h[J]9;4;1;0[?2026l[J]9;4;0', timestamp: 0},
        {index: 4, message: 'fourth line', timestamp: 0},
      ];
      await component.appendLogs(logLines, 1765163618);

      const lines = container.querySelectorAll('.job-log-line');
      expect(lines.length).toEqual(2);

      expect(lines[0].getAttribute('id')).toEqual('jobstep-12321-1');
      expect(lines[0].querySelector('.line-num').textContent).toEqual('1');
      expect(lines[0].querySelector('.line-num').getAttribute('href')).toEqual('#jobstep-12321-1');
      expect(lines[0].querySelector('.log-msg').textContent).toEqual('second line');

      expect(lines[1].getAttribute('id')).toEqual('jobstep-12321-2');
      expect(lines[1].querySelector('.line-num').textContent).toEqual('2');
      expect(lines[1].querySelector('.line-num').getAttribute('href')).toEqual('#jobstep-12321-2');
      expect(lines[1].querySelector('.log-msg').textContent).toEqual('fourth line');
    });
  });

  describe('createLogLine method', () => {
    test('creates log line with correct structure', () => {
      const {component} = createWrapper();
      const line = {
        index: 1,
        timestamp: 1765163618,
        message: 'Test message',
      };

      const logLine = component.createLogLine(line, 1765163618, {depth: 0, isHeader: false});

      expect((logLine as Element).classList.contains('job-log-line')).toBe(true);
      expect((logLine as Element).getAttribute('id')).toBe('jobstep-12321-1');
    });

    test('with timestamp', () => {
      const {component} = createWrapper({timeVisibleTimestamp: true});
      const line = {
        index: 1,
        timestamp: 1765163618,
        message: 'Test message',
      };

      const logLine = component.createLogLine(line, 1765163618, {depth: 0, isHeader: false});

      expect((logLine as Element).querySelector('.log-time-stamp').textContent).toBe('2025-12-08T03:13:38.000Z');
    });

    test('with duration', () => {
      const {component} = createWrapper({timeVisibleSeconds: true});
      const line = {
        index: 1,
        timestamp: 1765163618,
        message: 'Test message',
      };

      const logLine = component.createLogLine(line, 1765163618 - 150, {depth: 0, isHeader: false});

      expect((logLine as Element).querySelector('.log-time-seconds').textContent).toBe('150s');
    });

    test('creates line number link with correct href', () => {
      const {component} = createWrapper();
      const line = {
        index: 5,
        timestamp: 1765163618,
        message: 'Test',
      };

      const logLine = component.createLogLine(line, 1765163618, {depth: 0, isHeader: false});
      const lineNumber = (logLine as Element).querySelector('.line-num');

      expect(lineNumber.textContent).toBe('5');
      expect(lineNumber.getAttribute('href')).toEqual('#jobstep-12321-5');
    });
  });

  test('append logs with a group', async () => {
    const lines = [
      {index: 1, message: '##[group]Test group', timestamp: 0},
      {index: 2, message: 'A test line', timestamp: 0},
      {index: 3, message: '##[endgroup]', timestamp: 0},
      {index: 4, message: 'A line outside the group', timestamp: 0},
    ];

    const {container, component} = createWrapper();
    await component.appendLogs(lines, 1765163618);

    expect(container.querySelectorAll('.job-log-line').length).toEqual(3);

    // One log line in the <summary> ("Test group")...
    expect(container.querySelectorAll('details.log-msg summary span.log-msg').length).toEqual(1);
    expect(container.querySelector('details.log-msg summary span.log-msg').textContent).toEqual('Test group');

    // Another in the contents of the <details>, not under <summary> ("A test line"):
    expect(container.querySelectorAll('details.log-msg > div.job-log-line > span.log-msg').length).toEqual(1);
    expect(container.querySelector('details.log-msg > div.job-log-line > span.log-msg').textContent).toEqual('A test line');

    // Check if after the log list exists another log line
    expect(container.querySelector('.job-step-logs > .job-log-line > .log-msg').textContent).toEqual('A line outside the group');
  });

  test('scrollIntoView focuses on a line from the log', async () => {
    const {container, component} = createWrapper();
    const logLines = [
      {index: 1, timestamp: 1765163618, message: 'Starting build'},
      {index: 2, timestamp: 1765163619, message: 'Running tests'},
      {index: 3, timestamp: 1765163620, message: 'Build complete'},
    ];
    await component.appendLogs(logLines, 1765163618);

    const scrollIntoViewMock = vi.fn();
    const targetElement = container.querySelector('#jobstep-12321-1 .line-num') as HTMLElement;
    targetElement.scrollIntoView = scrollIntoViewMock;

    component.scrollIntoView('#jobstep-12321-1');

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});
