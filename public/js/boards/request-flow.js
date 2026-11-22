/**
 * Request-flow interactive board.
 * Contract:
 *   mountBoard(container, { incident, attempt, onTogglePin, isPinned, onEventView, onBoardChange, onOpenTerm })
 *   -> { update(attempt), destroy() }
 */
import { el, clear } from '../ui/dom.js';
import { renderSourcesContent, syncSourcePinStates } from './sources.js';

const KIND_LABELS = {
  request: '요청',
  response: '응답',
  close: '연결 종료',
  error: '오류',
};

const LANES_MIN_WIDTH = 720;

function parseT0Ms(t0) {
  const m = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(String(t0 || '00:00:00.000'));
  if (!m) return 0;
  return (((Number(m[1]) * 60 + Number(m[2])) * 60) + Number(m[3])) * 1000 + Number(m[4]);
}

function formatClock(t0Ms, deltaMs) {
  const total = t0Ms + deltaMs;
  const ms = ((total % 1000) + 1000) % 1000;
  const totalSec = Math.floor(total / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60) % 24;
  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  const absStr = `${pad2(hr)}:${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
  const relStr = `+${(deltaMs / 1000).toFixed(3)}초`;
  return { absStr, relStr };
}

function getScrollBehavior() {
  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced ? 'auto' : 'smooth';
}

function scrollEventIntoTimeline(timelineEl, evId, behavior) {
  if (!timelineEl || !evId) return;
  const btn = timelineEl.querySelector(`[data-testid="flow-event-${evId}"]`);
  if (!btn) return;
  const stickyHead = timelineEl.querySelector('.flow-lanes-header');
  const headHeight = stickyHead ? stickyHead.offsetHeight : 0;
  const tlRect = timelineEl.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const visibleTop = tlRect.top + headHeight + 4;
  const visibleBottom = tlRect.bottom - 4;
  if (btnRect.top < visibleTop) {
    const target = Math.max(0, timelineEl.scrollTop - (visibleTop - btnRect.top));
    timelineEl.scrollTo({ top: target, behavior });
  } else if (btnRect.bottom > visibleBottom) {
    const target = timelineEl.scrollTop + (btnRect.bottom - visibleBottom);
    timelineEl.scrollTo({ top: target, behavior });
  }
}

export function mountBoard(container, opts) {
  const {
    incident,
    onTogglePin,
    isPinned,
    onEventView,
    onBoardChange,
    onOpenTerm,
  } = opts;

  const board = incident.board || { t0: '00:00:00.000', lanes: [], traces: [], events: [] };
  const t0Ms = parseT0Ms(board.t0);
  const lanes = board.lanes || [];
  const laneIndexById = new Map(lanes.map((l, i) => [l.id, i]));
  const laneById = new Map(lanes.map((l) => [l.id, l]));
  const traces = board.traces || [];
  const traceIndexById = new Map(traces.map((tr, i) => [tr.id, i]));
  const events = [...(board.events || [])].sort((a, b) => a.t - b.t);
  const cardById = new Map((incident.cards || []).map((c) => [c.id, c]));

  const lineLookup = new Map();
  for (const ev of incident.evidence || []) {
    for (const ln of ev.lines || []) {
      lineLookup.set(ln.id, { ...ln, evidenceId: ev.id, evidenceTitle: ev.title });
    }
  }

  let currentAttempt = opts.attempt;
  let playTimer = null;

  function computeLayout() {
    const rectWidth = container.getBoundingClientRect().width;
    const width = rectWidth > 0 ? rectWidth : (container.clientWidth || window.innerWidth);
    return width >= LANES_MIN_WIDTH ? 'lanes' : 'list';
  }

  let currentLayout = computeLayout();
  container.dataset.layout = currentLayout;

  const getBoardState = () => {
    const b = currentAttempt?.board || {};
    const maxIdx = Math.max(0, events.length - 1);
    const clockIndex = Math.min(maxIdx, Math.max(0, Number.isInteger(b.clockIndex) ? b.clockIndex : 0));
    const tab = b.tab === 'sources' ? 'sources' : 'flow';
    const traceFilter = b.traceFilter && (b.traceFilter === 'all' || traceIndexById.has(b.traceFilter))
      ? b.traceFilter
      : 'all';
    const selectedEvent = b.selectedEvent && events.some((e) => e.id === b.selectedEvent)
      ? b.selectedEvent
      : (events[clockIndex]?.id || events[0]?.id || null);
    return { tab, clockIndex, traceFilter, selectedEvent };
  };

  let lastRenderedClockIndex = getBoardState().clockIndex;

  function stopPlay() {
    if (playTimer !== null) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function commitBoardPatch(patch, renderOpts = {}) {
    const prev = getBoardState();
    const next = { ...prev, ...patch };
    if (currentAttempt) {
      currentAttempt = { ...currentAttempt, board: next };
    }
    onBoardChange?.(next);
    render(renderOpts);
  }

  function selectEvent(evId) {
    onEventView?.(evId);
    commitBoardPatch(
      { selectedEvent: evId },
      { revealEventId: evId, revealDetail: true },
    );
  }

  function stepForward() {
    const st = getBoardState();
    if (st.clockIndex >= events.length - 1) {
      stopPlay();
      render();
      return;
    }
    const nextIdx = st.clockIndex + 1;
    const nextEv = events[nextIdx];
    if (nextEv) onEventView?.(nextEv.id);
    if (nextIdx >= events.length - 1) {
      stopPlay();
    }
    commitBoardPatch(
      {
        clockIndex: nextIdx,
        selectedEvent: nextEv ? nextEv.id : st.selectedEvent,
      },
      {
        revealEventId: nextEv ? nextEv.id : null,
        revealDetail: true,
      },
    );
  }

  function stepBack() {
    stopPlay();
    const st = getBoardState();
    const nextIdx = Math.max(0, st.clockIndex - 1);
    const selectedIdx = events.findIndex((e) => e.id === st.selectedEvent);
    const nextSelected = selectedIdx > nextIdx ? (events[nextIdx]?.id || null) : st.selectedEvent;
    commitBoardPatch({ clockIndex: nextIdx, selectedEvent: nextSelected });
  }

  function resetClock() {
    stopPlay();
    const firstEv = events[0] || null;
    if (firstEv) onEventView?.(firstEv.id);
    commitBoardPatch(
      { clockIndex: 0, selectedEvent: firstEv ? firstEv.id : null },
      { resetScroll: true },
    );
  }

  function jumpEnd() {
    stopPlay();
    const lastIdx = Math.max(0, events.length - 1);
    commitBoardPatch({ clockIndex: lastIdx });
  }

  function togglePlay() {
    if (playTimer !== null) {
      stopPlay();
      render();
      return;
    }
    const st = getBoardState();
    if (st.clockIndex >= events.length - 1) {
      commitBoardPatch(
        { clockIndex: 0, selectedEvent: events[0]?.id || null },
        { resetScroll: true },
      );
    }
    playTimer = setInterval(stepForward, 800);
    render();
  }

  function renderLanesTimeline(st, visibleEvents, prevClockIndex) {
    const laneCount = Math.max(1, lanes.length);
    const laneHeaders = el('div', {
      className: 'flow-lanes-header',
      style: { '--lane-count': String(laneCount) },
    },
      el('div', { className: 'flow-time-col-head', 'aria-hidden': 'true' }, '시각'),
      ...lanes.map((lane) => el('div', {
        className: 'flow-lane-head',
        'data-testid': `lane-${lane.id}`,
      },
        el('span', { className: 'flow-lane-label-full' }, lane.label),
        lane.note ? el('span', { className: 'flow-lane-note' }, lane.note) : null,
      )),
    );

    const timelineRows = el('div', {
      className: 'flow-timeline-body',
      style: { '--lane-count': String(laneCount) },
    },
      el('div', { className: 'flow-lifelines', 'aria-hidden': 'true' },
        el('div', { className: 'flow-lifeline-spacer' }),
        ...lanes.map(() => el('div', { className: 'flow-lifeline-col' },
          el('span', { className: 'flow-lifeline-line' }),
        )),
      ),
      visibleEvents.length === 0
        ? el('p', { className: 'flow-empty-note' }, '현재 시점까지 선택한 요청의 이벤트가 없습니다. 재생하거나 전체 보기를 눌러 확인하세요.')
        : visibleEvents.map(({ ev, index }) => {
            const fromIdx = laneIndexById.get(ev.from) ?? 0;
            const toIdx = laneIndexById.get(ev.to) ?? 0;
            const traceIdx = traceIndexById.get(ev.trace) ?? 0;
            const leftIdx = Math.min(fromIdx, toIdx);
            const rightIdx = Math.max(fromIdx, toIdx);
            const dir = toIdx >= fromIdx ? 'right' : 'left';
            const leftPct = ((leftIdx + 0.5) / laneCount) * 100;
            const rightPct = ((rightIdx + 0.5) / laneCount) * 100;
            const widthPct = Math.max(4, rightPct - leftPct);
            const isSelected = st.selectedEvent === ev.id;
            const hasPinned = (ev.lines || []).some((lid) => isPinned?.(lid));
            const isNew = index > prevClockIndex;
            const relSec = `+${(ev.t / 1000).toFixed(3)}s`;

            return el('button', {
              type: 'button',
              className: `flow-event-btn flow-event-lane-item trace-color-${traceIdx % 4} kind-${ev.kind}${isSelected ? ' is-selected' : ''}${hasPinned ? ' has-pinned' : ''}${isNew ? ' is-newly-revealed' : ''}`,
              'data-testid': `flow-event-${ev.id}`,
              'data-event-id': ev.id,
              'data-kind': ev.kind,
              'aria-pressed': String(isSelected),
              onClick: () => selectEvent(ev.id),
            },
              el('span', { className: 'flow-event-time' }, relSec),
              el('span', { className: 'flow-event-track' },
                el('span', {
                  className: 'flow-label-row',
                  style: { paddingLeft: `${leftPct.toFixed(2)}%` },
                },
                  el('span', {
                    className: 'flow-arrow-label',
                    'data-role': 'event-label',
                  }, ev.label),
                  hasPinned ? el('span', { className: 'flow-pin-badge', title: '증거 줄 핀됨' }, '★') : null,
                ),
                el('span', { className: 'flow-arrow-track', 'aria-hidden': 'true' },
                  el('span', {
                    className: `flow-arrow dir-${dir} kind-${ev.kind}`,
                    style: {
                      left: `${leftPct.toFixed(2)}%`,
                      width: `${widthPct.toFixed(2)}%`,
                    },
                  },
                    el('span', { className: 'flow-arrow-line' }),
                    el('span', { className: 'flow-arrow-head' }),
                  ),
                ),
              ),
            );
          }),
    );

    const timelineEl = el('div', {
      className: 'flow-timeline is-lanes',
      'data-testid': 'flow-timeline',
    },
      laneHeaders,
      timelineRows,
    );

    return { legendEl: null, timelineEl };
  }

  function renderListTimeline(st, visibleEvents, prevClockIndex) {
    const legendEl = el('div', { className: 'flow-lane-legend', 'aria-label': '시스템 구성 요소' },
      ...lanes.map((lane) => el('span', {
        className: 'flow-lane-chip',
        'data-testid': `lane-${lane.id}`,
      },
        el('strong', { className: 'flow-lane-chip-name' }, lane.label),
        lane.note ? el('span', { className: 'flow-lane-chip-note' }, lane.note) : null,
      )),
    );

    const listBody = el('div', { className: 'flow-list-body' },
      visibleEvents.length === 0
        ? el('p', { className: 'flow-empty-note' }, '현재 시점까지 선택한 요청의 이벤트가 없습니다. 재생하거나 전체 보기를 눌러 확인하세요.')
        : visibleEvents.map(({ ev, index }) => {
            const traceIdx = traceIndexById.get(ev.trace) ?? 0;
            const fromLabel = laneById.get(ev.from)?.label || ev.from;
            const toLabel = laneById.get(ev.to)?.label || ev.to;
            const isSelected = st.selectedEvent === ev.id;
            const hasPinned = (ev.lines || []).some((lid) => isPinned?.(lid));
            const isNew = index > prevClockIndex;
            const relSec = `+${(ev.t / 1000).toFixed(3)}s`;

            return el('button', {
              type: 'button',
              className: `flow-event-btn flow-event-list-item trace-color-${traceIdx % 4} kind-${ev.kind}${isSelected ? ' is-selected' : ''}${hasPinned ? ' has-pinned' : ''}${isNew ? ' is-newly-revealed' : ''}`,
              'data-testid': `flow-event-${ev.id}`,
              'data-event-id': ev.id,
              'data-kind': ev.kind,
              'aria-pressed': String(isSelected),
              onClick: () => selectEvent(ev.id),
            },
              el('span', { className: 'flow-list-meta' },
                el('span', { className: 'trace-swatch', 'aria-hidden': 'true' }),
                el('span', { className: 'flow-event-time' }, relSec),
                el('span', { className: `flow-list-kind kind-${ev.kind}` }, KIND_LABELS[ev.kind] || ev.kind),
                hasPinned ? el('span', { className: 'flow-pin-badge', title: '증거 줄 핀됨' }, '★') : null,
              ),
              el('span', { className: 'flow-list-route' }, `${fromLabel} → ${toLabel}`),
              el('span', {
                className: 'flow-list-label',
                'data-role': 'event-label',
              }, ev.label),
            );
          }),
    );

    const timelineEl = el('div', {
      className: 'flow-timeline is-list',
      'data-testid': 'flow-timeline',
    }, listBody);

    return { legendEl, timelineEl };
  }

  function renderFlowTab(bodyEl, prevClockIndex) {
    const st = getBoardState();
    const currentEv = events[st.clockIndex] || events[0];
    const clockFmt = formatClock(t0Ms, currentEv ? currentEv.t : 0);
    const atStart = st.clockIndex <= 0;
    const atEnd = st.clockIndex >= events.length - 1;

    // 1. Playback & clock bar
    const controls = el('div', { className: 'flow-toolbar' },
      el('div', { className: 'flow-controls', role: 'group', 'aria-label': '요청 흐름 재생 컨트롤' },
        el('button', {
          type: 'button',
          className: 'flow-ctrl-btn',
          'data-testid': 'flow-reset',
          onClick: resetClock,
        }, '처음'),
        el('button', {
          type: 'button',
          className: 'flow-ctrl-btn',
          'data-testid': 'flow-step-back',
          disabled: atStart,
          onClick: stepBack,
        }, '이전'),
        el('button', {
          type: 'button',
          className: `flow-ctrl-btn flow-play-btn${playTimer !== null ? ' is-playing' : ''}`,
          'data-testid': 'flow-play',
          'aria-pressed': String(playTimer !== null),
          onClick: togglePlay,
        }, playTimer !== null ? '정지' : '재생'),
        el('button', {
          type: 'button',
          className: 'flow-ctrl-btn',
          'data-testid': 'flow-step',
          disabled: atEnd,
          onClick: () => {
            stopPlay();
            stepForward();
          },
        }, '다음'),
        el('button', {
          type: 'button',
          className: 'flow-ctrl-btn',
          'data-testid': 'flow-end',
          onClick: jumpEnd,
        }, '전체'),
      ),
      el('div', { className: 'flow-clock-wrap' },
        el('span', { className: 'flow-clock', 'data-testid': 'flow-clock' },
          el('span', { className: 'flow-clock-abs' }, clockFmt.absStr),
          el('span', { className: 'flow-clock-rel' }, ` (${clockFmt.relStr})`),
        ),
        el('span', { className: 'flow-step-count' }, `${Math.min(events.length, st.clockIndex + 1)} / ${events.length}`),
      ),
    );

    // 2. Trace filters
    const traceBar = el('div', { className: 'flow-trace-bar', role: 'group', 'aria-label': '트레이스 필터' },
      el('span', { className: 'flow-trace-caption' }, '요청 필터'),
      el('button', {
        type: 'button',
        className: `trace-pill${st.traceFilter === 'all' ? ' is-active' : ''}`,
        'data-testid': 'trace-filter-all',
        'aria-pressed': String(st.traceFilter === 'all'),
        onClick: () => commitBoardPatch({ traceFilter: 'all' }),
      }, '전체'),
      ...traces.map((tr, idx) => el('button', {
        type: 'button',
        className: `trace-pill trace-color-${idx % 4}${st.traceFilter === tr.id ? ' is-active' : ''}`,
        'data-testid': `trace-filter-${tr.id}`,
        'aria-pressed': String(st.traceFilter === tr.id),
        onClick: () => commitBoardPatch({ traceFilter: tr.id }),
      },
        el('span', { className: 'trace-swatch', 'aria-hidden': 'true' }),
        tr.label,
      )),
    );

    // 3. Visible events
    const visibleEvents = [];
    for (let i = 0; i <= st.clockIndex && i < events.length; i++) {
      const ev = events[i];
      if (st.traceFilter !== 'all' && ev.trace !== st.traceFilter) continue;
      visibleEvents.push({ ev, index: i });
    }

    const { legendEl, timelineEl } = currentLayout === 'lanes'
      ? renderLanesTimeline(st, visibleEvents, prevClockIndex)
      : renderListTimeline(st, visibleEvents, prevClockIndex);

    // 4. Selected event detail panel
    const detailEv = events.find((e) => e.id === st.selectedEvent) || currentEv;
    const detailPanel = renderEventDetail(detailEv);

    bodyEl.append(controls, traceBar, ...(legendEl ? [legendEl] : []), timelineEl, detailPanel);
    return { timelineEl, detailPanel };
  }

  function renderEventDetail(ev) {
    if (!ev) {
      return el('div', { className: 'flow-detail', 'data-testid': 'flow-detail', 'data-event-id': '' },
        el('p', { className: 'muted-text' }, '이벤트를 선택하면 상세 정보와 관련 기록 줄이 표시됩니다.'),
      );
    }

    const timeFmt = formatClock(t0Ms, ev.t);
    const fromLabel = laneById.get(ev.from)?.label || ev.from;
    const toLabel = laneById.get(ev.to)?.label || ev.to;
    const traceIdx = traceIndexById.get(ev.trace) ?? 0;

    const detailsList = (ev.details && ev.details.length > 0)
      ? el('dl', { className: 'flow-detail-kv' },
          ev.details.map(([k, v]) => el('div', { className: 'flow-detail-kv-row' },
            el('dt', null, k),
            el('dd', null, v),
          )),
        )
      : null;

    const linesSection = el('div', { className: 'flow-detail-lines' },
      el('h4', { className: 'flow-detail-subhead' }, '관련 기록 줄 (눌러서 증거로 핀)'),
      ev.lines && ev.lines.length > 0
        ? el('div', { className: 'flow-detail-line-list' },
            ev.lines.map((lineId) => {
              const info = lineLookup.get(lineId);
              const pinned = Boolean(isPinned?.(lineId));
              return el('button', {
                type: 'button',
                className: 'evidence-line-btn',
                'data-testid': `line-${lineId}`,
                'data-line-id': lineId,
                'aria-pressed': String(pinned),
                onClick: () => onTogglePin?.(lineId),
              },
                el('span', { className: 'line-pin-indicator', 'aria-hidden': 'true' }, pinned ? '★' : '☆'),
                el('span', { className: 'line-id-tag' }, info ? `${lineId} · ${info.evidenceTitle}` : lineId),
                el('code', { className: 'line-text' }, info ? info.text : lineId),
              );
            }),
          )
        : el('p', { className: 'muted-text small-text' }, '이 이벤트에 직접 연결된 로그 줄이 없습니다.'),
    );

    const terms = (ev.terms || []).map((cid) => cardById.get(cid)).filter(Boolean);
    const termsSection = terms.length > 0
      ? el('div', { className: 'flow-detail-terms' },
          el('span', { className: 'flow-detail-terms-label' }, '관련 용어'),
          ...terms.map((card) => {
            const btn = el('button', {
              type: 'button',
              className: 'term-chip-btn',
              'data-testid': `term-${card.id}`,
              onClick: () => onOpenTerm?.(card, btn),
            }, `${card.term} ?`);
            return btn;
          }),
        )
      : null;

    return el('section', {
      className: 'flow-detail',
      'data-testid': 'flow-detail',
      'data-event-id': ev.id,
      'aria-label': '선택된 이벤트 상세',
    },
      el('div', { className: 'flow-detail-head' },
        el('div', { className: 'flow-detail-meta' },
          el('span', { className: 'flow-detail-time' }, `${timeFmt.absStr} (${timeFmt.relStr})`),
          el('span', { className: `flow-detail-trace trace-color-${traceIdx % 4}` }, `req=${ev.trace}`),
          el('span', { className: `flow-detail-kind kind-${ev.kind}` }, KIND_LABELS[ev.kind] || ev.kind),
        ),
        el('h3', { className: 'flow-detail-title' }, `${fromLabel} → ${toLabel}: ${ev.label}`),
      ),
      detailsList,
      linesSection,
      termsSection,
    );
  }

  let bodyEl = null;

  function render(renderOpts = {}) {
    const st = getBoardState();
    const prevClockIndex = lastRenderedClockIndex;
    lastRenderedClockIndex = st.clockIndex;

    const prevTimeline = container.querySelector('[data-testid="flow-timeline"]');
    const savedScrollTop = renderOpts.resetScroll ? 0 : (prevTimeline ? prevTimeline.scrollTop : 0);

    container.dataset.layout = currentLayout;
    clear(container);

    const tabs = el('div', { className: 'board-tabs', role: 'tablist', 'aria-label': '보드 보기 전환' },
      el('button', {
        type: 'button',
        role: 'tab',
        className: `board-tab-btn${st.tab === 'flow' ? ' is-active' : ''}`,
        'data-testid': 'board-tab-flow',
        'aria-selected': String(st.tab === 'flow'),
        onClick: () => {
          if (st.tab !== 'flow') commitBoardPatch({ tab: 'flow' });
        },
      }, '요청 흐름'),
      el('button', {
        type: 'button',
        role: 'tab',
        className: `board-tab-btn${st.tab === 'sources' ? ' is-active' : ''}`,
        'data-testid': 'board-tab-sources',
        'aria-selected': String(st.tab === 'sources'),
        onClick: () => {
          stopPlay();
          if (st.tab !== 'sources') commitBoardPatch({ tab: 'sources' });
        },
      }, '원본 자료'),
    );

    bodyEl = el('div', { className: 'board-body', role: 'tabpanel' });
    let flowRefs = null;
    if (st.tab === 'flow') {
      flowRefs = renderFlowTab(bodyEl, prevClockIndex);
    } else {
      renderSourcesContent(bodyEl, { incident, onTogglePin, isPinned });
    }

    container.append(tabs, bodyEl);

    if (flowRefs?.timelineEl) {
      flowRefs.timelineEl.scrollTop = savedScrollTop;
      const behavior = getScrollBehavior();
      if (renderOpts.revealEventId) {
        scrollEventIntoTimeline(flowRefs.timelineEl, renderOpts.revealEventId, behavior);
      }
      if (renderOpts.revealDetail && flowRefs.detailPanel) {
        flowRefs.detailPanel.scrollIntoView({ block: 'nearest', behavior });
      }
    }
  }

  let resizeObserver = null;
  let onWindowResize = null;
  const syncLayout = () => {
    const nextLayout = computeLayout();
    if (nextLayout !== currentLayout) {
      currentLayout = nextLayout;
      container.dataset.layout = currentLayout;
      render();
    }
  };
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(syncLayout);
    resizeObserver.observe(container);
  } else {
    onWindowResize = syncLayout;
    window.addEventListener('resize', onWindowResize);
  }

  render();

  return {
    update(nextAttempt) {
      currentAttempt = nextAttempt;
      if (!bodyEl) return;
      syncSourcePinStates(bodyEl, isPinned);
      const eventBtns = bodyEl.querySelectorAll('button[data-event-id]');
      const evMap = new Map(events.map((e) => [e.id, e]));
      for (const btn of eventBtns) {
        const ev = evMap.get(btn.dataset.eventId);
        if (!ev) continue;
        const hasPinned = (ev.lines || []).some((lid) => isPinned?.(lid));
        btn.classList.toggle('has-pinned', hasPinned);
        const badgeHost = btn.querySelector('.flow-label-row') || btn.querySelector('.flow-list-meta');
        if (badgeHost) {
          const badge = badgeHost.querySelector('.flow-pin-badge');
          if (hasPinned && !badge) {
            badgeHost.appendChild(el('span', { className: 'flow-pin-badge', title: '증거 줄 핀됨' }, '★'));
          } else if (!hasPinned && badge) {
            badge.remove();
          }
        }
      }
    },
    destroy() {
      stopPlay();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (onWindowResize) {
        window.removeEventListener('resize', onWindowResize);
        onWindowResize = null;
      }
      clear(container);
    },
  };
}
