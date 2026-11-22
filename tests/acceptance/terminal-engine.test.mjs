// Acceptance tests owned by Claude. NEON must not edit this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCommand } from '../../public/js/boards/terminal-engine.js';

const inc = JSON.parse(readFileSync(new URL('../../content/incidents/inc-003.json', import.meta.url)));
const spec = inc.board;
const ids = (r) => r.lines.filter((l) => l.id).map((l) => l.id);
const text = (r) => r.lines.map((l) => l.text).join('\n');

test('content command with exact pattern', () => {
  const r = runCommand(spec, 'dmesg -T');
  assert.equal(r.kind, 'ok');
  assert.ok(ids(r).includes('K-L2'));
  assert.ok(ids(r).includes('K-L5'));
});

test('whitespace is normalized and sudo is stripped', () => {
  assert.equal(runCommand(spec, '   free    -m  ').kind, 'ok');
  assert.deepEqual(ids(runCommand(spec, 'sudo dmesg -T | grep -i killed')), ['K-L2', 'K-L5']);
});

test('pipe: grep -i with quoted pattern', () => {
  const r = runCommand(spec, `dmesg -T | grep -i 'killed process'`);
  assert.deepEqual(ids(r), ['K-L2', 'K-L5']);
  assert.equal(r.lines.length, 2);
});

test('pipe: grep is case-sensitive without -i; grep -v inverts', () => {
  assert.deepEqual(ids(runCommand(spec, 'journalctl -u point-api | grep oom')), ['J-L3', 'J-L8']);
  assert.deepEqual(ids(runCommand(spec, 'cat /var/log/point-api/app.log | grep -v receipts')), ['A-L2', 'A-L4', 'A-L6', 'A-L8']);
});

test('pipe: head/tail/wc -l', () => {
  assert.deepEqual(ids(runCommand(spec, 'cat /var/log/point-api/memstat.log | tail -n 3')), ['M-L16', 'M-L17', 'M-L18']);
  assert.deepEqual(ids(runCommand(spec, 'cat /var/log/deploy/point-api.log | head -2')), ['D-L1', 'D-L2']);
  const wc = runCommand(spec, 'ps aux | wc -l');
  assert.equal(wc.lines.length, 1);
  assert.equal(wc.lines[0].text.trim(), '4');
});

test('file commands: cat, tail -n, head -n, grep FILE, less', () => {
  assert.deepEqual(ids(runCommand(spec, 'tail -n 2 /var/log/point-api/memstat.log')), ['M-L17', 'M-L18']);
  assert.deepEqual(ids(runCommand(spec, 'head -n 3 /var/log/deploy/point-api.log')), ['D-L1', 'D-L2', 'D-L3']);
  assert.deepEqual(ids(runCommand(spec, 'grep canary /var/log/deploy/point-api.log')), ['D-L3']);
  assert.ok(ids(runCommand(spec, 'less /etc/systemd/system/point-api.service')).includes('F-L1'));
  const none = runCommand(spec, 'grep ERROR /var/log/point-api/app.log');
  assert.equal(none.kind, 'ok');
  assert.equal(none.lines.length, 0);
});

test('ls lists directory entries derived from files and dirs', () => {
  const r = runCommand(spec, 'ls /var/log/point-api');
  assert.equal(r.kind, 'ok');
  for (const f of ['app.log', 'gc.log', 'memstat.log', 'access-hourly.log']) assert.ok(text(r).includes(f), f);
  assert.ok(text(runCommand(spec, 'ls /var/log')).includes('deploy'));
});

test('errors: unknown command, unsupported variant, missing file', () => {
  const u = runCommand(spec, 'foo --bar');
  assert.equal(u.kind, 'error');
  assert.match(text(u), /command not found/);
  const v = runCommand(spec, 'dmesg -x');
  assert.equal(v.kind, 'error');
  assert.match(text(v), /지원/);
  assert.match(text(v), /dmesg -T/);
  const f = runCommand(spec, 'cat /nope.log');
  assert.equal(f.kind, 'error');
  assert.match(text(f), /No such file or directory/);
  const p = runCommand(spec, 'dmesg -T | awk 1');
  assert.equal(p.kind, 'error');
});

test('help lists every content command usage and the builtins; clear', () => {
  const h = runCommand(spec, 'help');
  for (const c of spec.commands) assert.ok(text(h).includes(c.usage), c.usage);
  for (const b of ['cat', 'tail', 'head', 'grep', 'ls', 'clear']) assert.ok(text(h).includes(b), b);
  assert.equal(runCommand(spec, 'clear').kind, 'clear');
});

test('evidence line objects keep their ids; display text may differ from registry', () => {
  const r = runCommand(spec, 'dmesg');
  const k2 = r.lines.find((l) => l.id === 'K-L2');
  assert.ok(k2);
  assert.match(k2.text, /^\[\s*\d+\.\d+\]/);
});
