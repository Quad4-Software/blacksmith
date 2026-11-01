const i18n = window.config?.i18n ?? {};
const t = (key: string, fb: string) => i18n[key] ?? fb;

function setupFilter(menu: HTMLElement) {
  const links = Array.from(menu.querySelectorAll<HTMLAnchorElement>('a.item'));
  if (links.length < 6) return;
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'settings-nav-filter';
  input.placeholder = t('settings_nav_filter_placeholder', 'Filter settings');
  input.setAttribute('aria-label', t('settings_nav_filter_placeholder', 'Filter settings'));
  input.setAttribute('aria-controls', menu.id || (menu.id = 'settings-nav-menu'));
  const noMatch = document.createElement('div');
  noMatch.className = 'settings-nav-no-match';
  noMatch.setAttribute('aria-live', 'polite');
  noMatch.hidden = true;
  noMatch.textContent = t('settings_nav_no_match', 'No matching settings');
  const header = menu.querySelector('.header.item');
  if (header) {
    header.after(input, noMatch);
  } else {
    menu.prepend(input, noMatch);
  }

  const details = Array.from(menu.querySelectorAll<HTMLDetailsElement>('details.toggleable-item'));
  const savedOpen = new Map<HTMLDetailsElement, boolean>();

  function applyFilter() {
    const q = input.value.trim().toLowerCase();
    let any = false;
    if (!q) {
      for (const l of links) l.hidden = false;
      for (const d of details) {
        d.hidden = false;
        if (savedOpen.has(d)) d.open = savedOpen.get(d);
      }
      savedOpen.clear();
      noMatch.hidden = true;
      return;
    }
    for (const d of details) {
      if (!savedOpen.has(d)) savedOpen.set(d, d.open);
    }
    const topLinks = links.filter((l) => !l.closest('details.toggleable-item'));
    for (const l of topLinks) {
      const match = l.textContent.toLowerCase().includes(q);
      l.hidden = !match;
      if (match) any = true;
    }
    for (const d of details) {
      const summary = d.querySelector('summary');
      const kids = Array.from(d.querySelectorAll<HTMLAnchorElement>('a.item'));
      const summaryHit = summary?.textContent.toLowerCase().includes(q);
      const kidHits = kids.filter((l) => l.textContent.toLowerCase().includes(q));
      for (const l of kids) l.hidden = !kidHits.includes(l);
      d.hidden = !summaryHit && !kidHits.length;
      if (!d.hidden) {
        any = true;
        if (kidHits.length && !summaryHit) d.open = true;
      }
    }
    noMatch.hidden = any;
  }

  input.addEventListener('input', applyFilter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      applyFilter();
    } else if (e.key === 'Enter') {
      const first = links.find((l) => !l.hidden && !l.closest('details[hidden],details.toggleable-item:not([open])'));
      const target = first ?? links.find((l) => !l.hidden);
      if (target) window.location.href = target.getAttribute('href');
    }
  });
}

function setupMobileToggle(nav: HTMLElement, menu: HTMLElement) {
  const mq = matchMedia('(max-width: 767.98px)');
  let toggle: HTMLButtonElement | null = null;
  function apply() {
    if (mq.matches && !toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'settings-nav-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', menu.id || (menu.id = 'settings-nav-menu'));
      const active = menu.querySelector('a.item.active');
      toggle.textContent = active?.textContent.trim() || t('settings_nav_menu', 'Menu');
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('settings-nav-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      nav.prepend(toggle);
      nav.classList.add('settings-nav-collapsible');
    } else if (!mq.matches && toggle) {
      toggle.remove();
      toggle = null;
      nav.classList.remove('settings-nav-collapsible', 'settings-nav-open');
    }
  }
  apply();
  mq.addEventListener('change', apply);
}

export function initSettingsNav() {
  const nav = document.querySelector<HTMLElement>('.flex-container-nav');
  const menu = nav?.querySelector<HTMLElement>('.ui.vertical.menu');
  if (!nav || !menu) return;
  setupMobileToggle(nav, menu);
  setupFilter(menu);
}
