/**
 * Accessible confirmation sheet modal with focus trap and Esc dismissal.
 */
import { el } from './dom.js';

let activeSheet = null;

export function closeSheet() {
  if (activeSheet) {
    activeSheet.destroy();
    activeSheet = null;
  }
}

export function openConfirmSheet({
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmTestId = 'sheet-confirm',
  danger = false,
  onConfirm,
}) {
  closeSheet();

  const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const cancelBtn = el('button', {
    type: 'button',
    className: 'btn btn-secondary',
    onClick: () => closeSheet(),
  }, cancelLabel);

  const confirmBtn = el('button', {
    type: 'button',
    className: danger ? 'btn btn-danger' : 'btn btn-primary',
    'data-testid': confirmTestId,
    onClick: () => {
      closeSheet();
      if (typeof onConfirm === 'function') onConfirm();
    },
  }, confirmLabel);

  const titleId = `sheet-title-${Date.now()}`;
  const dialog = el('div', {
    className: 'sheet-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
  },
    el('h2', { id: titleId, className: 'sheet-title' }, title),
    el('p', { className: 'sheet-desc' }, description),
    el('div', { className: 'sheet-actions' }, cancelBtn, confirmBtn),
  );

  const backdrop = el('div', {
    className: 'sheet-backdrop',
    onClick: (e) => {
      if (e.target === backdrop) closeSheet();
    },
  }, dialog);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = dialog.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKeyDown);
  cancelBtn.focus();

  activeSheet = {
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      if (triggerEl && triggerEl.isConnected) {
        triggerEl.focus();
      }
    },
  };
}
