/**
 * Client-side state store backed by localStorage (key: csq:v2).
 * v1 data is ignored. Falls back to in-memory storage when localStorage is unavailable.
 * Contract defined in docs/SPEC.md section 6.
 */

export const STORAGE_KEY = 'csq:v2';

let memoryFallback = null;

function createEmptyState() {
  return {
    version: 2,
    attempts: {},
    history: [],
    learn: {
      done: {},
    },
  };
}

export function createAttempt(firstEventId = null) {
  return {
    step: 'briefing',
    initialHypothesis: null,
    checkpoint: 'cp1',
    selections: { cp1: [], cp2: [] },
    drafts: { cp1: '', cp2: '' },
    cp2Choices: { state: null, reply: null },
    submissions: { cp1: [], cp2: [] },
    lastResult: { cp1: null, cp2: null },
    hintLevel: 0,
    viewedTerms: [],
    viewedEvents: firstEventId ? [firstEventId] : [],
    board: {
      tab: 'flow',
      clockIndex: 0,
      traceFilter: 'all',
      selectedEvent: firstEventId,
    },
    selfCheck: {},
    finishedAt: null,
    outcome: null,
  };
}

function normalizeAttempt(raw) {
  const base = createAttempt();
  if (!raw || typeof raw !== 'object') return base;
  return {
    step: ['briefing', 'hypothesis', 'investigate', 'result'].includes(raw.step) ? raw.step : 'briefing',
    initialHypothesis: typeof raw.initialHypothesis === 'string' ? raw.initialHypothesis : null,
    checkpoint: raw.checkpoint === 'cp2' ? 'cp2' : 'cp1',
    selections: {
      cp1: Array.isArray(raw.selections?.cp1) ? [...raw.selections.cp1] : [],
      cp2: Array.isArray(raw.selections?.cp2) ? [...raw.selections.cp2] : [],
    },
    drafts: {
      cp1: typeof raw.drafts?.cp1 === 'string' ? raw.drafts.cp1 : '',
      cp2: typeof raw.drafts?.cp2 === 'string' ? raw.drafts.cp2 : '',
    },
    cp2Choices: {
      state: typeof raw.cp2Choices?.state === 'string' ? raw.cp2Choices.state : null,
      reply: typeof raw.cp2Choices?.reply === 'string' ? raw.cp2Choices.reply : null,
    },
    submissions: {
      cp1: Array.isArray(raw.submissions?.cp1) ? [...raw.submissions.cp1] : [],
      cp2: Array.isArray(raw.submissions?.cp2) ? [...raw.submissions.cp2] : [],
    },
    lastResult: {
      cp1: raw.lastResult?.cp1 ?? null,
      cp2: raw.lastResult?.cp2 ?? null,
    },
    hintLevel: Number.isInteger(raw.hintLevel) && raw.hintLevel >= 0 ? raw.hintLevel : 0,
    viewedTerms: Array.isArray(raw.viewedTerms) ? [...raw.viewedTerms] : [],
    viewedEvents: Array.isArray(raw.viewedEvents) ? [...raw.viewedEvents] : [],
    board: Array.isArray(raw.board?.history)
      ? {
          history: raw.board.history.filter((c) => typeof c === 'string'),
        }
      : {
          tab: raw.board?.tab === 'sources' ? 'sources' : 'flow',
          clockIndex: Number.isInteger(raw.board?.clockIndex) && raw.board.clockIndex >= 0 ? raw.board.clockIndex : 0,
          traceFilter: typeof raw.board?.traceFilter === 'string' ? raw.board.traceFilter : 'all',
          selectedEvent: typeof raw.board?.selectedEvent === 'string' ? raw.board.selectedEvent : null,
        },
    selfCheck: raw.selfCheck && typeof raw.selfCheck === 'object' ? { ...raw.selfCheck } : {},
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null,
    outcome: raw.outcome === 'independent' || raw.outcome === 'assisted' ? raw.outcome : null,
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 2) {
    return createEmptyState();
  }
  const attempts = {};
  if (raw.attempts && typeof raw.attempts === 'object') {
    for (const [id, att] of Object.entries(raw.attempts)) {
      attempts[id] = normalizeAttempt(att);
    }
  }
  const done = {};
  if (raw.learn?.done && typeof raw.learn.done === 'object') {
    for (const [tid, iso] of Object.entries(raw.learn.done)) {
      if (typeof iso === 'string') done[tid] = iso;
    }
  }
  return {
    version: 2,
    attempts,
    history: Array.isArray(raw.history) ? raw.history : [],
    learn: { done },
  };
}

export function loadState() {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = normalizeState(JSON.parse(raw));
        memoryFallback = parsed;
        return parsed;
      }
      memoryFallback = createEmptyState();
      return memoryFallback;
    }
  } catch {
    // Fall back to memory store
  }
  if (!memoryFallback) {
    memoryFallback = createEmptyState();
  }
  return memoryFallback;
}

export function saveState(state) {
  const normalized = normalizeState(state);
  memoryFallback = normalized;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // In-memory state already updated
  }
  return normalized;
}

export function resetState() {
  const empty = createEmptyState();
  memoryFallback = empty;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage removal errors
  }
  return empty;
}

export function toggleTopicDone(state, topicId) {
  const next = normalizeState(state);
  if (next.learn.done[topicId]) {
    delete next.learn.done[topicId];
  } else {
    next.learn.done[topicId] = new Date().toISOString();
  }
  return saveState(next);
}

export function isTopicDone(state, topicId) {
  return Boolean(state?.learn?.done?.[topicId]);
}

export function getLearnDoneIds(state) {
  return Object.keys(state?.learn?.done || {});
}

/**
 * Compute stage status from catalog stage entry and history.
 * @param {{ id: string, requires?: string[], available?: boolean }} stage
 * @param {Array<{ incidentId: string, outcome: string }>} history
 * @returns {'current' | 'locked' | 'solved-independent' | 'solved-assisted'}
 */
export function getStageStatus(stage, history = []) {
  const entries = history.filter((h) => h.incidentId === stage.id);
  if (entries.some((e) => e.outcome === 'independent')) return 'solved-independent';
  if (entries.some((e) => e.outcome === 'assisted')) return 'solved-assisted';

  if (stage.available === false) return 'locked';
  const solvedIds = new Set(history.map((h) => h.incidentId));
  for (const reqId of stage.requires || []) {
    if (!solvedIds.has(reqId)) return 'locked';
  }
  return 'current';
}
