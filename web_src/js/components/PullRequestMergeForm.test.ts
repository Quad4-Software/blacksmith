// Copyright 2024 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: MIT
import {afterEach, describe, expect, test} from 'vitest';
import {render, fireEvent} from '@testing-library/svelte';
import {tick, type ComponentProps} from 'svelte';
import PullRequestMergeForm from './PullRequestMergeForm.svelte';

type Props = ComponentProps<typeof PullRequestMergeForm>;
type MergeForm = Props['mergeForm'];

const texts = {
  baseLink: '/user/repo/pulls/1',
  textDeleteBranch: 'Delete branch',
  textAutoMergeButtonWhenSucceed: '(When checks succeed)',
  textAutoMergeWhenSucceed: 'Auto merge when all checks succeed',
  textAutoMergeCancelSchedule: 'Cancel auto merge',
  textClearMergeMessage: 'Clear message',
  textClearMergeMessageHint: 'Clear the merge message',
  textMergeCommitId: 'Merge commit id',
  textCancel: 'Cancel',
  mergeMessageFieldPlaceHolder: 'Message placeholder',
};

function style(name: string, textDoMerge: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    allowed: true,
    textDoMerge,
    mergeTitleFieldText: `${name} title`,
    mergeMessageFieldText: `${name} message`,
    hideAutoMerge: false,
    ...extra,
  };
}

function makeForm(overrides: Partial<MergeForm> = {}): MergeForm {
  return {
    ...texts,
    defaultDeleteBranchAfterMerge: false,
    defaultMergeMessage: 'default message',
    defaultMergeStyle: 'merge',
    emptyCommit: false,
    hasPendingPullRequestMerge: false,
    hasPendingPullRequestMergeTip: '',
    isPullBranchDeletable: false,
    canMergeNow: true,
    allOverridableChecksOk: true,
    pullHeadCommitID: 'abc123',
    mergeStyles: [style('merge', 'Create merge commit')],
    ...overrides,
  } as MergeForm;
}

const mergeBtn = '.merge-button .ui.button .button-text';
const text = (el: Element) => el.textContent.trim();

async function renderMergeForm(branchName: string) {
  const mergeForm = {
    textDeleteBranch: `Delete branch "${branchName}"`,
    textDoMerge: 'Merge',
    defaultMergeStyle: 'merge',
    isPullBranchDeletable: true,
    canMergeNow: true,
    mergeStyles: [{
      'name': 'merge',
      'allowed': true,
      'textDoMerge': 'Merge',
      'mergeTitleFieldText': 'Merge PR',
      'mergeMessageFieldText': 'Description',
      'hideAutoMerge': 'Hide this message',
    }],
  } as unknown as MergeForm;
  const result = render(PullRequestMergeForm, {props: {mergeForm}});
  await fireEvent.click(result.container.querySelector('.merge-button'));
  await tick();
  return result;
}

const multi = () => makeForm({mergeStyles: [style('merge', 'Create merge commit'), style('rebase', 'Rebase', {hideAutoMerge: true}), style('squash', 'Squash', {allowed: false})]});

async function openForm(mergeForm: MergeForm) {
  const result = render(PullRequestMergeForm, {props: {mergeForm}});
  await fireEvent.click(result.container.querySelector('.merge-button .ui.button'));
  return result;
}

function addInstructions() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="m" data-pull-merge-style="merge"></div>
    <div id="r" class="tw:hidden" data-pull-merge-style="rebase"></div>
    <div id="s" class="tw:hidden" data-pull-merge-style="squash"></div>`);
}

function isHidden(id: string) {
  return document.getElementById(id).classList.contains('tw:hidden');
}

describe('PullRequestMergeForm', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('renders escaped branch name', async () => {
    let {container, unmount} = await renderMergeForm('<b>evil</b>');
    expect(container.querySelector('label[for="delete-branch-after-merge"]').textContent.trim()).toBe('Delete branch "<b>evil</b>"');
    expect(container.querySelector('label[for="delete-branch-after-merge"] b')).toBeNull();
    unmount();

    ({container, unmount} = await renderMergeForm('<script class="evil">alert("evil message");</script>'));
    expect(container.querySelector('label[for="delete-branch-after-merge"]').textContent.trim()).toBe('Delete branch "<script class="evil">alert("evil message");</script>"');
    expect(container.querySelector('script.evil')).toBeNull();
  });

  test('hides merge controls when no merge style is allowed', () => {
    const mergeForm = makeForm({mergeStyles: [style('merge', 'Merge', {allowed: false})]});
    const {container} = render(PullRequestMergeForm, {props: {mergeForm}});
    expect(container.querySelector('.merge-button')).toBeNull();
    expect(container.querySelector('form.form-fetch-action')).toBeNull();
  });

  test('shows merge styles dropdown when multiple merge styles are allowed', async () => {
    const mergeForm = makeForm({
      mergeStyles: [style('merge', 'Create merge commit'), style('rebase', 'Rebase then fast-forward')],
    });
    const {container} = render(PullRequestMergeForm, {props: {mergeForm}});
    await tick();
    expect(container.querySelector(mergeBtn)).toBeTruthy();
    expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit');
    expect(container.querySelector('.merge-button .single-merge-strategy-auto-merge-btn')).toBeNull();
    expect(container.querySelector('.merge-button .ui.dropdown .menu')).toBeTruthy();
    expect(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(1)')).toBeTruthy();
    expect(text(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(1) .action-text'))).toBe('Create merge commit');
    expect(text(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(1) .auto-merge-small'))).toBe('Auto merge when all checks succeed');
    expect(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(2)')).toBeTruthy();
    expect(text(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(2) .action-text'))).toBe('Rebase then fast-forward');
    expect(text(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(2) .auto-merge-small'))).toBe('Auto merge when all checks succeed');

    await fireEvent.click(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(2)'));
    expect(text(container.querySelector(mergeBtn))).toBe('Rebase then fast-forward');
    expect(container.querySelector('form')).toBeNull();

    await fireEvent.click(container.querySelector('.merge-button .ui.dropdown .menu .item:nth-of-type(1) .auto-merge-small'));
    expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit (When checks succeed)');
    expect(container.querySelector('form')).toBeNull();
  });

  test('shows auto merge button when a single merge style is allowed', async () => {
    const {container} = render(PullRequestMergeForm, {props: {mergeForm: makeForm()}});
    await tick();
    expect(container.querySelector(mergeBtn)).toBeTruthy();
    expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit');
    expect(container.querySelector('.merge-button .ui.dropdown .menu')).toBeNull();
    const autoMergeBtn = '.merge-button .single-merge-strategy-auto-merge-btn';
    expect(container.querySelector(autoMergeBtn)).toBeTruthy();
    const tooltip = '.merge-button .single-merge-strategy-auto-merge-btn .single-merge-strategy-auto-merge-tooltip';
    expect(container.querySelector(tooltip)).toBeTruthy();
    expect(text(container.querySelector(tooltip))).toBe('Auto merge when all checks succeed');

    await fireEvent.click(container.querySelector(autoMergeBtn));
    expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit (When checks succeed)');
    expect(text(container.querySelector(tooltip))).toBe('Cancel auto merge');
    expect(container.querySelector('form')).toBeNull();

    await fireEvent.click(container.querySelector(autoMergeBtn));
    expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit');
    expect(text(container.querySelector(tooltip))).toBe('Auto merge when all checks succeed');
  });

  describe('merge button container', () => {
    test('uses the color depending on the checks', () => {
      const cases: Array<[Partial<MergeForm>, string]> = [
        [{emptyCommit: true}, 'grey'],
        [{allOverridableChecksOk: true}, 'primary'],
        [{allOverridableChecksOk: false}, 'red'],
      ];
      for (const [overrides, color] of cases) {
        const {container, unmount} = render(PullRequestMergeForm, {props: {mergeForm: makeForm(overrides)}});
        expect(container.querySelector('.merge-button').classList).toContain(color);
        unmount();
      }
    });

    test('hides the auto merge button when the style disables it or merging is not possible now', () => {
      const hidden = render(PullRequestMergeForm, {props: {mergeForm: makeForm({mergeStyles: [style('merge', 'Merge', {hideAutoMerge: true})]})}});
      expect(hidden.container.querySelector('.single-merge-strategy-auto-merge-btn')).toBeNull();
      hidden.unmount();

      const notNow = render(PullRequestMergeForm, {props: {mergeForm: makeForm({canMergeNow: false})}});
      expect(notNow.container.querySelector('.single-merge-strategy-auto-merge-btn')).toBeNull();
    });

    test('starts in auto merge mode when merging is not possible now', () => {
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: makeForm({canMergeNow: false})}});
      expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit (When checks succeed)');
    });

    test('picks the default merge style, falling back to the first allowed one', () => {
      const styles = [style('merge', 'Merge', {allowed: false}), style('rebase', 'Rebase'), style('squash', 'Squash')];
      const first = render(PullRequestMergeForm, {props: {mergeForm: makeForm({mergeStyles: styles, defaultMergeStyle: 'merge'})}});
      expect(text(first.container.querySelector(mergeBtn))).toBe('Rebase');
      first.unmount();
      const second = render(PullRequestMergeForm, {props: {mergeForm: makeForm({mergeStyles: styles, defaultMergeStyle: 'squash'})}});
      expect(text(second.container.querySelector(mergeBtn))).toBe('Squash');
    });
  });

  describe('dropdown menu', () => {
    test('is toggled by clicking the dropdown and closed by a mouseup elsewhere', async () => {
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: multi()}});
      const dropdown = container.querySelector<HTMLElement>('.merge-button .ui.dropdown');
      const menu = dropdown.querySelector('.menu');
      expect(menu.classList).not.toContain('show');
      await fireEvent.click(dropdown);
      expect(menu.classList).toContain('show');
      expect(container.querySelector('form')).toBeNull();

      await fireEvent.mouseUp(document.body);
      expect(menu.classList).not.toContain('show');

      await fireEvent.keyDown(dropdown, {key: 'Enter'});
      expect(menu.classList).toContain('show');
      await fireEvent.keyDown(dropdown, {key: 'Enter'});
      expect(menu.classList).not.toContain('show');
    });

    test('is keyboard focusable but does not take focus on mouse down', async () => {
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: multi()}});
      const dropdown = container.querySelector<HTMLElement>('.merge-button .ui.dropdown');
      expect(dropdown.getAttribute('role')).toBe('button');
      expect(dropdown.getAttribute('tabindex')).toBe('0');
      expect(await fireEvent.mouseDown(dropdown)).toBe(false);
    });

    test('only lists allowed styles and respects hideAutoMerge', () => {
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: multi()}});
      const items = container.querySelectorAll('.merge-button .ui.dropdown .menu .item');
      expect(items.length).toEqual(2);
      expect(items[0].querySelector('.auto-merge-small')).toBeTruthy();
      expect(items[1].querySelector('.auto-merge-small')).toBeNull();
    });

    test('with merging not possible now only auto merge entries are shown', async () => {
      const form = makeForm({canMergeNow: false, mergeStyles: [style('merge', 'Create merge commit'), style('rebase', 'Rebase', {hideAutoMerge: true}), style('squash', 'Squash')]});
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: form}});
      const items = container.querySelectorAll('.merge-button .ui.dropdown .menu .item');
      expect(Array.from(items, (x) => text(x).replaceAll(/\s+/g, ' '))).toEqual([
        'Create merge commit (When checks succeed)',
        'Squash (When checks succeed)',
      ]);
      await fireEvent.click(items[1]);
      expect(text(container.querySelector(mergeBtn))).toBe('Squash (When checks succeed)');
    });

    test('menu entries can be activated with the keyboard', async () => {
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: multi()}});
      const items = container.querySelectorAll<HTMLElement>('.merge-button .ui.dropdown .menu .item');
      await fireEvent.keyDown(items[1], {key: 'Enter'});
      expect(text(container.querySelector(mergeBtn))).toBe('Rebase');
      await fireEvent.keyDown(items[0].querySelector('.auto-merge-small'), {key: ' '});
      expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit (When checks succeed)');
      await fireEvent.keyDown(items[0], {key: 'a'});
      expect(text(container.querySelector(mergeBtn))).toBe('Create merge commit (When checks succeed)');
    });
  });

  describe('action form', () => {
    test('buttons and checkbox sit next to each other without whitespace', async () => {
      const {container} = await openForm(makeForm({isPullBranchDeletable: true}));
      const form = container.querySelector('form.ui.form.form-fetch-action');
      const submit = form.querySelector('button[type=submit]');
      const cancel = form.querySelector('button.merge-cancel');
      const checkbox = form.querySelector('.ui.checkbox');
      expect(submit.nextSibling).toBe(cancel);
      expect(cancel.nextSibling).toBe(checkbox);
      expect(checkbox.querySelector('input').nextSibling).toBe(checkbox.querySelector('label'));
      expect(text(form.querySelector('.ui.checkbox'))).toBe('Delete branch');
      expect(submit.textContent.trim() + cancel.textContent.trim()).toBe('Create merge commitCancel');
    });

    test('opens with the defaults of the selected style', async () => {
      const {container} = await openForm(makeForm({isPullBranchDeletable: true, defaultDeleteBranchAfterMerge: true, pullHeadCommitID: 'deadbeef'}));
      const form = container.querySelector('form.ui.form.form-fetch-action');
      expect(form.getAttribute('action')).toEqual('/user/repo/pulls/1/merge');
      expect(form.getAttribute('method')).toEqual('post');
      expect(container.querySelector('.merge-button')).toBeNull();
      expect(container.querySelector<HTMLInputElement>('input[name="head_commit_id"]').value).toEqual('deadbeef');
      expect(container.querySelector<HTMLInputElement>('input[name="merge_when_checks_succeed"]').value).toEqual('false');
      expect(container.querySelector<HTMLInputElement>('input[name="force_merge"]').value).toEqual('false');
      expect(container.querySelector<HTMLInputElement>('input[name="merge_title_field"]').value).toEqual('merge title');
      const textarea = container.querySelector<HTMLTextAreaElement>('textarea[name="merge_message_field"]');
      expect(textarea.value).toEqual('merge message');
      expect(textarea.getAttribute('placeholder')).toEqual('Message placeholder');
      expect(textarea.getAttribute('rows')).toEqual('5');
      expect(container.querySelector<HTMLInputElement>('#delete-branch-after-merge').checked).toBe(true);
      const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(submit.getAttribute('name')).toEqual('do');
      expect(submit.value).toEqual('merge');
      expect(text(submit)).toEqual('Create merge commit');
      expect(submit.classList).toContain('primary');
    });

    test('hides the delete branch checkbox when the branch is not deletable', async () => {
      const {container} = await openForm(makeForm({isPullBranchDeletable: false}));
      expect(container.querySelector('#delete-branch-after-merge')).toBeNull();
    });

    test('hides the message fields for styles without merge message', async () => {
      const {container} = await openForm(makeForm({mergeStyles: [style('fast-forward-only', 'Fast forward', {hideMergeMessageTexts: true})], defaultMergeStyle: 'fast-forward-only'}));
      expect(container.querySelector('input[name="merge_title_field"]')).toBeNull();
      expect(container.querySelector('textarea')).toBeNull();
      expect(container.querySelector('button[type="submit"]')).toBeTruthy();
    });

    test('manual merge asks for the merge commit id', async () => {
      const {container} = await openForm(makeForm({mergeStyles: [style('manually-merged', 'Mark as merged', {hideMergeMessageTexts: true})], defaultMergeStyle: 'manually-merged'}));
      expect(container.querySelector<HTMLInputElement>('input[name="merge_commit_id"]').getAttribute('placeholder')).toEqual('Merge commit id');
    });

    test('shows the red button and the force merge flag when checks are not all ok', async () => {
      const {container} = await openForm(makeForm({allOverridableChecksOk: false, canMergeNow: true}));
      expect(container.querySelector('button[type="submit"]').classList).toContain('red');
      expect(container.querySelector<HTMLInputElement>('input[name="force_merge"]').value).toEqual('true');
    });

    test('auto merge shows in the submit button and the hidden field', async () => {
      const {container} = await openForm(makeForm({canMergeNow: false, allOverridableChecksOk: false}));
      const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(text(submit)).toEqual('Create merge commit (When checks succeed)');
      expect(submit.classList).toContain('primary');
      expect(container.querySelector<HTMLInputElement>('input[name="merge_when_checks_succeed"]').value).toEqual('true');
      expect(container.querySelector<HTMLInputElement>('input[name="force_merge"]').value).toEqual('false');
    });

    test('the clear button restores the default message and only shows for edited messages', async () => {
      const {container} = await openForm(makeForm());
      const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
      const clear = () => container.querySelector<HTMLButtonElement>('textarea + button');
      expect(clear().textContent.trim()).toEqual('Clear message');
      expect(clear().getAttribute('data-tooltip-content')).toEqual('Clear the merge message');

      await fireEvent.click(clear());
      expect(textarea.value).toEqual('default message');
      expect(clear()).toBeNull();
      expect(container.querySelector('form')).toBeTruthy();

      await fireEvent.input(textarea, {target: {value: 'my edit'}});
      expect(clear()).toBeTruthy();
    });

    test('editing the title keeps the typed value and cancel returns to the merge button', async () => {
      const {container} = await openForm(makeForm());
      await fireEvent.input(container.querySelector('input[name="merge_title_field"]'), {target: {value: 'typed'}});
      expect(container.querySelector<HTMLInputElement>('input[name="merge_title_field"]').value).toEqual('typed');

      const cancel = container.querySelector<HTMLButtonElement>('.merge-cancel');
      expect(cancel.textContent.trim()).toEqual('Cancel');
      expect(cancel.getAttribute('type')).toEqual('button');
      await fireEvent.click(cancel);
      expect(container.querySelector('form')).toBeNull();
      expect(container.querySelector('.merge-button')).toBeTruthy();

      await fireEvent.click(container.querySelector('.merge-button .ui.button'));
      expect(container.querySelector<HTMLInputElement>('input[name="merge_title_field"]').value).toEqual('merge title');
    });
  });

  describe('pending auto merge', () => {
    test('renders the server provided tip as html and a cancel form', () => {
      const mergeForm = makeForm({hasPendingPullRequestMerge: true, hasPendingPullRequestMergeTip: 'Scheduled by <strong>user2</strong>'});
      const {container} = render(PullRequestMergeForm, {props: {mergeForm}});
      expect(container.querySelector('.ui.info.message strong').textContent).toEqual('user2');
      const form = container.querySelector('form');
      expect(form.getAttribute('action')).toEqual('/user/repo/pulls/1/cancel_auto_merge');
      expect(form.getAttribute('method')).toEqual('post');
      expect(form.querySelector('button').textContent.trim()).toEqual('Cancel auto merge');
    });

    test('renders neither without a pending merge', () => {
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: makeForm()}});
      expect(container.querySelector('.ui.info.message')).toBeNull();
      expect(container.querySelector('form')).toBeNull();
    });
  });

  describe('merge instructions toggling', () => {
    test('shows only the instructions of the selected merge style', async () => {
      addInstructions();
      const form = makeForm({mergeStyles: [style('merge', 'Merge'), style('rebase', 'Rebase'), style('squash', 'Squash')]});
      const {container} = render(PullRequestMergeForm, {props: {mergeForm: form}});
      await tick();
      expect([isHidden('m'), isHidden('r'), isHidden('s')]).toEqual([false, true, true]);

      await fireEvent.click(container.querySelectorAll('.merge-button .ui.dropdown .menu .item')[2]);
      await tick();
      expect([isHidden('m'), isHidden('r'), isHidden('s')]).toEqual([true, true, false]);
    });

    test('leaves the instructions alone when no merge style is allowed', async () => {
      addInstructions();
      render(PullRequestMergeForm, {props: {mergeForm: makeForm({mergeStyles: [style('merge', 'Merge', {allowed: false})]})}});
      await tick();
      expect([isHidden('m'), isHidden('r'), isHidden('s')]).toEqual([false, true, true]);
    });
  });
});
