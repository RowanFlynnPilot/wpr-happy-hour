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
  LISTING_EVENTS,
  tagInSeason,
  gameOn,
  gameLine,
  actionUrl,
  parseActionUrl,
  listingUrl,
  holidayOn,
  holidaysAhead,
  searchSpecials,
  viewUrl,
  claimOf,
  byBarName,
  specialsToSheet,
  sunsetAt,
  phaseOf,
  dayAtAGlance,
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
  const ad = { style: 'menu', headline: 'Prime Rib', line: 'Saturdays at the bar', board: ['From 4 PM'], accent: '#c9e265' };
  const listed = bar('listed', { website: 'https://www.example.com/menu', ad });
  assert.throws(() => spotlightFor(listed), /not verified/);
  assert.deepEqual(spotlightFor(listed, { preview: true }), { ...ad, cta: 'Details at example.com', rows: [{ text: 'From 4 PM' }] });
  const priced = spotlightFor({ ...listed, ad: { ...ad, board: ['12 oz Queen $42', 'Wings $8.50', 'Until sold out'] } }, { preview: true });
  assert.deepEqual(priced.rows, [
    { text: '12 oz Queen $42', item: '12 oz Queen', price: '$42' },
    { text: 'Wings $8.50', item: 'Wings', price: '$8.50' },
    { text: 'Until sold out' },
  ]);
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

test('dayAtAGlance: first, busiest (when bars overlap) and last, sourced only', () => {
  const bars = [
    bar('a', { specials: [special({ start: '11:00', end: '14:00' })] }),
    bar('b', { specials: [special({ start: '16:00', end: '18:00' })] }),
    bar('c', { specials: [special({ start: '16:30', end: '23:59' })] }),
    bar('guess', { specials: [special({ start: '10:00', end: '23:59', items: ['PLACEHOLDER — x'] })] }),
  ];
  const g = dayAtAGlance(bars, 'thu', all);
  assert.equal(g.text, 'First at 11\u00a0AM, busiest around 4:30\u00a0PM, the last until midnight.');
  assert.equal(g.peakAt, 16 * 60 + 30);
  assert.equal(g.shape.length, 28);
  const one = dayAtAGlance([bars[1]], 'thu', all);
  assert.deepEqual([one.peakAt, one.text], [null, 'From 4\u00a0PM until 6\u00a0PM.']);
  assert.deepEqual(dayAtAGlance([bars[3]], 'thu', all).text, '');
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

test('holidayOn: Thanksgiving (4th Thursday of November) and the fixed dates', () => {
  assert.equal(holidayOn(new Date(2026, 10, 26)), 'Thanksgiving');
  assert.equal(holidayOn(new Date(2027, 10, 25)), 'Thanksgiving');
  assert.equal(holidayOn(new Date(2026, 10, 19)), null); // third Thursday
  assert.equal(holidayOn(new Date(2026, 11, 24)), 'Christmas Eve');
  assert.equal(holidayOn(new Date(2026, 11, 25)), 'Christmas Day');
  assert.equal(holidayOn(new Date(2027, 0, 1)), "New Year's Day");
  assert.equal(holidayOn(new Date(2026, 10, 25)), null);
});

test('sunsetAt: Wausau sunset within a few minutes, as an instant', () => {
  const utcMin = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();
  // Nov 17: 4:29 PM CST = 22:29 UTC; Jun 21: 8:48 PM CDT = 01:48 UTC
  assert.ok(Math.abs(utcMin(sunsetAt(new Date(2026, 10, 17, 12))) - (22 * 60 + 29)) <= 5);
  assert.ok(Math.abs(utcMin(sunsetAt(new Date(2026, 5, 21, 12))) - (1 * 60 + 48)) <= 5);
});

test('phaseOf: golden hour sits around sunset, late by the clock', () => {
  const day = new Date(2026, 10, 17, 12);
  const at = (min) => new Date(sunsetAt(day).getTime() + min * 60_000);
  // only meaningful when the test machine's noon-to-evening clock isn't in the late band
  const notLate = (d) => !(d.getHours() >= 22 || d.getHours() < 4);
  for (const [min, phase] of [[-120, 'day'], [-60, 'golden'], [10, 'golden'], [45, 'evening']]) {
    if (notLate(at(min))) assert.equal(phaseOf(at(min)), phase);
  }
  assert.equal(phaseOf(new Date(2026, 10, 17, 23, 0)), 'late');
  assert.equal(phaseOf(new Date(2026, 10, 17, 2, 0)), 'late');
});

test('actionUrl and parseActionUrl round-trip a listing action', () => {
  const b = bar('palms-supper-club');
  for (const action of Object.keys(LISTING_EVENTS)) {
    assert.deepEqual(parseActionUrl(actionUrl(b, action)), { barId: 'palms-supper-club', action });
  }
  assert.equal(parseActionUrl('https://thepalmswausau.com/?utm_source=wausaupilotandreview'), null);
  assert.equal(parseActionUrl(`${listingUrl(b)}#nonsense`), null);
  assert.equal(parseActionUrl('https://evil.example/?bar=palms-supper-club#save'), null);
});

test('tagInSeason: seasonal tags come and go on their own', () => {
  const games = [{ date: '2026-11-25', opponent: 'Rams', home: false, kickoff: '19:00' }, { date: '2027-01-04', opponent: 'Texans', home: true, kickoff: null }];
  const on = (tag, y, m, d) => tagInSeason(tag, new Date(y, m - 1, d, 12), games);
  assert.equal(on('patio', 2026, 7, 4), true); // not seasonal
  assert.deepEqual([on('game-day', 2026, 11, 17), on('game-day', 2027, 1, 4), on('game-day', 2027, 1, 5)], [true, true, false]);
  assert.deepEqual([on('tom-and-jerrys', 2026, 11, 19), on('tom-and-jerrys', 2026, 11, 20), on('tom-and-jerrys', 2027, 1, 5), on('tom-and-jerrys', 2027, 1, 6)], [false, true, true, false]);
  // 2026: Thanksgiving is Nov 26, so gun deer season is Nov 21–29
  assert.deepEqual([on('hunters', 2026, 11, 20), on('hunters', 2026, 11, 21), on('hunters', 2026, 11, 29), on('hunters', 2026, 11, 30)], [false, true, true, false]);
  // 2027: Thanksgiving is Nov 25, season Nov 20–28
  assert.deepEqual([on('hunters', 2027, 11, 19), on('hunters', 2027, 11, 20), on('hunters', 2027, 11, 28), on('hunters', 2027, 11, 29)], [false, true, true, false]);
});

test('gameOn and gameLine: the Packers line on a game day only', () => {
  const games = [{ date: '2026-11-25', opponent: 'Rams', home: false, kickoff: '19:00' }, { date: '2026-12-13', opponent: 'Bills', home: true, kickoff: null }];
  assert.equal(gameOn(games, new Date(2026, 10, 24, 20)), null);
  assert.equal(gameLine(gameOn(games, new Date(2026, 10, 25, 9))), 'Packers at the Rams today, 7\u00a0PM kickoff.');
  assert.equal(gameLine(gameOn(games, new Date(2026, 11, 13, 23, 59))), 'Packers vs. the Bills today.');
});

test('holidaysAhead: the dates the newsletter card sits out', () => {
  assert.deepEqual(holidaysAhead(new Date(2026, 10, 17, 9), 60), [
    { date: '2026-11-26', name: 'Thanksgiving' },
    { date: '2026-12-24', name: 'Christmas Eve' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2027-01-01', name: "New Year's Day" },
  ]);
  assert.deepEqual(holidaysAhead(new Date(2026, 10, 26, 23), 0), [{ date: '2026-11-26', name: 'Thanksgiving' }]); // today counts
  assert.deepEqual(holidaysAhead(new Date(2026, 1, 1), 60), []);
  assert.equal(holidaysAhead(new Date(2026, 10, 17), 400).at(-1).date, '2027-11-25'); // through Dec 22, 2027: next Thanksgiving too
});

test('searchSpecials: a bar by name, a special by its wording, a guess only by its claim', () => {
  const wings = { days: ['thu'], start: '17:00', end: '20:00', type: 'food', items: ['Wing night — 75¢ wings'] };
  const taps = { days: ['mon'], start: '15:00', end: '18:00', type: 'drinks', items: ['$1 off taps'] };
  const guess = { days: ['tue'], start: '11:00', end: '20:00', type: 'food', items: ['PLACEHOLDER — time being confirmed: Wing Tuesday'] };
  const vague = { days: ['wed'], start: '15:00', end: '18:00', type: 'drinks', items: ['PLACEHOLDER — specials being confirmed'] };
  const buffet = { days: ['sat'], start: '16:00', end: '18:00', type: 'food', items: ['Early bird — wing & rib buffet'] };
  const fashioned = { days: ['fri'], start: '15:00', end: '18:00', type: 'drinks', items: ['$5 Old Fashioneds', 'Jalapeño poppers $6'] };
  const bars = [
    { name: 'Oliva’s Tap', address: '1 Main St, Wausau', specials: [wings, taps] },
    { name: 'The Mill Yard', address: '2 County Rd W, Brokaw', specials: [guess, fashioned, vague, buffet] },
  ];
  const found = (q) => [...searchSpecials(bars, q)];
  assert.equal(searchSpecials(bars, '   '), null); // a blank box is no search
  assert.deepEqual(found('wings'), [wings, guess, buffet]); // the guess by its claim; a plural finds "wing & rib"
  assert.deepEqual(found('specials'), []); // the marker's own words answer nothing
  assert.deepEqual(found('confirmed'), []);
  assert.deepEqual(found("OLIVA'S"), [wings, taps]); // a name keeps the whole listing; apostrophes fold
  assert.deepEqual(found('mill yard'), [guess, fashioned, vague, buffet]); // ...its guesses too
  assert.deepEqual(found('old fashioned'), [fashioned]);
  assert.deepEqual(found('jalapeno'), [fashioned]);
  assert.deepEqual(found('wausau wings'), [wings]); // where + what
  assert.deepEqual(found('brokaw wings'), [guess, buffet]);
  assert.deepEqual(found('$1'), [taps]);
  assert.deepEqual(found('karaoke'), []);
  assert.deepEqual(found('1'), [wings, taps]); // "1 Main St": an address number is a word too
  assert.deepEqual(found('5 old'), [fashioned]); // a price without its "$"
  assert.deepEqual(found('!!!'), []); // nothing searchable is still a search: it matches nothing
  assert.deepEqual(found('🍺'), []);
  // words match from their start: "wing" is not inside "Brewing"
  const brewery = [{ name: 'Red Eye Brewing', address: '1 Main St, Wausau', specials: [taps] }];
  assert.equal(searchSpecials(brewery, 'wings').size, 0);
  assert.equal(searchSpecials(brewery, 'brew').size, 1);
});

test('claimOf: what an item says, without the marker', () => {
  assert.equal(claimOf('$1 off taps'), '$1 off taps');
  assert.equal(claimOf('PLACEHOLDER — time being confirmed: 80¢ boneless wings'), '80¢ boneless wings');
  assert.equal(claimOf('PLACEHOLDER — time & details being confirmed: Friday fish fry'), 'Friday fish fry');
  assert.equal(claimOf('PLACEHOLDER — being confirmed: Early bird: 1 pc fish $9.99'), 'Early bird: 1 pc fish $9.99');
  assert.equal(claimOf('PLACEHOLDER — reported: $1.75 mugs & wings Mon (confirming)'), '$1.75 mugs & wings Mon');
  assert.equal(claimOf('PLACEHOLDER — Friday fish fry being confirmed'), 'Friday fish fry');
  assert.equal(claimOf('PLACEHOLDER — $1 off house pints'), '$1 off house pints');
  assert.equal(claimOf('PLACEHOLDER — specials being confirmed'), '');
  assert.equal(claimOf('PLACEHOLDER — daily specials being confirmed with the bar'), '');
});

test('byBarName: A to Z, with "The" set aside', () => {
  const names = ['The Mill Yard', 'Arrow Sports Club', 'The Bar of Wausau', 'Nevermore on Third'].map((name) => ({ name }));
  assert.deepEqual(names.sort(byBarName).map((b) => b.name), ['Arrow Sports Club', 'The Bar of Wausau', 'The Mill Yard', 'Nevermore on Third']);
});

test('specialsToSheet: the call sheet line for each special', () => {
  assert.equal(
    specialsToSheet([
      { days: ['mon', 'tue', 'wed', 'thu'], start: '15:00', end: '18:00', type: 'drinks', items: ['$1 off all drinks', '$4 taps; cans | bottles'] },
      { days: ['tue', 'thu', 'sat', 'sun'], start: '11:00', end: '12:00', type: 'food', items: ['Brunch burger $8'] },
      { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start: '00:30', end: '23:59', type: 'both', items: ['$3 rails'] },
      { days: ['fri'], start: '16:30', end: '21:00', type: 'food', items: ['Fish fry'] },
    ]),
    [
      'Mon-Thu 3pm-6pm drinks: $1 off all drinks; $4 taps, cans / bottles',
      'Tue, Thu, Sat-Sun 11am-noon food: Brunch burger $8',
      'Daily 12:30am-midnight both: $3 rails',
      'Fri 4:30pm-9pm food: Fish fry',
    ].join('\n')
  );
});

test('viewUrl: the view, filters and search as a link, defaults left out', () => {
  const base = 'https://rowanflynnpilot.github.io/wpr-happy-hour/';
  const at = (over) => viewUrl({ view: 'now', city: 'all', type: 'all', tag: 'all', q: '', ...over });
  assert.equal(at({}), base);
  assert.equal(at({ q: 'wings' }), `${base}?q=wings`);
  assert.equal(at({ view: 'fri', city: 'Rib Mountain', type: 'food', tag: 'patio', q: 'old fashioned & $5' }), `${base}?view=fri&city=Rib+Mountain&type=food&tag=patio&q=old+fashioned+%26+%245`);
  // the finder reads its own link back
  const read = new URL(at({ view: 'all', city: 'Rib Mountain', q: 'old fashioned & $5' })).searchParams;
  assert.deepEqual([read.get('view'), read.get('city'), read.get('q')], ['all', 'Rib Mountain', 'old fashioned & $5']);
});
