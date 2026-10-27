// Time + listing logic shared by the app (App.jsx), the newsletter card
// (digest.jsx) and the image renderer (scripts/render-digest.mjs). Pure
// functions only — unit-tested in schedule.test.js (npm test).
import { DAY_KEYS, toMinutes } from './data/validate.js';

export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const WEEKDAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function weekdayLabel(key) {
  return WEEKDAY_NAMES[key];
}

// ["mon","tue","wed","thu","fri"] → "Mon–Fri"; non-consecutive runs join with ' · '
export function fmtDays(days) {
  const idx = days.map((d) => WEEK_ORDER.indexOf(d)).sort((a, b) => a - b);
  const runs = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs
    .map(([a, b]) => (a === b ? DAY_LABELS[WEEK_ORDER[a]] : `${DAY_LABELS[WEEK_ORDER[a]]}–${DAY_LABELS[WEEK_ORDER[b]]}`))
    .join(' · ');
}

export function fmtTime(hm) {
  // 23:59 is how the data caps a window that runs past midnight (no cross-midnight windows)
  if (hm === '23:59') return 'midnight';
  const [h, m] = hm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export const fmtWindow = (special) => `${fmtTime(special.start)}–${fmtTime(special.end)}`;

// For tight columns: no-break spaces, so "5:30 PM" never splits and a window can
// only wrap at its dash (never "2:30 PM–5:30 / PM")
export const unbroken = (text) => text.replaceAll(' ', '\u00a0');

// One bar's windows for a day, in time order, each once — drinks and food
// specials often share a window (3–6)
export function fmtWindows(specials, sep = ', ') {
  const sorted = [...specials].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return [...new Set(sorted.map(fmtWindow))].join(sep);
}

// Status of one special relative to a Date: 'now' | 'later' | 'done' | null (not today).
// Start inclusive, end exclusive.
export function specialStatus(special, date) {
  const today = DAY_KEYS[date.getDay()];
  if (!special.days.includes(today)) return null;
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins < toMinutes(special.start)) return 'later';
  if (mins < endMinutes(special.end)) return 'now';
  return 'done';
}

// An end of 23:59 is the data's "midnight" (no cross-midnight windows), so it ends
// at 24:00: still on at 11:59 PM, and the countdown at 11:30 says 30 min, not 29
const endMinutes = (hm) => (hm === '23:59' ? 1440 : toMinutes(hm));

export function minutesUntil(hm, date) {
  return endMinutes(hm) - (date.getHours() * 60 + date.getMinutes());
}

// A card shows one header per window: specials sharing days + hours (a drinks
// and a food special, 11–9:30) merge, items in data order, windows in time order. Type is 'drinks' or
// 'food' when all agree, else 'both'. placeholder: any item is a PLACEHOLDER.
export function groupSpecials(specials) {
  const groups = new Map();
  for (const s of specials) {
    const key = `${s.days.join(',')}|${s.start}|${s.end}`;
    const g = groups.get(key);
    if (g) {
      g.items.push(...s.items);
      if (g.type !== s.type) g.type = 'both';
    } else groups.set(key, { days: s.days, start: s.start, end: s.end, type: s.type, items: [...s.items] });
  }
  // Windows in time order — data order put "2:30–5:30 PM" above "11 AM–11 PM"
  return [...groups.values()]
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end))
    .map((g) => ({ ...g, placeholder: g.items.some(isPlaceholder) }));
}

// Research placeholders carry a "PLACEHOLDER — " prefix in the data (a guessed item or
// window); cards show them muted, tagged "Placeholder", instead of the raw marker.
export const isPlaceholder = (item) => item.includes('PLACEHOLDER'); // same test as validate()
export function placeholderText(item) {
  const t = item.replace(/^PLACEHOLDER\s*(—|-|:)?\s*/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// A listing's sourced specials: its own advertising or a call, never a research
// guess. Only these are counted, timed or stated as fact; a listing with none is
// shown as "being confirmed".
export const sourcedOf = (specials) => specials.filter((s) => !s.items.some(isPlaceholder));
export const isConfirmed = ({ specials }) => sourcedOf(specials).length > 0;

export const tierRank = (bar) => (bar.tier === 'featured' ? 0 : 1);
const featuredFirst = (a, b) => tierRank(a) - tierRank(b) || a.name.localeCompare(b.name);
// Time-ordered lists sort on the earliest qualifying special, regardless of data order
const earliestStart = (specials) => Math.min(...specials.map((s) => toMinutes(s.start)));
const byTierStartName = (a, b) =>
  tierRank(a.bar) - tierRank(b.bar) ||
  earliestStart(a.specials) - earliestStart(b.specials) ||
  a.bar.name.localeCompare(b.bar.name);

// Now view: bars grouped by whether any matching special is active this minute.
// Sourced specials decide first: a bar whose confirmed happy hour starts at 5 is
// "later today", even while a guessed special of its would be on now.
export function nowListings(bars, date, match) {
  const pouring = [];
  const laterToday = [];
  for (const bar of bars) {
    const qualifying = bar.specials.filter(match);
    const active = qualifying.filter((s) => specialStatus(s, date) === 'now');
    const upcoming = qualifying.filter((s) => specialStatus(s, date) === 'later');
    if (sourcedOf(active).length > 0) pouring.push({ bar, specials: active });
    else if (sourcedOf(upcoming).length > 0) laterToday.push({ bar, specials: upcoming });
    else if (active.length > 0) pouring.push({ bar, specials: active });
    else if (upcoming.length > 0) laterToday.push({ bar, specials: upcoming });
  }
  pouring.sort((a, b) => featuredFirst(a.bar, b.bar));
  laterToday.sort(byTierStartName);
  return { pouring, laterToday };
}

// What's next after today: the next day (1–7 ahead; 7 = same weekday next week)
// with a sourced matching special — its bars, first to start first (then by name).
// Feeds the Now view's closing line and its quiet state. Null if none all week.
export function nextDay(bars, date, match) {
  for (let offset = 1; offset <= 7; offset++) {
    const dayKey = DAY_KEYS[(date.getDay() + offset) % 7];
    const openers = bars
      .map((bar) => ({ bar, specials: sourcedOf(bar.specials.filter((s) => match(s) && s.days.includes(dayKey))) }))
      .filter((e) => e.specials.length > 0)
      .map(({ bar, specials }) => ({ bar, start: hmOf(Math.min(...specials.map((s) => toMinutes(s.start)))) }))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.bar.name.localeCompare(b.bar.name));
    if (openers.length > 0) return { offset, dayKey, openers };
  }
  return null;
}

// The day's shape, for the hero: how many bars have a sourced matching special
// running at each half hour from 10 AM to midnight (28 counts, the rows' axis)
export const SHAPE_START = 10 * 60;
export const SHAPE_STEP = 30;
export function dayShape(bars, dayKey, match) {
  const counts = Array.from({ length: (24 * 60 - SHAPE_START) / SHAPE_STEP }, () => 0);
  for (const bar of bars) {
    const windows = sourcedOf(bar.specials.filter((s) => match(s) && s.days.includes(dayKey)));
    counts.forEach((_, i) => {
      const t = SHAPE_START + i * SHAPE_STEP;
      if (windows.some((s) => toMinutes(s.start) <= t && t < endMinutes(s.end))) counts[i] += 1;
    });
  }
  return counts;
}

// Day view: every bar with a matching special on `day`, featured first, then start, then name
export function dayListings(bars, day, match) {
  return bars
    .map((bar) => ({ bar, specials: bar.specials.filter((s) => match(s) && s.days.includes(day)) }))
    .filter((e) => e.specials.length > 0)
    .sort(byTierStartName);
}

// Newsletter card for one weekday. VERIFIED bars only — placeholder or unconfirmed
// specials never go out to subscribers. Featured partners get full entries (capped;
// overflow featured still lead the name list), everyone else gets a name + time line.
export const DIGEST_MAX_FEATURED = 3;
export const DIGEST_MAX_LISTED = 8;
export function digestFor(bars, day) {
  const listings = dayListings(bars.filter((b) => b.verifiedOn !== null), day, () => true);
  const featured = listings.filter((l) => l.bar.tier === 'featured').slice(0, DIGEST_MAX_FEATURED);
  const rest = listings.filter((l) => !featured.includes(l));
  return {
    count: listings.length,
    featured,
    listed: rest.slice(0, DIGEST_MAX_LISTED),
    more: Math.max(0, rest.length - DIGEST_MAX_LISTED),
  };
}

// The card's "also today" list as a schedule: partners grouped under the time
// their first window starts, each with when that window ends and any later
// windows that day. Groups run in time order; rows keep digestFor's order
// (featured overflow first) within a group. Shared windows (a drinks and a food
// special, 3–6) count once.
export function digestSchedule(listed) {
  const groups = [];
  for (const { bar, specials } of listed) {
    const windows = [...new Map(specials.map((s) => [`${s.start}|${s.end}`, s])).values()].sort(
      (a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end)
    );
    const [first, ...rest] = windows;
    // "until X, then Y" only reads right for windows after the first one ends; a
    // happy hour inside an all-day special doesn't become a misleading "then"
    const later = rest.filter((w) => toMinutes(w.start) >= toMinutes(first.end));
    let group = groups.find((g) => g.start === first.start);
    if (!group) groups.push((group = { start: first.start, rows: [] }));
    group.rows.push({ bar, end: first.end, later });
  }
  return groups.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

// Newsletter spotlight: one partner's own ad in WPR's house ad style — its photo,
// logo and words (bar.ad, written with the bar at the sale from its own
// advertising), with a button naming where the ad links: the bar's site, or its
// finder listing when it has none. Real ads are for VERIFIED bars only.
// { preview: true } is the sales preview (spotlight.html?preview=<id>): a listed
// bar's ad before it's verified, for collateral and pitches — never sent to subscribers.
export function spotlightFor(bar, { preview = false } = {}) {
  if (!preview && bar.verifiedOn === null) throw new Error(`spotlight: "${bar.id}" is not verified — unconfirmed specials never go to subscribers`);
  if (bar.ad === null) throw new Error(`spotlight: "${bar.id}" has no ad copy — write its "ad" in bars.json with the bar`);
  const cta = bar.website ? `Details at ${new URL(bar.website).hostname.replace(/^www\./, '')}` : 'Details on the Happy Hour Finder';
  return { ...bar.ad, cta };
}

// Paid outbound links (bar websites, the presenting sponsor). The links carry
// rel="noreferrer", so without UTM tags a partner's own analytics would file
// WPR's referrals under "direct" — these tags are their renewal evidence.
// medium says where the click came from: 'widget' (the app) or 'newsletter'.
// validate() guarantees the URL parses.
export function trackedUrl(url, medium = 'widget') {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'wausaupilotandreview');
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', 'happy-hour');
  return u.href;
}

// The finder's timetable: a list grouped under one time each — when the happy
// hour ends (Now: "Until 8 PM") or starts (later and day views: "From 4 PM") —
// in time order. A row is placed by its sourced specials (by its guessed ones only
// when it has none), and each group keeps confirmed rows apart from the ones still
// being confirmed, which the finder folds away. Rows keep their order.
export const endsAt = ({ specials }) => Math.max(...specials.map((s) => endMinutes(s.end)));
export const startsAt = ({ specials }) => Math.min(...specials.map((s) => toMinutes(s.start)));
export function timetable(entries, keyFn) {
  const groups = new Map();
  for (const e of entries) {
    const sourced = sourcedOf(e.specials);
    const k = keyFn({ specials: sourced.length > 0 ? sourced : e.specials });
    if (!groups.has(k)) groups.set(k, { minutes: k, confirmed: [], guessed: [] });
    groups.get(k)[sourced.length > 0 ? 'confirmed' : 'guessed'].push(e);
  }
  return [...groups.values()].sort((a, b) => a.minutes - b.minutes);
}

// Minutes since midnight → "HH:MM" for fmtTime (1440 is the data's midnight)
export const hmOf = (m) => (m >= 1440 ? '23:59' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

// The hero's second line: what the list means right now. Sourced windows only —
// a PLACEHOLDER time is never stated as fact. '' when there's nothing to say.
export function heroFinding(pouring, laterToday) {
  const sourced = (list) => list.filter(isConfirmed).map(({ bar, specials }) => ({ bar, specials: sourcedOf(specials) }));
  const names = (list) =>
    list.length <= 2 ? list.map((e) => e.bar.name).join(' and ') : `${list[0].bar.name}, ${list[1].bar.name} and ${list.length - 2} more`;
  const parts = [];
  const p = sourced(pouring);
  const l = sourced(laterToday);
  if (p.length === 1 && l.length === 0) {
    parts.push(`The last one going: ${p[0].bar.name}, until ${unbroken(fmtTime(hmOf(endsAt(p[0]))))}.`);
  } else if (p.length) {
    const soonest = Math.min(...p.map(endsAt));
    parts.push(`First to wrap up: ${names(p.filter((e) => endsAt(e) === soonest))}, at ${unbroken(fmtTime(hmOf(soonest)))}.`);
  }
  if (l.length) {
    const next = Math.min(...l.map(startsAt));
    parts.push(`Next to start: ${names(l.filter((e) => startsAt(e) === next))}, at ${unbroken(fmtTime(hmOf(next)))}.`);
  }
  return parts.join(' ');
}

// "Add to calendar": a bar's weekly specials as repeating events (RFC 5545), in
// the reader's local time (floating — no timezone library), sourced specials
// only: a guessed window never lands in someone's calendar. null if none.
const ICS_DAY = { sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA' };
export function icsFor(bar, date) {
  const windows = groupSpecials(bar.specials).filter((g) => !g.placeholder);
  if (!windows.length) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const at = (hm) => `${hm.replace(':', '')}00`;
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  // Lines over 75 octets fold onto a continuation line (a leading space)
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (new TextEncoder().encode(rest).length > 74) {
      let cut = 70;
      while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
      out.push(rest.slice(0, cut));
      rest = ` ${rest.slice(cut)}`;
    }
    return [...out, rest].join('\r\n');
  };
  const stamp = `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const events = windows.flatMap((g, i) => {
    // The first day on or after today that this window runs
    let first = null;
    for (let off = 0; off < 7 && !first; off++) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + off);
      if (g.days.includes(DAY_KEYS[d.getDay()])) first = d;
    }
    return [
      'BEGIN:VEVENT',
      `UID:${bar.id}-${i}@happy-hour-finder.wausaupilotandreview.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ymd(first)}T${at(g.start)}`,
      `DTEND:${ymd(first)}T${at(g.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${g.days.map((d) => ICS_DAY[d]).join(',')}`,
      `SUMMARY:${esc(`${bar.name}: ${g.type === 'food' ? 'food special' : 'happy hour'}`)}`,
      `LOCATION:${esc(`${bar.address}, WI`)}`,
      `DESCRIPTION:${esc(`${g.items.join(' · ')}\nFrom Wausau Pilot & Review's Happy Hour Finder. Specials can change — check with the bar.`)}`,
      'END:VEVENT',
    ];
  });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wausau Pilot & Review//Happy Hour Finder//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
