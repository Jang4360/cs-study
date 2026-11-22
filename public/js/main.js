/**
 * Application entry point: loads catalog, renders global header shell, starts hash router.
 */
import { loadCatalog } from './content.js';
import { startRouter } from './router.js';
import { el, clear } from './ui/dom.js';
import { closeTermPopover } from './ui/term-popover.js';
import { closeSheet } from './ui/sheet.js';
import { renderQuestHome } from './views/quest-home.js';
import { renderIncidentView } from './views/incident.js';
import { renderLearnHome } from './views/learn-home.js';
import { renderLearnCategory } from './views/learn-category.js';
import { renderLearnTopic } from './views/learn-topic.js';

let currentCleanup = null;
let renderSeq = 0;

async function bootstrap() {
  const appRoot = document.getElementById('app');
  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (err) {
    clear(appRoot);
    appRoot.appendChild(
      el('main', { id: 'main-content', className: 'error-shell' },
        el('h1', null, '콘텐츠를 불러오지 못했습니다'),
        el('p', null, err.message),
      )
    );
    return;
  }

  document.title = catalog.productName || '인시던트 랩';

  const navQuest = el('a', {
    href: '#/',
    className: 'global-nav-link',
    'data-testid': 'nav-quest',
  }, '퀘스트');

  const navLearn = el('a', {
    href: '#/learn',
    className: 'global-nav-link',
    'data-testid': 'nav-learn',
  }, '학습');

  const header = el('header', { className: 'global-header' },
    el('div', { className: 'global-header-inner' },
      el('a', { href: '#/', className: 'brand-mark' },
        el('span', { className: 'brand-dot', 'aria-hidden': 'true' }),
        el('span', { className: 'brand-name' }, catalog.productName),
      ),
      el('nav', { className: 'global-nav', 'aria-label': '모드 전환' },
        navQuest,
        navLearn,
      ),
    ),
  );

  const mainEl = el('main', { id: 'main-content', className: 'app-main', tabindex: '-1' });

  clear(appRoot);
  appRoot.append(header, mainEl);

  function syncNav(mode) {
    const isQuest = mode === 'quest';
    navQuest.classList.toggle('is-active', isQuest);
    navLearn.classList.toggle('is-active', !isQuest);
    if (isQuest) {
      navQuest.setAttribute('aria-current', 'page');
      navLearn.removeAttribute('aria-current');
    } else {
      navLearn.setAttribute('aria-current', 'page');
      navQuest.removeAttribute('aria-current');
    }
  }

  startRouter(async (route) => {
    const seq = ++renderSeq;
    closeTermPopover();
    closeSheet();
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    syncNav(route.mode);
    mainEl.setAttribute('aria-busy', 'true');

    try {
      let handle = null;
      if (route.name === 'quest-home') {
        handle = await renderQuestHome(mainEl, { catalog, route });
      } else if (route.name === 'incident' || route.name === 'incident-result') {
        handle = await renderIncidentView(mainEl, { catalog, route });
      } else if (route.name === 'learn-home') {
        handle = await renderLearnHome(mainEl, { catalog, route });
      } else if (route.name === 'learn-category') {
        handle = await renderLearnCategory(mainEl, { catalog, route });
      } else if (route.name === 'learn-topic') {
        handle = await renderLearnTopic(mainEl, { catalog, route });
      } else {
        handle = await renderQuestHome(mainEl, { catalog, route });
      }

      if (seq !== renderSeq) {
        handle?.destroy?.();
        return;
      }
      currentCleanup = handle?.destroy || null;
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      if (seq !== renderSeq) return;
      clear(mainEl);
      mainEl.appendChild(
        el('div', { className: 'error-shell' },
          el('h1', null, '화면을 표시하지 못했습니다'),
          el('p', null, err?.message || '알 수 없는 오류'),
          el('a', { href: '#/', className: 'btn btn-primary' }, '홈으로 돌아가기'),
        )
      );
    } finally {
      if (seq === renderSeq) {
        mainEl.removeAttribute('aria-busy');
      }
    }
  });
}

bootstrap();
