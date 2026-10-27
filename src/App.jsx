import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import data from './data/bars.json';
// Schema lives in validate.js — shared with scripts/check-data.mjs so CI
// rejects bad data before it can deploy. The app still throws at load.
import { DAY_KEYS, TAGS, toMinutes, validate } from './data/validate.js';
// Time + listing logic is shared with the newsletter card and unit-tested
import {
  DAY_LABELS,
  WEEK_ORDER,
  dayListings,
  dayShape,
  endsAt,
  fmtDays,
  fmtTime,
  fmtWindow,
  groupSpecials,
  heroFinding,
  hmOf,
  icsFor,
  isConfirmed,
  isPlaceholder,
  minutesUntil,
  nextDay,
  nowListings,
  placeholderText,
  sourcedOf,
  specialStatus,
  startsAt,
  timetable,
  trackedUrl,
  unbroken,
  weekdayLabel,
} from './schedule.js';
// The day's axis and skyline, the verified seal, the arrow — shared with the newsletter card
import { Arrow, Axis, DayShape, Seal, onAxis, pctOf, spanOf } from './marks.jsx';

/* ---------------- */
/* Data (validated) */
/* ---------------- */

const DATA = validate(data);
const CITIES = [...new Set(DATA.bars.map((b) => b.city))].sort();
// The tag filter offers only tags some listing actually has (Chris collects them)
const TAGS_IN_USE = Object.keys(TAGS).filter((t) => DATA.bars.some((b) => b.tags.includes(t)));

// Deep links: ?view=fri&city=Weston&type=food&tag=patio&bar=red-eye-brewing — read
// once at load, no router. Unlike curated data, params arrive from outside (article
// links, embeds, bars' own socials), so invalid values fall back to defaults
// instead of throwing.
const PARAMS = new URLSearchParams(window.location.search);
const INITIAL_BAR = DATA.bars.some((b) => b.id === PARAMS.get('bar')) ? PARAMS.get('bar') : null;
const INITIAL_VIEW = ['now', ...DAY_KEYS].includes(PARAMS.get('view'))
  ? PARAMS.get('view')
  : INITIAL_BAR
    ? viewForBar(INITIAL_BAR)
    : 'now';

// ?bar= without ?view=: land on a view where that bar is actually visible — today
// or the next day it has a sourced special (the day view still shows a special
// that already ended; the Now view would not), else the next day it appears.
function viewForBar(barId) {
  const { specials } = DATA.bars.find((b) => b.id === barId);
  const todayIdx = WEEK_ORDER.indexOf(DAY_KEYS[new Date().getDay()]);
  const days = WEEK_ORDER.map((_, off) => WEEK_ORDER[(todayIdx + off) % 7]);
  const runs = (list) => days.find((d) => list.some((s) => s.days.includes(d)));
  // runs(specials) always finds one — the validator guarantees ≥1 special with ≥1 day
  return runs(sourcedOf(specials)) ?? runs(specials);
}
const INITIAL_CITY = CITIES.includes(PARAMS.get('city')) ? PARAMS.get('city') : 'all';
const INITIAL_TYPE = ['drinks', 'food'].includes(PARAMS.get('type')) ? PARAMS.get('type') : 'all';
const INITIAL_TAG = TAGS_IN_USE.includes(PARAMS.get('tag')) ? PARAMS.get('tag') : 'all';

// Derived from public address only — contact info stays in the Notion CRM
const mapsUrl = (bar) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bar.name}, ${bar.address} WI`)}`;

// Sales contact — Chris Weber owns the listing pipeline; billing never touches the tool.
// The address is also shown as text in the footer: on a desktop with no mail app a
// mailto: click does nothing, and the reader needs something to copy.
const CHRIS_EMAIL = 'weber.chris@wausaupilotandreview.com';
const CONTACT_LISTING = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20listing`;
const CONTACT_SPONSOR = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20sponsorship`;
const CONTACT_CORRECTION = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20correction`;
// Per listing: lands with Chris as a call-list item; nothing a reader reports is
// published until he confirms it with the bar
const reportUrl = (bar) =>
  `mailto:${CHRIS_EMAIL}?subject=${encodeURIComponent(`Happy Hour Finder: change at ${bar.name}`)}&body=${encodeURIComponent(
    `What's changed at ${bar.name}?\n\n`
  )}`;

// Sibling reader guide, live since July 2026 — cross-promoted on Fridays only
const FISH_FRY_URL = 'https://wausaupilotandreview.com/wausau-area-fish-fry-guide/';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymdParts = (ymd) => ymd.split('-').map(Number);
// "2026-07-11" → "Jul 2026" — month precision so a phone check doesn't read stale by Friday
const fmtMonth = (ymd) => `${MONTHS[ymdParts(ymd)[1] - 1]} ${ymdParts(ymd)[0]}`;
// "2026-10-26" → "Oct 26" — a source check is dated to the day
const fmtDay = (ymd) => `${MONTHS[ymdParts(ymd)[1] - 1]} ${ymdParts(ymd)[2]}`;
const daysSince = (ymd, now) => (now - new Date(`${ymd}T00:00:00`)) / 86_400_000;
// Past this, a listing says it may have changed (check-data warns Chris at the same age)
const STALE_DAYS = 90;
const CHECKED_FROM = { website: "the bar's website", facebook: "the bar's Facebook", instagram: "the bar's Instagram" };

// How fresh a listing is, said plainly on every row: phone-verified, or where its
// specials came from and when they were last checked. Old checks look old.
function freshness(bar, now) {
  if (bar.verifiedOn) return { text: `Verified by phone, ${fmtMonth(bar.verifiedOn)}`, stale: daysSince(bar.verifiedOn, now) > STALE_DAYS, verified: true };
  if (bar.checked) {
    const stale = daysSince(bar.checked.on, now) > STALE_DAYS;
    return { text: `From ${CHECKED_FROM[bar.checked.via]}, ${stale ? fmtMonth(bar.checked.on) : `checked ${fmtDay(bar.checked.on)}`}`, stale };
  }
  return null; // research guesses only: their "Being confirmed" tags say so
}

// "Add to calendar": the bar's weekly specials as a repeating calendar file, made
// in the browser — the reader's own calendar becomes the reminder
function addToCalendar(bar) {
  const url = URL.createObjectURL(new Blob([icsFor(bar, new Date())], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${bar.id}-specials.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Brings an element to the top of the reader's screen, 16px clear. Standalone, the
// page scrolls. In the WordPress iframe — sized to its content, so it can't scroll
// itself — the parent page does, from the anchor in a height report (README snippet).
function bringIntoView(el) {
  if (window.parent === window) return el.scrollIntoView({ block: 'start' }); // CSS scroll-margin-top keeps the 16px
  const anchor = Math.round(el.getBoundingClientRect().top + window.scrollY) - 16;
  window.parent.postMessage({ type: 'wpr-hh-height', height: document.body.scrollHeight, anchor }, '*');
}

// The hero's light follows the clock: day, the golden hour, evening, late night
function phaseOf(date) {
  const h = date.getHours();
  return h >= 22 || h < 4 ? 'late' : h >= 19 ? 'evening' : h >= 15 ? 'golden' : 'day';
}

// The hero count rolls to its new value when a filter or the clock moves it — the
// finder's one authored motion, exponential ease-out. Reduced motion: it just changes.
function useRolling(value) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  shownRef.current = shown;
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return undefined;
    }
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 700);
      setShown(Math.round(from + (value - from) * (p === 1 ? 1 : 1 - 2 ** (-10 * p))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/* ---------------- */
/* Components       */
/* ---------------- */

// In a window's last 15 minutes the clock becomes the news: "Last call"
const LAST_CALL = 15;

// The section and the time group already say "pouring now" / "from 8 PM", so a
// chip on every row would be noise. Only the last hour is news — and only for a
// sourced window: a guessed end never counts down.
function StatusChip({ group, now }) {
  if (group.placeholder || specialStatus(group, now) !== 'now') return null;
  const left = minutesUntil(group.end, now);
  if (left <= LAST_CALL) return <span className="chip chip-lastcall">Last call · {left} min</span>;
  return left <= 60 ? <span className="chip chip-now">{left} min left</span> : null;
}

// The glass and fork marks are drawn, so screen readers hear the word instead
const TYPE_WORDS = { drinks: 'Drinks', food: 'Food', both: 'Food and drinks' };

// One window (days + hours) of a bar's specials; see groupSpecials(). In a day
// view every special runs that day, so its days only say something when it
// also runs on others ("Tue · Thu · Sat–Sun"), not a "Sat" on every row — except
// on a linked card, which may be read with the day's heading scrolled away.
function SpecialRow({ group, now, showDays, allDays }) {
  return (
    <div className="special">
      <div className="special-meta">
        <span className={`type-icon type-${group.type}`} aria-hidden="true" />
        <span className="sr-only">{TYPE_WORDS[group.type]}:</span>
        {(allDays || (showDays && group.days.length > 1)) && <span className="special-days mono">{fmtDays(group.days)}</span>}
        <span className="special-time mono">{unbroken(fmtWindow(group))}</span>
        {now && <StatusChip group={group} now={now} />}
        {group.placeholder && <span className="chip chip-placeholder">Being confirmed</span>}
      </div>
      <ul className="special-items">
        {group.items.map((item, i) =>
          isPlaceholder(item) ? (
            <li key={i} className="item-placeholder">{placeholderText(item)}</li>
          ) : (
            <li key={i}>{item}</li>
          )
        )}
      </ul>
    </div>
  );
}

// The evening axis under each bar, 10 AM to midnight: its windows drawn on it,
// the part already gone dimmed, and the same "now" line at the same spot on
// every row — "how long do I have here?" is seen at scroll speed, not read
const endOf = (hm) => (hm === '23:59' ? 1440 : toMinutes(hm));
const minuteOf = (date) => (date ? date.getHours() * 60 + date.getMinutes() : null);

function Track({ specials, now }) {
  const nowMin = minuteOf(now);
  const windows = [...new Map(specials.map((s) => [`${s.start}|${s.end}`, s])).values()];
  return (
    <div className="track" aria-hidden="true">
      {windows.map((s, i) => {
        const a = toMinutes(s.start);
        const b = endOf(s.end);
        const cut = nowMin === null ? a : Math.min(Math.max(nowMin, a), b);
        // the sliver that's left of a sourced window in its last call burns brighter
        const lastCall = nowMin !== null && !s.items.some(isPlaceholder) && nowMin >= a && b - nowMin <= LAST_CALL;
        return (
          <Fragment key={i}>
            {cut > a && <span className="track-fill track-past" style={{ left: pctOf(a), width: spanOf(a, cut) }} />}
            {b > cut && <span className={`track-fill${lastCall ? ' last-call' : ''}`} style={{ left: pctOf(cut), width: spanOf(cut, b) }} />}
          </Fragment>
        );
      })}
      {onAxis(nowMin) && <span className="track-now" style={{ left: pctOf(nowMin) }} />}
    </div>
  );
}

// A timetable row, not a pinned card. Featured keeps the evening ground and
// its photo (the featured perk) and leads every list. Bar names are h3 beside
// a list's featured rows, h4 inside a time group (its time is the h3).
function BarCard({ bar, specials, now, showDays, trackNow, linked, level }) {
  const featured = bar.tier === 'featured';
  const fresh = freshness(bar, trackNow ?? new Date());
  const calendar = groupSpecials(bar.specials).some((g) => !g.placeholder);
  const [saved, setSaved] = useState(false);
  const Name = `h${level}`;
  return (
    <article
      id={`bar-${bar.id}`}
      className={`card${featured ? ' card-featured' : ''}${featured && bar.photo ? ' has-photo' : ''}${linked ? ' card-linked' : ''}`}
    >
      {featured && bar.photo && (
        <img
          className="card-photo"
          src={bar.photo}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.hidden = true)} // a photo that fails shouldn't leave a broken-image icon
        />
      )}
      <header className={`card-head${fresh?.verified ? ' has-seal' : ''}`}>
        {/* tabIndex -1: a deep link or a "next up" jump moves focus here */}
        <Name className="card-name" tabIndex={-1}>
          {bar.website ? (
            // Every listing is paid — rel="sponsored" is the disclosure to search engines
            <a href={trackedUrl(bar.website)} target="_blank" rel="noopener noreferrer sponsored">
              {bar.name}
            </a>
          ) : (
            bar.name
          )}
        </Name>
        <p className="card-address">
          {bar.address /* ends with the town — validate() enforces it */}
          {featured && (
            <>
              {' · '}
              <a href={mapsUrl(bar)} target="_blank" rel="noopener noreferrer">
                Directions
              </a>
            </>
          )}
        </p>
        {featured && <p className="card-tier">Featured partner</p>}
        {bar.tags.length > 0 && <p className="card-tags">{bar.tags.map((t) => TAGS[t]).join(' · ')}</p>}
        {fresh?.verified && <Seal />}
      </header>
      <div className="card-specials">
        {groupSpecials(specials).map((g, i) => (
          <SpecialRow key={i} group={g} now={now} showDays={showDays} allDays={linked} />
        ))}
        {bar.note && <p className="card-note">{bar.note}</p>}
        <Track specials={specials} now={trackNow} />
        <div className="card-meta">
          {fresh && (
            <p className={`card-fresh${fresh.verified ? ' verified' : ''}${fresh.stale ? ' stale' : ''}`}>
              {fresh.text}
              {fresh.stale ? ' — may have changed' : ''}
            </p>
          )}
          <p className="card-actions">
            {calendar && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  addToCalendar(bar);
                  setSaved(true);
                }}
              >
                {saved ? 'Calendar file downloaded' : 'Add to calendar'}
              </button>
            )}
            <a href={reportUrl(bar)}>Report a change</a>
          </p>
          <span className="sr-only" role="status">
            {saved ? `Calendar file for ${bar.name} downloaded` : ''}
          </span>
        </div>
      </div>
    </article>
  );
}

// Featured partners lead every list (the rate card's promise), then the
// timetable: one big time per group, the bars beside it — the newsletter card's
// "also today" schedule, in the finder. In each group the rows still being
// confirmed fold into one line, so a busy evening reads as what's certain.
function Timetable({ entries, by, label, now, showDays, trackNow, linkedBar }) {
  // stable sort: confirmed featured rows first, each half keeping its order
  const featured = entries.filter((e) => e.bar.tier === 'featured').sort((a, b) => isConfirmed(b) - isConfirmed(a));
  const rest = entries.filter((e) => e.bar.tier !== 'featured');
  const card = (level) => (e) => (
    <BarCard
      key={e.bar.id}
      bar={e.bar}
      specials={e.specials}
      now={now}
      showDays={showDays}
      trackNow={trackNow}
      linked={e.bar.id === linkedBar}
      level={level}
    />
  );
  return (
    <>
      {featured.map(card(3))}
      {rest.length > 0 && (
        <div className="slot slot-axis">
          <span />
          <div className="axis-row">
            <span />
            <Axis />
          </div>
        </div>
      )}
      {timetable(rest, by).map(({ minutes, confirmed, guessed }) => (
        <div className="slot" key={minutes}>
          <h3 className="slot-time">{label(unbroken(fmtTime(hmOf(minutes))))}</h3>
          <div className="slot-rows">
            {confirmed.map(card(4))}
            {guessed.length > 0 && (
              <details className="slot-more" open={guessed.some((e) => e.bar.id === linkedBar)}>
                <summary>
                  {confirmed.length > 0 ? `${guessed.length} more` : `${guessed.length} listing${guessed.length === 1 ? '' : 's'}`},
                  specials being confirmed
                </summary>
                {guessed.map(card(4))}
              </details>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------- */
/* App              */
/* ---------------- */

const NOUNS = { all: ['happy hour', 'happy hours'], drinks: ['drink special', 'drink specials'], food: ['food special', 'food specials'] };

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(INITIAL_VIEW); // 'now' | one of DAY_KEYS
  const [city, setCity] = useState(INITIAL_CITY);
  const [type, setType] = useState(INITIAL_TYPE); // 'all' | 'drinks' | 'food'
  const [tag, setTag] = useState(INITIAL_TAG); // 'all' | a key of TAGS
  // Where to take the reader after a deep link or a "next up" jump: a bar's card,
  // or (barId null) the top of the new view. key makes a repeat jump re-run.
  const [jump, setJump] = useState(() => (INITIAL_BAR ? { barId: INITIAL_BAR, key: 0 } : null));

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const tick = setInterval(refresh, 30_000);
    // Phones freeze background tabs — refresh the moment the page is visible
    // again instead of showing stale "Pouring now" status until the next tick
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Embedded in the WordPress iframe: report content height so the parent can
  // size the frame. Parent listener lives in the README snippet; manual test
  // harness at public/embed-test.html. Height is not sensitive, so '*' is fine —
  // the parent side is what must origin-check.
  useEffect(() => {
    if (window.parent === window) return undefined; // standalone page, nothing to report
    const post = () => window.parent.postMessage({ type: 'wpr-hh-height', height: document.body.scrollHeight }, '*');
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    post();
    return () => ro.disconnect();
  }, []);

  // A deep link or jump lands its target at the top of the screen and moves
  // focus there — after the web fonts load, since they reflow every card above it.
  // INITIAL_VIEW guarantees a ?bar= card is in the first paint (unless the link
  // also carries a conflicting city/type — then this no-ops).
  useEffect(() => {
    if (!jump) return undefined;
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      const el = jump.barId ? document.getElementById(`bar-${jump.barId}`) : document.querySelector('.hero');
      if (!el) return;
      bringIntoView(el);
      el.querySelector(jump.barId ? '.card-name' : '.hero-title')?.focus({ preventScroll: true });
    });
    return () => {
      live = false;
    };
  }, [jump]);

  const jumpTo = (day, barId = null) => {
    setView(day);
    setJump({ barId, key: Date.now() });
  };

  const filtered = city !== 'all' || type !== 'all' || tag !== 'all';
  const clearFilters = () => {
    setCity('all');
    setType('all');
    setTag('all');
  };

  const typeMatch = (s) => type === 'all' || s.type === type || s.type === 'both';
  const cityBars = useMemo(
    () => DATA.bars.filter((b) => (city === 'all' || b.city === city) && (tag === 'all' || b.tags.includes(tag))),
    [city, tag]
  );

  const today = DAY_KEYS[now.getDay()];
  const nowMin = minuteOf(now);

  // Now view: bars grouped by whether any qualifying special is active this
  // minute; counted only when sourced (a guessed time is never a "pouring" fact)
  const { pouring, laterToday, confirmedNow, confirmedLater, guessed, next } = useMemo(() => {
    const { pouring, laterToday } = nowListings(cityBars, now, typeMatch);
    const confirmedNow = pouring.filter(isConfirmed).length;
    const confirmedLater = laterToday.filter(isConfirmed).length;
    return {
      pouring,
      laterToday,
      confirmedNow,
      confirmedLater,
      guessed: pouring.length - confirmedNow + laterToday.length - confirmedLater,
      next: nextDay(cityBars, now, typeMatch), // the closing line, or the quiet state's way forward
    };
  }, [cityBars, now, type]);
  const quiet = confirmedNow === 0 && confirmedLater === 0;

  // Day view: every bar with a qualifying special on the chosen day
  const dayList = useMemo(
    () => (view === 'now' ? [] : dayListings(cityBars, view, typeMatch)),
    [cityBars, view, type]
  );

  // The hero's picture of the day it's showing
  const shapeDay = view === 'now' ? today : view;
  const shape = useMemo(() => dayShape(cityBars, shapeDay, typeMatch), [cityBars, shapeDay, type]);

  // The hero: one number, set big, and the sentence it starts — in the reader's
  // filters ("3 food specials are on in Athens right now")
  const place = city === 'all' ? '' : ` in ${city}`;
  const heroCount = view === 'now' ? confirmedNow || confirmedLater : 0;
  const rolled = useRolling(heroCount);
  const [one, many] = NOUNS[type];
  const noun = heroCount === 1 ? one : many;
  const words =
    view !== 'now'
      ? `${weekdayLabel(view)} happy hours`
      : confirmedNow > 0
        ? `${noun} ${heroCount === 1 ? 'is' : 'are'} ${type === 'food' ? 'on' : 'pouring'}${place} right now`
        : confirmedLater > 0
          ? `${noun}${place} start${heroCount === 1 ? 's' : ''} later today`
          : `Quiet${place} right now`;
  const nextWhen = next && `${next.offset === 1 ? 'tomorrow' : weekdayLabel(next.dayKey)} at ${fmtTime(next.openers[0].start)}`;
  const sub =
    view === 'now'
      ? [
          heroFinding(pouring, laterToday),
          quiet && next && `Back at it ${nextWhen}.`,
          guessed > 0 && `Plus ${guessed} more with specials being confirmed.`,
        ]
          .filter(Boolean)
          .join(' ')
      : '';
  const friday = view === 'fri' || (view === 'now' && today === 'fri');

  // Screen readers hear the result of a filter or day change. Counts only move
  // when a window opens or closes — never the per-minute countdown text.
  const status =
    view === 'now'
      ? `${confirmedNow} pouring now, ${confirmedLater} later today${guessed ? `, ${guessed} more being confirmed` : ''}`
      : `${dayList.length} bar${dayList.length === 1 ? '' : 's'} with ${weekdayLabel(view)} specials`;

  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const weekday = now.toLocaleDateString([], { weekday: 'long' });
  const linkedBar = jump?.barId ?? null;

  return (
    <div className="app">
      <header className="masthead">
        <a className="masthead-brand" href="https://wausaupilotandreview.com" target="_top">
          <img className="masthead-badge" src="./wpr-typewriter-badge.png" alt="" width="36" height="36" />
          <img className="masthead-wordmark" src="./wpr-wordmark.png" alt="Wausau Pilot & Review" width="141" height="18" />
        </a>
        <span className="masthead-tag">Independent. Local. Nonprofit news.</span>
      </header>
      {/* WPR house flag rule: thick over thin, as on the fleet's other tools */}
      <div className="masthead-rule" />
      <main>
        <header className="hero" data-phase={view === 'now' ? phaseOf(now) : 'day'}>
          {/* The tool's own name sits under WPR's flag, never above it */}
          <div className="hero-top">
            <p className="hero-tool">
              <img className="hero-mark" src="./favicon.svg" alt="" width="22" height="22" />
              Happy Hour Finder
            </p>
            <p className="hero-clock">
              {weekday}, <span className="mono">{clock}</span>
            </p>
          </div>
          <h1 className={`hero-title${heroCount > 0 ? ' has-count' : ''}`} tabIndex={-1}>
            {heroCount > 0 && (
              <>
                <span className="hero-count" aria-hidden="true">
                  {rolled}
                </span>
                <span className="sr-only">{heroCount} </span>
              </>
            )}
            <span className="hero-words">{words}</span>
          </h1>
          <p className="hero-sub">{sub || 'Drink and food specials at partner bars across the Wausau area'}</p>
          {friday && (
            <p className="hero-fishfry">
              It’s fish fry Friday. <a href={FISH_FRY_URL} target="_top">See the Fish Fry Guide</a>
              {type !== 'food' && (
                <>
                  {' or '}
                  <button type="button" className="link-btn" onClick={() => setType('food')}>
                    show food specials
                  </button>
                </>
              )}
              .
            </p>
          )}
          <DayShape counts={shape} nowMin={view === 'now' || view === today ? nowMin : null} />
        </header>

        <div className="controls">
          <div className="day-picker" role="group" aria-label="Pick a day">
            <button
              aria-pressed={view === 'now'}
              className={`day-btn${view === 'now' ? ' active' : ''}`}
              onClick={() => setView('now')}
            >
              Now
            </button>
            {WEEK_ORDER.map((d) => (
              <button
                key={d}
                aria-pressed={view === d}
                aria-current={d === today ? 'date' : undefined}
                title={d === today ? 'Today' : undefined}
                className={`day-btn${view === d ? ' active' : ''}${d === today ? ' today' : ''}`}
                onClick={() => setView(d)}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="filters">
            <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Filter by city">
              <option value="all">All cities</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
              <option value="all">Food & drinks</option>
              <option value="drinks">Drinks</option>
              <option value="food">Food</option>
            </select>
            {TAGS_IN_USE.length > 0 && (
              <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by feature">
                <option value="all">Any spot</option>
                {TAGS_IN_USE.map((t) => (
                  <option key={t} value={t}>
                    {TAGS[t]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {/* The disclosure and the key, before the first listing rather than after the last */}
        <p className="list-key">
          Every listing is a paid partner placement. Each says where its specials came from; those marked{' '}
          <span className="chip chip-placeholder">Being confirmed</span> are still being checked with the bar.
        </p>
        <p className="sr-only" role="status">
          {status}
        </p>

        {view === 'now' ? (
          <>
            {quiet && (
              <section className="quiet">
                <h2 className="section-label">
                  {next ? `First up ${next.offset === 1 ? 'tomorrow' : `on ${weekdayLabel(next.dayKey)}`}` : `Nothing listed${place} this week yet`}
                </h2>
                {next && (
                  <ul className="openers">
                    {next.openers.slice(0, 3).map(({ bar, start }) => (
                      <li key={bar.id}>
                        <button type="button" className="opener" onClick={() => jumpTo(next.dayKey, bar.id)}>
                          <span className="opener-time mono">{unbroken(fmtTime(start))}</span>
                          <span className="opener-name">{bar.name}</span>
                          <span className="opener-town">{bar.city}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="quiet-more">
                  {next && (
                    <button type="button" className="link-btn" onClick={() => jumpTo(next.dayKey)}>
                      See all {next.openers.length} on {weekdayLabel(next.dayKey)}
                    </button>
                  )}
                  {filtered && (
                    <button type="button" className="link-btn" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                </p>
              </section>
            )}
            {pouring.length > 0 && (
              <section>
                <h2 className="section-label">Pouring now</h2>
                <Timetable entries={pouring} by={endsAt} label={(t) => `Until ${t}`} now={now} trackNow={now} showDays={false} linkedBar={linkedBar} />
              </section>
            )}
            {laterToday.length > 0 && (
              <section>
                <h2 className="section-label">Later today</h2>
                <Timetable entries={laterToday} by={startsAt} label={(t) => `From ${t}`} now={now} trackNow={now} showDays={false} linkedBar={linkedBar} />
              </section>
            )}
            {/* End on what's next, not a disclaimer: tomorrow's evening, one tap away */}
            {!quiet && next && (
              <button type="button" className="tomorrow" onClick={() => jumpTo(next.dayKey)}>
                <span className="tomorrow-day">
                  {next.offset === 1 ? `Tomorrow, ${weekdayLabel(next.dayKey)}` : `Next up, ${weekdayLabel(next.dayKey)}`}
                </span>
                <span className="tomorrow-line">
                  {next.openers.length} {NOUNS[type][next.openers.length === 1 ? 0 : 1]}, first at{' '}
                  <span className="mono">{unbroken(fmtTime(next.openers[0].start))}</span> at {next.openers[0].bar.name}
                </span>
                <Arrow />
              </button>
            )}
          </>
        ) : (
          <section>
            <h2 className="sr-only">{weekdayLabel(view)} specials</h2>
            {dayList.length > 0 ? (
              <Timetable
                entries={dayList}
                by={startsAt}
                label={(t) => `From ${t}`}
                now={null}
                trackNow={view === today ? now : null}
                showDays={true}
                linkedBar={linkedBar}
              />
            ) : (
              <p className="empty">
                No specials listed for {weekdayLabel(view)}
                {place} yet.{' '}
                {filtered ? (
                  <button type="button" className="link-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : (
                  <a href={CONTACT_LISTING}>Run one? Get it listed.</a>
                )}
              </p>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <img className="footer-badge" src="./wpr-typewriter-badge.png" alt="" />
        <p className="sponsor-slot">
          Happy Hour Finder, presented by{' '}
          {DATA.sponsor ? (
            DATA.sponsor.url ? (
              <a className="sponsor-name" href={trackedUrl(DATA.sponsor.url)} target="_blank" rel="noopener noreferrer sponsored">
                {DATA.sponsor.name}
              </a>
            ) : (
              <span className="sponsor-name">{DATA.sponsor.name}</span>
            )
          ) : (
            <a className="sponsor-open" href={CONTACT_SPONSOR}>
              your business here
            </a>
          )}
        </p>
        <p>
          A <strong>Wausau Pilot &amp; Review</strong> community tool ·{' '}
          <a href="tel:+17153015539">715-301-5539</a> · Partner listings are paid placements · Last updated{' '}
          {fmtDay(DATA.updated)}, {ymdParts(DATA.updated)[0]}
        </p>
        <p>
          Run a bar or restaurant? Get listed: email Chris Weber at{' '}
          <a href={CONTACT_LISTING}>{CHRIS_EMAIL}</a> · <a href={CONTACT_CORRECTION}>Spot an error? Tell us</a>
        </p>
      </footer>
    </div>
  );
}
