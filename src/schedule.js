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
// window); cards show them muted, tagged "Being confirmed", instead of the raw marker.
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

// Newsletter spotlight: one partner's own ad, in the look it picked — its photo,
// logo and words (bar.ad, written with the bar at the sale from its own
// advertising), with a button naming where the ad links: the bar's site, or its
// finder listing when it has none. Real ads are for VERIFIED bars only.
// { preview: true } is the sales preview (spotlight.html?preview=<id>): a listed
// bar's ad before it's verified, for collateral and pitches — never sent to subscribers.
// rows: the board lines, each split into item and price when it ends in one
// ("12 oz Queen $42"), so a style can set it as a menu line; the rest are notes.
const PRICED = /^(.*\S)\s+(\$\d[\d,]*(?:\.\d{2})?)$/;
export function spotlightFor(bar, { preview = false } = {}) {
  if (!preview && bar.verifiedOn === null) throw new Error(`spotlight: "${bar.id}" is not verified — unconfirmed specials never go to subscribers`);
  if (bar.ad === null) throw new Error(`spotlight: "${bar.id}" has no ad copy — write its "ad" in bars.json with the bar`);
  const cta = bar.website ? `Details at ${new URL(bar.website).hostname.replace(/^www\./, '')}` : 'Details on the Happy Hour Finder';
  const rows = bar.ad.board.map((text) => {
    const m = PRICED.exec(text);
    return m ? { text, item: m[1], price: m[2] } : { text };
  });
  return { ...bar.ad, cta, rows };
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

// The newsletter card's picture of a day: its shape (dayShape), its busiest half
// hour (only when at least two bars overlap — one bar has no "busiest"), and one
// line: "First at 11 AM, busiest around 5 PM, the last until midnight." Sourced only.
export function dayAtAGlance(bars, day, match) {
  const shape = dayShape(bars, day, match);
  const windows = bars.flatMap((b) => sourcedOf(b.specials.filter((s) => match(s) && s.days.includes(day))));
  if (windows.length === 0) return { shape, peakAt: null, text: '' };
  const first = Math.min(...windows.map((s) => toMinutes(s.start)));
  const last = Math.max(...windows.map((s) => endMinutes(s.end)));
  const top = Math.max(...shape);
  const peakAt = top >= 2 ? SHAPE_START + shape.indexOf(top) * SHAPE_STEP : null;
  const t = (m) => unbroken(fmtTime(hmOf(m)));
  const text =
    peakAt === null ? `From ${t(first)} until ${t(last)}.` : `First at ${t(first)}, busiest around ${t(peakAt)}, the last until ${t(last)}.`;
  return { shape, peakAt, text };
}

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

// Days when a usual schedule can't be trusted: many bars close or keep short
// hours. The finder says so instead of "pouring right now". Fixed dates plus
// Thanksgiving (the fourth Thursday of November); the name, or null.
export function holidayOn(date) {
  const [m, d] = [date.getMonth() + 1, date.getDate()];
  if (m === 11 && date.getDay() === 4 && d >= 22 && d <= 28) return 'Thanksgiving';
  if (m === 12 && d === 24) return 'Christmas Eve';
  if (m === 12 && d === 25) return 'Christmas Day';
  if (m === 1 && d === 1) return "New Year's Day";
  return null;
}

// The holidays in the `days` days from `from`, as [{ date: 'YYYY-MM-DD', name }]:
// the dates the newsletter leaves the day card out (digest.json's "skip"). The card
// is one image per weekday with no date on it, so it can't say "hours vary" itself.
export function holidaysAhead(from, days) {
  const out = [];
  for (let i = 0; i <= days; i++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const name = holidayOn(date);
    if (name) out.push({ date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, name });
  }
  return out;
}

// Sunset in Wausau on the visitor's calendar date, as a Date — NOAA's short solar
// formula, good to a few minutes; no timezone library, the result is an instant.
const WAUSAU = { lat: 44.96, lon: -89.63 };
export function sunsetAt(date) {
  const [y, m, d] = [date.getFullYear(), date.getMonth(), date.getDate()];
  const dayOfYear = Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86_400_000);
  const g = (2 * Math.PI * dayOfYear) / 365;
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const rad = Math.PI / 180;
  const hourAngle = Math.acos(Math.cos(90.833 * rad) / (Math.cos(WAUSAU.lat * rad) * Math.cos(decl)) - Math.tan(WAUSAU.lat * rad) * Math.tan(decl)) / rad;
  const utcMinutes = 720 - 4 * (WAUSAU.lon - hourAngle) - eqTime;
  return new Date(Date.UTC(y, m, d) + utcMinutes * 60_000);
}

// The hero's light: late (10 PM–4 AM), the golden hour (90 minutes before
// Wausau's sunset to 30 after — 4:30 in December, 8:45 in June), evening after
// it, day before it
export function phaseOf(date) {
  const h = date.getHours();
  if (h >= 22 || h < 4) return 'late';
  const sinceSunset = (date - sunsetAt(date)) / 60_000;
  return sinceSunset >= 30 ? 'evening' : sinceSunset >= -90 ? 'golden' : 'day';
}

// A listing's own link: this page, opened at the bar. Switch LISTING_BASE to the
// WordPress page's URL at launch (LAUNCH.md) — its snippet forwards ?bar= into the
// frame. source says where the visit came from (the printed table tent's QR code),
// as utm_source, which Plausible reports.
const LISTING_BASE = 'https://rowanflynnpilot.github.io/wpr-happy-hour/';
export const listingUrl = (bar, source) => `${LISTING_BASE}?bar=${bar.id}${source ? `&utm_source=${source}` : ''}`;

// A link to what the reader is looking at: the view, filters and search as the
// finder's own deep-link parameters, leaving out whatever is at its default
// ("now", "all", no search). The finder reads them back at load.
export function viewUrl({ view, city, type, tag, q }) {
  const params = new URLSearchParams();
  if (view !== 'now') params.set('view', view);
  if (city !== 'all') params.set('city', city);
  if (type !== 'all') params.set('type', type);
  if (tag !== 'all') params.set('tag', tag);
  if (q) params.set('q', q);
  const query = params.toString();
  return `${LISTING_BASE}${query ? `?${query}` : ''}`;
}

// What readers do on a listing, counted per bar for the partner report (Plausible
// custom events; scripts/partner-report.mjs reads them back). Each event carries
// the listing's link with the action as its fragment in the "url" property —
// the one property Plausible shows and exports on every plan (a "bar" property
// would need the Business plan). The event names are the goals to create in
// Plausible's site settings.
export const LISTING_EVENTS = {
  website: 'Listing Website', // tapped through to the bar's own site
  directions: 'Listing Directions',
  save: 'Listing Saved',
  share: 'Listing Shared',
  calendar: 'Listing Calendar',
  opened: 'Listing Opened', // arrived by the bar's own link
  'opened-tent': 'Listing Opened', // ...by scanning its table tent
};
export const actionUrl = (bar, action) => `${listingUrl(bar)}#${action}`;
// The reverse: a "url" value from an export → { barId, action }, or null when it
// isn't one of ours (an outbound link, say)
export function parseActionUrl(url) {
  const m = /[?&]bar=([a-z0-9-]+)#([a-z-]+)$/.exec(url);
  return m && url.startsWith(LISTING_BASE) && m[2] in LISTING_EVENTS ? { barId: m[1], action: m[2] } : null;
}

// The visitor's calendar date as YYYY-MM-DD (local, like every time in the finder)
export const ymdOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Thanksgiving's day of the month: the fourth Thursday of November
const thanksgiving = (year) => 22 + ((11 - new Date(year, 10, 1).getDay()) % 7);

// Seasonal tags show only in season, so nobody has to remember to take them down:
//   game-day        while a Packers game is still ahead on the schedule (packers.json)
//   tom-and-jerrys  November 20 through January 5
//   hunters         Wisconsin's nine-day gun deer season: the Saturday before
//                   Thanksgiving through the Sunday after it
// Every other tag is always in season.
export function tagInSeason(tag, date, games) {
  const [m, d] = [date.getMonth() + 1, date.getDate()];
  if (tag === 'game-day') return games.some((g) => g.date >= ymdOf(date));
  if (tag === 'tom-and-jerrys') return (m === 11 && d >= 20) || m === 12 || (m === 1 && d <= 5);
  if (tag === 'hunters') {
    const t = thanksgiving(date.getFullYear());
    return m === 11 && d >= t - 5 && d <= t + 3;
  }
  return true;
}

// Today's Packers game, if there is one, and the hero's line for it
export const gameOn = (games, date) => games.find((g) => g.date === ymdOf(date)) ?? null;
export const gameLine = (game) =>
  `Packers ${game.home ? 'vs.' : 'at'} the ${game.opponent} today${game.kickoff ? `, ${unbroken(fmtTime(game.kickoff))} kickoff` : ''}.`;

// Sales contact: Chris Weber owns the listing pipeline (the finder's footer, the
// listing check page)
export const CHRIS_EMAIL = 'weber.chris@wausaupilotandreview.com';

// A to Z, the way a reader looks a bar up: "The Bar of Wausau" files under B
const sortName = (bar) => bar.name.replace(/^the\s+/i, '');
export const byBarName = (a, b) => sortName(a).localeCompare(sortName(b));

// Search: the reader's words against a bar's name and address and the wording of
// its sourced specials. Folded so "oliva's" finds "Oliva’s" and "jalapeno" finds
// "jalapeño"; "$3" and "2-for-1" keep their characters.
const foldText = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9$]+/g, ' ')
    .trim();

// What an item actually claims. A sourced item is its own claim. A guessed one is
// its marker's claim with the marker's own words taken off:
//   "PLACEHOLDER — time being confirmed: 80¢ boneless wings" → "80¢ boneless wings"
//   "PLACEHOLDER — Friday fish fry being confirmed"          → "Friday fish fry"
//   "PLACEHOLDER — specials being confirmed"                 → "" (it claims nothing)
// Search matches a guess only by this (it still shows as "Being confirmed"), and the
// listing check page puts it to the owner as the thing to correct.
export function claimOf(item) {
  if (!isPlaceholder(item)) return item;
  const claim = item
    .replace(/^PLACEHOLDER\s*(—|-|:)?\s*/, '')
    .replace(/^[^:$\d]*\b(being confirmed|reported):\s*/i, '')
    .replace(/\s*\(confirming\)$/i, '')
    .replace(/\s*being confirmed\b.*$/i, '');
  return /^((daily|drink|food|happy hour) )*(specials|deals|happy hour)$/i.test(claim) ? '' : claim;
}

// The specials a search keeps, as a Set — or null when the query is blank (no
// search). A special is kept when every word is in its bar's name or address or in
// its own items: "wings" keeps the wing nights, "wausau wings" the ones in Wausau,
// and a bar's name keeps its whole listing. Words match from their start, so
// "wing" is not found inside "Brewing", and a plural finds its singular ("wings"
// finds "wing & rib buffet").
export function searchSpecials(bars, query) {
  const words = foldText(query).split(' ').filter(Boolean).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w));
  if (words.length === 0) return null;
  const hits = new Set();
  for (const bar of bars) {
    const where = foldText(`${bar.name} ${bar.address}`).split(' ');
    for (const s of bar.specials) {
      const what = foldText(s.items.map(claimOf).join(' ')).split(' ');
      if (words.every((w) => where.some((t) => t.startsWith(w)) || what.some((t) => t.startsWith(w)))) hits.add(s);
    }
  }
  return hits;
}

// Specials written the way the call sheet's "Verified specials (final)" column
// reads them (parseSpecials in scripts/apply-calls.mjs), one per line:
//   Mon-Thu 3pm-6pm drinks: $1 off all drinks; $4 old fashioneds
// The listing check page puts these in the owner's email, so Chris pastes them
// into the sheet instead of retyping them. ";" and "|" are the format's own
// separators, so an item's own are swapped out.
const sheetTime = (hm) => {
  if (hm === '12:00') return 'noon';
  if (hm === '23:59') return 'midnight';
  const [h, m] = hm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};
const sheetDays = (days) => {
  if (days.length === 7) return 'Daily';
  const runs = [];
  for (const i of days.map((d) => WEEK_ORDER.indexOf(d)).sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => (a === b ? DAY_LABELS[WEEK_ORDER[a]] : `${DAY_LABELS[WEEK_ORDER[a]]}-${DAY_LABELS[WEEK_ORDER[b]]}`)).join(', ');
};
export const specialsToSheet = (specials) =>
  specials
    .map((s) => `${sheetDays(s.days)} ${sheetTime(s.start)}-${sheetTime(s.end)} ${s.type}: ${s.items.map((i) => i.replaceAll(';', ',').replaceAll('|', '/').trim()).join('; ')}`)
    .join('\n');
