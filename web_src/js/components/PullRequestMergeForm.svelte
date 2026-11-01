<script lang="ts">
import {useEventListener, watch} from 'runed';
import SvgIcon from './SvgIcon.svelte';
import {toggleElem} from '../utils/dom.ts';

interface MergeStyle {
  name: string;
  allowed: boolean;
  textDoMerge: string;
  mergeTitleFieldText?: string;
  mergeMessageFieldText?: string;
  hideMergeMessageTexts?: boolean;
  hideAutoMerge?: boolean;
}

interface MergeForm {
  baseLink?: string;
  textDeleteBranch?: string;
  textAutoMergeButtonWhenSucceed?: string;
  textAutoMergeWhenSucceed?: string;
  textAutoMergeCancelSchedule?: string;
  textClearMergeMessage?: string;
  textClearMergeMessageHint?: string;
  textMergeCommitId?: string;
  textCancel?: string;
  mergeMessageFieldPlaceHolder?: string;
  defaultDeleteBranchAfterMerge?: boolean;
  defaultMergeMessage?: string;
  defaultMergeStyle?: string;
  emptyCommit?: boolean;
  hasPendingPullRequestMerge?: boolean;
  hasPendingPullRequestMergeTip?: string;
  isPullBranchDeletable?: boolean;
  canMergeNow?: boolean;
  allOverridableChecksOk?: boolean;
  pullHeadCommitID?: string;
  mergeStyles: MergeStyle[];
}

interface Props {
  mergeForm: MergeForm;
}

const {mergeForm}: Props = $props();

// dummy only, these values will come from one of the mergeForm.mergeStyles
const dummyMergeStyleDetail: MergeStyle = {
  name: '',
  allowed: false,
  hideMergeMessageTexts: false,
  textDoMerge: '',
  mergeTitleFieldText: '',
  mergeMessageFieldText: '',
  hideAutoMerge: false,
};

function getInitialState() {
  let name = mergeForm.mergeStyles.find((e) => e.allowed && e.name === mergeForm.defaultMergeStyle)?.name;
  if (!name) name = mergeForm.mergeStyles.find((e) => e.allowed)?.name;
  return {mergeStyle: name ?? '', autoMerge: Boolean(name) && !mergeForm.canMergeNow};
}

const initialState = getInitialState();

let mergeTitleFieldValue = $state('');
let mergeMessageFieldValue = $state('');
let deleteBranchAfterMerge = $state(false);
let autoMergeWhenSucceed = $state(initialState.autoMerge);
let mergeStyle = $state(initialState.mergeStyle);
let showMergeStyleMenu = $state(false);
let showActionForm = $state(false);

const mergeStyleAllowedCount = $derived(mergeForm.mergeStyles.reduce((v, msd) => v + (msd.allowed ? 1 : 0), 0));

const mergeStyleDetail = $derived(mergeForm.mergeStyles.find((e) => e.name === mergeStyle) ?? dummyMergeStyleDetail);

const mergeButtonStyleClass = $derived.by(() => {
  if (mergeForm.allOverridableChecksOk) return 'primary';
  return autoMergeWhenSucceed ? 'primary' : 'red';
});

const mergeButtonText = $derived(autoMergeWhenSucceed ? `${mergeStyleDetail.textDoMerge} ${mergeForm.textAutoMergeButtonWhenSucceed}` : mergeStyleDetail.textDoMerge);

const forceMerge = $derived(mergeForm.canMergeNow && !mergeForm.allOverridableChecksOk);

watch(() => mergeStyle, (val) => {
  if (!val) return;
  for (const elem of document.querySelectorAll('[data-pull-merge-style]')) {
    toggleElem(elem, elem.getAttribute('data-pull-merge-style') === val);
  }
});

useEventListener(() => document, 'mouseup', hideMergeStyleMenu);

function hideMergeStyleMenu() {
  showMergeStyleMenu = false;
}

function toggleActionForm(show: boolean) {
  if (show && mergeStyleAllowedCount === 0) return;
  showActionForm = show;
  if (!show) return;
  deleteBranchAfterMerge = mergeForm.defaultDeleteBranchAfterMerge;
  mergeTitleFieldValue = mergeStyleDetail.mergeTitleFieldText;
  mergeMessageFieldValue = mergeStyleDetail.mergeMessageFieldText;
}

function switchMergeStyle(name: string, autoMerge = false) {
  mergeStyle = name;
  autoMergeWhenSucceed = autoMerge;
}

function clearMergeMessage() {
  mergeMessageFieldValue = mergeForm.defaultMergeMessage;
}

function onActivateKey(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  action();
}
</script>

<!--
if this component is shown, either the user is an admin (can do a merge without checks), or they are a writer who has the permission to do a merge
if the user is a writer and can't do a merge now (canMergeNow==false), then only show the Auto Merge for them
How to test the UI manually:
* Method 1: manually set some variables in pull.tmpl, eg: {{$notAllOverridableChecksOk = true}} {{$canMergeNow = false}}
* Method 2: make a protected branch, then set state=pending/success :
  curl -X POST ${root_url}/api/v1/repos/${owner}/${repo}/statuses/${sha} \
    -H "accept: application/json" -H "authorization: Basic $base64_auth" -H "Content-Type: application/json" \
    -d '{"context": "test/context", "description": "description", "state": "${state}", "target_url": "http://localhost"}'
-->
<div>
  {#if mergeForm.hasPendingPullRequestMerge}
    <div class="ui info message">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- the tip is a localized string rendered and escaped by the server in pull.tmpl -->
      {@html mergeForm.hasPendingPullRequestMergeTip}
    </div>
  {/if}

  <!-- another similar form is in pull.tmpl (manual merge)-->
  {#if showActionForm}
    <form class="ui form form-fetch-action" action={`${mergeForm.baseLink}/merge`} method="post">
      <input type="hidden" name="head_commit_id" value={mergeForm.pullHeadCommitID}>
      <input type="hidden" name="merge_when_checks_succeed" value={autoMergeWhenSucceed}>
      <input type="hidden" name="force_merge" value={forceMerge}>

      {#if !mergeStyleDetail.hideMergeMessageTexts}
        <div class="field">
          <input type="text" name="merge_title_field" bind:value={mergeTitleFieldValue}>
        </div>
        <div class="field">
          <textarea name="merge_message_field" rows="5" placeholder={mergeForm.mergeMessageFieldPlaceHolder} bind:value={mergeMessageFieldValue}></textarea>
          {#if mergeMessageFieldValue !== mergeForm.defaultMergeMessage}
            <button onclick={(e) => { e.preventDefault(); clearMergeMessage() }} class="btn tw:mt-1 tw:p-1 interact-fg" data-tooltip-content={mergeForm.textClearMergeMessageHint}>
              {mergeForm.textClearMergeMessage}
            </button>
          {/if}
        </div>
      {/if}

      {#if mergeStyle === 'manually-merged'}
        <div class="field">
          <input type="text" name="merge_commit_id" placeholder={mergeForm.textMergeCommitId}>
        </div>
      {/if}

      <button class={['ui', 'button', mergeButtonStyleClass]} type="submit" name="do" value={mergeStyle}>
        {mergeButtonText}
      </button><button class="ui button merge-cancel" type="button" onclick={() => toggleActionForm(false)}>
        {mergeForm.textCancel}
      </button>{#if mergeForm.isPullBranchDeletable}
        <div class="ui checkbox tw:ml-1">
          <input name="delete_branch_after_merge" type="checkbox" bind:checked={deleteBranchAfterMerge} id="delete-branch-after-merge"><label for="delete-branch-after-merge">{mergeForm.textDeleteBranch}</label>
        </div>
      {/if}
    </form>
  {/if}

  {#if !showActionForm && mergeStyleAllowedCount > 0}
    <div class="tw:flex">
      <!-- the merge button -->
      <!-- the click comes from the keyboard accessible buttons inside, the container only forwards it -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class={['ui', 'buttons', 'merge-button', mergeForm.emptyCommit ? 'grey' : mergeForm.allOverridableChecksOk ? 'primary' : 'red']} onclick={() => toggleActionForm(true)}>
        <button class="ui button">
          <SvgIcon name="octicon-git-merge"/>
          <span class="button-text">
            {mergeButtonText}
          </span>
        </button>
        {#if mergeStyleAllowedCount === 1 && !mergeStyleDetail.hideAutoMerge && mergeForm.canMergeNow}
          <button
            class="ui icon button single-merge-strategy-auto-merge-btn"
            onclick={(e) => { e.stopPropagation(); autoMergeWhenSucceed = !autoMergeWhenSucceed }}
          >
            <SvgIcon name="octicon-clock"/>
            <span class="single-merge-strategy-auto-merge-tooltip">
              {autoMergeWhenSucceed ? mergeForm.textAutoMergeCancelSchedule : mergeForm.textAutoMergeWhenSucceed}
            </span>
          </button>
        {/if}
        {#if mergeStyleAllowedCount > 1}
          <div
            class="ui dropdown icon button"
            role="button"
            tabindex="0"
            onmousedown={(e) => e.preventDefault()}
            onclick={(e) => { e.stopPropagation(); showMergeStyleMenu = !showMergeStyleMenu }}
            onkeydown={(e) => onActivateKey(e, () => { showMergeStyleMenu = !showMergeStyleMenu })}
          >
            <SvgIcon name="octicon-triangle-down" size={14}/>
            <div class={['menu', {show: showMergeStyleMenu}]}>
              {#each mergeForm.mergeStyles as msd (msd.name)}
                <!-- if can merge now, show one action "merge now", and an action "auto merge when succeed" -->
                {#if msd.allowed && mergeForm.canMergeNow}
                  <div
                    class="item"
                    role="menuitem"
                    tabindex="0"
                    onclick={(e) => { e.stopPropagation(); switchMergeStyle(msd.name) }}
                    onkeydown={(e) => onActivateKey(e, () => switchMergeStyle(msd.name))}
                  >
                    <div class="action-text">
                      {msd.textDoMerge}
                    </div>
                    {#if !msd.hideAutoMerge}
                      <div
                        class="auto-merge-small"
                        role="button"
                        tabindex="0"
                        onclick={(e) => { e.stopPropagation(); switchMergeStyle(msd.name, true) }}
                        onkeydown={(e) => onActivateKey(e, () => switchMergeStyle(msd.name, true))}
                      >
                        <SvgIcon name="octicon-clock" size={14}/>
                        <div class="auto-merge-tip">
                          {mergeForm.textAutoMergeWhenSucceed}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}

                <!-- if can NOT merge now, only show one action "auto merge when succeed" -->
                {#if msd.allowed && !mergeForm.canMergeNow && !msd.hideAutoMerge}
                  <div
                    class="item"
                    role="menuitem"
                    tabindex="0"
                    onclick={(e) => { e.stopPropagation(); switchMergeStyle(msd.name, true) }}
                    onkeydown={(e) => onActivateKey(e, () => switchMergeStyle(msd.name, true))}
                  >
                    <div class="action-text">
                      {msd.textDoMerge} {mergeForm.textAutoMergeButtonWhenSucceed}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- the cancel auto merge button -->
      {#if mergeForm.hasPendingPullRequestMerge}
        <form action={`${mergeForm.baseLink}/cancel_auto_merge`} method="post" class="tw:ml-4">
          <button class="ui button">
            {mergeForm.textAutoMergeCancelSchedule}
          </button>
        </form>
      {/if}
    </div>
  {/if}
</div>

<style>
/* to keep UI the same, at the moment we are still using some Fomantic UI styles, but we do not use their scripts, so we need to fine tune some styles */
.ui.dropdown .menu.show {
  display: block;
}
.ui.checkbox label {
  cursor: pointer;
}

/* make the dropdown list left-aligned */
.ui.merge-button {
  position: relative;
}
.ui.merge-button .ui.dropdown {
  position: static;
}
.ui.merge-button > .ui.dropdown:last-child > .menu:not(.left) {
  inset-inline: 0 auto;
}
.ui.merge-button .ui.dropdown .menu > .item {
  display: flex;
  align-items: stretch;
  padding: 0 !important; /* polluted by semantic.css: .ui.dropdown .menu > .item { !important } */
}

/* merge style list item */
.action-text {
  padding: 0.8rem;
  flex: 1
}

.auto-merge-small {
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.auto-merge-small .auto-merge-tip {
  display: none;
  inset-inline-start: 38px;
  top: -0.5px;
  bottom: -1px;
  position: absolute;
  align-items: center;
  color: var(--color-info-text);
  background-color: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  border-inline-start: none;
  padding-inline-end: 1rem;
}

.menu .item:has(.auto-merge-small:hover) {
  overflow: unset;
}

.auto-merge-small:hover {
  color: var(--color-info-text);
  background-color: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
}

.ui.buttons .button.single-merge-strategy-auto-merge-btn {
  color: var(--color-info-text);
  background-color: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
}

.ui.buttons .button.single-merge-strategy-auto-merge-btn .single-merge-strategy-auto-merge-tooltip {
  display: none;
}

.ui.buttons .button.single-merge-strategy-auto-merge-btn:hover .single-merge-strategy-auto-merge-tooltip {
  display: flex;
}

.auto-merge-small:hover .auto-merge-tip {
  display: flex;
}

</style>
