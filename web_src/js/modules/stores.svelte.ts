function createDiffTreeState(value: Record<string, unknown>) {
  const state = $state(value);
  return state;
}

let diffTreeState: Record<string, unknown>;

export function diffTreeStore(): Record<string, unknown> {
  if (!diffTreeState) {
    diffTreeState = createDiffTreeState(window.config.pageData.diffFileInfo as Record<string, unknown>);
    window.config.pageData.diffFileInfo = diffTreeState;
  }
  return diffTreeState;
}
