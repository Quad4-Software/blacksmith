import {initMarkupContent} from '../markup/content.js';

export function renderPreviewPanelContent($panelPreviewer, data) {
  $panelPreviewer.html(data);
  initMarkupContent();

  const $refIssues = $panelPreviewer.find('p .ref-issue');
  if ($refIssues.length) {
    import('./contextpopup.js').then(({attachRefIssueContextPopup}) => attachRefIssueContextPopup($refIssues));
  }
}
