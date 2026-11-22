/**
 * Virtual terminal interactive board.
 * Contract:
 *   mountBoard(container, { incident, attempt, onTogglePin, isPinned, onEventView, onBoardChange, onOpenTerm })
 *   -> { update(attempt), destroy() }
 */
import { el, clear } from '../ui/dom.js';
import { runCommand, getMatchedCommand, autocomplete } from './terminal-engine.js';

export function mountBoard(container, opts) {
  const {
    incident,
    onTogglePin,
    isPinned,
    onBoardChange,
    onOpenTerm,
  } = opts;

  const spec = incident.board || {
    type: 'terminal',
    host: 'server',
    user: 'ops',
    home: '/home/ops',
    now: '',
    motd: [],
    commands: [],
    files: {},
    dirs: {},
  };

  const cardById = new Map((incident.cards || []).map((c) => [c.id, c]));
  const promptText = `${spec.user || 'ops'}@${spec.host || 'localhost'}:~$`;

  let history = Array.isArray(opts.attempt?.board?.history)
    ? opts.attempt.board.history.filter((c) => typeof c === 'string')
    : [];
  let histNavIndex = -1;
  let savedDraft = '';
  const discoveredTermIds = [];
  const discoveredTermSet = new Set();

  clear(container);
  delete container.dataset.layout;

  // 1. Top bar
  const topBar = el('div', { className: 'term-topbar' },
    el('div', { className: 'term-topbar-left' },
      el('span', { className: 'term-dots', 'aria-hidden': 'true' },
        el('span', { className: 'term-dot is-red' }),
        el('span', { className: 'term-dot is-yellow' }),
        el('span', { className: 'term-dot is-green' }),
      ),
      el('strong', { className: 'term-host' }, `${spec.user || 'ops'}@${spec.host || 'localhost'}`),
      el('span', { className: 'term-badge' }, '가상 터미널'),
    ),
    el('div', { className: 'term-topbar-meta' },
      spec.now ? el('span', { className: 'term-meta-item' }, spec.now) : null,
      spec.home ? el('span', { className: 'term-meta-item' }, spec.home) : null,
    ),
  );

  // 2. Output scroll log
  const outputEl = el('div', {
    className: 'term-output',
    'data-testid': 'terminal-output',
    role: 'log',
    'aria-label': '터미널 출력',
    'aria-live': 'polite',
    tabindex: '0',
  });

  // 3. Input bar
  const inputEl = el('input', {
    id: 'terminal-input',
    type: 'text',
    className: 'term-input',
    'data-testid': 'terminal-input',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    placeholder: '명령 입력 (예: help, dmesg -T)',
  });

  const inputRow = el('div', { className: 'term-input-row' },
    el('label', { for: 'terminal-input', className: 'sr-only' }, '터미널 명령 입력'),
    el('span', { className: 'term-prompt', 'aria-hidden': 'true' }, promptText),
    inputEl,
  );

  // 4. Terms chip bar
  const termsBar = el('div', {
    className: 'term-terms-bar',
    'aria-label': '관련 용어',
    hidden: true,
  });

  const wrapper = el('div', { className: 'terminal-board' },
    topBar,
    outputEl,
    inputRow,
    termsBar,
  );
  container.appendChild(wrapper);

  function scrollToBottom() {
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function collectTermsForCommand(cmdStr) {
    const matched = getMatchedCommand(spec, cmdStr);
    if (!matched || !Array.isArray(matched.terms)) return;
    let added = false;
    for (const cid of matched.terms) {
      if (cardById.has(cid) && !discoveredTermSet.has(cid)) {
        discoveredTermSet.add(cid);
        discoveredTermIds.push(cid);
        added = true;
      }
    }
    if (added) renderTermsBar();
  }

  function renderTermsBar() {
    clear(termsBar);
    if (discoveredTermIds.length === 0) {
      termsBar.hidden = true;
      return;
    }
    termsBar.hidden = false;
    termsBar.appendChild(el('span', { className: 'term-terms-label' }, '관련 용어'));
    for (const cid of discoveredTermIds) {
      const card = cardById.get(cid);
      if (!card) continue;
      const btn = el('button', {
        type: 'button',
        className: 'term-chip-btn',
        'data-testid': `term-${card.id}`,
        onClick: () => onOpenTerm?.(card, btn),
      }, `${card.term} ?`);
      termsBar.appendChild(btn);
    }
  }

  function renderMotd() {
    if (!Array.isArray(spec.motd) || spec.motd.length === 0) return;
    const block = el('div', { className: 'term-block term-motd' },
      spec.motd.map((line) => el('div', { className: 'term-line is-motd' }, line)),
    );
    outputEl.appendChild(block);
  }

  function fillInputWithCommand(cmdUsage) {
    inputEl.value = cmdUsage;
    histNavIndex = -1;
    inputEl.focus();
    const len = inputEl.value.length;
    try {
      inputEl.setSelectionRange(len, len);
    } catch {
      // Ignore selection range errors on unsupported inputs
    }
  }

  function renderResultBlock(cmdText, result) {
    const lineNodes = (result.lines || []).map((line) => {
      if (line.id) {
        const pinned = Boolean(isPinned?.(line.id));
        return el('button', {
          type: 'button',
          className: `term-line-btn${pinned ? ' is-pinned' : ''}`,
          'data-testid': `line-${line.id}`,
          'data-line-id': line.id,
          'aria-pressed': String(pinned),
          onClick: () => onTogglePin?.(line.id),
        },
          el('span', { className: 'term-pin-mark', 'aria-hidden': 'true' }, pinned ? '★' : '☆'),
          el('span', { className: 'term-line-text' }, line.text),
        );
      }

      if (line.helpUsage) {
        return el('div', { className: 'term-line term-help-line' },
          el('span', { className: 'term-help-indent', 'aria-hidden': 'true' }, '  '),
          el('button', {
            type: 'button',
            className: 'term-help-cmd',
            'data-testid': 'help-cmd',
            'data-command': line.helpUsage,
            onClick: () => fillInputWithCommand(line.helpUsage),
          }, line.helpUsage),
          el('span', { className: 'term-help-desc' }, ` — ${line.helpDesc || ''}`),
        );
      }

      return el('div', {
        className: `term-line${result.kind === 'error' ? ' is-error' : ''}`,
      }, line.text === '' ? '\u00A0' : line.text);
    });

    const block = el('div', { className: 'term-block' },
      el('div', { className: 'term-cmd-echo' },
        el('span', { className: 'term-prompt-echo' }, promptText),
        ' ',
        el('span', { className: 'term-cmd-text' }, cmdText),
      ),
      ...lineNodes,
    );
    outputEl.appendChild(block);
  }

  function executeCommand(rawInput) {
    const trimmed = String(rawInput ?? '').trim();
    if (!trimmed) {
      const emptyEcho = el('div', { className: 'term-block' },
        el('div', { className: 'term-cmd-echo' },
          el('span', { className: 'term-prompt-echo' }, promptText),
        ),
      );
      outputEl.appendChild(emptyEcho);
      scrollToBottom();
      return;
    }

    history.push(trimmed);
    onBoardChange?.({ history: [...history] });
    collectTermsForCommand(trimmed);

    const res = runCommand(spec, trimmed, { history });
    if (res.kind === 'clear') {
      clear(outputEl);
    } else {
      renderResultBlock(trimmed, res);
    }
    scrollToBottom();
  }

  function syncPinStates() {
    for (const btn of outputEl.querySelectorAll('button[data-line-id]')) {
      const lid = btn.dataset.lineId;
      const pinned = Boolean(isPinned?.(lid));
      btn.setAttribute('aria-pressed', String(pinned));
      btn.classList.toggle('is-pinned', pinned);
      const mark = btn.querySelector('.term-pin-mark');
      if (mark) mark.textContent = pinned ? '★' : '☆';
    }
  }

  // Initial render: collect all terms from history and replay from after last clear
  function restoreFromHistory() {
    clear(outputEl);
    for (const cmd of history) {
      collectTermsForCommand(cmd);
    }

    let lastClearIdx = -1;
    for (let i = 0; i < history.length; i++) {
      if (runCommand(spec, history[i]).kind === 'clear') {
        lastClearIdx = i;
      }
    }

    if (lastClearIdx === -1) {
      renderMotd();
    }

    for (let i = lastClearIdx + 1; i < history.length; i++) {
      const cmd = history[i];
      const res = runCommand(spec, cmd, { history: history.slice(0, i + 1) });
      if (res.kind !== 'clear') {
        renderResultBlock(cmd, res);
      }
    }

    scrollToBottom();
  }

  // Input event handlers
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = inputEl.value;
      inputEl.value = '';
      histNavIndex = -1;
      savedDraft = '';
      executeCommand(val);
      return;
    }

    if (e.key === 'ArrowUp') {
      if (history.length === 0) return;
      e.preventDefault();
      if (histNavIndex === -1) {
        savedDraft = inputEl.value;
        histNavIndex = history.length - 1;
      } else if (histNavIndex > 0) {
        histNavIndex -= 1;
      }
      inputEl.value = history[histNavIndex];
      const len = inputEl.value.length;
      try { inputEl.setSelectionRange(len, len); } catch { /* ignore */ }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (histNavIndex === -1) return;
      e.preventDefault();
      if (histNavIndex < history.length - 1) {
        histNavIndex += 1;
        inputEl.value = history[histNavIndex];
      } else {
        histNavIndex = -1;
        inputEl.value = savedDraft;
      }
      const len = inputEl.value.length;
      try { inputEl.setSelectionRange(len, len); } catch { /* ignore */ }
      return;
    }

    if (e.key === 'Tab') {
      if (!inputEl.value.trim()) return;
      const completed = autocomplete(spec, inputEl.value);
      if (completed !== null) {
        e.preventDefault();
        inputEl.value = completed;
        const len = inputEl.value.length;
        try { inputEl.setSelectionRange(len, len); } catch { /* ignore */ }
      }
    }
  };

  const onOutputClick = (e) => {
    if (e.target.closest('button, a')) return;
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) return;
    inputEl.focus();
  };

  inputEl.addEventListener('keydown', onKeyDown);
  outputEl.addEventListener('click', onOutputClick);

  restoreFromHistory();
  inputEl.focus();

  return {
    update() {
      syncPinStates();
    },
    destroy() {
      inputEl.removeEventListener('keydown', onKeyDown);
      outputEl.removeEventListener('click', onOutputClick);
      clear(container);
    },
  };
}
