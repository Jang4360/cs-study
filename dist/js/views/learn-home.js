/**
 * Learn Home view (#/learn): Vercel Marketplace inspired clean category grid + compact radar.
 */
import { loadAllTopics, getCompetencyMeta } from '../content.js';
import { loadState, isTopicDone, getLearnDoneIds } from '../store.js';
import { computeCompetency } from '../competency.js';
import { el, clear, domainIconSvg } from '../ui/dom.js';
import { renderRadar } from '../ui/radar.js';

export async function renderLearnHome(container, { catalog }) {
  const [topics, compMeta] = await Promise.all([
    loadAllTopics(),
    getCompetencyMeta(),
  ]);

  clear(container);
  const state = loadState();
  const scores = computeCompetency(
    { learnDone: getLearnDoneIds(state), history: state.history },
    compMeta,
  );

  const topicsByDomain = new Map();
  for (const d of catalog.domains || []) {
    topicsByDomain.set(d.id, []);
  }
  for (const t of topics) {
    if (!topicsByDomain.has(t.domain)) topicsByDomain.set(t.domain, []);
    topicsByDomain.get(t.domain).push(t);
  }

  const cards = (catalog.domains || []).map((domain) => {
    const list = topicsByDomain.get(domain.id) || [];
    const total = list.length;
    const doneCount = list.filter((t) => isTopicDone(state, t.id)).length;
    const progressText = total === 0 ? '준비 중' : `${doneCount}/${total}`;

    return el('a', {
      href: `#/learn/${encodeURIComponent(domain.id)}`,
      className: `learn-cat-card${total === 0 ? ' is-upcoming' : ''}`,
      'data-testid': `category-${domain.id}`,
    },
      el('div', { className: 'learn-cat-card-top' },
        el('span', { className: 'learn-cat-icon' }, domainIconSvg(domain.id, 22)),
        el('span', {
          className: `learn-progress-pill${total > 0 && doneCount === total ? ' is-complete' : ''}`,
          'data-testid': `category-progress-${domain.id}`,
        }, progressText),
      ),
      el('h2', { className: 'learn-cat-title' }, domain.label),
      el('p', { className: 'learn-cat-desc' }, domain.description),
    );
  });

  const view = el('div', { className: 'learn-home', 'data-testid': 'learn-home' },
    el('header', { className: 'learn-header' },
      el('h1', { className: 'learn-title' }, '학습'),
      el('p', { className: 'learn-subtitle' }, '사건 없이 핵심 시스템 개념을 빠르게 정리하고 완료 표시로 역량을 쌓으세요.'),
    ),
    el('div', { className: 'learn-home-layout' },
      el('section', { className: 'learn-cat-grid', 'aria-label': '학습 카테고리' }, cards),
      el('aside', { className: 'learn-radar-box', 'aria-label': '역량 현황' },
        el('h2', { className: 'learn-side-heading' }, '분야별 역량'),
        renderRadar({
          scores,
          domains: catalog.domains,
          maxPerDomain: catalog.competency?.maxPerDomain ?? 10,
          ruleText: catalog.competency?.rule || '',
          testId: 'learn-radar',
          includeAxisTestIds: false,
          compact: true,
        }),
      ),
    ),
  );

  container.appendChild(view);
  return { destroy() {} };
}
