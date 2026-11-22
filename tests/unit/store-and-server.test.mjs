import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  loadState,
  saveState,
  resetState,
  createAttempt,
  getStageStatus,
  toggleTopicDone,
  isTopicDone,
  getLearnDoneIds,
  STORAGE_KEY,
} from '../../public/js/store.js';
import { resolveRequestPath, createAppServer } from '../../server/server.mjs';

test('store: uses csq:v2 and works in memory when localStorage is absent', () => {
  assert.equal(STORAGE_KEY, 'csq:v2');
  const s0 = resetState();
  assert.equal(s0.version, 2);
  assert.deepEqual(s0.history, []);
  assert.deepEqual(s0.learn, { done: {} });

  s0.history.push({ incidentId: 'inc-001', outcome: 'independent' });
  s0.attempts['inc-001'] = createAttempt('ev01');
  s0.attempts['inc-001'].board.clockIndex = 4;
  saveState(s0);

  const s1 = loadState();
  assert.equal(s1.history.length, 1);
  assert.equal(s1.attempts['inc-001'].board.clockIndex, 4);

  const s2 = toggleTopicDone(s1, 'net-timeout');
  assert.equal(isTopicDone(s2, 'net-timeout'), true);
  assert.deepEqual(getLearnDoneIds(s2), ['net-timeout']);

  const s3 = toggleTopicDone(s2, 'net-timeout');
  assert.equal(isTopicDone(s3, 'net-timeout'), false);
  assert.deepEqual(getLearnDoneIds(s3), []);

  resetState();
  assert.equal(loadState().history.length, 0);
  assert.deepEqual(getLearnDoneIds(loadState()), []);
});

test('store: getStageStatus follows solved -> requires/available -> current/locked', () => {
  const s1 = { id: 'inc-001', requires: [] };
  const s2 = { id: 'inc-002', requires: ['inc-001'], available: false };
  const s3 = { id: 'inc-003', requires: ['inc-001'] };

  assert.equal(getStageStatus(s1, []), 'current');
  assert.equal(getStageStatus(s2, []), 'locked');
  assert.equal(getStageStatus(s3, []), 'locked');

  const histAssisted = [{ incidentId: 'inc-001', outcome: 'assisted' }];
  assert.equal(getStageStatus(s1, histAssisted), 'solved-assisted');
  assert.equal(getStageStatus(s2, histAssisted), 'locked');
  assert.equal(getStageStatus(s3, histAssisted), 'current');

  const histBoth = [...histAssisted, { incidentId: 'inc-001', outcome: 'independent' }];
  assert.equal(getStageStatus(s1, histBoth), 'solved-independent');
});

test('server: resolveRequestPath blocks traversal and bad encoding', () => {
  assert.equal(resolveRequestPath('/').status, 200);
  assert.equal(resolveRequestPath('/content/catalog.json').status, 200);
  assert.equal(resolveRequestPath('/content/topics/net-timeout.json').status, 200);
  assert.equal(resolveRequestPath('/../package.json').status, 400);
  assert.equal(resolveRequestPath('/%2e%2e/package.json').status, 400);
  assert.equal(resolveRequestPath('/content/../../package.json').status, 400);
  assert.equal(resolveRequestPath('/..%2fserver/server.mjs').status, 400);
  assert.equal(resolveRequestPath('/%E0%A4%A').status, 400);
});

test('server: supports GET and HEAD, rejects POST with 405, sets HTML no-cache', async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const req = (method, urlPath) =>
    new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: urlPath, method }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      r.on('error', reject);
      r.end();
    });

  try {
    const getHome = await req('GET', '/');
    assert.equal(getHome.status, 200);
    assert.equal(getHome.headers['cache-control'], 'no-cache');
    assert.equal(getHome.headers['x-content-type-options'], 'nosniff');

    const headHome = await req('HEAD', '/');
    assert.equal(headHome.status, 200);
    assert.equal(headHome.body, '');

    const postHome = await req('POST', '/');
    assert.equal(postHome.status, 405);
    assert.equal(postHome.headers['x-content-type-options'], 'nosniff');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
