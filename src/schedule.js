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
  if (mins < toMinutes(special.end)) return 'now';
  return 'done';
}

export function minutesUntil(hm, date) {
  return toMinutes(hm) - (date.getHours() * 60 + date.getMinutes());
}

// A card shows one header per window: specials sharing days + hours (a drinks
// and a food special, 11–9:30) merge, items in data order. Type is 'drinks' or
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
  return [...groups.values()].map((g) => ({ ...g, placeholder: g.items.some(isPlaceholder) }));
}

// Research placeholders carry a "PLACEHOLDER — " prefix in the data (a guessed item or
// window); cards show them muted, tagged "Placeholder", instead of the raw marker.
export const isPlaceholder = (item) => item.includes('PLACEHOLDER'); // same test as validate()
export function placeholderText(item) {
  const t = item.replace(/^PLACEHOLDER\s*(—|-|:)?\s*/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const tierRank = (bar) => (bar.tier === 'featured' ? 0 : 1);
const featuredFirst = (a, b) => tierRank(a) - tierRank(b) || a.name.localeCompare(b.name);
// Time-ordered lists sort on the earliest qualifying special, regardless of data order
const earliestStart = (specials) => Math.min(...specials.map((s) => toMinutes(s.start)));
const byTierStartName = (a, b) =>
  tierRank(a.bar) - tierRank(b.bar) ||
  earliestStart(a.specials) - earliestStart(b.specials) ||
  a.bar.name.localeCompare(b.bar.name);

// Now view: bars grouped by whether any matching special is active this minute
export function nowListings(bars, date, match) {
  const pouring = [];
  const laterToday = [];
  for (const bar of bars) {
    const qualifying = bar.specials.filter(match);
    const active = qualifying.filter((s) => specialStatus(s, date) === 'now');
    const upcoming = qualifying.filter((s) => specialStatus(s, date) === 'later');
    if (active.length > 0) pouring.push({ bar, specials: active });
    else if (upcoming.length > 0) laterToday.push({ bar, specials: upcoming });
  }
  pouring.sort((a, b) => featuredFirst(a.bar, b.bar));
  laterToday.sort(byTierStartName);
  return { pouring, laterToday };
}

// Quiet night: the earliest matching pour on the next day that has one,
// looking up to a week ahead (offset 7 = same weekday next week). Null if none.
export function nextPour(bars, date, match) {
  for (let offset = 1; offset <= 7; offset++) {
    const dayKey = DAY_KEYS[(date.getDay() + offset) % 7];
    let start = null;
    for (const bar of bars) {
      for (const s of bar.specials) {
        if (match(s) && s.days.includes(dayKey) && (start === null || toMinutes(s.start) < toMinutes(start))) {
          start = s.start;
        }
      }
    }
    if (start !== null) return { offset, dayKey, start };
  }
  return null;
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

// Newsletter spotlight: one VERIFIED partner's own small sponsored ad, built from
// its listing — its week of specials, one row per window, Monday first. Capped
// (with a line budget per row, in digest.css) so the ad stays small; the rest count as "more".
export const SPOTLIGHT_MAX_ROWS = 3;
export function spotlightFor(bar) {
  if (bar.verifiedOn === null) throw new Error(`spotlight: "${bar.id}" is not verified — unconfirmed specials never go to subscribers`);
  const firstDay = (g) => Math.min(...g.days.map((d) => WEEK_ORDER.indexOf(d)));
  const rows = groupSpecials(bar.specials).sort((a, b) => firstDay(a) - firstDay(b) || toMinutes(a.start) - toMinutes(b.start));
  return { rows: rows.slice(0, SPOTLIGHT_MAX_ROWS), more: Math.max(0, rows.length - SPOTLIGHT_MAX_ROWS) };
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
