// npm test — the QR encoder against published reference values and its own structure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBits, qrModules, rsRemainder } from './qr.js';

test('rsRemainder matches the standard "HELLO WORLD" 1-M example', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('formatBits: the published level-M format strings', () => {
  assert.equal(formatBits(0).toString(2).padStart(15, '0'), '101010000010010');
  assert.equal(formatBits(1).toString(2).padStart(15, '0'), '101000100100101');
  assert.equal(formatBits(7).toString(2).padStart(15, '0'), '100101010100000');
});

test('qrModules: size by length, finders and timing in place', () => {
  assert.equal(qrModules('hi').length, 21); // version 1
  const url = 'https://rowanflynnpilot.github.io/wpr-happy-hour/?bar=palms-supper-club&utm_source=tent';
  const g = qrModules(url);
  assert.equal(g.length, 41); // 87 bytes: version 6
  assert.ok(g.every((row) => row.length === g.length));
  const n = g.length;
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    assert.ok(g[y][x] && g[y + 6][x + 6] && g[y + 3][x + 3] && !g[y + 1][x + 1]); // a finder's corners, center and gap
  }
  for (let i = 8; i < n - 8; i++) assert.equal(g[6][i], i % 2 === 0); // timing row
  assert.equal(g[n - 8][8], true); // the dark module
  assert.throws(() => qrModules('x'.repeat(181)), /too long/);
});
