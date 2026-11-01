import {describe, expect, test, vi} from 'vitest';
import {render} from '@testing-library/svelte';
import {mount, tick, unmount} from 'svelte';
import ContextPopup from './ContextPopup.svelte';

function mockIssueFetch(data: Record<string, unknown>) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    json: vi.fn().mockResolvedValue({
      ok: true,
      created_at: '2024-07-13T22:00:00Z',
      repository: {full_name: 'user2/repo1'},
      ...data,
    }),
    ok: true,
  } as unknown as Response);
}

function loadPopup(container: HTMLElement, detail: Record<string, unknown>) {
  const root = container.querySelector('div');
  root.dispatchEvent(new CustomEvent('ce-load-context-popup', {detail}));
}

function getParagraph(container: HTMLElement, n: number): HTMLElement {
  return container.querySelector(`p:nth-of-type(${n})`);
}

async function assertPopup(popupData: Record<string, unknown> & {number: number, title: string, body: string, labels: Array<{name: string, color?: string}>}, expectedIconColor: string, expectedIcon: string) {
  const date = new Date('2024-07-13T22:00:00Z');
  mockIssueFetch(popupData);

  const {container} = render(ContextPopup);
  loadPopup(container, {owner: 'user2', repo: 'repo1', index: popupData.number});
  await vi.waitFor(() => expect(container.querySelector('#issue-info-popup')).toBeTruthy());

  expect(getParagraph(container, 1).textContent.trim()).toEqual(`user2/repo1 on ${date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'})}`);
  expect(getParagraph(container, 2).textContent.trim()).toEqual(`${popupData.title} #${popupData.number}`);
  expect(getParagraph(container, 3).textContent.trim()).toEqual(popupData.body);

  const svg = container.querySelector('svg');
  expect(svg.classList).toContain(expectedIcon);
  expect(svg.classList).toContain(expectedIconColor);

  const labelTexts = Array.from(container.querySelectorAll('.ui.label'), (x) => x.textContent.trim());
  for (const l of popupData.labels) {
    expect(labelTexts).toContain(l.name);
  }
}

describe('ContextPopup', () => {
  test('renders an open issue popup', async () => {
    await assertPopup({
      title: 'Open Issue',
      body: 'Open Issue Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'open',
      pull_request: null,
    }, 'green', 'octicon-issue-opened');
  });

  test('renders a closed issue popup', async () => {
    await assertPopup({
      title: 'Closed Issue',
      body: 'Closed Issue Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'closed',
      pull_request: null,
    }, 'red', 'octicon-issue-closed');
  });

  test('renders an open PR popup', async () => {
    await assertPopup({
      title: 'Open PR',
      body: 'Open PR Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'open',
      pull_request: {merged: false, draft: false},
    }, 'green', 'octicon-git-pull-request');
  });

  test('renders an open WIP PR popup', async () => {
    await assertPopup({
      title: 'WIP: Open PR',
      body: 'WIP Open PR Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'open',
      pull_request: {merged: false, draft: true},
    }, 'grey', 'octicon-git-pull-request-draft');
  });

  test('renders a closed PR popup', async () => {
    await assertPopup({
      title: 'Closed PR',
      body: 'Closed PR Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'closed',
      pull_request: {merged: false, draft: false},
    }, 'red', 'octicon-git-pull-request-closed');
  });

  test('renders a closed WIP PR popup', async () => {
    await assertPopup({
      title: 'WIP: Closed PR',
      body: 'WIP Closed PR Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'closed',
      pull_request: {merged: false, draft: true},
    }, 'red', 'octicon-git-pull-request-closed');
  });

  test('renders a merged PR popup', async () => {
    await assertPopup({
      title: 'Merged PR',
      body: 'Merged PR Body',
      number: 1,
      labels: [{color: 'd21b1fff', name: 'Bug'}, {color: 'aaff00', name: 'Confirmed'}],
      state: 'closed',
      pull_request: {merged: true, draft: false},
    }, 'purple', 'octicon-git-merge');
  });

  test('renders an issue popup with escaped HTML', async () => {
    const evil = '<script class="evil">alert("evil message");</script>';
    mockIssueFetch({
      repository: {full_name: evil},
      title: evil,
      body: evil,
      number: 1,
      labels: [{color: '000666', name: evil}],
      state: 'open',
      pull_request: null,
    });

    const {container} = render(ContextPopup);
    loadPopup(container, {owner: evil, repo: evil, index: 1});
    await vi.waitFor(() => expect(container.querySelector('#issue-info-popup')).toBeTruthy());

    expect(container.querySelector('.evil')).toBeNull();
    expect(getParagraph(container, 1).textContent).toContain(evil);
    expect(getParagraph(container, 2).textContent).toContain(evil);
    expect(getParagraph(container, 3).textContent).toContain(evil);
  });

  test('renders an issue popup with emojis', async () => {
    mockIssueFetch({
      title: 'Title',
      body: 'Body',
      number: 1,
      labels: [{color: '000666', name: 'Tag :+1:'}],
      state: 'open',
      pull_request: null,
    });

    const {container} = render(ContextPopup);
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 1});
    await vi.waitFor(() => expect(container.querySelector('.ui.label')).toBeTruthy());

    expect(container.querySelector('.ui.label').textContent).toEqual('Tag 👍');
  });

  test('applies label colors and truncates long bodies', async () => {
    mockIssueFetch({
      title: 'Title',
      body: `${'a'.repeat(100)}\n\n${'b'.repeat(10)}`,
      number: 3,
      labels: [{color: 'ff0000', name: 'Red'}],
      state: 'open',
      pull_request: null,
    });

    const {container} = render(ContextPopup);
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 3});
    await vi.waitFor(() => expect(container.querySelector('#issue-info-popup')).toBeTruthy());

    expect(getParagraph(container, 3).textContent).toEqual(`${'a'.repeat(85)}…`);
    const label = container.querySelector<HTMLElement>('.ui.label');
    expect(label.style.backgroundColor).not.toEqual('');
    expect(label.style.color).not.toEqual('');
  });

  test('requests the issue info url and loads only once', async () => {
    const fetchSpy = mockIssueFetch({
      title: 'Title',
      body: 'Body',
      number: 5,
      labels: [],
      state: 'open',
      pull_request: null,
    });

    const {container} = render(ContextPopup);
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 5});
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 5});
    await vi.waitFor(() => expect(container.querySelector('#issue-info-popup')).toBeTruthy());
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 5});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/user2/repo1/issues/5/info');
  });

  test('shows the error message of a failed response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: vi.fn().mockResolvedValue({message: 'issue not found'}),
      ok: false,
    } as unknown as Response);

    const {container} = render(ContextPopup);
    expect(container.querySelector('#issue-info-popup')).toBeNull();
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 1});
    await vi.waitFor(() => expect(container.textContent).toContain('issue not found'));

    expect(container.querySelector('#issue-info-popup')).toBeNull();
    expect(container.querySelector('.is-loading')).toBeNull();
  });

  test('shows the network error when fetch rejects', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const i18n = window.config.i18n as unknown as Record<string, string>;
    const original = i18n.network_error;
    i18n.network_error = 'network down';

    try {
      const {container} = render(ContextPopup);
      loadPopup(container, {owner: 'user2', repo: 'repo1', index: 1});
      await vi.waitFor(() => expect(container.textContent).toContain('network down'));
      expect(container.querySelector('#issue-info-popup')).toBeNull();
    } finally {
      i18n.network_error = original;
    }
  });

  test('shows a loading placeholder while fetching', async () => {
    let resolveFetch: (value: unknown) => void;
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }) as Promise<Response>);

    const {container} = render(ContextPopup);
    loadPopup(container, {owner: 'user2', repo: 'repo1', index: 1});
    await vi.waitFor(() => expect(container.querySelector('.is-loading')).toBeTruthy());

    resolveFetch({
      json: vi.fn().mockResolvedValue({
        created_at: '2024-07-13T22:00:00Z',
        repository: {full_name: 'user2/repo1'},
        title: 'Title',
        body: 'Body',
        number: 1,
        labels: [],
        state: 'open',
        pull_request: null,
      }),
      ok: true,
    });
    await vi.waitFor(() => expect(container.querySelector('#issue-info-popup')).toBeTruthy());
    expect(container.querySelector('.is-loading')).toBeNull();
  });

  test('loads when the event is dispatched on the first child of the mount target', async () => {
    mockIssueFetch({
      title: 'Mounted',
      body: 'Body',
      number: 1,
      labels: [],
      state: 'open',
      pull_request: null,
    });

    const el = document.createElement('div');
    document.body.append(el);
    const instance = mount(ContextPopup, {target: el});
    await tick();
    el.firstChild.dispatchEvent(new CustomEvent('ce-load-context-popup', {detail: {owner: 'user2', repo: 'repo1', index: 1}}));
    await vi.waitFor(() => expect(el.querySelector('#issue-info-popup')).toBeTruthy());
    await unmount(instance);
    el.remove();
  });
});
