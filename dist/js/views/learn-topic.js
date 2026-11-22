/**
 * Learn Topic detail view (#/learn/topic/:topicId[?from=:incidentId]).
 * Vercel Marketplace detail page layout: main content column (<=720px) + right metadata sidebar.
 */
import { loadTopic, loadAllTopics, loadAllAvailableIncidents } from '../content.js';
import { loadState, toggleTopicDone, isTopicDone } from '../store.js';
import { navigate } from '../router.js';
import { el, clear } from '../ui/dom.js';

export async function renderLearnTopic(container, { catalog, route }) {
  const topicId = route.params.topicId;
  const fromIncidentId = route.query?.from || null;

  const [topic, allTopics, incidentsById] = await Promise.all([
    loadTopic(topicId),
    loadAllTopics(),
    loadAllAvailableIncidents(),
  ]);

  if (!topic) {
    clear(container);
    container.appendChild(
      el('div', { className: 'error-shell' },
        el('h1', null, '주제를 찾을 수 없습니다'),
        el('a', { href: '#/learn', className: 'btn btn-learn-primary' }, '학습 홈으로'),
      )
    );
    return { destroy() {} };
  }

  const domainInfo = (catalog.domains || []).find((d) => d.id === topic.domain) || { id: topic.domain, label: topic.domain };
  const topicMap = new Map(allTopics.map((t) => [t.id, t]));
  const sameDomainTopics = allTopics
    .filter((t) => t.domain === topic.domain)
    .sort((a, b) => a.order - b.order);
  const myIndex = sameDomainTopics.findIndex((t) => t.id === topic.id);
  const prevTopic = myIndex > 0 ? sameDomainTopics[myIndex - 1] : null;
  const nextTopic = myIndex >= 0 && myIndex < sameDomainTopics.length - 1 ? sameDomainTopics[myIndex + 1] : null;

  let state = loadState();
  let activeStepIdx = 0;
  const checkSelections = {};

  function render() {
    clear(container);
    const done = isTopicDone(state, topic.id);

    // Top breadcrumb / return links
    const topNav = el('div', { className: 'topic-topnav' },
      fromIncidentId
        ? el('a', {
            href: `#/incident/${encodeURIComponent(fromIncidentId)}`,
            className: 'topic-return-pill',
            'data-testid': 'topic-return-incident',
          }, '← 사건으로 돌아가기')
        : null,
      el('a', {
        href: `#/learn/${encodeURIComponent(topic.domain)}`,
        className: 'topic-back-link',
        'data-testid': 'topic-back',
      }, `← ${domainInfo.label}`),
    );

    // Hero header
    const hero = el('header', { className: 'topic-hero' },
      el('h1', { className: 'topic-title' }, topic.title),
      el('div', { className: 'topic-hero-bar' },
        el('code', { className: 'topic-cmd-chip' }, topic.keyword),
      ),
      el('p', { className: 'topic-summary' }, topic.summary),
    );

    // Interactive flow diagram section
    const steps = topic.flow?.steps || [];
    const flowContainer = el('section', { className: 'topic-section', 'data-testid': 'topic-flow' });

    function renderFlowSection() {
      clear(flowContainer);
      const currentStep = steps[activeStepIdx] || steps[0];

      const stepNodes = el('div', { className: 'diagram-steps', role: 'list' },
        steps.map((step, idx) => {
          const isActive = idx === activeStepIdx;
          return el('div', { className: 'diagram-step-wrap', role: 'listitem' },
            el('button', {
              type: 'button',
              className: `diagram-step-node${isActive ? ' is-active' : ''}`,
              'data-testid': `diagram-step-${idx + 1}`,
              'data-active': String(isActive),
              'aria-current': isActive ? 'step' : null,
              onClick: () => {
                activeStepIdx = idx;
                renderFlowSection();
              },
            },
              el('span', { className: 'diagram-step-num' }, String(idx + 1)),
              el('span', { className: 'diagram-step-label' }, step.label),
            ),
            idx < steps.length - 1 ? el('span', { className: 'diagram-connector', 'aria-hidden': 'true' }, '→') : null,
          );
        }),
      );

      const detailCard = currentStep
        ? el('div', { className: 'diagram-detail-box', role: 'status', 'aria-live': 'polite' },
            el('div', { className: 'diagram-detail-head' },
              el('span', { className: 'diagram-detail-badge' }, `${activeStepIdx + 1} / ${steps.length}`),
              el('strong', null, currentStep.label),
            ),
            el('p', { className: 'diagram-detail-text' }, currentStep.detail),
          )
        : null;

      const controls = el('div', { className: 'diagram-controls' },
        el('button', {
          type: 'button',
          className: 'btn btn-learn-secondary btn-sm',
          'data-testid': 'diagram-prev',
          disabled: activeStepIdx <= 0,
          onClick: () => {
            if (activeStepIdx > 0) {
              activeStepIdx -= 1;
              renderFlowSection();
            }
          },
        }, '← 이전 단계'),
        el('button', {
          type: 'button',
          className: 'btn btn-learn-secondary btn-sm',
          'data-testid': 'diagram-next',
          disabled: activeStepIdx >= steps.length - 1,
          onClick: () => {
            if (activeStepIdx < steps.length - 1) {
              activeStepIdx += 1;
              renderFlowSection();
            }
          },
        }, '다음 단계 →'),
      );

      flowContainer.append(
        el('h2', { className: 'topic-section-title' }, topic.flow?.title || '동작 흐름'),
        stepNodes,
        detailCard,
        controls,
      );
    }
    renderFlowSection();

    // Checks section
    const checksContainer = el('section', { className: 'topic-section', 'data-testid': 'topic-checks' });

    function renderChecksSection() {
      clear(checksContainer);
      checksContainer.appendChild(el('h2', { className: 'topic-section-title' }, '이해 확인'));

      for (const q of topic.checks || []) {
        const chosen = checkSelections[q.id];
        const isCorrect = chosen !== undefined && chosen === q.answer;
        const qBox = el('div', { className: 'check-question-box' },
          el('p', { className: 'check-prompt' }, q.prompt),
          el('div', { className: 'check-options' },
            (q.options || []).map((opt) => el('button', {
              type: 'button',
              className: `check-opt-btn${chosen === opt.id ? ' is-selected' : ''}`,
              'data-testid': `check-${q.id}-${opt.id}`,
              'aria-pressed': String(chosen === opt.id),
              onClick: () => {
                checkSelections[q.id] = opt.id;
                renderChecksSection();
              },
            },
              el('span', { className: 'check-opt-code' }, opt.id.toUpperCase()),
              el('span', null, opt.text),
            )),
          ),
          chosen !== undefined
            ? el('div', {
                className: `check-result is-${isCorrect ? 'correct' : 'incorrect'}`,
                'data-testid': `check-result-${q.id}`,
                'data-result': isCorrect ? 'correct' : 'incorrect',
                role: 'status',
                'aria-live': 'polite',
              },
                el('strong', null, isCorrect ? '정답입니다. ' : '다시 생각해 보세요. '),
                el('span', null, q.explanation),
              )
            : null,
        );
        checksContainer.appendChild(qBox);
      }
    }
    renderChecksSection();

    // Main column (max-width 720px)
    const mainColumn = el('article', { className: 'topic-main' },
      el('section', { className: 'topic-definition', 'data-testid': 'topic-definition' },
        el('span', { className: 'topic-def-kicker' }, '핵심 정의'),
        el('p', { className: 'topic-def-text' }, topic.definition),
      ),
      el('section', { className: 'topic-section', 'data-testid': 'topic-why' },
        el('h2', { className: 'topic-section-title' }, '왜 알아야 하는가'),
        el('ul', { className: 'topic-why-list' },
          (topic.why || []).map((item) => el('li', null, item)),
        ),
      ),
      flowContainer,
      el('section', { className: 'topic-section', 'data-testid': 'topic-misconceptions' },
        el('h2', { className: 'topic-section-title' }, '흔한 오해와 바로잡기'),
        el('div', { className: 'misconception-list' },
          (topic.misconceptions || []).map((m) => el('div', { className: 'misconception-row' },
            el('div', { className: 'misconception-col is-wrong' },
              el('span', { className: 'misconception-tag' }, '오해'),
              el('p', null, m.wrong),
            ),
            el('div', { className: 'misconception-col is-right' },
              el('span', { className: 'misconception-tag' }, '바로잡기'),
              el('p', null, m.right),
            ),
          )),
        ),
      ),
      el('section', { className: 'topic-section', 'data-testid': 'topic-practice' },
        el('h2', { className: 'topic-section-title' }, '실무에서 보기'),
        ...(topic.inPractice || []).map((item) => el('figure', { className: 'practice-block' },
          el('figcaption', { className: 'practice-caption' }, item.caption),
          el('pre', { className: 'practice-code' }, el('code', null, item.code)),
        )),
      ),
      checksContainer,
      el('section', { className: 'topic-section', 'data-testid': 'topic-related' },
        el('h2', { className: 'topic-section-title' }, '관련 사건 및 참고 자료'),
        (topic.relatedIncidents || []).length > 0
          ? el('div', { className: 'related-incidents-wrap' },
              el('h3', { className: 'topic-subhead' }, '이 개념이 쓰이는 사건'),
              el('div', { className: 'related-links-row' },
                topic.relatedIncidents.map((incId) => {
                  const inc = incidentsById[incId];
                  return el('a', {
                    href: `#/incident/${encodeURIComponent(incId)}`,
                    className: 'related-incident-chip',
                    'data-testid': `related-incident-${incId}`,
                  }, inc ? `${inc.title} →` : `${incId} →`);
                }),
              ),
            )
          : null,
        (topic.sources || []).length > 0
          ? el('div', { className: 'sources-refs-wrap' },
              el('h3', { className: 'topic-subhead' }, '출처'),
              el('ul', { className: 'sources-ref-list' },
                topic.sources.map((src) => el('li', null,
                  el('a', {
                    href: src.url,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    className: 'source-ref-link',
                  }, src.title),
                )),
              ),
            )
          : null,
      ),
    );

    // Right metadata sidebar (renders above main on mobile via CSS)
    const completeBtn = el('button', {
      type: 'button',
      className: `btn ${done ? 'btn-learn-done' : 'btn-learn-primary'} topic-complete-btn`,
      'data-testid': 'topic-complete',
      'data-done': String(done),
      onClick: () => {
        state = toggleTopicDone(state, topic.id);
        render();
      },
    }, done ? '완료됨 ✓ (취소)' : '학습 완료로 표시');

    const prereqContent = (topic.prerequisites || []).length > 0
      ? el('ul', { className: 'meta-link-list' },
          topic.prerequisites.map((pid) => {
            const pt = topicMap.get(pid);
            return el('li', null,
              el('a', { href: `#/learn/topic/${encodeURIComponent(pid)}`, className: 'meta-link' }, pt ? pt.title : pid),
            );
          }),
        )
      : el('span', { className: 'muted-text' }, '없음');

    const relatedMetaContent = (topic.relatedIncidents || []).length > 0
      ? el('ul', { className: 'meta-link-list' },
          topic.relatedIncidents.map((incId) => {
            const inc = incidentsById[incId];
            return el('li', null,
              el('a', { href: `#/incident/${encodeURIComponent(incId)}`, className: 'meta-link' }, inc ? inc.title : incId),
            );
          }),
        )
      : el('span', { className: 'muted-text' }, '없음');

    const metaSidebar = el('aside', { className: 'topic-meta', 'data-testid': 'topic-meta', 'aria-label': '주제 메타 정보' },
      completeBtn,
      el('dl', { className: 'topic-meta-list' },
        el('div', { className: 'topic-meta-row' },
          el('dt', null, '분야'),
          el('dd', null, el('span', { className: 'meta-tag' }, domainInfo.label)),
        ),
        el('div', { className: 'topic-meta-row' },
          el('dt', null, '예상 시간'),
          el('dd', null, `${topic.minutes}분`),
        ),
        el('div', { className: 'topic-meta-row' },
          el('dt', null, '선행 주제'),
          el('dd', null, prereqContent),
        ),
        el('div', { className: 'topic-meta-row' },
          el('dt', null, '관련 사건'),
          el('dd', null, relatedMetaContent),
        ),
      ),
    );

    // Bottom prev/next buttons
    const bottomNav = el('nav', { className: 'topic-pager', 'aria-label': '이전 및 다음 주제' },
      el('button', {
        type: 'button',
        className: 'btn btn-learn-secondary topic-pager-btn',
        'data-testid': 'topic-prev',
        disabled: !prevTopic,
        onClick: () => {
          if (prevTopic) navigate(`#/learn/topic/${encodeURIComponent(prevTopic.id)}`);
        },
      }, prevTopic ? `← ${prevTopic.title}` : '← 이전 주제 없음'),
      el('button', {
        type: 'button',
        className: 'btn btn-learn-secondary topic-pager-btn',
        'data-testid': 'topic-next',
        disabled: !nextTopic,
        onClick: () => {
          if (nextTopic) navigate(`#/learn/topic/${encodeURIComponent(nextTopic.id)}`);
        },
      }, nextTopic ? `${nextTopic.title} →` : '다음 주제 없음 →'),
    );

    const view = el('div', { className: 'topic-view', 'data-testid': 'topic-view' },
      topNav,
      hero,
      el('div', { className: 'topic-layout' }, mainColumn, metaSidebar),
      bottomNav,
    );

    container.appendChild(view);
  }

  render();
  return { destroy() {} };
}
