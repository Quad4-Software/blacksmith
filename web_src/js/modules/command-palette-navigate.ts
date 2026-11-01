export function navigate(url: string, newTab = false) {
  if (newTab) {
    window.open(url, '_blank', 'noopener');
  } else {
    window.location.href = url;
  }
}
