// Acceptance tests owned by Claude. NEON must not edit this file.
// Run: node --test tests/acceptance/grading.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateRule, gradeCheckpoint, computeOutcome } from '../../public/js/grading.js';

const inc = JSON.parse(readFileSync(new URL('../../content/incidents/inc-001.json', import.meta.url)));
const cp1 = inc.checkpoints.find((c) => c.id === 'cp1');
const cp2 = inc.checkpoints.find((c) => c.id === 'cp2');
const R = '같은 req ID로 두 로그를 연결했다.'; // valid rationale (>=10 chars)

test('evaluateRule: allOf / anyOf / noneOf', () => {
  assert.equal(evaluateRule({ allOf: ['a', 'b'] }, ['a', 'b', 'c']), true);
  assert.equal(evaluateRule({ allOf: ['a', 'b'] }, ['a']), false);
  assert.equal(evaluateRule({ anyOf: ['a', 'b'] }, ['b']), true);
  assert.equal(evaluateRule({ anyOf: ['a', 'b'] }, ['c']), false);
  assert.equal(evaluateRule({ noneOf: ['x'] }, ['a']), true);
  assert.equal(evaluateRule({ noneOf: ['x'] }, ['a', 'x']), false);
  assert.equal(evaluateRule({ allOf: ['a'], noneOf: ['x'] }, ['a', 'x']), false);
});

test('cp1 pass: E3-L1 + E2-L1', () => {
  const r = gradeCheckpoint(cp1, { selected: ['E3-L1', 'E2-L1'], rationale: R });
  assert.equal(r.pass, true);
  assert.equal(r.suggestTopic, null);
});

test('cp1 fail: other transaction mixed in -> concept topic suggested, pattern feedback', () => {
  const r = gradeCheckpoint(cp1, { selected: ['E2-L1', 'E2-L2', 'E3-L1'], rationale: R });
  assert.equal(r.pass, false);
  assert.equal(r.suggestTopic, 'infra-request-id');
  assert.ok(r.feedback.some((f) => f.includes('PTX-20261118-0422')));
});

test('cp1 fail: missing ptx line -> concept topic suggested', () => {
  const r = gradeCheckpoint(cp1, { selected: ['E2-L1'], rationale: R });
  assert.equal(r.pass, false);
  assert.equal(r.suggestTopic, 'infra-request-id');
  assert.ok(r.feedback.some((f) => f.includes('다리')));
});

test('cp1 fail: missing gateway line -> no topic suggested', () => {
  const r = gradeCheckpoint(cp1, { selected: ['E3-L1'], rationale: R });
  assert.equal(r.pass, false);
  assert.equal(r.suggestTopic, null);
  assert.ok(r.feedback.some((f) => f.includes('게이트웨이')));
});

test('rationale must be 10..200 chars after trim', () => {
  assert.equal(gradeCheckpoint(cp1, { selected: ['E3-L1', 'E2-L1'], rationale: '  짧음  ' }).pass, false);
  assert.equal(gradeCheckpoint(cp1, { selected: ['E3-L1', 'E2-L1'], rationale: 'ㄱ'.repeat(201) }).pass, false);
  assert.equal(gradeCheckpoint(cp1, { selected: ['E3-L1', 'E2-L1'], rationale: 'ㄱ'.repeat(200) }).pass, true);
});

test('cp2 pass with DB evidence, no notes', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E4-L1'], rationale: R, state: 'H3', reply: 'R2' });
  assert.equal(r.pass, true);
  assert.deepEqual(r.notes, []);
});

test('cp2 pass with commit log only -> pass + DB note', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E3-L2'], rationale: R, state: 'H3', reply: 'R2' });
  assert.equal(r.pass, true);
  assert.equal(r.notes.length, 1);
  assert.ok(r.notes[0].includes('DB'));
});

test('cp2 fail: wrong state gives that state feedback only', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E4-L1'], rationale: R, state: 'H2', reply: 'R2' });
  assert.equal(r.pass, false);
  assert.deepEqual(r.feedback, [cp2.stateQuestion.wrongFeedback.H2]);
});

test('cp2 fail: wrong reply', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E4-L1'], rationale: R, state: 'H3', reply: 'R1' });
  assert.equal(r.pass, false);
  assert.deepEqual(r.feedback, [cp2.replyQuestion.wrongFeedback.R1]);
});

test('cp2 fail: non-decisive evidence', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E2-L1'], rationale: R, state: 'H3', reply: 'R2' });
  assert.equal(r.pass, false);
  assert.deepEqual(r.feedback, [cp2.evidenceQuestion.wrongFeedback]);
});

test('cp2 fail: more than maxSelections', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E4-L1', 'E3-L2', 'E3-L1'], rationale: R, state: 'H3', reply: 'R2' });
  assert.equal(r.pass, false);
});

test('cp2 fail: multiple wrong parts -> feedback in order state, evidence, reply', () => {
  const r = gradeCheckpoint(cp2, { selected: ['E2-L2'], rationale: R, state: 'H4', reply: 'R3' });
  assert.equal(r.pass, false);
  assert.deepEqual(r.feedback, [
    cp2.stateQuestion.wrongFeedback.H4,
    cp2.evidenceQuestion.wrongFeedback,
    cp2.replyQuestion.wrongFeedback.R3,
  ]);
});

test('computeOutcome', () => {
  assert.equal(computeOutcome({ finalFirstTryPass: true, hintLevel: 0 }), 'independent');
  assert.equal(computeOutcome({ finalFirstTryPass: true, hintLevel: 1 }), 'assisted');
  assert.equal(computeOutcome({ finalFirstTryPass: false, hintLevel: 0 }), 'assisted');
});
