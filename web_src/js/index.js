// bootstrap module must be the first one to be imported, it handles webpack lazy-loading and global errors
import './bootstrap.js';

import {initGlobalCopyToClipboardListener} from './features/clipboard.js';
import {initRepoGraphGit} from './features/repo-graph.js';
import {initImageDiff} from './features/imagediff.js';
import {initRepoMigration} from './features/repo-migration.js';
import {initRepoProject} from './features/repo-projects.ts';
import {initTableSort} from './features/tablesort.js';
import {initAutoFocusEnd} from './features/autofocus-end.js';
import {initAdminUserListSearchForm} from './features/admin/users.js';
import {initAdminConfigs} from './features/admin/config.js';
import {initMarkupAnchors} from './markup/anchors.js';
import {initNotificationCount, initNotificationsTable} from './features/notification.js';
import {initRepoIssueContentHistory} from './features/repo-issue-content.js';
import {initStopwatch} from './features/stopwatch.js';
import {initFindFileInRepo} from './features/repo-findfile.js';
import {initCommentContent, initMarkupContent} from './markup/content.js';

import {initUserAuthOauth2, initUserAuth} from './features/user-auth.js';
import {
  initRepoIssueDue,
  initRepoIssueReferenceRepositorySearch,
  initRepoIssueTimeTracking,
  initRepoIssueWipTitle,
  initRepoPullRequestAllowMaintainerEdit,
  initRepoPullRequestReview,
  initArchivedLabelHandler,
} from './features/repo-issue.js';
import {initRepoIssueSidebarList} from './features/repo-issue-sidebar-list.ts';
import {initRepoEllipsisButton, initCommitStatuses, initCommitNotes} from './features/repo-commit.js';
import {
  initFootLanguageMenu,
  initGlobalButtonClickOnEnter,
  initGlobalButtons,
  initGlobalCommon,
  initDisabledInputs,
  initGlobalDropzone,
  initGlobalEnterQuickSubmit,
  initGlobalFormDirtyLeaveConfirm,
  initGlobalLinkActions,
  initHeadNavbarContentToggle,
} from './features/common-global.js';
import {initRepoTopicBar} from './features/repo-home.js';
import {initAdminEmails} from './features/admin/emails.js';
import {initAdminCommon} from './features/admin/common.js';
import {initRepoTemplateSearch} from './features/repo-template.js';
import {initRepoCodeView} from './features/repo-code.ts';
import {initSshKeyFormParser} from './features/sshkey-helper.js';
import {initRepoArchiveLinks} from './features/repo-common.js';
import {initRepoMigrationStatusChecker} from './features/repo-migrate.js';
import {
  initRepoSettingGitHook,
  initRepoSettingsCollaboration,
  initRepoSettingSearchTeamBox,
} from './features/repo-settings.js';
import {initRepoSuggestionApply} from './features/repo-suggestion.js';
import {initOrgTeamSearchRepoBox} from './features/org-team.js';
import {initUserAuthWebAuthn, initUserAuthWebAuthnRegister} from './features/user-auth-webauthn.js';
import {initRepoRelease, initRepoReleaseNew} from './features/repo-release.js';
import {initAddOrgMemberButton} from './features/add-org-member.ts';
import {initCompSearchUserBox} from './features/comp/SearchUserBox.js';
import {initInstall} from './features/install.js';
import {initCompWebHookEditor} from './features/comp/WebHookEditor.js';
import {initRepoBranchButton} from './features/repo-branch.ts';
import {initCommonOrganization} from './features/common-organization.js';
import {initRepoWikiForm} from './features/repo-wiki.js';
import {initRepoCommentForm, initRepository} from './features/repo-legacy.js';
import {initCopyContent} from './features/copycontent.js';
import {initCaptcha} from './features/captcha.js';
import {initGlobalTooltips} from './modules/tippy.js';
import {initDropdowns} from './modules/dropdown.ts';
import {initGiteaFomantic} from './modules/fomantic.js';
import {onDomReady} from './utils/dom.ts';
import {initRepoIssueList} from './features/repo-issue-list.js';
import {initCommonIssueListQuickGoto} from './features/common-issue-list.js';
import {initRepoDiffCommitBranchesAndTags} from './features/repo-diff-commit.js';
import {initDirAuto} from './modules/dirauto.js';
import {initRepositorySearch} from './features/repo-search.js';
import {initColorPickers} from './features/colorpicker.js';
import {initRepoMilestoneEditor} from './features/repo-milestone.js';
import {initModalClose} from './modules/modal.ts';
import {initAuthorizedIntegrationClaimRuleEditor} from './features/authorized-integration.js';
import {
  initModalServiceMessageForm,
  initPreviewServiceMessageButton,
  initDeleteServiceMessageButton,
} from './features/service-message.ts';

// Init Gitea's Fomantic settings
initGiteaFomantic();
initDirAuto();

onDomReady(() => {
  initGlobalCommon();

  initDisabledInputs(document);
  initGlobalTooltips();
  initGlobalButtonClickOnEnter();
  initGlobalButtons();
  initGlobalCopyToClipboardListener();
  initGlobalDropzone();
  initGlobalEnterQuickSubmit();
  initGlobalFormDirtyLeaveConfirm();
  initGlobalLinkActions();
  initDropdowns();

  initCommonOrganization();
  initCommonIssueListQuickGoto();

  initCompSearchUserBox();
  initCompWebHookEditor();

  initInstall();

  initHeadNavbarContentToggle();
  initFootLanguageMenu();

  initCommentContent();
  if (document.querySelector('.ref-issue')) {
    import('./features/contextpopup.js').then(({initContextPopups}) => initContextPopups());
  }
  if (document.getElementById('user-heatmap')) {
    import('./features/heatmap.js').then(({initHeatmap}) => initHeatmap());
  }
  initImageDiff();
  initMarkupAnchors();
  initMarkupContent();
  initSshKeyFormParser();
  initStopwatch();
  initTableSort();
  initAutoFocusEnd();
  initFindFileInRepo();
  initCopyContent();

  initAdminCommon();
  initAdminEmails();
  initAdminUserListSearchForm();
  initAdminConfigs();

  if (document.getElementById('dashboard-repo-list')) {
    import('./features/dashboard-repo-list.ts').then(({initDashboardRepoList}) => initDashboardRepoList());
  }

  initNotificationCount();
  initNotificationsTable();

  initOrgTeamSearchRepoBox();

  if (document.getElementById('repo-activity-top-authors-chart')) {
    import('./features/repo-activity-top-authors.ts').then(({initRepoActivityTopAuthorsChart}) => initRepoActivityTopAuthorsChart());
  }
  initRepoArchiveLinks();
  initRepoBranchButton();
  initRepoCodeView();
  initRepoCommentForm();
  initRepoEllipsisButton();
  initRepoDiffCommitBranchesAndTags();
  if (document.querySelector('.repository .edit.form, .js-quick-pull-choice-option')) {
    import('./features/repo-editor.js').then(({initRepoEditor}) => initRepoEditor());
  }
  initAddOrgMemberButton();
  initRepoGraphGit();
  initRepoIssueContentHistory();
  initRepoIssueDue();
  initRepoIssueList();
  initRepoIssueSidebarList();
  initArchivedLabelHandler();
  initRepoIssueReferenceRepositorySearch();
  initRepoIssueTimeTracking();
  initRepoIssueWipTitle();
  initRepoMigration();
  initRepoMigrationStatusChecker();
  initRepoProject();
  initRepoPullRequestAllowMaintainerEdit();
  initRepoPullRequestReview();
  initRepoRelease();
  initRepoReleaseNew();
  initRepoSettingGitHook();
  initRepoSettingSearchTeamBox();
  initRepoSettingsCollaboration();
  initRepoTemplateSearch();
  initRepoTopicBar();
  initRepoWikiForm();
  initRepository();
  if (document.getElementById('repo-action-view')) {
    import('./features/repo-action-view.ts').then(({initRepositoryActionView}) => initRepositoryActionView());
  }
  initRepositorySearch();
  if (document.getElementById('repo-contributors-chart')) {
    import('./features/contributors.js').then(({initRepoContributors}) => initRepoContributors());
  }
  if (document.getElementById('repo-code-frequency-chart')) {
    import('./features/code-frequency.js').then(({initRepoCodeFrequency}) => initRepoCodeFrequency());
  }
  if (document.getElementById('repo-recent-commits-chart')) {
    import('./features/recent-commits.js').then(({initRepoRecentCommits}) => initRepoRecentCommits());
  }
  if (document.querySelector('#diff-file-boxes, .conversation-holder')) {
    import('./features/repo-diff.js').then(({initRepoDiffView}) => initRepoDiffView());
  }
  initRepoMilestoneEditor();

  initCommitStatuses();
  initCommitNotes();
  initCaptcha();

  initUserAuthOauth2();
  initUserAuthWebAuthn();
  initUserAuthWebAuthnRegister();
  initUserAuth();
  initRepoSuggestionApply();
  initColorPickers();
  initModalClose();
  initAuthorizedIntegrationClaimRuleEditor();
  initModalServiceMessageForm();
  initPreviewServiceMessageButton();
  initDeleteServiceMessageButton();

  // no-js helper class is currently unused by UI components in Forgejo, but it is left for compatibility
  document.body.classList.remove('no-js');
});
