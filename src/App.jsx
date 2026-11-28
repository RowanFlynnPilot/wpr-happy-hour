import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import data from './data/bars.json';
import packers from './data/packers.json';
// Schema lives in validate.js — shared with scripts/check-data.mjs so CI
// rejects bad data before it can deploy. The app still throws at load.
import { DAY_KEYS, TAGS, toMinutes, validate, validateGames } from './data/validate.js';
// Time + listing logic is shared with the newsletter card and unit-tested
import {
  CHRIS_EMAIL,
  DAY_LABELS,
  LISTING_EVENTS,
  actionUrl,
  WEEK_ORDER,
  byBarName,
  dayListings,
  dayShape,
  endsAt,
  fmtDays,
  fmtTime,
  fmtWindow,
  gameLine,
  gameOn,
  groupSpecials,
  heroFinding,
  hmOf,
  holidayOn,
  icsFor,
  isConfirmed,
  isPlaceholder,
  listingUrl,
  minutesUntil,
  nextDay,
  nowListings,
  phaseOf,
  placeholderText,
  searchSpecials,
  specialStatus,
  startsAt,
  tagInSeason,
  timetable,
  trackedUrl,
  unbroken,
  viewUrl,
  weekdayLabel,
} from './schedule.js';
// The day's axis and skyline, the verified seal, the arrow — shared with the newsletter card
import { Arrow, Axis, DayShape, Seal, onAxis, pctOf, spanOf } from './marks.jsx';

/* ---------------- */
/* Data (validated) */
/* ---------------- */

const DATA = validate(data);
const CITIES = [...new Set(DATA.bars.map((b) => b.city))].sort();
// The Packers' remaining games, read from the team's schedule (never from memory)
const GAMES = validateGames(packers).games;
// The tag filter offers only tags some listing actually has (Chris collects them)
// and that are in season on the day: Tom & Jerrys leave the list in January
const tagsInUse = (date) => Object.keys(TAGS).filter((t) => tagInSeason(t, date, GAMES) && DATA.bars.some((b) => b.tags.includes(t)));

// Deep links: ?view=fri&city=Weston&type=food&tag=patio&q=wings&bar=red-eye-brewing — read
// once at load, no router. Unlike curated data, params arrive from outside (article
// links, embeds, bars' own socials), so invalid values fall back to defaults
// instead of throwing.
const PARAMS = new URLSearchParams(window.location.search);
const INITIAL_BAR = DATA.bars.some((b) => b.id === PARAMS.get('bar')) ? PARAMS.get('bar') : null;
// ?bar= without ?view=: the A-to-Z view, where every bar is listed with its whole
// week — a bar's own link (its table tent, its ad, a share) shows all it runs, not
// one day of it.
const INITIAL_VIEW = ['now', 'all', ...DAY_KEYS].includes(PARAMS.get('view')) ? PARAMS.get('view') : INITIAL_BAR ? 'all' : 'now';
// Arriving by a bar's own link is counted for that bar — once, at load — and by
// its table tent when the link says so (utm_source=tent, from the QR code)
const ARRIVED_BY = INITIAL_BAR && (PARAMS.get('utm_source') === 'tent' ? 'opened-tent' : 'opened');
const INITIAL_CITY = CITIES.includes(PARAMS.get('city')) ? PARAMS.get('city') : 'all';
const INITIAL_TYPE = ['drinks', 'food'].includes(PARAMS.get('type')) ? PARAMS.get('type') : 'all';
const INITIAL_TAG = tagsInUse(new Date()).includes(PARAMS.get('tag')) ? PARAMS.get('tag') : 'all';
const INITIAL_QUERY = (PARAMS.get('q') ?? '').slice(0, 60);

// Derived from public address only — contact info stays in the Notion CRM
const mapsUrl = (bar) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bar.name}, ${bar.address} WI`)}`;

// Sales contact — Chris Weber owns the listing pipeline; billing never touches the tool.
// The address is also shown as text in the footer: on a desktop with no mail app a
// mailto: click does nothing, and the reader needs something to copy.
const CONTACT_LISTING = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20listing`;
const CONTACT_SPONSOR = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20sponsorship`;
const CONTACT_CORRECTION = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20correction`;
// Per listing: lands with Chris as a call-list item; nothing a reader reports is
// published until he confirms it with the bar
// Email links carry target="_top": a web mail handler (Gmail) won't load inside the
// WordPress iframe and would blank it.
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

// The phone's own share sheet, where the browser has one. Inside the WordPress
// iframe it also needs allow="web-share" on the frame (README snippet).
const CAN_SHARE = typeof navigator.share === 'function';

// What readers do on a listing, counted per bar for the partner report — a count
// and the listing it happened on, nothing about the reader. Plausible's own queue:
// events sent before its script loads are replayed when it does.
window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
const track = (action, bar) => window.plausible(LISTING_EVENTS[action], { props: { url: actionUrl(bar, action), bar: bar.id } });

// Saved bars live in this browser only — no account, nothing sent anywhere. Null
// when the browser refuses storage (private mode, a partitioned iframe): then the
// finder simply has no Save buttons.
const SAVED_KEY = 'wpr-hh-saved';
function readSaved() {
  try {
    const ids = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? '[]');
    return new Set(ids.filter((id) => DATA.bars.some((b) => b.id === id)));
  } catch {
    return null;
  }
}

// What every card needs from the app: the saved set and its toggle, the one
// status line screen readers hear, and whether today is a holiday
const Finder = createContext(null);

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

if (ARRIVED_BY) track(ARRIVED_BY, DATA.bars.find((b) => b.id === INITIAL_BAR));

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
  const { holiday } = useContext(Finder);
  return (
    <div className="special">
      <div className="special-meta">
        <span className={`type-icon type-${group.type}`} aria-hidden="true" />
        <span className="sr-only">{TYPE_WORDS[group.type]}:</span>
        {(allDays || (showDays && group.days.length > 1)) && <span className="special-days mono">{fmtDays(group.days)}</span>}
        <span className="special-time mono">{unbroken(fmtWindow(group))}</span>
        {now && !holiday && <StatusChip group={group} now={now} />}
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
// a list's featured rows, h4 inside a time group (its time is the h3). In the
// A-to-Z view a card carries the bar's whole week: every row names its days, and
// there is no time track (one axis can't hold seven days).
function BarCard({ bar, specials, now, showDays, trackNow, linked, level, week }) {
  const featured = bar.tier === 'featured';
  const fresh = freshness(bar, trackNow ?? new Date());
  const calendar = groupSpecials(bar.specials).some((g) => !g.placeholder);
  const { saved, toggleSaved, announce, inSeason } = useContext(Finder);
  const tags = bar.tags.filter(inSeason);
  const isSaved = saved?.has(bar.id);
  const [downloaded, setDownloaded] = useState(false);
  const Name = `h${level}`;
  const share = () => {
    track('share', bar);
    return navigator
      .share({ title: bar.name, text: `${bar.name}: specials and times on Wausau Pilot & Review’s Happy Hour Finder`, url: listingUrl(bar) })
      // AbortError is the reader closing the sheet; anything else, say so
      .catch((e) => e.name === 'AbortError' || announce('Sharing isn’t available here'));
  };
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
            <a href={trackedUrl(bar.website)} target="_blank" rel="noopener noreferrer sponsored" onClick={() => track('website', bar)}>
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
              <a href={mapsUrl(bar)} target="_blank" rel="noopener noreferrer" onClick={() => track('directions', bar)}>
                Directions
              </a>
            </>
          )}
        </p>
        {featured && <p className="card-tier">Featured partner</p>}
        {tags.length > 0 && <p className="card-tags">{tags.map((t) => TAGS[t]).join(' · ')}</p>}
        {fresh?.verified && <Seal />}
      </header>
      <div className="card-specials">
        {groupSpecials(specials).map((g, i) => (
          <SpecialRow key={i} group={g} now={now} showDays={showDays} allDays={linked || week} />
        ))}
        {bar.note && <p className="card-note">{bar.note}</p>}
        {!week && <Track specials={specials} now={trackNow} />}
        <div className="card-meta">
          {fresh && (
            <p className={`card-fresh${fresh.verified ? ' verified' : ''}${fresh.stale ? ' stale' : ''}`}>
              {fresh.text}
              {fresh.stale ? ' — may have changed' : ''}
            </p>
          )}
          <p className="card-actions">
            {saved && (
              <button
                type="button"
                className={`link-btn save-btn${isSaved ? ' is-saved' : ''}`}
                aria-pressed={isSaved}
                onClick={() => {
                  toggleSaved(bar.id);
                  if (!isSaved) track('save', bar);
                  announce(isSaved ? `${bar.name} removed from your bars` : `${bar.name} saved to your bars`);
                }}
              >
                {isSaved ? 'Saved' : 'Save'}
              </button>
            )}
            {CAN_SHARE && (
              <button type="button" className="link-btn" onClick={share}>
                Share
              </button>
            )}
            {calendar && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  addToCalendar(bar);
                  track('calendar', bar);
                  setDownloaded(true);
                  announce(`Calendar file for ${bar.name} downloaded`);
                }}
              >
                {downloaded ? 'Calendar file downloaded' : 'Add to calendar'}
              </button>
            )}
            <a href={reportUrl(bar)} target="_top">
              Report a change
            </a>
          </p>
        </div>
      </div>
    </article>
  );
}

// Featured partners lead every list (the rate card's promise) — when they have a
// sourced special in it. One with only guessed specials files into the timetable
// like any other unconfirmed row, so the list never opens on "Being confirmed".
// (A verified bar can't carry guesses, so a paying featured partner always leads.) Then the
// timetable: one big time per group, the bars beside it — the newsletter card's
// "also today" schedule, in the finder. In each group the rows still being
// confirmed fold into one line, so a busy evening reads as what's certain.
function Timetable({ entries, by, label, now, showDays, trackNow, linkedBar, searching }) {
  const { saved } = useContext(Finder);
  const mine = (e) => (saved?.has(e.bar.id) ? 1 : 0);
  // a stable sort: the reader's saved bars lead their group, the rest keep their order
  const savedFirst = (list) => [...list].sort((a, b) => mine(b) - mine(a));
  const leads = (e) => e.bar.tier === 'featured' && isConfirmed(e);
  const featured = savedFirst(entries.filter(leads));
  const rest = entries.filter((e) => !leads(e));
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
            {savedFirst(confirmed).map(card(4))}
            {guessed.length > 0 && (
              // open for what the reader came for: a search, a linked bar, a saved one
              <details className="slot-more" open={searching || guessed.some((e) => e.bar.id === linkedBar || mine(e))}>
                <summary>
                  {confirmed.length > 0 ? `${guessed.length} more` : `${guessed.length} listing${guessed.length === 1 ? '' : 's'}`},
                  specials being confirmed
                </summary>
                {savedFirst(guessed).map(card(4))}
              </details>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// Every bar, A to Z, each with its whole week — where a reader looks one bar up.
// The same order of trust as the timetable: featured partners with a sourced
// special lead, then every bar with one, then the rest folded into one line.
function AllBars({ entries, linkedBar, searching }) {
  const { saved } = useContext(Finder);
  const leads = (e) => e.bar.tier === 'featured' && isConfirmed(e);
  const card = (level) => (e) => <BarCard key={e.bar.id} bar={e.bar} specials={e.specials} now={null} showDays={true} linked={e.bar.id === linkedBar} level={level} week />;
  const sure = entries.filter((e) => isConfirmed(e) && !leads(e));
  const guessed = entries.filter((e) => !isConfirmed(e));
  return (
    <>
      {entries.filter(leads).map(card(3))}
      <div className="slot-rows az">
        {sure.map(card(3))}
        {guessed.length > 0 && (
          // open for what the reader came for: a search, a linked bar, a saved one
          <details className="slot-more" open={searching || guessed.some((e) => e.bar.id === linkedBar || saved?.has(e.bar.id))}>
            <summary>
              {sure.length > 0 ? `${guessed.length} more` : `${guessed.length} listing${guessed.length === 1 ? '' : 's'}`}, specials being confirmed
            </summary>
            {guessed.map(card(3))}
          </details>
        )}
      </div>
    </>
  );
}

/* ---------------- */
/* App              */
/* ---------------- */

const NOUNS = { all: ['happy hour', 'happy hours'], drinks: ['drink special', 'drink specials'], food: ['food special', 'food specials'] };

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(INITIAL_VIEW); // 'now' | one of DAY_KEYS | 'all' (every bar, A to Z)
  const [city, setCity] = useState(INITIAL_CITY);
  const [type, setType] = useState(INITIAL_TYPE); // 'all' | 'drinks' | 'food'
  const [tag, setTag] = useState(INITIAL_TAG); // 'all' | a key of TAGS
  const [query, setQuery] = useState(INITIAL_QUERY); // the search box
  // Where to take the reader after a deep link or a "next up" jump: a bar's card,
  // or (barId null) the top of the new view. key makes a repeat jump re-run.
  const [jump, setJump] = useState(() => (INITIAL_BAR ? { barId: INITIAL_BAR, key: 0 } : null));
  const [saved, setSaved] = useState(readSaved); // Set of bar ids, or null: no storage here
  const [onlySaved, setOnlySaved] = useState(false);
  const [notice, setNotice] = useState(''); // what a card just did, for screen readers
  const [linkCopied, setLinkCopied] = useState(null); // the link last copied: the button says so until the view changes
  const [linkShown, setLinkShown] = useState(null); // the view's link, shown to copy by hand when it can't be copied for the reader

  const toggleSaved = (id) => {
    const next = new Set(saved);
    if (!next.delete(id)) next.add(id);
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      setSaved(next);
    } catch {
      setSaved(null); // storage went away mid-visit: stop offering it
    }
  };
  const mineOnly = onlySaved && saved?.size > 0; // the last one unsaved: the filter lets go
  // Tags on offer today; a seasonal tag picked before its season ended lets go too
  const dateKey = now.toDateString();
  const tagsNow = useMemo(() => tagsInUse(now), [dateKey]);
  const activeTag = tagsNow.includes(tag) ? tag : 'all';
  const game = gameOn(GAMES, now); // today's Packers game, if any

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

  // The search keeps a set of specials (null: no search); it never leaves the page
  const hits = useMemo(() => searchSpecials(DATA.bars, query), [query]);
  const asked = query.trim();
  const filtered = city !== 'all' || type !== 'all' || activeTag !== 'all' || mineOnly || hits !== null;
  const clearFilters = () => {
    setCity('all');
    setType('all');
    setTag('all');
    setOnlySaved(false);
    setQuery('');
  };

  // A link to this view, made only when the reader asks for it. The address bar is
  // left alone on purpose: in the WordPress page a changing address would hand every
  // keystroke of a search to that page's analytics, and nothing typed here is sent
  // or counted. The phone's share sheet where there is one, else the clipboard
  // (inside the iframe that needs allow="clipboard-write"), else the link to select.
  const viewLink = viewUrl({ view, city, type, tag: activeTag, q: hits !== null ? asked : '' });
  const worthLinking = view !== 'now' || city !== 'all' || type !== 'all' || activeTag !== 'all' || hits !== null;
  const shareView = () => {
    if (CAN_SHARE) {
      return navigator
        .share({ title: 'Happy Hour Finder', text: 'Wausau Pilot & Review’s Happy Hour Finder', url: viewLink })
        .catch((e) => e.name === 'AbortError' || setLinkShown(viewLink));
    }
    return navigator.clipboard.writeText(viewLink).then(
      () => {
        setLinkCopied(viewLink);
        setNotice('Link copied');
      },
      () => setLinkShown(viewLink)
    );
  };

  // One test for every list, count and sentence: the type filter and the search
  const typeMatch = (s) => (type === 'all' || s.type === type || s.type === 'both') && (hits === null || hits.has(s));
  const cityBars = useMemo(
    () =>
      DATA.bars.filter(
        (b) =>
          (city === 'all' || b.city === city) &&
          (activeTag === 'all' || b.tags.includes(activeTag)) &&
          (!mineOnly || saved.has(b.id)) &&
          (hits === null || b.specials.some((s) => hits.has(s)))
      ),
    [city, activeTag, mineOnly, saved, hits]
  );

  const today = DAY_KEYS[now.getDay()];
  const nowMin = minuteOf(now);
  // Thanksgiving, Christmas, New Year's Day: the usual schedule may not hold, so
  // nothing is claimed as "pouring right now" — the list shows the usual specials
  const holiday = holidayOn(now);
  const todayShown = view === 'now' || view === today;

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
  }, [cityBars, now, type, hits]);
  const quiet = confirmedNow === 0 && confirmedLater === 0;

  // Day view: every bar with a qualifying special on the chosen day
  const dayList = useMemo(
    () => (view === 'now' || view === 'all' ? [] : dayListings(cityBars, view, typeMatch)),
    [cityBars, view, type, hits]
  );

  // A-to-Z view: every bar, with all of its qualifying specials
  const allList = useMemo(
    () =>
      view === 'all'
        ? cityBars.map((bar) => ({ bar, specials: bar.specials.filter(typeMatch) })).filter((e) => e.specials.length > 0).sort((a, b) => byBarName(a.bar, b.bar))
        : [],
    [cityBars, view, type, hits]
  );

  // The hero's picture of the day it's showing (the A-to-Z view has no one day)
  const shapeDay = view === 'now' || view === 'all' ? today : view;
  const shape = useMemo(() => dayShape(cityBars, shapeDay, typeMatch), [cityBars, shapeDay, type, hits]);

  // The hero: one number, set big, and the sentence it starts — in the reader's
  // filters ("3 food specials are on in Athens right now")
  const place = city === 'all' ? '' : ` in ${city}`;
  const heroCount = view === 'all' ? allList.length : view === 'now' && !holiday ? confirmedNow || confirmedLater : 0;
  const rolled = useRolling(heroCount);
  const [one, many] = NOUNS[type];
  const noun = heroCount === 1 ? one : many;
  const words =
    view === 'all'
      ? heroCount > 0
        ? `bar${heroCount === 1 ? '' : 's'}${place}, A to Z`
        : `No bars${place} match`
      : view !== 'now'
      ? `${weekdayLabel(view)} happy hours`
      : holiday
        ? 'Holiday hours vary today'
        : confirmedNow > 0
        ? `${noun} ${heroCount === 1 ? 'is' : 'are'} ${type === 'food' ? 'on' : 'pouring'}${place} right now`
        : confirmedLater > 0
          ? `${noun}${place} start${heroCount === 1 ? 's' : ''} later today`
          : `Quiet${place} right now`;
  const nextWhen = next && `${next.offset === 1 ? 'tomorrow' : weekdayLabel(next.dayKey)} at ${fmtTime(next.openers[0].start)}`;
  const holidayLine = `It’s ${holiday}. Many bars close or keep short hours, so call ahead. These are their usual specials.`;
  const sub =
    holiday && todayShown
      ? holidayLine
      : view === 'now'
      ? [
          heroFinding(pouring, laterToday),
          quiet && next && `Back at it ${nextWhen}.`,
          guessed > 0 && `Plus ${guessed} more with specials being confirmed.`,
        ]
          .filter(Boolean)
          .join(' ')
      : view === 'all'
        ? 'Every listing, with its specials for the whole week.'
        : '';
  const friday = view === 'fri' || (view === 'now' && today === 'fri');

  // Screen readers hear the result of a filter or day change. Counts only move
  // when a window opens or closes — never the per-minute countdown text.
  const status =
    view === 'all'
      ? `${allList.length} bar${allList.length === 1 ? '' : 's'} listed`
      : view === 'now'
      ? `${confirmedNow} pouring now, ${confirmedLater} later today${guessed ? `, ${guessed} more being confirmed` : ''}`
      : `${dayList.length} bar${dayList.length === 1 ? '' : 's'} with ${weekdayLabel(view)} specials`;

  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const weekday = now.toLocaleDateString([], { weekday: 'long' });
  const linkedBar = jump?.barId ?? null;

  return (
    <Finder.Provider value={{ saved, toggleSaved, announce: setNotice, holiday: holiday && todayShown, inSeason: (t) => tagsNow.includes(t) }}>
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
          {game && todayShown && (
            <p className="hero-fishfry">
              {gameLine(game)}
              {tagsNow.includes('game-day') && activeTag !== 'game-day' && (
                <>
                  {' '}
                  <button type="button" className="link-btn" onClick={() => setTag('game-day')}>
                    See who’s showing it
                  </button>
                  .
                </>
              )}
            </p>
          )}
          {view !== 'all' && <DayShape counts={shape} nowMin={view === 'now' || view === today ? nowMin : null} />}
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
            {tagsNow.length > 0 && (
              <select value={activeTag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by feature">
                <option value="all">Any spot</option>
                {tagsNow.map((t) => (
                  <option key={t} value={t}>
                    {TAGS[t]}
                  </option>
                ))}
              </select>
            )}
            {saved?.size > 0 && (
              <button type="button" className={`mine-btn${mineOnly ? ' active' : ''}`} aria-pressed={mineOnly} onClick={() => setOnlySaved(!mineOnly)}>
                My bars <span className="mine-count">{saved.size}</span>
              </button>
            )}
            {/* Every bar with its whole week; pressed again, back to what's on now */}
            <button type="button" className={`mine-btn${view === 'all' ? ' active' : ''}`} aria-pressed={view === 'all'} onClick={() => setView(view === 'all' ? 'now' : 'all')}>
              All bars A–Z
            </button>
          </div>
          <input
            className="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a bar or a special, like wings"
            aria-label="Search bars and specials"
            maxLength={60}
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        {worthLinking && (
          <p className="view-link">
            <button type="button" className="link-btn" onClick={shareView}>
              {CAN_SHARE ? 'Share this view' : linkCopied === viewLink ? 'Link copied' : 'Copy a link to this view'}
            </button>
            {linkShown === viewLink && (
              <input className="view-link-url mono" readOnly value={viewLink} aria-label="Link to this view" onFocus={(e) => e.target.select()} autoFocus />
            )}
          </p>
        )}
        {/* The disclosure and the key, before the first listing rather than after the last */}
        <p className="list-key">
          Every listing is a paid partner placement. Each says where its specials came from; those marked{' '}
          <span className="chip chip-placeholder">Being confirmed</span> are still being checked with the bar.
        </p>
        <p className="sr-only" role="status">
          {status}
        </p>
        <p className="sr-only" role="status">
          {notice}
        </p>

        {view === 'now' ? (
          <>
            {quiet && (
              <section className="quiet">
                <h2 className="section-label">
                  {next
                    ? `First up ${next.offset === 1 ? 'tomorrow' : `on ${weekdayLabel(next.dayKey)}`}`
                    : hits === null
                      ? `Nothing listed${place} this week yet`
                      : cityBars.length > 0
                        ? // the search did match — only listings still being confirmed (below, or on another day)
                          `Nothing confirmed for “${asked}”${place} yet`
                        : `Nothing matches “${asked}”${place}`}
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
                  {hits !== null && cityBars.length > 0 && (
                    <button type="button" className="link-btn" onClick={() => setView('all')}>
                      Search every day
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
                <h2 className="section-label">{holiday ? 'Usually pouring now' : 'Pouring now'}</h2>
                <Timetable entries={pouring} by={endsAt} label={(t) => `Until ${t}`} now={now} trackNow={now} showDays={false} linkedBar={linkedBar} searching={hits !== null} />
              </section>
            )}
            {laterToday.length > 0 && (
              <section>
                <h2 className="section-label">{holiday ? 'Usually later today' : 'Later today'}</h2>
                <Timetable entries={laterToday} by={startsAt} label={(t) => `From ${t}`} now={now} trackNow={now} showDays={false} linkedBar={linkedBar} searching={hits !== null} />
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
        ) : view === 'all' ? (
          <section>
            <h2 className="sr-only">All bars, A to Z</h2>
            {allList.length > 0 ? (
              <AllBars entries={allList} linkedBar={linkedBar} searching={hits !== null} />
            ) : (
              <p className="empty">
                {hits !== null ? `No bar or special matches “${asked}”${place}.` : `No bars listed${place} yet.`}{' '}
                {filtered && (
                  <button type="button" className="link-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </p>
            )}
          </section>
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
                searching={hits !== null}
              />
            ) : (
              <p className="empty">
                {hits !== null ? `Nothing matches “${asked}” on ${weekdayLabel(view)}${place}.` : `No specials listed for ${weekdayLabel(view)}${place} yet.`}{' '}
                {hits !== null && (
                  <>
                    <button type="button" className="link-btn" onClick={() => setView('all')}>
                      Search every day
                    </button>{' '}
                  </>
                )}
                {filtered ? (
                  <button type="button" className="link-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : (
                  <a href={CONTACT_LISTING} target="_top">
                    Run one? Get it listed.
                  </a>
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
            <a className="sponsor-open" href={CONTACT_SPONSOR} target="_top">
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
          <a href={CONTACT_LISTING} target="_top">
            {CHRIS_EMAIL}
          </a>{' '}
          ·{' '}
          <a href={CONTACT_CORRECTION} target="_top">
            Spot an error? Tell us
          </a>
        </p>
      </footer>
    </div>
    </Finder.Provider>
  );
}
