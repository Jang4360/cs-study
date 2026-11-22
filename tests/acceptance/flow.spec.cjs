// Acceptance tests owned by Claude. NEON must not edit this file.
// v0.2 contract — see docs/spec/SPEC.md
// Run: timeout 600 npx playwright test -c tests/acceptance/playwright.config.cjs --reporter=line
const { test, expect } = require('@playwright/test');
const http = require('node:http');

const T = (page, id) => page.getByTestId(id);
const RATIONALE_CP1 = '앱 로그의 ptx와 req ID가 게이트웨이 req ID와 같아서 같은 요청이다.';
const RATIONALE_CP2 = 'DB에 GRANTED 행이 있고 커밋 로그가 있어 처리 완료다. 재전송하면 중복 지급된다.';

// event that carries each evidence line in the request-flow board
const LINE_EVENT = {
  'E1-L2': 'ev01', 'E3-L1': 'ev02', 'E3-L2': 'ev04', 'E4-L1': 'ev04', 'E3-L3': 'ev05', 'E3-L4': 'ev07',
  'E2-L2': 'ev09', 'E2-L3': 'ev11', 'E1-L3': 'ev12', 'E2-L1': 'ev13', 'E3-L5': 'ev14', 'E3-L6': 'ev15',
};

async function fresh(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/');
  await expect(T(page, 'quest-home')).toBeVisible();
}

async function startIncident(page, hypothesis = 'H2') {
  await T(page, 'stage-start-inc-001').click();
  await expect(T(page, 'briefing-view')).toBeVisible();
  await expect(T(page, 'sim-badge')).toBeVisible();
  await T(page, 'start-investigation').click();
  await T(page, `hypothesis-option-${hypothesis}`).click();
  await T(page, 'hypothesis-submit').click();
  await expect(T(page, 'board')).toHaveAttribute('data-board-type', 'request-flow');
}

async function openEvent(page, evId) {
  await T(page, 'board-tab-flow').click();
  await T(page, 'trace-filter-all').click();
  await T(page, 'flow-end').click();
  await T(page, `flow-event-${evId}`).click();
  await expect(T(page, 'flow-detail')).toHaveAttribute('data-event-id', evId);
}

async function pinLine(page, lineId) {
  await openEvent(page, LINE_EVENT[lineId]);
  const btn = T(page, 'flow-detail').getByTestId(`line-${lineId}`);
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

async function passCp1(page) {
  await pinLine(page, 'E2-L1');
  await pinLine(page, 'E3-L1');
  await T(page, 'rationale-input').fill(RATIONALE_CP1);
  await T(page, 'cp-submit').click();
  await expect(T(page, 'cp-result')).toHaveAttribute('data-result', 'pass');
  await T(page, 'cp-continue').click();
  await expect(T(page, 'checkpoint-panel')).toHaveAttribute('data-checkpoint', 'cp2');
}

async function answerCp2(page, { state = 'H3', lines = ['E4-L1'], reply = 'R2' } = {}) {
  await T(page, `final-state-${state}`).check();
  for (const l of lines) await pinLine(page, l);
  await T(page, `final-reply-${reply}`).check();
  await T(page, 'rationale-input').fill(RATIONALE_CP2);
  await T(page, 'cp-submit').click();
}

async function visiblePanels(page) {
  return page.locator('[data-panel]:visible').count();
}

test('A. quest home: current stage open, later stages locked; modes look different', async ({ page }) => {
  await fresh(page);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'quest');
  await expect(T(page, 'stage-inc-001')).toHaveAttribute('data-status', 'current');
  for (const id of ['inc-002', 'inc-005', 'inc-010']) {
    await expect(T(page, `stage-${id}`)).toHaveAttribute('data-status', 'locked');
    await expect(T(page, `stage-start-${id}`)).toHaveCount(0);
  }
  await T(page, 'stage-inc-002').click({ force: true });
  await expect(T(page, 'quest-home')).toBeVisible();
  const questBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await T(page, 'nav-learn').click();
  await expect(T(page, 'learn-home')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'learn');
  const learnBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(learnBg).not.toBe(questBg);
  await T(page, 'nav-quest').click();
  await expect(T(page, 'quest-home')).toBeVisible();
});

test('B. request-flow board: playback reveals events, trace filter, detail with lines and terms; <= 4 panels', async ({ page }) => {
  await fresh(page);
  await startIncident(page, 'H2');
  expect(await visiblePanels(page)).toBeLessThanOrEqual(4);
  for (const lane of ['client', 'gw', 'app', 'db', 'notify']) await expect(T(page, `lane-${lane}`)).toBeVisible();

  await T(page, 'flow-reset').click();
  await expect(T(page, 'flow-event-ev01')).toBeVisible();
  await expect(T(page, 'flow-event-ev15')).toHaveCount(0);
  await T(page, 'flow-step').click();
  await expect(T(page, 'flow-event-ev02')).toBeVisible();
  await expect(T(page, 'flow-detail')).toHaveAttribute('data-event-id', 'ev02');
  await expect(T(page, 'flow-clock')).toContainText('14:02:11.145');
  await T(page, 'flow-step-back').click();
  await expect(T(page, 'flow-event-ev02')).toHaveCount(0);

  await T(page, 'flow-end').click();
  await expect(T(page, 'flow-event-ev15')).toBeVisible();
  await T(page, 'trace-filter-gw-7f3a9c').click();
  await expect(T(page, 'flow-event-ev07')).toBeVisible();
  await expect(T(page, 'flow-event-ev04')).toHaveCount(0);
  await T(page, 'trace-filter-all').click();

  await T(page, 'flow-event-ev13').click();
  const detail = T(page, 'flow-detail');
  await expect(detail).toContainText('499');
  await expect(detail.getByTestId('line-E2-L1')).toHaveAttribute('aria-pressed', 'false');
  await detail.getByTestId('term-client-closed').click();
  await expect(T(page, 'term-popover')).toContainText('nginx');

  await T(page, 'board-tab-sources').click();
  await expect(T(page, 'source-E5')).toContainText('read timeout: 3초');
  await expect(T(page, 'line-E6-L3')).toBeVisible();
  expect(await visiblePanels(page)).toBeLessThanOrEqual(4);
});

test('C. independent solve end-to-end; term popovers do not count as help; competency rises', async ({ page }) => {
  await fresh(page);
  await startIncident(page, 'H2');
  await openEvent(page, 'ev04');
  await T(page, 'flow-detail').getByTestId('term-commit').click();
  await expect(T(page, 'term-popover')).toBeVisible();
  await expect(T(page, 'cp-submit')).toBeDisabled();
  await passCp1(page);
  await answerCp2(page);
  await expect(page).toHaveURL(/#\/incident\/inc-001\/result$/);
  await expect(T(page, 'result-outcome')).toHaveAttribute('data-outcome', 'independent');
  await expect(T(page, 'result-hypothesis-compare')).toContainText('도달했지만 처리에 실패했다');
  await expect(T(page, 'my-rationale')).toContainText(RATIONALE_CP2);
  await expect(T(page, 'next-incident')).toContainText('두 번 지급된 포인트');
  expect(await visiblePanels(page)).toBeLessThanOrEqual(4);
  await T(page, 'go-home').click();
  await expect(T(page, 'stage-inc-001')).toHaveAttribute('data-status', 'solved-independent');
  await expect(T(page, 'axis-network')).toHaveAttribute('data-points', '3');
  await expect(T(page, 'axis-db')).toHaveAttribute('data-points', '1');
  await expect(T(page, 'axis-os')).toHaveAttribute('data-points', '0');
});

test('D. cp1 fail suggests concept page; return keeps state; hint -> assisted', async ({ page }) => {
  await fresh(page);
  await startIncident(page, 'H2');
  await pinLine(page, 'E2-L2');
  await T(page, 'rationale-input').fill('시각이 비슷해서 같은 요청이라고 봤다.');
  await T(page, 'cp-submit').click();
  await expect(T(page, 'cp-result')).toHaveAttribute('data-result', 'fail');
  await expect(T(page, 'cp-feedback')).toContainText('PTX-20261118-0422');
  await T(page, 'concept-suggest-infra-request-id').click();
  await expect(T(page, 'topic-view')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'learn');
  await T(page, 'topic-return-incident').click();
  await expect(T(page, 'checkpoint-panel')).toHaveAttribute('data-checkpoint', 'cp1');
  await expect(T(page, 'rationale-input')).toHaveValue('시각이 비슷해서 같은 요청이라고 봤다.');
  await expect(T(page, 'selected-line-E2-L2')).toBeVisible();

  await openEvent(page, 'ev09');
  await T(page, 'flow-detail').getByTestId('line-E2-L2').click();
  await expect(T(page, 'selected-line-E2-L2')).toHaveCount(0);
  await passCp1(page);
  await expect(T(page, 'hint-note')).toContainText('도움');
  await T(page, 'hint-button').click();
  await expect(T(page, 'hint-level-1')).toBeVisible();
  await answerCp2(page);
  await expect(T(page, 'result-outcome')).toHaveAttribute('data-outcome', 'assisted');
  await T(page, 'go-home').click();
  await expect(T(page, 'stage-inc-001')).toHaveAttribute('data-status', 'solved-assisted');
  await expect(T(page, 'axis-network')).toHaveAttribute('data-points', '2');
});

test('E. cp2 wrong first -> assisted; max 2 selections; reload restores', async ({ page }) => {
  await fresh(page);
  await startIncident(page, 'H3');
  await passCp1(page);
  await answerCp2(page, { state: 'H2', lines: ['E4-L1'], reply: 'R2' });
  await expect(T(page, 'cp-result')).toHaveAttribute('data-result', 'fail');
  await pinLine(page, 'E3-L2');
  await openEvent(page, 'ev02');
  await T(page, 'flow-detail').getByTestId('line-E3-L1').click();
  await expect(T(page, 'flow-detail').getByTestId('line-E3-L1')).toHaveAttribute('aria-pressed', 'false');
  await T(page, 'final-state-H3').check();
  await T(page, 'rationale-input').fill('재시도 전 초안');
  await page.reload();
  await expect(T(page, 'checkpoint-panel')).toHaveAttribute('data-checkpoint', 'cp2');
  await expect(T(page, 'rationale-input')).toHaveValue('재시도 전 초안');
  await expect(T(page, 'selected-line-E3-L2')).toBeVisible();
  await T(page, 'final-state-H3').check();
  await T(page, 'final-reply-R2').check();
  await T(page, 'rationale-input').fill(RATIONALE_CP2);
  await T(page, 'cp-submit').click();
  await expect(T(page, 'result-outcome')).toHaveAttribute('data-outcome', 'assisted');
});

test('F. learn: category -> topic -> complete changes card color and competency', async ({ page }) => {
  await fresh(page);
  await T(page, 'nav-learn').click();
  for (const d of ['os', 'network', 'infra', 'db', 'ai']) await expect(T(page, `category-${d}`)).toBeVisible();
  await expect(T(page, 'category-progress-network')).toContainText('0/3');
  await T(page, 'category-network').click();
  await expect(T(page, 'category-view')).toBeVisible();
  const card = T(page, 'topic-card-net-timeout');
  await expect(card).toHaveAttribute('data-done', 'false');
  const bgBefore = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  await card.click();
  await expect(T(page, 'topic-view')).toBeVisible();
  for (const s of ['topic-definition', 'topic-why', 'topic-flow', 'topic-misconceptions', 'topic-practice', 'topic-checks', 'topic-meta']) {
    await expect(T(page, s)).toBeVisible();
  }
  await expect(T(page, 'diagram-step-1')).toHaveAttribute('data-active', 'true');
  await T(page, 'diagram-next').click();
  await expect(T(page, 'diagram-step-2')).toHaveAttribute('data-active', 'true');
  await T(page, 'check-q1-a').click();
  await expect(T(page, 'check-result-q1')).toHaveAttribute('data-result', 'incorrect');
  await T(page, 'check-q1-b').click();
  await expect(T(page, 'check-result-q1')).toHaveAttribute('data-result', 'correct');
  await T(page, 'topic-complete').click();
  await expect(T(page, 'topic-complete')).toHaveAttribute('data-done', 'true');
  await T(page, 'topic-back').click();
  await expect(card).toHaveAttribute('data-done', 'true');
  const bgAfter = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bgAfter).not.toBe(bgBefore);
  await T(page, 'side-category-ai').click();
  await expect(T(page, 'category-empty')).toBeVisible();
  await T(page, 'side-category-network').click();
  await expect(T(page, 'review-deck')).toBeVisible();
  const deckCard = T(page, 'review-deck').locator('[data-testid^="deck-card-"]').first();
  await deckCard.click();
  await expect(deckCard).toHaveAttribute('data-flipped', 'true');
  await T(page, 'nav-learn').click();
  await expect(T(page, 'category-progress-network')).toContainText('1/3');
  await T(page, 'nav-quest').click();
  await expect(T(page, 'axis-network')).toHaveAttribute('data-points', '1');
});

test('G. topic prev/next and un-complete', async ({ page }) => {
  await fresh(page);
  await page.goto('/#/learn/topic/net-timeout');
  await expect(T(page, 'topic-view')).toBeVisible();
  await T(page, 'topic-complete').click();
  await T(page, 'topic-complete').click();
  await expect(T(page, 'topic-complete')).toHaveAttribute('data-done', 'false');
  await T(page, 'topic-next').click();
  await expect(page).toHaveURL(/#\/learn\/topic\/net-connection-close$/);
  await T(page, 'topic-prev').click();
  await expect(page).toHaveURL(/#\/learn\/topic\/net-timeout$/);
});

test('H. reset, mobile, dark mode, accessibility', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await fresh(page);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noHScroll()).toBe(true);
  await startIncident(page, 'H2');
  await openEvent(page, 'ev04');
  expect(await noHScroll()).toBe(true);
  await expect(T(page, 'mobile-cp-bar')).toBeVisible();
  await T(page, 'flow-detail').getByTestId('line-E3-L2').click();
  await expect(T(page, 'mobile-cp-bar-count')).toHaveText('1');
  await T(page, 'mobile-cp-bar-go').click();
  await expect(T(page, 'rationale-input')).toBeFocused();
  const tags = await page.$$eval('[data-testid^="line-"], [data-testid^="flow-event-"], [data-testid^="term-"]:not([data-testid="term-popover"]):not([data-testid="term-open-topic"])', (els) => [...new Set(els.map((e) => e.tagName))]);
  expect(tags).toEqual(['BUTTON']);
  await page.goto('/#/learn/network');
  expect(await noHScroll()).toBe(true);
  await page.goto('/#/learn/topic/net-connection-close');
  expect(await noHScroll()).toBe(true);
  await page.goto('/#/');
  await T(page, 'reset-progress').click();
  await T(page, 'reset-confirm').click();
  await expect(T(page, 'stage-inc-001')).toHaveAttribute('data-status', 'current');
  await ctx.close();

  for (const route of ['/#/', '/#/learn']) {
    const bg = async (scheme) => {
      const c = await browser.newContext({ colorScheme: scheme });
      const p = await c.newPage();
      await p.goto(route);
      await p.waitForSelector('[data-testid="quest-home"], [data-testid="learn-home"]');
      const v = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await c.close();
      return v;
    };
    expect(await bg('dark')).not.toBe(await bg('light'));
  }
});

function rawGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 8791, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('I. static server: content types, 404, traversal blocked, nosniff', async () => {
  const home = await rawGet('/');
  expect(home.status).toBe(200);
  expect(home.headers['content-type']).toMatch(/text\/html/);
  expect(home.headers['x-content-type-options']).toBe('nosniff');
  const cat = await rawGet('/content/catalog.json');
  expect(cat.status).toBe(200);
  expect(cat.headers['content-type']).toMatch(/application\/json/);
  expect((await rawGet('/content/topics/net-timeout.json')).status).toBe(200);
  expect((await rawGet('/no-such-file.js')).status).toBe(404);
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/content/../../package.json', '/..%2fserver/server.mjs']) {
    const r = await rawGet(p);
    expect([400, 403, 404]).toContain(r.status);
    expect(r.body).not.toContain('"scripts"');
    expect(r.body).not.toContain('createServer');
  }
});

test('J. flow viewer readability: full labels, full contrast, detail stays in view, list layout on mobile; code blocks not clipped', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await fresh(page);
  await startIncident(page, 'H2');
  await expect(T(page, 'board')).toHaveAttribute('data-layout', 'lanes');
  await T(page, 'flow-end').click();
  await page.waitForTimeout(500); // let reveal fades finish
  const labels = page.locator('[data-testid^="flow-event-"] [data-role="event-label"]');
  expect(await labels.count()).toBe(15);
  const clipped = await labels.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  expect(clipped).toEqual([]);
  await expect(T(page, 'flow-event-ev01').locator('[data-role="event-label"]')).toHaveText('POST /v1/points/grant');
  const faded = await page.locator('[data-testid^="flow-event-"]').evaluateAll((els) => els.filter((e) => {
    for (let n = e; n && n !== document.body; n = n.parentElement) if (parseFloat(getComputedStyle(n).opacity) < 1) return true;
    return false;
  }).length);
  expect(faded).toBe(0);
  await T(page, 'flow-event-ev15').click();
  await expect(T(page, 'flow-detail')).toHaveAttribute('data-event-id', 'ev15');
  await expect(T(page, 'flow-detail')).toBeInViewport({ ratio: 0.3 });
  await T(page, 'flow-reset').click();
  for (let i = 0; i < 14; i++) await T(page, 'flow-step').click();
  await expect(T(page, 'flow-event-ev15')).toBeInViewport();
  await expect(T(page, 'flow-detail')).toBeInViewport({ ratio: 0.3 });
  await page.goto('/#/learn/topic/net-timeout');
  const preClipped = await page.locator('[data-testid="topic-practice"] pre').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto' && getComputedStyle(e).overflowX !== 'scroll').length);
  expect(preClipped).toBe(0);
  await ctx.close();

  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  await fresh(mp);
  await startIncident(mp, 'H2');
  await expect(T(mp, 'board')).toHaveAttribute('data-layout', 'list');
  await T(mp, 'flow-end').click();
  const overflow = await T(mp, 'board').evaluate((b) => b.scrollWidth > b.clientWidth + 1);
  expect(overflow).toBe(false);
  const mClipped = await mp.locator('[data-testid^="flow-event-"] [data-role="event-label"]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(mClipped).toBe(0);
  await T(mp, 'flow-event-ev13').click();
  await expect(T(mp, 'flow-detail')).toBeInViewport({ ratio: 0.3 });
  await m.close();
});

// ---------- v0.3: terminal board (inc-003) ----------
async function seedInc001Solved(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('csq:v2', JSON.stringify({ version: 2, attempts: {}, history: [{ incidentId: 'inc-001', outcome: 'independent', finishedAt: '2026-11-21T00:00:00.000Z', hintLevel: 0, initialHypothesis: 'H2', finalRationale: 'seed' }], learn: { done: {} } }));
  });
  await page.goto('/#/');
  await expect(T(page, 'quest-home')).toBeVisible();
}

async function run(page, cmd) {
  const input = T(page, 'terminal-input');
  await input.fill(cmd);
  await input.press('Enter');
}

async function pinTerm(page, lineId) {
  const btn = T(page, 'terminal-output').getByTestId(`line-${lineId}`).last();
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

test('K. terminal board: help, commands, pipes, pins, history, terms, reload, independent solve', async ({ page }) => {
  await seedInc001Solved(page);
  await expect(T(page, 'stage-inc-003')).toHaveAttribute('data-status', 'current');
  await expect(T(page, 'stage-inc-002')).toHaveAttribute('data-status', 'locked');
  await T(page, 'stage-start-inc-003').click();
  await expect(T(page, 'briefing-view')).toContainText('point-api-02');
  await T(page, 'start-investigation').click();
  await T(page, 'hypothesis-option-H2').click();
  await T(page, 'hypothesis-submit').click();
  await expect(T(page, 'board')).toHaveAttribute('data-board-type', 'terminal');
  expect(await page.locator('[data-panel]:visible').count()).toBeLessThanOrEqual(4);
  await expect(T(page, 'terminal-output')).toContainText('학습용 시뮬레이션');
  await expect(T(page, 'terminal-input')).toBeFocused();

  await run(page, 'help');
  await expect(T(page, 'terminal-output')).toContainText('jcmd 24817 VM.native_memory summary');
  await T(page, 'terminal-output').locator('[data-testid="help-cmd"][data-command="dmesg -T"]').first().click();
  await expect(T(page, 'terminal-input')).toHaveValue('dmesg -T');
  await expect(T(page, 'terminal-input')).toBeFocused();

  await run(page, 'foo');
  await expect(T(page, 'terminal-output')).toContainText('command not found');
  await run(page, "dmesg -T | grep -i 'killed process'");
  await expect(T(page, 'terminal-output').getByTestId('line-K-L5').last()).toBeVisible();
  await T(page, 'terminal-input').press('ArrowUp');
  await expect(T(page, 'terminal-input')).toHaveValue("dmesg -T | grep -i 'killed process'");
  await T(page, 'terminal-input').fill('');

  await T(page, 'board').getByTestId('term-oom-killer').click();
  await expect(T(page, 'term-popover')).toContainText('SIGKILL');
  await page.keyboard.press('Escape');

  await pinTerm(page, 'K-L5');
  await expect(T(page, 'selected-line-K-L5')).toBeVisible();
  await T(page, 'rationale-input').fill('커널 OOM Killer가 java를 SIGKILL로 종료한 기록이 있다.');
  await T(page, 'cp-submit').click();
  await expect(T(page, 'cp-result')).toHaveAttribute('data-result', 'pass');
  await T(page, 'cp-continue').click();
  await expect(T(page, 'checkpoint-panel')).toHaveAttribute('data-checkpoint', 'cp2');

  await run(page, 'jcmd 24817 VM.native_memory summary');
  await pinTerm(page, 'N-L8');
  await page.reload();
  await expect(T(page, 'board')).toHaveAttribute('data-board-type', 'terminal');
  await expect(T(page, 'terminal-output')).toContainText('Killed process 19044');
  await expect(T(page, 'terminal-output')).toContainText('Other (reserved=926981KB');
  await expect(T(page, 'selected-line-N-L8')).toBeVisible();
  await run(page, 'cat /var/log/deploy/point-api.log');
  await pinTerm(page, 'D-L3');
  await T(page, 'final-state-H3').check();
  await T(page, 'final-reply-R2').check();
  await T(page, 'rationale-input').fill('NMT Other가 905MB로 힙 밖 메모리가 크고 v2.3.1 카나리 이후 늘었다.');
  await T(page, 'cp-submit').click();
  await expect(page).toHaveURL(/#\/incident\/inc-003\/result$/);
  await expect(T(page, 'result-outcome')).toHaveAttribute('data-outcome', 'independent');
  await expect(T(page, 'result-references').locator('a[href="https://toss.tech/article/reactor-netty-memory-leak"]')).toBeVisible();
  expect(await page.locator('[data-panel]:visible').count()).toBeLessThanOrEqual(4);
  await T(page, 'go-home').click();
  await expect(T(page, 'stage-inc-003')).toHaveAttribute('data-status', 'solved-independent');
  await expect(T(page, 'axis-os')).toHaveAttribute('data-points', '3');
  await expect(T(page, 'axis-infra')).toHaveAttribute('data-points', '2');
});

test('L. terminal on mobile; inc-001 result shows self-designed note', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await seedInc001Solved(page);
  await T(page, 'stage-start-inc-003').click();
  await T(page, 'start-investigation').click();
  await T(page, 'hypothesis-option-H1').click();
  await T(page, 'hypothesis-submit').click();
  const fs = await T(page, 'terminal-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
  await run(page, 'cat /etc/systemd/system/point-api.service');
  await run(page, 'ps -o pid,rss,etime,args -p 24817');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(T(page, 'mobile-cp-bar')).toBeVisible();
  await page.goto('/#/incident/inc-001/result');
  await expect(T(page, 'result-references')).toContainText('자체 설계');
  await ctx.close();
});
