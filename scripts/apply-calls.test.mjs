// npm test — the call-sheet → bars.json path. A wrong parse here would put a
// wrong time on a card marked "✓ Verified", so each reading rule is pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCalls, parseCallDate, parseCsv, parseDays, parseSpecials, parseTime } from './apply-calls.mjs';

test('parseDays: ranges, lists, wraps, shorthands', () => {
  assert.deepEqual(parseDays('Mon-Fri'), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(parseDays('Tue, Thu'), ['tue', 'thu']);
  assert.deepEqual(parseDays('Tuesday & Thursday'), ['tue', 'thu']);
  assert.deepEqual(parseDays('Fri–Sun'), ['fri', 'sat', 'sun']);
  assert.deepEqual(parseDays('Sat-Mon'), ['mon', 'sat', 'sun']);
  assert.deepEqual(parseDays('Daily'), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  assert.deepEqual(parseDays('Weekdays'), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(parseDays('Thurs'), ['thu']);
  assert.throws(() => parseDays('Funday'), /unknown day/);
});

test('parseTime: 12-hour, 24-hour, noon, midnight', () => {
  assert.equal(parseTime('3pm'), '15:00');
  assert.equal(parseTime('3:30 PM'), '15:30');
  assert.equal(parseTime('12pm'), '12:00');
  assert.equal(parseTime('12am'), '00:00');
  assert.equal(parseTime('15:00'), '15:00');
  assert.equal(parseTime('noon'), '12:00');
  assert.equal(parseTime('midnight'), '23:59');
  assert.throws(() => parseTime('3'), /needs am\/pm/);
  assert.throws(() => parseTime('13pm'), /12-hour/);
});

test('parseSpecials: the documented examples', () => {
  assert.deepEqual(parseSpecials('Mon-Fri 3pm-6pm drinks: $2 off rails; $1 off taps'), [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '15:00', end: '18:00', type: 'drinks', items: ['$2 off rails', '$1 off taps'] },
  ]);
  const two = parseSpecials('Fri 4-9pm food: Fish fry — cod $12\nSat, Sun 11am-2pm both: $5 Bloody Marys | Thu 5pm-midnight drink: $3 pints');
  assert.equal(two.length, 3);
  assert.deepEqual([two[0].start, two[0].end, two[0].items[0]], ['16:00', '21:00', 'Fish fry — cod $12']);
  assert.deepEqual([two[1].days, two[1].start, two[1].end, two[1].type], [['sat', 'sun'], '11:00', '14:00', 'both']);
  assert.deepEqual([two[2].end, two[2].type], ['23:59', 'drinks']);
});

test('parseSpecials: a bare start borrows the end\'s am/pm only when it fits', () => {
  assert.deepEqual(parseSpecials('Mon 3:30-6pm drinks: x').map((s) => [s.start, s.end]), [['15:30', '18:00']]);
  assert.deepEqual(parseSpecials('Mon 11-2pm food: x').map((s) => [s.start, s.end]), [['11:00', '14:00']]);
  assert.deepEqual(parseSpecials('Mon 11-noon food: x').map((s) => [s.start, s.end]), [['11:00', '12:00']]);
  assert.deepEqual(parseSpecials('Mon 9-midnight drinks: x').map((s) => [s.start, s.end]), [['21:00', '23:59']]);
});

test('parseSpecials: refuses anything it would have to guess', () => {
  assert.throws(() => parseSpecials('Mon-Fri 3-6 drinks: x'), /am\/pm/);
  assert.throws(() => parseSpecials('Fri 9pm-close drinks: x'), /isn't a time/);
  assert.throws(() => parseSpecials('Fri 9pm-2am drinks: x'), /after start/);
  assert.throws(() => parseSpecials('Happy hour weekdays'), /can't read/);
  assert.throws(() => parseSpecials('Mon 3pm-6pm snacks: x'), /can't read/);
  assert.doesNotThrow(() => parseSpecials('Fri 4pm-9pm drinks: Close Encounters IPA $5'));
});

test('parseCallDate: US and ISO formats, real dates only', () => {
  assert.equal(parseCallDate('9/28/2026'), '2026-09-28');
  assert.equal(parseCallDate('9/28/26'), '2026-09-28');
  assert.equal(parseCallDate('2026-09-28'), '2026-09-28');
  assert.throws(() => parseCallDate('2/31/2026'), /real date/);
});

test('parseCsv: quoted multi-line cells and required columns', () => {
  const csv = '﻿Bar,Deep-link ID,Call date,Outcome,Tier sold,Verified specials (final)\r\nX,x-bar,9/1/2026,Verified,Partner,"Mon 3pm-6pm drinks: a\nTue 3pm-6pm drinks: b"\r\n';
  const [row] = parseCsv(csv);
  assert.equal(row['Deep-link ID'], 'x-bar');
  assert.equal(parseSpecials(row['Verified specials (final)']).length, 2);
  assert.throws(() => parseCsv('Bar,Outcome\nX,Verified\n'), /missing the "Deep-link ID" column/);
});

const doc = () => ({
  updated: '2026-09-26',
  sponsor: null,
  bars: [
    {
      id: 'x-bar', name: 'X Bar', city: 'Wausau', address: '1 Main St, Wausau', website: '', tier: 'partner',
      verifiedOn: null, photo: null,
      specials: [{ days: ['mon'], start: '15:00', end: '18:00', type: 'drinks', items: ['PLACEHOLDER — guess'] }],
    },
  ],
});
const row = (over = {}) => ({
  'Deep-link ID': 'x-bar', 'Call date': '9/28/2026', Outcome: 'Verified', 'Tier sold': 'Featured',
  'Verified specials (final)': 'Mon-Fri 3pm-6pm drinks: $2 off rails', ...over,
});

test('applyCalls: a Verified row replaces placeholders and stamps the listing', () => {
  const { doc: next, report } = applyCalls(doc(), [row()], '2026-09-30');
  const bar = next.bars[0];
  assert.equal(bar.verifiedOn, '2026-09-28');
  assert.equal(bar.tier, 'featured');
  assert.deepEqual(bar.specials[0].items, ['$2 off rails']);
  assert.equal(next.updated, '2026-09-30');
  assert.equal(report.applied.length, 1);
});

test('applyCalls: re-running the same sheet changes nothing', () => {
  const once = applyCalls(doc(), [row()], '2026-09-30').doc;
  const { doc: twice, report } = applyCalls(once, [row()], '2026-10-01');
  assert.deepEqual(report.unchanged, ['x-bar']);
  assert.equal(twice.updated, '2026-09-30');
});

test('applyCalls: other outcomes are reported, never applied', () => {
  const { doc: next, report } = applyCalls(doc(), [row({ Outcome: 'Declined' }), row({ Outcome: '' })], '2026-09-30');
  assert.equal(next.bars[0].verifiedOn, null);
  assert.deepEqual(report.other, ['x-bar: Declined (9/28/2026)']);
});

test('applyCalls: bad rows fail loudly, naming the bar', () => {
  assert.throws(() => applyCalls(doc(), [row({ 'Deep-link ID': 'nope' })], '2026-09-30'), /row "nope".*no bar/);
  assert.throws(() => applyCalls(doc(), [row({ 'Tier sold': 'Gold' })], '2026-09-30'), /Partner or Featured/);
  assert.throws(() => applyCalls(doc(), [row({ 'Call date': '10/5/2026' })], '2026-09-30'), /in the future/);
  assert.throws(() => applyCalls(doc(), [row({ 'Verified specials (final)': '' })], '2026-09-30'), /empty/);
});
