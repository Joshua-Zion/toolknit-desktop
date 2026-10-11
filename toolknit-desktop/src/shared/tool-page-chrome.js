import { Globe2, ExternalLink, Heart, HeartHandshake, Settings, Minus, Square, X } from 'lucide';

const headers = '.home-v2-topbar, .pdf-merge-v2-topbar, .tool-page-v2-topbar, .settings-v2-topbar, .help-v2-topbar, .teleprompter-topbar, .bg-removal-topbar, .donation-page-topbar';
const backSelector = '.pdf-merge-v2-back, .tool-page-v2-back, .settings-v2-back, .help-back-btn, .teleprompter-back, .bg-removal-back, .ppt-draft-editor-back';

function svgElement(document, [tag, attributes, children = []]) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  for (const child of children) element.append(svgElement(document, child));
  return element;
}

function icon(document, definition, className = '') {
  const svg = svgElement(document, definition);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  // Lucide refresh must not replace the prepared morph with a static icon.
  svg.removeAttribute('data-lucide');
  return svg;
}

const backIcon = ['svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.35', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
  ['path', { class: 'tk-nav-back-head', d: 'M 15 5 L 6 12 L 15 19 L 15 5' }],
  ['path', { class: 'tk-nav-back-shaft', d: 'M 5 12 H 19' }]
]];

function prepareButton(button, motion, definitions) {
  if (button.dataset.navMotion === motion) return;
  const document = button.ownerDocument;
  if (!document?.createElementNS) return;
  button.dataset.navMotion = motion;
  button.classList.add('tk-nav-button', `tk-nav-${motion}`);
  const oldIcon = button.querySelector('svg, i[data-lucide]');
  const visual = definitions.length === 1 ? icon(document, definitions[0]) : document.createElement('span');
  if (definitions.length > 1) {
    visual.className = 'tk-nav-morph';
    visual.setAttribute('aria-hidden', 'true');
    visual.append(icon(document, definitions[0], 'tk-nav-current'), icon(document, definitions[1], 'tk-nav-alternate'));
  }
  if (oldIcon) oldIcon.replaceWith(visual);
  else button.prepend(visual);
  // The window runtime owns maximize/restore state; Lucide refresh keeps that icon current.
  if (motion === 'maximize') {
    const host = document.documentElement || globalThis.document?.documentElement;
    visual.setAttribute('data-lucide', host?.classList.contains('window-is-maximized') ? 'copy' : 'square');
  }
  if (motion === 'back') {
    const wrapper = visual.closest('.svg-wrapper-1');
    if (wrapper) wrapper.replaceWith(visual);
    const label = button.querySelector('span');
    if (label) {
      label.classList.add('tk-nav-back-label');
      const key = label.getAttribute('data-i18n');
      if (key && !button.hasAttribute('data-i18n-title')) button.setAttribute('data-i18n-title', key);
      if (!button.title) button.title = label.textContent.trim();
    }
  }
}

/** Idempotent visual preparation at existing template/lazy boundaries, not event binding. */
export function prepareToolPageChrome(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  const list = [...root.querySelectorAll(headers)];
  if (root.matches?.(headers)) list.unshift(root);
  for (const header of list) {
    header.classList.add('tk-tool-nav');
    header.querySelector(':scope > :is(.pdf-merge-v2-topbar-left, .tool-page-v2-topbar-left, .settings-v2-topbar-left, .help-v2-topbar-left, .ppt-draft-editor-topbar-left, .teleprompter-topbar-left, .bg-removal-topbar-left)')?.classList.add('tk-nav-left');
    header.querySelector(':scope > :is(.home-v2-top-actions, .pdf-merge-v2-top-actions, .tool-page-v2-top-actions)')?.classList.add('tk-nav-actions');
    for (const tag of header.querySelectorAll('.pdf-merge-v2-top-tag, .tool-page-v2-tag, .settings-v2-top-tag, .help-v2-top-tag, .ppt-draft-editor-top-tag')) tag.classList.add('tk-nav-tag');
    for (const button of header.querySelectorAll('button')) {
      if (button.matches(backSelector)) prepareButton(button, 'back', [backIcon]);
      else if (button.matches('.home-v2-support-top, .tool-page-v2-support')) prepareButton(button, 'support', [Heart, HeartHandshake]);
      else if (button.matches('.home-v2-nav-link, .tool-page-v2-nav-link')) prepareButton(button, 'web', [Globe2, ExternalLink]);
      else if (button.matches('.home-v2-icon-button, .tool-page-v2-icon, .home-v2-window-button')) {
        const action = button.getAttribute('data-tool-window') || button.getAttribute('data-ppt-window-action') || button.getAttribute('data-window-action') || button.getAttribute('data-action');
        const motion = ['minimize', 'maximize', 'close'].includes(action) ? action : 'settings';
        prepareButton(button, motion, [{ settings: Settings, minimize: Minus, maximize: Square, close: X }[motion]]);
      }
    }
  }
}
