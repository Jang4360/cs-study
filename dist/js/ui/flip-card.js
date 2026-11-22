/**
 * Accessible review flip-card button component.
 */
import { el } from './dom.js';

export function createFlipCard({ index, term, definition }) {
  let flipped = false;

  const front = el('span', { className: 'flip-card-face flip-card-front' },
    el('span', { className: 'flip-card-kicker' }, '용어'),
    el('strong', { className: 'flip-card-term' }, term),
    el('span', { className: 'flip-card-hint' }, '눌러서 뜻 확인'),
  );

  const back = el('span', { className: 'flip-card-face flip-card-back' },
    el('span', { className: 'flip-card-kicker' }, term),
    el('span', { className: 'flip-card-def' }, definition),
  );

  const btn = el('button', {
    type: 'button',
    className: 'flip-card',
    'data-testid': `deck-card-${index}`,
    'data-flipped': 'false',
    'aria-pressed': 'false',
    onClick: () => {
      flipped = !flipped;
      btn.setAttribute('data-flipped', String(flipped));
      btn.setAttribute('aria-pressed', String(flipped));
    },
  }, front, back);

  return btn;
}
