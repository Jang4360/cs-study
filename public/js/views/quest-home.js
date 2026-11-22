/**
 * Quest Home view (#/): Nod Coding inspired Bauhaus stage map + competency radar.
 */
import { loadAllAvailableIncidents, getCompetencyMeta } from '../content.js';
import { loadState, resetState, getStageStatus, getLearnDoneIds } from '../store.js';
import { computeCompetency } from '../competency.js';
import { navigate } from '../router.js';
import { el, clear, svgFromMarkup, lockIconSvg, checkIconSvg } from '../ui/dom.js';
import { renderRadar } from '../ui/radar.js';
import { openConfirmSheet } from '../ui/sheet.js';

function createBauhausHeroArt() {
  return svgFromMarkup(`
    <svg class="bauhaus-art" viewBox="0 0 360 120" aria-hidden="true">
      <line x1="0" y1="60" x2="88" y2="60" stroke="currentColor" stroke-width="2" />
      <circle cx="94" cy="60" r="5" fill="var(--q-bg)" stroke="currentColor" stroke-width="2" />
      <line x1="272" y1="60" x2="360" y2="60" stroke="currentColor" stroke-width="2" />
      <circle cx="266" cy="60" r="5" fill="var(--q-bg)" stroke="currentColor" stroke-width="2" />
      <rect x="114" y="14" width="44" height="92" rx="22" fill="var(--q-blue)" />
      <circle cx="136" cy="84" r="22" fill="var(--q-pink)" />
      <rect x="162" y="14" width="84" height="44" rx="22" fill="var(--q-orange)" />
      <circle cx="184" cy="36" r="22" fill="var(--q-yellow)" />
      <rect x="162" y="62" width="84" height="44" rx="22" fill="var(--q-mint)" />
      <circle cx="224" cy="84" r="22" fill="var(--q-ink)" />
      <circle cx="224" cy="84" r="8" fill="var(--q-pink)" />
    </svg>
  `);
}

function createCurrentNodeAccent() {
  return svgFromMarkup(`
    <svg class="stage-node-ornament" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="36" fill="var(--q-yellow)" opacity="0.45" />
      <path d="M40 4 A36 36 0 0 1 76 40 L40 40 Z" fill="var(--q-pink)" opacity="0.8" />
    </svg>
  `);
}

export async function renderQuestHome(container, { catalog }) {
  const [incidentsById, compMeta] = await Promise.all([
    loadAllAvailableIncidents(),
    getCompetencyMeta(),
  ]);

  const domainMap = new Map((catalog.domains || []).map((d) => [d.id, d]));

  function render() {
    clear(container);
    const state = loadState();
    const scores = computeCompetency(
      { learnDone: getLearnDoneIds(state), history: state.history },
      compMeta,
    );

    const hero = el('section', { className: 'quest-hero' },
      el('div', { className: 'quest-hero-copy' },
        el('p', { className: 'quest-season-kicker' }, catalog.quest?.season || '시즌 1'),
        el('h1', { className: 'quest-hero-title' }, '실제 장애를 보드 위에서 직접 추적하세요'),
        el('p', { className: 'quest-hero-sub' }, '요청 흐름과 로그 줄에서 결정적 증거를 찾아 판정하고, 부족한 개념은 학습 모드에서 바로 채웁니다.'),
      ),
      el('div', { className: 'quest-hero-art-wrap' }, createBauhausHeroArt()),
    );

    const stages = catalog.quest?.stages || [];
    const stageNodes = stages.map((stage, idx) => {
      const inc = incidentsById[stage.id];
      const status = getStageStatus(stage, state.history);
      const num = String(idx + 1).padStart(2, '0');
      const title = inc ? inc.title : (stage.title || stage.id);
      const domainId = inc ? inc.domains?.primary : stage.domain;
      const domainLabel = domainMap.get(domainId)?.label || domainId || '';
      const boardType = inc ? inc.board?.type : stage.board;
      const boardLabel = catalog.boards?.[boardType] || boardType || '';
      const isSolved = status === 'solved-independent' || status === 'solved-assisted';
      const isCurrent = status === 'current';
      const isLocked = status === 'locked';

      const attempt = state.attempts?.[stage.id];
      const hasInProgress = attempt && attempt.step !== 'briefing' && attempt.step !== 'result';

      let badgeEl;
      if (isSolved) {
        badgeEl = el('div', { className: 'stage-circle is-solved', 'aria-hidden': 'true' }, checkIconSvg(22));
      } else if (isCurrent) {
        badgeEl = el('div', { className: 'stage-circle is-current', 'aria-hidden': 'true' },
          createCurrentNodeAccent(),
          el('span', { className: 'stage-circle-num' }, num),
        );
      } else {
        badgeEl = el('div', { className: 'stage-circle is-locked', 'aria-hidden': 'true' }, lockIconSvg(18));
      }

      let actionEl = null;
      if (isCurrent) {
        actionEl = el('button', {
          type: 'button',
          className: 'btn btn-quest-primary stage-start-btn',
          'data-testid': `stage-start-${stage.id}`,
          onClick: () => navigate(`#/incident/${encodeURIComponent(stage.id)}`),
        }, hasInProgress ? '이어서' : '시작하기');
      } else if (isSolved) {
        actionEl = el('button', {
          type: 'button',
          className: 'btn btn-quest-secondary stage-start-btn',
          'data-testid': `stage-start-${stage.id}`,
          onClick: () => {
            if (attempt?.step === 'result') {
              navigate(`#/incident/${encodeURIComponent(stage.id)}/result`);
            } else {
              navigate(`#/incident/${encodeURIComponent(stage.id)}`);
            }
          },
        }, '다시 보기');
      }

      const statusText = status === 'solved-independent'
        ? '독립 해결'
        : status === 'solved-assisted'
          ? '도움받아 해결'
          : isCurrent
            ? (hasInProgress ? '진행 중' : '도전 가능')
            : '이전 사건을 해결하면 열립니다';

      return el('li', {
        className: `stage-item stage-status-${status} ${idx % 2 === 1 ? 'is-alt' : ''}`,
        'data-testid': `stage-${stage.id}`,
        'data-status': status,
      },
        el('div', { className: 'stage-node-col' },
          badgeEl,
          idx < stages.length - 1 ? el('span', { className: 'stage-connector', 'aria-hidden': 'true' }) : null,
        ),
        el('div', { className: 'stage-card' },
          el('div', { className: 'stage-card-top' },
            el('span', { className: 'stage-num-tag' }, `STAGE ${num}`),
            domainLabel ? el('span', { className: `domain-chip domain-${domainId}` }, domainLabel) : null,
            boardLabel && !isLocked ? el('span', { className: 'board-chip' }, boardLabel) : null,
            isSolved ? el('span', { className: `solved-pill is-${status}` }, statusText) : null,
          ),
          el('h2', { className: 'stage-title' }, title),
          inc && !isLocked ? el('p', { className: 'stage-summary' }, inc.summary) : null,
          isLocked ? el('p', { className: 'stage-lock-msg' }, statusText) : null,
          actionEl ? el('div', { className: 'stage-actions' }, actionEl) : null,
        ),
      );
    });

    const mapPanel = el('section', { className: 'quest-map-panel', 'data-panel': '', 'aria-label': '사건 단계 지도' },
      el('div', { className: 'section-head-row' },
        el('h2', { className: 'section-heading' }, '사건 경로'),
        el('span', { className: 'section-meta' }, `${stages.filter((s) => s.available !== false).length} / ${stages.length} 공개`),
      ),
      el('ol', { className: 'stage-path' }, stageNodes),
    );

    const radarPanel = el('aside', { className: 'quest-radar-panel', 'data-panel': '', 'aria-label': '나의 역량' },
      el('h2', { className: 'section-heading' }, '분야별 역량'),
      renderRadar({
        scores,
        domains: catalog.domains,
        maxPerDomain: catalog.competency?.maxPerDomain ?? 10,
        ruleText: catalog.competency?.rule || '',
        testId: 'competency-radar',
        includeAxisTestIds: true,
      }),
    );

    const footer = el('div', { className: 'quest-home-footer' },
      el('button', {
        type: 'button',
        className: 'btn btn-ghost-danger',
        'data-testid': 'reset-progress',
        onClick: () => {
          openConfirmSheet({
            title: '학습·사건 기록을 모두 초기화할까요?',
            description: '진행 중인 사건 시도, 해결 이력, 학습 완료 표시와 역량 점수가 모두 삭제됩니다.',
            confirmLabel: '모두 초기화',
            cancelLabel: '취소',
            confirmTestId: 'reset-confirm',
            danger: true,
            onConfirm: () => {
              resetState();
              render();
            },
          });
        },
      }, '진행 기록 초기화'),
    );

    const view = el('div', { className: 'quest-home', 'data-testid': 'quest-home' },
      hero,
      el('div', { className: 'quest-home-grid' }, mapPanel, radarPanel),
      footer,
    );

    container.appendChild(view);
  }

  render();
  return { destroy() {} };
}
