/**
 * Learn Category view (#/learn/:domain): sidebar categories, ordered topic cards, review flip-card deck.
 */
import { loadAllTopics } from '../content.js';
import { loadState, isTopicDone } from '../store.js';
import { el, clear, domainIconSvg, checkIconSvg } from '../ui/dom.js';
import { createFlipCard } from '../ui/flip-card.js';

export async function renderLearnCategory(container, { catalog, route }) {
  const topics = await loadAllTopics();
  const state = loadState();
  const domains = catalog.domains || [];
  const activeDomain = domains.find((d) => d.id === route.params.domain) || domains[0];

  clear(container);

  const topicsByDomain = new Map();
  for (const d of domains) topicsByDomain.set(d.id, []);
  for (const t of topics) {
    if (!topicsByDomain.has(t.domain)) topicsByDomain.set(t.domain, []);
    topicsByDomain.get(t.domain).push(t);
  }
  for (const list of topicsByDomain.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  const sidebar = el('aside', { className: 'learn-sidebar', 'aria-label': '카테고리 목록' },
    el('h2', { className: 'learn-sidebar-title' }, '카테고리'),
    el('nav', { className: 'learn-sidebar-nav' },
      domains.map((d) => {
        const list = topicsByDomain.get(d.id) || [];
        const doneCount = list.filter((t) => isTopicDone(state, t.id)).length;
        const isCurrent = d.id === activeDomain.id;
        return el('a', {
          href: `#/learn/${encodeURIComponent(d.id)}`,
          className: `side-cat-link${isCurrent ? ' is-active' : ''}`,
          'data-testid': `side-category-${d.id}`,
          'aria-current': isCurrent ? 'page' : null,
        },
          el('span', { className: 'side-cat-left' },
            domainIconSvg(d.id, 16),
            el('span', null, d.label),
          ),
          el('span', { className: 'side-cat-count' }, list.length === 0 ? '준비 중' : `${doneCount}/${list.length}`),
        );
      }),
    ),
  );

  const domainTopics = topicsByDomain.get(activeDomain.id) || [];

  let bodyContent;
  if (domainTopics.length === 0) {
    bodyContent = el('div', { className: 'category-empty', 'data-testid': 'category-empty' },
      el('p', { className: 'category-empty-title' }, '아직 준비 중입니다'),
      el('p', { className: 'category-empty-desc' }, `${activeDomain.label} 분야의 개념 페이지는 순차적으로 추가됩니다.`),
    );
  } else {
    const cardsGrid = el('div', { className: 'topic-card-grid' },
      domainTopics.map((topic) => {
        const done = isTopicDone(state, topic.id);
        const orderStr = String(topic.order).padStart(2, '0');
        return el('a', {
          href: `#/learn/topic/${encodeURIComponent(topic.id)}`,
          className: `topic-card${done ? ' is-done' : ''}`,
          'data-testid': `topic-card-${topic.id}`,
          'data-done': String(done),
        },
          el('div', { className: 'topic-card-top' },
            el('span', { className: 'topic-order-num' }, orderStr),
            el('div', { className: 'topic-card-badges' },
              el('span', { className: 'topic-min-chip' }, `${topic.minutes}분`),
              done
                ? el('span', { className: 'topic-done-badge' }, checkIconSvg(14), '완료')
                : null,
            ),
          ),
          el('h2', { className: 'topic-card-title' }, topic.title),
          el('p', { className: 'topic-card-summary' }, topic.summary),
          el('div', { className: 'topic-card-foot' },
            el('code', { className: 'topic-keyword-chip' }, topic.keyword),
          ),
        );
      }),
    );

    const allTerms = [];
    for (const t of domainTopics) {
      for (const termObj of t.terms || []) {
        allTerms.push(termObj);
      }
    }

    const reviewDeck = allTerms.length > 0
      ? el('section', { className: 'review-deck', 'data-testid': 'review-deck' },
          el('div', { className: 'review-deck-head' },
            el('h2', { className: 'learn-section-title' }, '복습 덱'),
            el('p', { className: 'muted-text' }, `${activeDomain.label} 핵심 용어 ${allTerms.length}개 · 카드를 눌러 뜻을 확인하세요.`),
          ),
          el('div', { className: 'review-deck-grid' },
            allTerms.map((item, idx) => createFlipCard({
              index: idx + 1,
              term: item.term,
              definition: item.definition,
            })),
          ),
        )
      : null;

    bodyContent = el('div', { className: 'category-topics-wrap' }, cardsGrid, reviewDeck);
  }

  const mainCol = el('div', { className: 'category-main' },
    el('header', { className: 'category-header' },
      el('div', { className: 'category-title-row' },
        el('span', { className: 'learn-cat-icon' }, domainIconSvg(activeDomain.id, 22)),
        el('h1', { className: 'learn-title' }, activeDomain.label),
      ),
      el('p', { className: 'learn-subtitle' }, activeDomain.description),
    ),
    bodyContent,
  );

  const view = el('div', { className: 'category-view', 'data-testid': 'category-view' },
    sidebar,
    mainCol,
  );

  container.appendChild(view);
  return { destroy() {} };
}
