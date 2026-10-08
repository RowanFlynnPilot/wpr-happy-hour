// npm test — Node's built-in runner, no dependencies. Dates are local time,
// matching the app (visitor's browser clock). 2026-09-24 is a Thursday.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIGEST_MAX_FEATURED,
  DIGEST_MAX_LISTED,
  SPOTLIGHT_MAX_ROWS,
  dayListings,
  digestFor,
  fmtDays,
  fmtTime,
  fmtWindows,
  groupSpecials,
  isPlaceholder,
  minutesUntil,
  placeholderText,
  nextPour,
  nowListings,
  specialStatus,
  spotlightFor,
  trackedUrl,
} from './schedule.js';

const thu = (h, m = 0) => new Date(2026, 8, 24, h, m);
const special = (over = {}) => ({ days: ['thu'], start: '15:00', end: '18:00', type: 'drinks', items: ['$1 off taps'], ...over });
const bar = (id, over = {}) => ({
  id,
  name: id,
  city: 'Wausau',
  address: '1 Main St, Wausau',
  website: '',
  tier: 'partner',
  verifiedOn: null,
  photo: null,
  specials: [special()],
  ...over,
});
const all = () => true;
const names = (entries) => entries.map((e) => e.bar.id);

test('fmtTime renders 12-hour times', () => {
  assert.equal(fmtTime('00:00'), '12 AM');
  assert.equal(fmtTime('09:05'), '9:05 AM');
  assert.equal(fmtTime('12:00'), '12 PM');
  assert.equal(fmtTime('15:30'), '3:30 PM');
  assert.equal(fmtTime('23:30'), '11:30 PM');
  assert.equal(fmtTime('23:59'), 'midnight'); // the data's cap for past-midnight windows
});

test('groupSpecials merges same days + hours, keeps order, derives type', () => {
  const groups = groupSpecials([
    special({ days: ['fri'], start: '11:00', end: '21:30', type: 'drinks', items: ['$3.50 old fashioneds'] }),
    special({ days: ['fri'], start: '11:00', end: '21:30', type: 'food', items: ['Fish fry'] }),
    special({ days: ['fri'], start: '16:00', end: '21:30', type: 'food', items: ['Pan-fried walleye'] }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items, ['$3.50 old fashioneds', 'Fish fry']);
  assert.equal(groups[0].type, 'both');
  assert.equal(groups[1].type, 'food');
  assert.equal(groups[0].placeholder, false);
});

test('placeholder lines are flagged and shown without the raw marker', () => {
  const [g] = groupSpecials([special({ items: ['PLACEHOLDER — specials being confirmed'] })]);
  assert.equal(g.placeholder, true);
  assert.equal(isPlaceholder('PLACEHOLDER — x'), true);
  assert.equal(placeholderText('PLACEHOLDER — time being confirmed: Friday fish fry'), 'Time being confirmed: Friday fish fry');
});

test('fmtDays collapses consecutive runs, Mon-first, no week wrap', () => {
  assert.equal(fmtDays(['mon', 'tue', 'wed', 'thu', 'fri']), 'Mon–Fri');
  assert.equal(fmtDays(['fri', 'mon', 'tue']), 'Mon–Tue · Fri');
  assert.equal(fmtDays(['sat', 'sun']), 'Sat–Sun');
  assert.equal(fmtDays(['sun', 'mon']), 'Mon · Sun');
  assert.equal(fmtDays(['wed']), 'Wed');
});

test('specialStatus: start inclusive, end exclusive, null on other days', () => {
  const s = special();
  assert.equal(specialStatus(s, thu(14, 59)), 'later');
  assert.equal(specialStatus(s, thu(15, 0)), 'now');
  assert.equal(specialStatus(s, thu(17, 59)), 'now');
  assert.equal(specialStatus(s, thu(18, 0)), 'done');
  assert.equal(specialStatus(s, new Date(2026, 8, 25, 16, 0)), null); // Friday
});

test('fmtWindows lists each window once, in time order', () => {
  const specials = [
    special({ start: '14:30', end: '17:30' }),
    special({ start: '11:00', end: '23:00', type: 'food' }),
    special({ start: '14:30', end: '17:30', type: 'food' }),
  ];
  assert.equal(fmtWindows(specials), '11 AM–11 PM, 2:30 PM–5:30 PM');
});

test('minutesUntil counts down to a time today', () => {
  assert.equal(minutesUntil('18:00', thu(17, 15)), 45);
});

test('nowListings groups pouring vs later, featured first, skips finished', () => {
  const bars = [
    bar('a-partner'),
    bar('b-featured', { tier: 'featured' }),
    bar('c-later', { specials: [special({ start: '19:00', end: '21:00' })] }),
    bar('d-done', { specials: [special({ start: '11:00', end: '13:00' })] }),
  ];
  const { pouring, laterToday } = nowListings(bars, thu(16), all);
  assert.deepEqual(names(pouring), ['b-featured', 'a-partner']);
  assert.deepEqual(names(laterToday), ['c-later']);
});

test('nowListings applies the type filter', () => {
  const bars = [bar('food-only', { specials: [special({ type: 'food' })] }), bar('both', { specials: [special({ type: 'both' })] })];
  const drinks = (s) => s.type === 'drinks' || s.type === 'both';
  assert.deepEqual(names(nowListings(bars, thu(16), drinks).pouring), ['both']);
});

test('nextPour finds the earliest start on the next day that has one', () => {
  const bars = [
    bar('sat-late', { specials: [special({ days: ['sat'], start: '16:00', end: '18:00' })] }),
    bar('sat-early', { specials: [special({ days: ['sat'], start: '14:00', end: '16:00' })] }),
  ];
  assert.deepEqual(nextPour(bars, thu(23), all), { offset: 2, dayKey: 'sat', start: '14:00' });
});

test('nextPour wraps to the same weekday next week, null when nothing matches', () => {
  assert.deepEqual(nextPour([bar('thu-only')], thu(23), all), { offset: 7, dayKey: 'thu', start: '15:00' });
  assert.equal(nextPour([bar('thu-only')], thu(23), () => false), null);
});

test('dayListings: featured first, then earliest start, then name', () => {
  const bars = [
    bar('zeta', { specials: [special({ start: '14:00', end: '16:00' })] }),
    bar('alpha', { specials: [special({ start: '14:00', end: '16:00' })] }),
    bar('featured-late', { tier: 'featured', specials: [special({ start: '20:00', end: '22:00' })] }),
    bar('early', { specials: [special({ start: '11:00', end: '13:00' })] }),
    bar('not-thursday', { specials: [special({ days: ['fri'] })] }),
  ];
  assert.deepEqual(names(dayListings(bars, 'thu', all)), ['featured-late', 'early', 'alpha', 'zeta']);
});

test('digestFor shows verified bars only', () => {
  const d = digestFor([bar('unverified'), bar('verified', { verifiedOn: '2026-09-01' })], 'thu');
  assert.equal(d.count, 1);
  assert.deepEqual(names(d.listed), ['verified']);
});

test('digestFor caps featured entries and the name list, counting the rest', () => {
  const v = { verifiedOn: '2026-09-01' };
  const featured = Array.from({ length: DIGEST_MAX_FEATURED + 1 }, (_, i) => bar(`f${i}`, { ...v, tier: 'featured' }));
  const partners = Array.from({ length: DIGEST_MAX_LISTED + 2 }, (_, i) => bar(`p${String(i).padStart(2, '0')}`, v));
  const d = digestFor([...partners, ...featured], 'thu');
  assert.equal(d.count, featured.length + partners.length);
  assert.equal(d.featured.length, DIGEST_MAX_FEATURED);
  assert.equal(d.listed[0].bar.id, `f${DIGEST_MAX_FEATURED}`); // overflow featured leads the list
  assert.equal(d.listed.length, DIGEST_MAX_LISTED);
  assert.equal(d.more, d.count - DIGEST_MAX_FEATURED - DIGEST_MAX_LISTED);
});

test('spotlightFor: verified only, one row per window, Monday first, capped', () => {
  const v = { verifiedOn: '2026-09-01' };
  assert.throws(() => spotlightFor(bar('unverified')), /not verified/);
  const { rows, more } = spotlightFor(
    bar('busy', {
      ...v,
      specials: [
        special({ days: ['fri'], start: '16:00', end: '21:00', type: 'food', items: ['Fish fry'] }),
        special({ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '15:00', end: '18:00', items: ['$2 off rails'] }),
        special({ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '15:00', end: '18:00', type: 'food', items: ['$6 apps'] }),
        special({ days: ['sun'], start: '11:00', end: '14:00' }),
        special({ days: ['sat'], start: '11:00', end: '14:00' }),
        special({ days: ['tue'], start: '18:00', end: '21:00' }),
      ],
    })
  );
  assert.equal(rows.length, SPOTLIGHT_MAX_ROWS);
  assert.deepEqual(rows[0].items, ['$2 off rails', '$6 apps']); // merged window
  assert.deepEqual(rows.map((r) => r.days[0]), ['mon', 'tue', 'fri']);
  assert.equal(more, 2);
});

test('trackedUrl adds UTM tags and keeps the existing query', () => {
  const u = new URL(trackedUrl('https://example.com/menu?x=1&utm_source=old'));
  assert.equal(u.searchParams.get('x'), '1');
  assert.equal(u.searchParams.get('utm_source'), 'wausaupilotandreview');
  assert.equal(u.searchParams.get('utm_medium'), 'widget');
  assert.equal(u.searchParams.get('utm_campaign'), 'happy-hour');
  assert.equal(new URL(trackedUrl('https://example.com/', 'newsletter')).searchParams.get('utm_medium'), 'newsletter');
});
