/**
 * Sources board (raw evidence lines grouped by evidence source).
 * Implements the standard board interface AND exports renderSourcesContent
 * so request-flow's second tab can reuse it directly.
 */
import { el, clear } from '../ui/dom.js';

export function renderSourcesContent(container, { incident, onTogglePin, isPinned }) {
  clear(container);

  const list = el('div', { className: 'sources-list' });
  for (const ev of incident.evidence || []) {
    const group = el('section', {
      className: 'source-group',
      'data-testid': `source-${ev.id}`,
    },
      el('header', { className: 'source-group-head' },
        el('div', { className: 'source-group-title-row' },
          el('span', { className: 'source-id-badge' }, ev.id),
          el('h3', { className: 'source-group-title' }, ev.title),
        ),
        ev.oneLine ? el('p', { className: 'source-group-oneline' }, ev.oneLine) : null,
        ev.caption ? el('p', { className: 'source-group-caption' }, ev.caption) : null,
      ),
      el('div', { className: 'source-lines' },
        (ev.lines || []).map((ln) => {
          const pinned = Boolean(isPinned?.(ln.id));
          return el('button', {
            type: 'button',
            className: 'evidence-line-btn',
            'data-testid': `line-${ln.id}`,
            'data-line-id': ln.id,
            'aria-pressed': String(pinned),
            onClick: () => onTogglePin?.(ln.id),
          },
            el('span', { className: 'line-pin-indicator', 'aria-hidden': 'true' }, pinned ? '★' : '☆'),
            el('span', { className: 'line-id-tag' }, ln.id),
            el('code', { className: 'line-text' }, ln.text),
          );
        }),
      ),
    );
    list.appendChild(group);
  }

  container.appendChild(list);
}

export function syncSourcePinStates(container, isPinned) {
  const buttons = container.querySelectorAll('button[data-line-id]');
  for (const btn of buttons) {
    const pinned = Boolean(isPinned?.(btn.dataset.lineId));
    btn.setAttribute('aria-pressed', String(pinned));
    const icon = btn.querySelector('.line-pin-indicator');
    if (icon) icon.textContent = pinned ? '★' : '☆';
  }
}

export function mountBoard(container, { incident, onTogglePin, isPinned }) {
  renderSourcesContent(container, { incident, onTogglePin, isPinned });
  return {
    update() {
      syncSourcePinStates(container, isPinned);
    },
    destroy() {
      clear(container);
    },
  };
}
