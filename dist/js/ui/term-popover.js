/**
 * Accessible floating term popover.
 * Closes on Escape or outside click without blocking clicks to other controls.
 */
import { el } from './dom.js';

let activePopover = null;
let activeAnchor = null;
let cleanupListeners = null;

export function closeTermPopover({ restoreFocus = false } = {}) {
  if (cleanupListeners) {
    cleanupListeners();
    cleanupListeners = null;
  }
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  if (restoreFocus && activeAnchor && activeAnchor.isConnected) {
    activeAnchor.focus();
  }
  activeAnchor = null;
}

export function openTermPopover({ card, incidentId, anchorEl }) {
  const sameAnchor = activeAnchor === anchorEl && activePopover !== null;
  closeTermPopover();
  if (sameAnchor) return;

  activeAnchor = anchorEl || null;

  const topicHref = card.topic
    ? `#/learn/topic/${encodeURIComponent(card.topic)}${incidentId ? `?from=${encodeURIComponent(incidentId)}` : ''}`
    : null;

  const closeBtn = el('button', {
    type: 'button',
    className: 'term-popover-close',
    'aria-label': '용어 설명 닫기',
    onClick: () => closeTermPopover({ restoreFocus: true }),
  }, '×');

  const popover = el('div', {
    className: 'term-popover',
    role: 'dialog',
    'aria-label': `${card.term} 용어 설명`,
    'data-testid': 'term-popover',
  },
    el('div', { className: 'term-popover-head' },
      el('strong', { className: 'term-popover-title' }, card.term),
      closeBtn,
    ),
    el('p', { className: 'term-popover-def' }, card.definition),
    topicHref
      ? el('div', { className: 'term-popover-foot' },
          el('a', {
            href: topicHref,
            className: 'term-popover-link',
            'data-testid': 'term-open-topic',
            onClick: () => closeTermPopover(),
          }, '개념 페이지에서 자세히 보기 →')
        )
      : null,
  );

  document.body.appendChild(popover);
  activePopover = popover;

  // Position near anchorEl within viewport bounds
  positionPopover(popover, anchorEl);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeTermPopover({ restoreFocus: true });
    }
  };

  const onPointerDown = (e) => {
    if (!activePopover) return;
    if (activePopover.contains(e.target)) return;
    if (activeAnchor && activeAnchor.contains(e.target)) return;
    closeTermPopover();
  };

  const onHashChange = () => closeTermPopover();
  const onResize = () => {
    if (activePopover) positionPopover(activePopover, activeAnchor);
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('resize', onResize);

  cleanupListeners = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('resize', onResize);
  };
}

function positionPopover(popover, anchorEl) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 12;
  const rect = popover.getBoundingClientRect();

  if (!anchorEl || !anchorEl.isConnected) {
    popover.style.left = `${Math.max(pad, (vw - rect.width) / 2)}px`;
    popover.style.top = `${Math.max(pad, (vh - rect.height) / 3)}px`;
    return;
  }

  const anchor = anchorEl.getBoundingClientRect();
  let left = anchor.left;
  if (left + rect.width > vw - pad) {
    left = vw - rect.width - pad;
  }
  if (left < pad) left = pad;

  let top = anchor.bottom + 8;
  if (top + rect.height > vh - pad) {
    top = anchor.top - rect.height - 8;
  }
  if (top < pad) top = pad;

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}
