// npm test — Node's built-in runner, no dependencies. Dates are local time,
// matching the app (visitor's browser clock). 2026-09-24 is a Thursday.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIGEST_MAX_FEATURED,
  DIGEST_MAX_LISTED,
  dayListings,
  digestFor,
  digestSchedule,
  endsAt,
  heroFinding,
  hmOf,
  icsFor,
  startsAt,
  timetable,
  fmtDays,
  fmtTime,
  fmtWindows,
  groupSpecials,
  isPlaceholder,
  minutesUntil,
  placeholderText,
  nextDay,
  dayShape,
  SHAPE_START,
  SHAPE_STEP,
  isConfirmed,
  sourcedOf,
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

test('groupSpecials sorts windows by start, then end', () => {
  const groups = groupSpecials([
    special({ start: '14:30', end: '17:30', items: ['Happy hour'] }),
    special({ start: '11:00', end: '23:00', items: ['All day'] }),
  ]);
  assert.deepEqual(groups.map((g) => g.start), ['11:00', '14:30']);
});

test('a window ending 23:59 runs to midnight', () => {
  const late = special({ start: '20:00', end: '23:59' });
  assert.equal(specialStatus(late, thu(23, 59)), 'now');
  assert.equal(minutesUntil('23:59', thu(23, 30)), 30);
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

test('nowListings: a confirmed happy hour later beats a guessed one now', () => {
  const b = bar('mixed', {
    specials: [special({ start: '15:00', end: '18:00', items: ['PLACEHOLDER — x'] }), special({ start: '17:00', end: '19:00' })],
  });
  const { pouring, laterToday } = nowListings([b, bar('guess', { specials: [special({ items: ['PLACEHOLDER — y'] })] })], thu(16), all);
  assert.deepEqual(names(laterToday), ['mixed']);
  assert.deepEqual(names(pouring), ['guess']); // still listed, as being confirmed
  assert.equal(isConfirmed(pouring[0]), false);
  assert.deepEqual(sourcedOf(b.specials).map((s) => s.start), ['17:00']);
});

test('nextDay: the next day with sourced specials, its bars first to start first', () => {
  const bars = [
    bar('sat-late', { name: 'Late', specials: [special({ days: ['sat'], start: '16:00', end: '18:00' })] }),
    bar('sat-early', { name: 'Early', specials: [special({ days: ['sat'], start: '14:00', end: '16:00' })] }),
    bar('fri-guess', { specials: [special({ days: ['fri'], items: ['PLACEHOLDER — x'] })] }), // never "next"
  ];
  const d = nextDay(bars, thu(23), all);
  assert.deepEqual([d.offset, d.dayKey], [2, 'sat']);
  assert.deepEqual(d.openers.map((o) => [o.bar.id, o.start]), [['sat-early', '14:00'], ['sat-late', '16:00']]);
});

test('nextDay wraps to the same weekday next week, null when nothing matches', () => {
  const d = nextDay([bar('thu-only')], thu(23), all);
  assert.deepEqual([d.offset, d.dayKey, d.openers[0].start], [7, 'thu', '15:00']);
  assert.equal(nextDay([bar('thu-only')], thu(23), () => false), null);
});

test('dayShape counts bars with sourced specials per half hour, 10 AM to midnight', () => {
  const shape = dayShape(
    [
      bar('a', { specials: [special({ start: '15:00', end: '17:00' }), special({ start: '15:00', end: '16:00', type: 'food' })] }),
      bar('b', { specials: [special({ start: '16:00', end: '23:59' })] }),
      bar('guess', { specials: [special({ start: '15:00', end: '18:00', items: ['PLACEHOLDER — x'] })] }),
    ],
    'thu',
    all
  );
  const at = (h, m = 0) => shape[(h * 60 + m - SHAPE_START) / SHAPE_STEP];
  assert.equal(shape.length, 28);
  assert.equal(at(14, 30), 0);
  assert.equal(at(15), 1); // one bar, however many of its specials
  assert.equal(at(16, 30), 2);
  assert.equal(at(17), 1); // end exclusive
  assert.equal(at(23, 30), 1); // 23:59 runs to midnight
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

test('digestSchedule groups by first start, in time order, with ends and later windows', () => {
  const listed = [
    { bar: bar('feat-late'), specials: [special({ start: '16:00', end: '18:00' })] },
    { bar: bar('a'), specials: [special({ start: '15:00', end: '17:00' })] },
    {
      bar: bar('b'),
      specials: [
        special({ start: '20:00', end: '22:00' }),
        special({ start: '15:00', end: '18:00', type: 'food' }),
        special({ start: '15:00', end: '18:00' }), // same window, counted once
      ],
    },
  ];
  const groups = digestSchedule(listed);
  assert.deepEqual(groups.map((g) => g.start), ['15:00', '16:00']);
  // a window inside the first one is not a "then"
  const nested = digestSchedule([{ bar: bar('all-day'), specials: [special({ start: '11:00', end: '23:59' }), special({ start: '14:30', end: '17:30' })] }]);
  assert.equal(nested[0].rows[0].later.length, 0);
  assert.deepEqual(groups[0].rows.map((r) => [r.bar.id, r.end, r.later.length]), [['a', '17:00', 0], ['b', '18:00', 1]]);
  assert.equal(groups[0].rows[1].later[0].start, '20:00');
  assert.equal(groups[1].rows[0].bar.id, 'feat-late');
});

test('spotlightFor: the ad copy and a button to the bar, verified only unless a preview', () => {
  const ad = { headline: 'Prime Rib', line: 'Saturdays at the bar', board: ['From 4 PM'], accent: '#c9e265' };
  const listed = bar('listed', { website: 'https://www.example.com/menu', ad });
  assert.throws(() => spotlightFor(listed), /not verified/);
  assert.deepEqual(spotlightFor(listed, { preview: true }), { ...ad, cta: 'Details at example.com' });
  assert.equal(spotlightFor({ ...listed, verifiedOn: '2026-09-01' }).headline, 'Prime Rib');
  assert.equal(spotlightFor({ ...listed, website: '' }, { preview: true }).cta, 'Details on the Happy Hour Finder');
  assert.throws(() => spotlightFor(bar('no-copy', { verifiedOn: '2026-09-01', ad: null })), /no ad copy/);
});

test('trackedUrl adds UTM tags and keeps the existing query', () => {
  const u = new URL(trackedUrl('https://example.com/menu?x=1&utm_source=old'));
  assert.equal(u.searchParams.get('x'), '1');
  assert.equal(u.searchParams.get('utm_source'), 'wausaupilotandreview');
  assert.equal(u.searchParams.get('utm_medium'), 'widget');
  assert.equal(u.searchParams.get('utm_campaign'), 'happy-hour');
  assert.equal(new URL(trackedUrl('https://example.com/', 'newsletter')).searchParams.get('utm_medium'), 'newsletter');
});

test('timetable groups by a time key, in time order, confirmed rows apart', () => {
  const entries = [
    { bar: bar('late'), specials: [special({ start: '16:00', end: '21:00' })] },
    { bar: bar('guess'), specials: [special({ start: '15:00', end: '18:00', items: ['PLACEHOLDER — x'] })] },
    { bar: bar('early'), specials: [special({ start: '15:00', end: '18:00' })] },
    { bar: bar('also-early'), specials: [special({ start: '15:00', end: '23:59' })] },
    // placed by its sourced window (16:00), not its guessed one (15:00)
    { bar: bar('mixed'), specials: [special({ start: '15:00', end: '17:00', items: ['PLACEHOLDER — y'] }), special({ start: '16:00', end: '18:00' })] },
  ];
  const byStart = timetable(entries, startsAt);
  assert.deepEqual(
    byStart.map((g) => [g.minutes, g.confirmed.map((e) => e.bar.id), g.guessed.map((e) => e.bar.id)]),
    [[900, ['early', 'also-early'], ['guess']], [960, ['late', 'mixed'], []]]
  );
  assert.equal(endsAt(entries[3]), 1440); // 23:59 is midnight
  assert.equal(hmOf(1440), '23:59');
  assert.equal(hmOf(1230), '20:30');
});

test('heroFinding names the soonest to end and the next to start, sourced only', () => {
  const pouring = [
    { bar: bar('a', { name: 'A' }), specials: [special({ end: '20:00' })] },
    { bar: bar('guess', { name: 'Guess' }), specials: [special({ end: '19:00', items: ['PLACEHOLDER — x'] })] },
  ];
  const later = [{ bar: bar('b', { name: 'B' }), specials: [special({ start: '21:00', end: '23:00' })] }];
  assert.equal(heroFinding(pouring, later), 'First to wrap up: A, at 8\u00a0PM. Next to start: B, at 9\u00a0PM.');
  assert.equal(heroFinding([], []), '');
  // one left and nothing after it: say so
  const last = [{ bar: bar('n', { name: 'Night Owl' }), specials: [special({ start: '21:00', end: '23:59' })] }];
  assert.equal(heroFinding(last, []), 'The last one going: Night Owl, until midnight.');
  // a guessed window in a confirmed row doesn't set the time
  const mixed = [{ bar: bar('m', { name: 'M' }), specials: [special({ end: '18:00' }), special({ end: '17:00', items: ['PLACEHOLDER \u2014 z'] })] }];
  assert.equal(heroFinding([...mixed, ...pouring], []), 'First to wrap up: M, at 6\u00a0PM.');
});

test('icsFor: weekly repeating events for sourced specials, local time', () => {
  const b = bar('palms', {
    name: 'The Palms',
    address: '1 Main St, Weston',
    specials: [
      special({ days: ['fri', 'sat'], start: '16:00', end: '21:00', type: 'food', items: ['Fish, prime rib; more'] }),
      special({ days: ['wed'], items: ['PLACEHOLDER — x'] }),
    ],
  });
  const ics = icsFor(b, thu(12)); // Thursday Sep 24, 2026
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20260925T160000\r\n/); // the next Friday, floating local time
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=FR,SA\r\n/);
  assert.match(ics, /DESCRIPTION:Fish\\, prime rib\\; more/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1); // the guessed Wednesday is left out
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.equal(icsFor(bar('guesses', { specials: [special({ items: ['PLACEHOLDER — x'] })] }), thu(12)), null);
});
