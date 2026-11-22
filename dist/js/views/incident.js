/**
 * Incident view (#/incident/:id and #/incident/:id/result).
 * Steps: briefing -> hypothesis -> investigate (board + notes panel) -> result.
 * Enforces <= 4 visible [data-panel] elements during investigate (2) and result (4).
 */
import { loadIncident, loadAllTopics } from '../content.js';
import { loadState, saveState, createAttempt } from '../store.js';
import { gradeCheckpoint, computeOutcome } from '../grading.js';
import { navigate } from '../router.js';
import { getBoardModule } from '../boards/registry.js';
import { el, clear } from '../ui/dom.js';
import { openTermPopover, closeTermPopover } from '../ui/term-popover.js';

const STEPS = [
  { id: 'briefing', label: '브리핑' },
  { id: 'hypothesis', label: '가설' },
  { id: 'investigate', label: '조사' },
  { id: 'result', label: '결과' },
];

export async function renderIncidentView(container, { catalog, route }) {
  const incidentId = route.params.id;
  const [incident, allTopics] = await Promise.all([
    loadIncident(incidentId),
    loadAllTopics(),
  ]);

  if (!incident) {
    clear(container);
    container.appendChild(
      el('div', { className: 'error-shell' },
        el('h1', null, '사건을 찾을 수 없습니다'),
        el('p', null, '아직 공개되지 않았거나 존재하지 않는 사건입니다.'),
        el('a', { href: '#/', className: 'btn btn-quest-primary' }, '퀘스트 홈으로'),
      )
    );
    return { destroy() {} };
  }

  const topicMap = new Map(allTopics.map((t) => [t.id, t]));
  const hypMap = new Map((incident.hypotheses || []).map((h) => [h.id, h]));
  const lineMap = new Map();
  for (const ev of incident.evidence || []) {
    for (const ln of ev.lines || []) {
      lineMap.set(ln.id, { ...ln, evidenceId: ev.id, evidenceTitle: ev.title });
    }
  }

  const firstEventId = incident.board?.events?.[0]?.id || null;

  let state = loadState();
  if (route.name !== 'incident-result' && !state.attempts[incident.id]) {
    state.attempts[incident.id] = createAttempt(firstEventId);
    state = saveState(state);
  }

  let activeBoardHandle = null;
  let pinNoticeMessage = '';

  function cleanupBoard() {
    if (activeBoardHandle) {
      activeBoardHandle.destroy();
      activeBoardHandle = null;
    }
  }

  function getAttempt() {
    return state.attempts[incident.id];
  }

  function persist() {
    state = saveState(state);
  }

  function renderTopBar(currentStep) {
    return el('div', { className: 'incident-topbar' },
      el('div', { className: 'incident-topbar-main' },
        el('a', { href: '#/', className: 'incident-back-link' }, '← 퀘스트'),
        el('h1', { className: 'incident-topbar-title' }, incident.title),
        el('span', { className: 'sim-badge', 'data-testid': 'sim-badge' }, '학습용 가상 자료'),
      ),
      el('div', { className: 'incident-topbar-sub' },
        el('ol', { className: 'step-pills', 'aria-label': '사건 진행 단계' },
          STEPS.map((st, idx) => {
            const activeIdx = STEPS.findIndex((s) => s.id === currentStep);
            const stateClass = idx < activeIdx ? 'is-done' : (idx === activeIdx ? 'is-active' : '');
            return el('li', {
              className: `step-pill ${stateClass}`,
              'aria-current': idx === activeIdx ? 'step' : null,
            }, `${idx + 1}. ${st.label}`);
          }),
        ),
        currentStep === 'investigate' && incident.objective
          ? el('p', { className: 'incident-objective-bar' },
              el('strong', null, '목표: '),
              incident.objective,
            )
          : null,
      ),
    );
  }

  function renderBriefing(wrapper) {
    const intake = incident.intake || {};
    const panel = el('section', {
      className: 'incident-panel briefing-panel',
      'data-panel': '',
      'data-testid': 'briefing-view',
    },
      el('p', { className: 'sim-notice-inline' }, incident.simulationNotice),
      el('div', { className: 'briefing-grid' },
        el('div', { className: 'briefing-col' },
          el('h2', { className: 'panel-heading' }, '수신 메시지'),
          el('div', { className: 'chat-list' },
            (intake.messages || []).map((msg) => el('div', { className: 'chat-bubble' },
              el('div', { className: 'chat-meta' },
                el('strong', null, msg.from),
                el('span', { className: 'muted-text' }, msg.time),
              ),
              el('p', { className: 'chat-text' }, msg.text),
            )),
          ),
          intake.ticket
            ? el('div', { className: 'ticket-box' },
                el('div', { className: 'ticket-head' },
                  el('span', { className: 'ticket-id' }, `티켓 #${intake.ticket.id}`),
                  el('span', { className: 'muted-text' }, `접수: ${intake.ticket.reporter}`),
                ),
                el('dl', { className: 'ticket-fields' },
                  (intake.ticket.fields || []).map((f) => el('div', { className: 'ticket-row' },
                    el('dt', null, f.label),
                    el('dd', null, f.value),
                  )),
                ),
              )
            : null,
        ),
        el('div', { className: 'briefing-col' },
          el('div', { className: 'objective-callout' },
            el('span', { className: 'callout-kicker' }, '이번 사건 목표'),
            el('p', { className: 'objective-text' }, incident.objective),
          ),
          el('div', { className: 'criteria-box' },
            el('h2', { className: 'panel-heading' }, '판정 기준'),
            el('ul', { className: 'criteria-list' },
              (incident.criteria || []).map((c) => el('li', null, c)),
            ),
          ),
          incident.system
            ? el('div', { className: 'system-box' },
                el('h3', { className: 'sub-heading' }, '시스템 구성'),
                el('pre', { className: 'system-diagram' }, incident.system.diagram),
                el('ul', { className: 'system-notes' },
                  (incident.system.notes || []).map((n) => el('li', null, n)),
                ),
              )
            : null,
        ),
      ),
      el('div', { className: 'panel-footer-actions' },
        el('button', {
          type: 'button',
          className: 'btn btn-quest-primary btn-lg',
          'data-testid': 'start-investigation',
          onClick: () => {
            getAttempt().step = 'hypothesis';
            persist();
            render();
          },
        }, '조사 시작하기 →'),
      ),
    );
    wrapper.appendChild(panel);
  }

  function renderHypothesis(wrapper) {
    let selected = getAttempt().initialHypothesis;

    const submitBtn = el('button', {
      type: 'button',
      className: 'btn btn-quest-primary btn-lg',
      'data-testid': 'hypothesis-submit',
      disabled: !selected,
      onClick: () => {
        if (!selected) return;
        const att = getAttempt();
        att.initialHypothesis = selected;
        att.step = 'investigate';
        persist();
        render();
      },
    }, '가설 기록하고 보드 열기 →');

    const optionLabels = (incident.hypotheses || []).map((h) => {
      const radio = el('input', {
        type: 'radio',
        name: 'initial-hypothesis',
        value: h.id,
        checked: selected === h.id,
        onChange: () => {
          selected = h.id;
          const att = getAttempt();
          att.initialHypothesis = h.id;
          persist();
          submitBtn.disabled = false;
          for (const lbl of optionLabels) {
            lbl.classList.toggle('is-selected', lbl.dataset.hypId === selected);
          }
        },
      });
      return el('label', {
        className: `hyp-option${selected === h.id ? ' is-selected' : ''}`,
        'data-testid': `hypothesis-option-${h.id}`,
        'data-hyp-id': h.id,
      },
        radio,
        el('span', { className: 'hyp-code' }, h.id),
        el('span', { className: 'hyp-text' }, h.text),
      );
    });

    const panel = el('section', {
      className: 'incident-panel hypothesis-panel',
      'data-panel': '',
    },
      el('h2', { className: 'panel-heading' }, '첫 가설 세우기'),
      el('p', { className: 'hypothesis-note' }, '브리핑만 보고 가장 그럴듯한 상태를 하나 골라 주세요. 채점하지 않습니다. 조사 뒤 결과 화면에서 처음 생각과 비교합니다.'),
      el('fieldset', { className: 'hyp-fieldset' },
        el('legend', { className: 'sr-only' }, '초기 가설 선택'),
        ...optionLabels,
      ),
      el('div', { className: 'panel-footer-actions' }, submitBtn),
    );
    wrapper.appendChild(panel);
  }

  function renderInvestigate(wrapper) {
    const attempt = getAttempt();
    const cpId = attempt.checkpoint === 'cp2' ? 'cp2' : 'cp1';
    const cp = (incident.checkpoints || []).find((c) => c.id === cpId) || incident.checkpoints[0];
    const maxSel = cp.evidenceQuestion?.maxSelections ?? Infinity;

    const boardType = incident.board?.type || 'sources';
    const boardPanel = el('section', {
      className: 'board-panel',
      'data-panel': '',
      'data-testid': 'board',
      'data-board-type': boardType,
      'aria-label': catalog.boards?.[boardType] || '조사 보드',
    });

    const notesPanel = el('aside', {
      className: 'notes-panel',
      'data-panel': '',
      'data-testid': 'notes-panel',
      'aria-label': '조사 노트 및 판정',
    });

    const mobileCountEl = el('strong', { 'data-testid': 'mobile-cp-bar-count' }, '0');
    const mobileBar = el('div', { className: 'mobile-cp-bar', 'data-testid': 'mobile-cp-bar' },
      el('div', { className: 'mobile-cp-bar-info' },
        el('span', { className: 'mobile-cp-bar-stage' }, cp.id === 'cp1' ? '체크포인트 1' : '체크포인트 2'),
        el('span', { className: 'mobile-cp-bar-sel' }, '핀한 근거 ', mobileCountEl, '줄'),
      ),
      el('button', {
        type: 'button',
        className: 'btn btn-quest-primary mobile-cp-bar-btn',
        'data-testid': 'mobile-cp-bar-go',
        onClick: () => {
          notesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const textarea = notesPanel.querySelector('[data-testid="rationale-input"]');
          if (textarea) textarea.focus();
        },
      }, '판정 작성 →'),
    );

    const grid = el('div', { className: 'investigate-grid' }, boardPanel, notesPanel);
    wrapper.append(grid, mobileBar);

    function isPinned(lineId) {
      const activeCp = getAttempt().checkpoint === 'cp2' ? 'cp2' : 'cp1';
      return (getAttempt().selections[activeCp] || []).includes(lineId);
    }

    function onTogglePin(lineId) {
      const att = getAttempt();
      const activeCp = att.checkpoint === 'cp2' ? 'cp2' : 'cp1';
      const activeCpObj = (incident.checkpoints || []).find((c) => c.id === activeCp);
      const limit = activeCpObj?.evidenceQuestion?.maxSelections ?? Infinity;
      const list = att.selections[activeCp] || [];
      const idx = list.indexOf(lineId);

      if (idx >= 0) {
        list.splice(idx, 1);
        pinNoticeMessage = '';
      } else {
        if (list.length >= limit) {
          pinNoticeMessage = `최대 ${limit}줄까지만 선택할 수 있습니다. 기존 줄을 해제한 뒤 선택해 주세요.`;
          syncNotesDynamic();
          return;
        }
        list.push(lineId);
        pinNoticeMessage = '';
      }

      att.selections[activeCp] = list;
      persist();
      activeBoardHandle?.update(getAttempt());
      renderNotes();
    }

    function onEventView(evId) {
      const att = getAttempt();
      if (!att.viewedEvents.includes(evId)) {
        att.viewedEvents.push(evId);
        persist();
      }
    }

    function onBoardChange(nextBoardState) {
      const att = getAttempt();
      att.board = nextBoardState;
      persist();
    }

    function onOpenTerm(card, anchorEl) {
      const att = getAttempt();
      if (!att.viewedTerms.includes(card.id)) {
        att.viewedTerms.push(card.id);
        persist();
      }
      openTermPopover({ card, incidentId: incident.id, anchorEl });
    }

    const boardMod = getBoardModule(boardType);
    activeBoardHandle = boardMod.mountBoard(boardPanel, {
      incident,
      attempt,
      onTogglePin,
      isPinned,
      onEventView,
      onBoardChange,
      onOpenTerm,
    });

    // Refs inside notesPanel for in-place updates (preserving textarea focus)
    let submitBtnRef = null;
    let charCountRef = null;
    let submitHintRef = null;
    let pinNoticeRef = null;

    function getValidationState(att, cpObj) {
      const sel = att.selections[cpObj.id] || [];
      const draft = (att.drafts[cpObj.id] || '').trim();
      const missing = [];
      if (cpObj.stateQuestion && !att.cp2Choices.state) missing.push('원인/상태 선택');
      if (sel.length < 1) missing.push('증거 줄 1개 이상 핀');
      if (cpObj.evidenceQuestion?.maxSelections && sel.length > cpObj.evidenceQuestion.maxSelections) {
        missing.push(`증거 줄 최대 ${cpObj.evidenceQuestion.maxSelections}개`);
      }
      if (cpObj.replyQuestion && !att.cp2Choices.reply) missing.push('조치/회신 선택');
      if (draft.length < 10) missing.push('근거 10자 이상 작성');
      if (draft.length > 200) missing.push('근거 200자 이하 작성');
      return { ready: missing.length === 0, missing, draftLen: draft.length };
    }

    function syncNotesDynamic() {
      const att = getAttempt();
      const activeCp = att.checkpoint === 'cp2' ? 'cp2' : 'cp1';
      const cpObj = (incident.checkpoints || []).find((c) => c.id === activeCp) || incident.checkpoints[0];
      const sel = att.selections[cpObj.id] || [];
      mobileCountEl.textContent = String(sel.length);

      const v = getValidationState(att, cpObj);
      if (submitBtnRef) submitBtnRef.disabled = !v.ready;
      if (charCountRef) {
        charCountRef.textContent = `${(att.drafts[cpObj.id] || '').length} / 200자 (공백 제외 ${v.draftLen}자 · 최소 10자)`;
      }
      if (submitHintRef) {
        submitHintRef.textContent = v.ready ? '제출할 수 있습니다.' : `필요 항목: ${v.missing.join(', ')}`;
      }
      if (pinNoticeRef) {
        pinNoticeRef.textContent = pinNoticeMessage;
        pinNoticeRef.hidden = !pinNoticeMessage;
      }
    }

    function renderNotes() {
      clear(notesPanel);
      const att = getAttempt();
      const activeCp = att.checkpoint === 'cp2' ? 'cp2' : 'cp1';
      const cpObj = (incident.checkpoints || []).find((c) => c.id === activeCp) || incident.checkpoints[0];
      const sel = att.selections[cpObj.id] || [];
      const draftVal = att.drafts[cpObj.id] || '';
      const lastRes = att.lastResult[cpObj.id];
      const initialHyp = hypMap.get(att.initialHypothesis);

      // Update mobile bar checkpoint label
      const stageSpan = mobileBar.querySelector('.mobile-cp-bar-stage');
      if (stageSpan) stageSpan.textContent = cpObj.id === 'cp1' ? '체크포인트 1' : '체크포인트 2';

      // Initial hypothesis compact box
      const hypReminder = initialHyp
        ? el('div', { className: 'notes-hyp-reminder' },
            el('span', { className: 'notes-kicker' }, '나의 첫 가설'),
            el('p', { className: 'notes-hyp-text' }, `${initialHyp.id}. ${initialHyp.text}`),
          )
        : null;

      // CP2 stateQuestion radios
      let stateQuestionEl = null;
      if (cpObj.stateQuestion) {
        const sq = cpObj.stateQuestion;
        stateQuestionEl = el('fieldset', { className: 'cp-fieldset' },
          el('legend', { className: 'cp-legend' }, sq.prompt),
          el('div', { className: 'cp-radio-list' },
            (sq.options || []).map((optId) => {
              const h = hypMap.get(optId);
              return el('label', { className: 'cp-radio-label' },
                el('input', {
                  type: 'radio',
                  name: 'cp2-final-state',
                  value: optId,
                  checked: att.cp2Choices.state === optId,
                  'data-testid': `final-state-${optId}`,
                  onChange: () => {
                    const cur = getAttempt();
                    cur.cp2Choices.state = optId;
                    persist();
                    syncNotesDynamic();
                  },
                }),
                el('span', null, h ? h.text : optId),
              );
            }),
          ),
        );
      }

      // Selected evidence chips
      pinNoticeRef = el('p', {
        className: 'pin-limit-notice',
        role: 'status',
        'aria-live': 'polite',
        hidden: !pinNoticeMessage,
      }, pinNoticeMessage);

      const evidenceSection = el('div', { className: 'cp-evidence-box' },
        el('div', { className: 'cp-evidence-head' },
          el('span', { className: 'cp-legend' }, cpObj.evidenceQuestion ? cpObj.evidenceQuestion.prompt : '핀한 근거 줄'),
          el('span', { className: 'cp-sel-badge' },
            cpObj.evidenceQuestion?.maxSelections
              ? `${sel.length} / ${cpObj.evidenceQuestion.maxSelections}줄`
              : `${sel.length}줄`
          ),
        ),
        sel.length > 0
          ? el('ul', { className: 'selected-line-list' },
              sel.map((lid) => {
                const info = lineMap.get(lid);
                return el('li', {
                  className: 'selected-chip',
                  'data-testid': `selected-line-${lid}`,
                },
                  el('span', { className: 'selected-chip-id' }, lid),
                  el('span', { className: 'selected-chip-text' }, info ? info.text : lid),
                  el('button', {
                    type: 'button',
                    className: 'selected-chip-remove',
                    'aria-label': `${lid} 핀 해제`,
                    onClick: () => onTogglePin(lid),
                  }, '×'),
                );
              }),
            )
          : el('p', { className: 'muted-text small-text' },
              boardType === 'terminal'
                ? '터미널 출력에서 증거 줄을 눌러 핀하세요.'
                : '보드의 이벤트 상세나 원본 자료 탭에서 증거 줄을 눌러 핀하세요.'
            ),
        pinNoticeRef,
      );

      // CP2 replyQuestion radios
      let replyQuestionEl = null;
      if (cpObj.replyQuestion) {
        const rq = cpObj.replyQuestion;
        replyQuestionEl = el('fieldset', { className: 'cp-fieldset' },
          el('legend', { className: 'cp-legend' }, rq.prompt),
          el('div', { className: 'cp-radio-list' },
            (rq.options || []).map((opt) => el('label', { className: 'cp-radio-label' },
              el('input', {
                type: 'radio',
                name: 'cp2-final-reply',
                value: opt.id,
                checked: att.cp2Choices.reply === opt.id,
                'data-testid': `final-reply-${opt.id}`,
                onChange: () => {
                  const cur = getAttempt();
                  cur.cp2Choices.reply = opt.id;
                  persist();
                  syncNotesDynamic();
                },
              }),
              el('span', null, opt.text),
            )),
          ),
        );
      }

      // Rationale input
      charCountRef = el('span', { className: 'char-count' }, '');
      const rationaleInput = el('textarea', {
        id: 'rationale-input',
        className: 'rationale-textarea',
        'data-testid': 'rationale-input',
        maxlength: '200',
        rows: '3',
        placeholder: '증거를 바탕으로 10자 이상 적어 주세요.',
        value: draftVal,
        onInput: (e) => {
          const cur = getAttempt();
          cur.drafts[cpObj.id] = e.target.value;
          persist();
          syncNotesDynamic();
        },
      });

      const rationaleField = el('div', { className: 'cp-field' },
        el('label', { for: 'rationale-input', className: 'cp-legend' }, cpObj.rationalePrompt),
        rationaleInput,
        el('div', { className: 'cp-field-foot' }, charCountRef),
      );

      submitHintRef = el('p', { className: 'submit-hint' }, '');
      submitBtnRef = el('button', {
        type: 'button',
        className: 'btn btn-quest-primary cp-submit-btn',
        'data-testid': 'cp-submit',
        onClick: () => {
          const cur = getAttempt();
          const submission = {
            selected: [...(cur.selections[cpObj.id] || [])],
            rationale: cur.drafts[cpObj.id] || '',
            state: cur.cp2Choices.state,
            reply: cur.cp2Choices.reply,
          };
          const res = gradeCheckpoint(cpObj, submission);
          cur.submissions[cpObj.id].push({
            at: new Date().toISOString(),
            ...submission,
            pass: res.pass,
          });
          cur.lastResult[cpObj.id] = res;
          pinNoticeMessage = '';

          if (res.pass && cpObj.id === 'cp2') {
            const finalFirstTryPass = cur.submissions.cp2.length === 1;
            const outcome = computeOutcome({ finalFirstTryPass, hintLevel: cur.hintLevel });
            const finishedAt = new Date().toISOString();
            cur.outcome = outcome;
            cur.finishedAt = finishedAt;
            cur.step = 'result';
            state.history.push({
              incidentId: incident.id,
              outcome,
              finishedAt,
              hintLevel: cur.hintLevel,
              initialHypothesis: cur.initialHypothesis,
              finalRationale: submission.rationale.trim(),
            });
            persist();
            navigate(`#/incident/${encodeURIComponent(incident.id)}/result`);
            return;
          }

          persist();
          renderNotes();
        },
      }, cpObj.id === 'cp1' ? '체크포인트 1 제출' : '최종 판단 제출');

      // Feedback area
      let resultBox = null;
      if (lastRes) {
        const suggestTopicObj = lastRes.suggestTopic ? topicMap.get(lastRes.suggestTopic) : null;
        resultBox = el('div', {
          className: `cp-result is-${lastRes.pass ? 'pass' : 'fail'}`,
          'data-testid': 'cp-result',
          'data-result': lastRes.pass ? 'pass' : 'fail',
          role: 'status',
          'aria-live': 'polite',
        },
          el('strong', { className: 'cp-result-badge' }, lastRes.pass ? '통과했습니다' : '다시 확인해 보세요'),
          el('div', { className: 'cp-feedback', 'data-testid': 'cp-feedback' },
            lastRes.pass
              ? el('p', null, cpObj.passFeedback)
              : el('ul', { className: 'cp-feedback-list' },
                  (lastRes.feedback || []).map((msg) => el('li', null, msg)),
                ),
          ),
          !lastRes.pass && lastRes.suggestTopic
            ? el('a', {
                href: `#/learn/topic/${encodeURIComponent(lastRes.suggestTopic)}?from=${encodeURIComponent(incident.id)}`,
                className: 'concept-suggest-link',
                'data-testid': `concept-suggest-${lastRes.suggestTopic}`,
              }, `개념 보기: ${suggestTopicObj ? suggestTopicObj.title : lastRes.suggestTopic} →`)
            : null,
          lastRes.pass && cpObj.id === 'cp1'
            ? el('button', {
                type: 'button',
                className: 'btn btn-quest-primary cp-continue-btn',
                'data-testid': 'cp-continue',
                onClick: () => {
                  const cur = getAttempt();
                  cur.checkpoint = 'cp2';
                  pinNoticeMessage = '';
                  persist();
                  activeBoardHandle?.update(getAttempt());
                  renderNotes();
                },
              }, '최종 판단으로 이동 →')
            : null,
        );
      }

      const cpSection = el('section', {
        className: 'checkpoint-panel',
        'data-testid': 'checkpoint-panel',
        'data-checkpoint': cpObj.id,
      },
        el('div', { className: 'cp-header' },
          el('span', { className: 'cp-step-tag' }, cpObj.id === 'cp1' ? '체크포인트 1 / 2' : '체크포인트 2 / 2'),
          el('h2', { className: 'cp-title' }, cpObj.title),
        ),
        el('p', { className: 'cp-prompt' }, cpObj.prompt),
        stateQuestionEl,
        evidenceSection,
        replyQuestionEl,
        rationaleField,
        submitHintRef,
        submitBtnRef,
        resultBox,
      );

      // Hints area
      const hints = incident.hints || [];
      const revealedHints = hints.slice(0, att.hintLevel);
      const allHintsRevealed = att.hintLevel >= hints.length;

      const hintSection = el('section', { className: 'hints-section', 'aria-label': '힌트' },
        el('div', { className: 'hints-head' },
          el('h3', { className: 'sub-heading' }, '힌트'),
          el('button', {
            type: 'button',
            className: 'btn btn-quest-secondary btn-sm',
            'data-testid': 'hint-button',
            disabled: allHintsRevealed,
            onClick: () => {
              const cur = getAttempt();
              if (cur.hintLevel < hints.length) {
                cur.hintLevel += 1;
                persist();
                renderNotes();
              }
            },
          }, allHintsRevealed ? '힌트 모두 확인함' : `힌트 보기 (${att.hintLevel}/${hints.length})`),
        ),
        el('p', { className: 'hint-note', 'data-testid': 'hint-note' }, "힌트를 보면 '도움받아 해결'로 기록됩니다."),
        revealedHints.length > 0
          ? el('ol', { className: 'hint-list' },
              revealedHints.map((h) => el('li', {
                className: 'hint-item',
                'data-testid': `hint-level-${h.level}`,
              },
                el('span', { className: 'hint-kind' }, `단계 ${h.level} · ${h.kind}`),
                el('p', null, h.text),
              )),
            )
          : null,
      );

      notesPanel.append(hypReminder, cpSection, hintSection);
      syncNotesDynamic();
    }

    renderNotes();
  }

  function renderResult(wrapper) {
    const attempt = state.attempts[incident.id] || null;
    const lastHist = [...state.history].reverse().find((h) => h.incidentId === incident.id);
    const outcome = attempt?.outcome || lastHist?.outcome || 'assisted';
    const cp2 = (incident.checkpoints || []).find((c) => c.id === 'cp2');
    const initHypId = attempt?.initialHypothesis || lastHist?.initialHypothesis;
    const initHyp = hypMap.get(initHypId);
    const answerHyp = hypMap.get(cp2?.stateQuestion?.answer);
    const myRationale = (attempt?.submissions?.cp2?.slice(-1)[0]?.rationale || attempt?.drafts?.cp2 || lastHist?.finalRationale || '').trim();
    const cp2Notes = attempt?.lastResult?.cp2?.notes || [];
    const resolution = incident.resolution || {};

    // Panel 1: Outcome + hypothesis compare
    const panel1 = el('section', { className: 'incident-panel result-panel-outcome', 'data-panel': '' },
      el('div', {
        className: `result-outcome-banner is-${outcome}`,
        'data-testid': 'result-outcome',
        'data-outcome': outcome,
      },
        el('span', { className: 'result-outcome-kicker' }, '사건 판정 완료'),
        el('h2', { className: 'result-outcome-title' }, outcome === 'independent' ? '독립 해결' : '도움받아 해결'),
        el('p', { className: 'result-outcome-sub' },
          outcome === 'independent'
            ? '힌트 없이 첫 최종 판단에서 정확한 결론에 도달했습니다.'
            : '힌트 또는 재시도를 거쳐 정확한 결론에 도달했습니다.'
        ),
      ),
      el('div', { className: 'hypothesis-compare', 'data-testid': 'result-hypothesis-compare' },
        el('div', { className: 'compare-card' },
          el('span', { className: 'compare-label' }, '조사 전 첫 가설'),
          el('p', { className: 'compare-val' }, initHyp ? `${initHyp.id}. ${initHyp.text}` : '기록 없음'),
        ),
        el('div', { className: 'compare-card is-confirmed' },
          el('span', { className: 'compare-label' }, '증거로 확인된 실제 상태'),
          el('p', { className: 'compare-val' }, answerHyp ? `${answerHyp.id}. ${answerHyp.text}` : ''),
        ),
      ),
    );

    // Panel 2: Pass feedback + notes + model vs my rationale
    const panel2 = el('section', { className: 'incident-panel result-panel-rationale', 'data-panel': '' },
      el('h2', { className: 'panel-heading' }, '사건 정리와 근거 비교'),
      cp2?.passFeedback ? el('p', { className: 'result-pass-feedback' }, cp2.passFeedback) : null,
      cp2Notes.length > 0
        ? el('ul', { className: 'result-notes-list' },
            cp2Notes.map((n) => el('li', null, n)),
          )
        : null,
      el('div', { className: 'rationale-compare-grid' },
        el('div', { className: 'rationale-box', 'data-testid': 'my-rationale' },
          el('h3', { className: 'sub-heading' }, '내가 적은 근거'),
          el('p', null, myRationale || '작성된 근거가 없습니다.'),
        ),
        el('div', { className: 'rationale-box is-model', 'data-testid': 'model-rationale' },
          el('h3', { className: 'sub-heading' }, '모범 근거'),
          el('p', null, resolution.modelRationale || ''),
        ),
      ),
    );

    // Panel 3: Self check
    const panel3 = el('section', { className: 'incident-panel result-panel-selfcheck', 'data-panel': '' },
      el('h2', { className: 'panel-heading' }, '서술 근거 자기 점검'),
      el('p', { className: 'muted-text' }, '내가 적은 근거에 아래 핵심 요소가 들어갔는지 스스로 확인해 보세요.'),
      el('div', { className: 'selfcheck-list' },
        (resolution.selfCheck || []).map((sc) => el('label', { className: 'selfcheck-item' },
          el('input', {
            type: 'checkbox',
            checked: Boolean(attempt?.selfCheck?.[sc.id]),
            'data-testid': `selfcheck-${sc.id}`,
            onChange: (e) => {
              if (!state.attempts[incident.id]) {
                state.attempts[incident.id] = createAttempt(firstEventId);
                state.attempts[incident.id].step = 'result';
                if (lastHist) {
                  state.attempts[incident.id].outcome = lastHist.outcome;
                  state.attempts[incident.id].initialHypothesis = lastHist.initialHypothesis;
                }
              }
              state.attempts[incident.id].selfCheck[sc.id] = e.target.checked;
              persist();
            },
          }),
          el('span', null, sc.text),
        )),
      ),
    );

    // Panel 4: Remedies + next incident + navigation actions
    const panel4 = el('section', { className: 'incident-panel result-panel-next', 'data-panel': '' },
      el('h2', { className: 'panel-heading' }, '재발 방지 대책 비교'),
      el('div', { className: 'table-wrap' },
        el('table', { className: 'remedies-table', 'data-testid': 'remedies-table' },
          el('thead', null,
            el('tr', null,
              el('th', { scope: 'col' }, '조치'),
              el('th', { scope: 'col' }, '효과'),
              el('th', { scope: 'col' }, '고려할 점 / 부작용'),
            ),
          ),
          el('tbody', null,
            (resolution.remedies || []).map((r) => el('tr', null,
              el('td', null, el('strong', null, r.action)),
              el('td', null, r.effect),
              el('td', null, r.sideEffect),
            )),
          ),
        ),
      ),
      // References / provenance
      (() => {
        const refs = Array.isArray(incident.references) ? incident.references : [];
        return el('div', { className: 'result-references', 'data-testid': 'result-references' },
          refs.length > 0
            ? [
                el('h3', { className: 'sub-heading' }, '참고한 공개 사례'),
                el('ul', { className: 'result-ref-list' },
                  refs.map((ref) => el('li', null,
                    el('a', {
                      href: ref.url,
                      target: '_blank',
                      rel: 'noopener',
                      className: 'result-ref-link',
                    }, ref.publisher ? `${ref.title} (${ref.publisher})` : ref.title),
                  )),
                ),
                el('p', { className: 'result-ref-note' }, '이 사건은 공개 사례를 바탕으로 회사·수치·시스템을 바꾼 가상 사건입니다.'),
              ]
            : [
                el('h3', { className: 'sub-heading' }, '사건 출처'),
                el('p', { className: 'result-ref-note' }, incident.referenceNote || '이 사건은 공개 사례를 바탕으로 회사·수치·시스템을 바꾼 가상 사건입니다.'),
              ],
        );
      })(),
      incident.next
        ? el('div', { className: 'next-incident-card', 'data-testid': 'next-incident' },
            el('div', { className: 'next-incident-head' },
              el('span', { className: 'next-kicker' }, '다음 사건 예고'),
              el('span', { className: 'prep-pill' }, '준비 중'),
            ),
            el('h3', { className: 'next-incident-title' }, incident.next.title),
            el('p', { className: 'next-incident-teaser' }, incident.next.teaser),
          )
        : null,
      el('div', { className: 'result-footer-actions' },
        el('button', {
          type: 'button',
          className: 'btn btn-quest-primary',
          'data-testid': 'go-home',
          onClick: () => navigate('#/'),
        }, '퀘스트 홈으로'),
        el('button', {
          type: 'button',
          className: 'btn btn-quest-secondary',
          'data-testid': 'replay',
          onClick: () => {
            state.attempts[incident.id] = createAttempt(firstEventId);
            persist();
            navigate(`#/incident/${encodeURIComponent(incident.id)}`);
          },
        }, '이 사건 다시 풀기'),
      ),
    );

    const view = el('div', { className: 'result-view', 'data-testid': 'result-view' },
      panel1,
      panel2,
      panel3,
      panel4,
    );
    wrapper.appendChild(view);
  }

  function render() {
    cleanupBoard();
    closeTermPopover();
    clear(container);

    const isResultRoute = route.name === 'incident-result';
    if (!isResultRoute && !state.attempts[incident.id]) {
      state.attempts[incident.id] = createAttempt(firstEventId);
      persist();
    }
    const attempt = state.attempts[incident.id];
    const currentStep = isResultRoute ? 'result' : attempt.step;

    const wrapper = el('div', { className: 'incident-shell' }, renderTopBar(currentStep));
    container.appendChild(wrapper);

    if (currentStep === 'result') {
      renderResult(wrapper);
    } else if (currentStep === 'briefing') {
      renderBriefing(wrapper);
    } else if (currentStep === 'hypothesis') {
      renderHypothesis(wrapper);
    } else {
      renderInvestigate(wrapper);
    }
  }

  render();

  return {
    destroy() {
      cleanupBoard();
      closeTermPopover();
    },
  };
}
