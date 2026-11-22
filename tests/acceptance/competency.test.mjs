// Acceptance tests owned by Claude. NEON must not edit this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCompetency } from '../../public/js/competency.js';

const rule = { learnPoints: 1, questAssisted: 2, questIndependent: 3, secondaryBonus: 1, maxPerDomain: 10 };
const meta = {
  topics: [
    { id: 'net-timeout', domain: 'network' },
    { id: 'db-commit', domain: 'db' },
    { id: 'os-process-fd', domain: 'os' },
  ],
  incidents: [{ id: 'inc-001', primary: 'network', secondary: ['db', 'infra'] }],
  rule,
};

test('empty progress -> all zero', () => {
  assert.deepEqual(computeCompetency({ learnDone: [], history: [] }, meta), { os: 0, network: 0, infra: 0, db: 0, ai: 0 });
});

test('learn completion adds 1 to its domain', () => {
  const c = computeCompetency({ learnDone: ['net-timeout', 'db-commit'], history: [] }, meta);
  assert.equal(c.network, 1);
  assert.equal(c.db, 1);
  assert.equal(c.os, 0);
});

test('best outcome per incident counts once; secondary bonus applies', () => {
  const c = computeCompetency({
    learnDone: [],
    history: [
      { incidentId: 'inc-001', outcome: 'assisted' },
      { incidentId: 'inc-001', outcome: 'independent' },
    ],
  }, meta);
  assert.equal(c.network, 3);
  assert.equal(c.db, 1);
  assert.equal(c.infra, 1);
});

test('cap at maxPerDomain; unknown ids ignored', () => {
  const many = { topics: Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, domain: 'os' })), incidents: [], rule };
  const c = computeCompetency({ learnDone: [...many.topics.map((t) => t.id), 'nope'], history: [{ incidentId: 'zzz', outcome: 'independent' }] }, many);
  assert.equal(c.os, 10);
});
