/**
 * Pure grading functions (no DOM dependencies).
 * Contract defined in docs/SPEC.md section 4.
 */

const RATIONALE_LENGTH_ERROR = '판단 근거를 10자 이상 200자 이하로 적어 주세요.';

/**
 * Evaluate a line-selection rule against selected evidence line IDs.
 * @param {{ allOf?: string[], anyOf?: string[], noneOf?: string[] } | null | undefined} rule
 * @param {string[]} selectedIds
 * @returns {boolean}
 */
export function evaluateRule(rule, selectedIds) {
  if (!rule) return true;
  const set = new Set(Array.isArray(selectedIds) ? selectedIds : []);

  if (Array.isArray(rule.allOf) && rule.allOf.length > 0) {
    for (const id of rule.allOf) {
      if (!set.has(id)) return false;
    }
  }

  if (Array.isArray(rule.anyOf) && rule.anyOf.length > 0) {
    let matched = false;
    for (const id of rule.anyOf) {
      if (set.has(id)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }

  if (Array.isArray(rule.noneOf) && rule.noneOf.length > 0) {
    for (const id of rule.noneOf) {
      if (set.has(id)) return false;
    }
  }

  return true;
}

/**
 * Grade a checkpoint submission (cp1 evidence-only or cp2 multi-part).
 * @param {object} cp
 * @param {{ selected?: string[], rationale?: string, state?: string, reply?: string }} submission
 * @returns {{ pass: boolean, feedback: string[], notes: string[], suggestTopic: string | null }}
 */
export function gradeCheckpoint(cp, submission = {}) {
  const selected = Array.isArray(submission.selected) ? submission.selected : [];
  const trimmedRationale = typeof submission.rationale === 'string' ? submission.rationale.trim() : '';

  if (trimmedRationale.length < 10 || trimmedRationale.length > 200) {
    return {
      pass: false,
      feedback: [RATIONALE_LENGTH_ERROR],
      notes: [],
      suggestTopic: null,
    };
  }

  // cp1: evidenceRule based
  if (cp.evidenceRule) {
    const pass = evaluateRule(cp.evidenceRule, selected);
    if (pass) {
      return { pass: true, feedback: [], notes: [], suggestTopic: null };
    }

    const feedback = [];
    let suggestTopic = null;
    for (const pattern of cp.patterns || []) {
      if (evaluateRule(pattern.when, selected)) {
        if (pattern.feedback) feedback.push(pattern.feedback);
        if (suggestTopic === null && pattern.suggestTopic) {
          suggestTopic = pattern.suggestTopic;
        }
      }
    }

    return { pass: false, feedback, notes: [], suggestTopic };
  }

  // cp2: stateQuestion + evidenceQuestion + replyQuestion
  const feedback = [];

  const sq = cp.stateQuestion;
  const statePass = Boolean(sq && submission.state === sq.answer);
  if (!statePass && sq) {
    const msg = sq.wrongFeedback?.[submission.state] ?? '이 요청의 실제 상태를 다시 확인해 보세요.';
    feedback.push(msg);
  }

  const eq = cp.evidenceQuestion;
  const maxSel = eq?.maxSelections ?? Infinity;
  const evidencePass = Boolean(
    eq &&
    selected.length >= 1 &&
    selected.length <= maxSel &&
    evaluateRule(eq.rule, selected)
  );
  if (!evidencePass && eq) {
    feedback.push(eq.wrongFeedback);
  }

  const rq = cp.replyQuestion;
  const replyPass = Boolean(rq && submission.reply === rq.answer);
  if (!replyPass && rq) {
    const msg = rq.wrongFeedback?.[submission.reply] ?? '고객사 회신 내용을 다시 확인해 보세요.';
    feedback.push(msg);
  }

  const pass = statePass && evidencePass && replyPass;
  const notes = [];
  if (pass && Array.isArray(eq?.passNotes)) {
    for (const item of eq.passNotes) {
      if (evaluateRule(item.when, selected)) {
        notes.push(item.note);
      }
    }
  }

  return { pass, feedback, notes, suggestTopic: null };
}

/**
 * Determine incident resolution outcome.
 * @param {{ finalFirstTryPass: boolean, hintLevel: number }} params
 * @returns {'independent' | 'assisted'}
 */
export function computeOutcome({ finalFirstTryPass, hintLevel }) {
  return finalFirstTryPass && hintLevel === 0 ? 'independent' : 'assisted';
}
