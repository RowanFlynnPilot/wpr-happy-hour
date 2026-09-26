import { useEffect, useMemo, useState } from 'react';
import data from './data/bars.json';
// Schema lives in validate.js — shared with scripts/check-data.mjs so CI
// rejects bad data before it can deploy. The app still throws at load.
import { DAY_KEYS, validate } from './data/validate.js';
// Time + listing logic is shared with the newsletter card and unit-tested
import {
  DAY_LABELS,
  WEEK_ORDER,
  dayListings,
  fmtDays,
  fmtTime,
  fmtWindow,
  minutesUntil,
  nextPour as findNextPour,
  nowListings,
  specialStatus,
  trackedUrl,
  weekdayLabel,
} from './schedule.js';

/* ---------------- */
/* Data (validated) */
/* ---------------- */

const DATA = validate(data);
const CITIES = [...new Set(DATA.bars.map((b) => b.city))].sort();

// Deep links: ?view=fri&city=Weston&type=food&bar=red-eye-brewing — read once at
// load, no router. Unlike curated data, params arrive from outside (article
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
// if it has a special today (the day view still shows a special that already
// ended; the Now view would not), else the next day it appears.
function viewForBar(barId) {
  const { specials } = DATA.bars.find((b) => b.id === barId);
  const todayIdx = WEEK_ORDER.indexOf(DAY_KEYS[new Date().getDay()]);
  for (let off = 0; off < 7; off++) {
    const day = WEEK_ORDER[(todayIdx + off) % 7];
    if (specials.some((s) => s.days.includes(day))) return day;
  }
  return 'now'; // unreachable — the validator guarantees ≥1 special with ≥1 day
}
const INITIAL_CITY = CITIES.includes(PARAMS.get('city')) ? PARAMS.get('city') : 'all';
const INITIAL_TYPE = ['drinks', 'food'].includes(PARAMS.get('type')) ? PARAMS.get('type') : 'all';

/* ---------------- */
/* Components       */
/* ---------------- */

function StatusChip({ special, now }) {
  const status = specialStatus(special, now);
  if (status === 'now') {
    const left = minutesUntil(special.end, now);
    return (
      <span className="chip chip-now">
        Pouring now{left <= 60 ? ` · ${left} min left` : ` · until ${fmtTime(special.end)}`}
      </span>
    );
  }
  if (status === 'later') {
    return <span className="chip chip-later">Starts {fmtTime(special.start)}</span>;
  }
  return null;
}

function SpecialRow({ special, now, showDays }) {
  return (
    <div className="special">
      <div className="special-meta">
        {showDays && (
          <span className="special-days mono">{fmtDays(special.days)}</span>
        )}
        <span className="special-time mono">{fmtWindow(special)}</span>
        {now && <StatusChip special={special} now={now} />}
      </div>
      <ul className="special-items">
        {special.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// Derived from public address only — contact info stays in the Notion CRM
const mapsUrl = (bar) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bar.name}, ${bar.address}, ${bar.city} WI`)}`;

// Sales contact — Chris Weber owns the listing pipeline; billing never touches the tool.
// The address is also shown as text in the footer: on a desktop with no mail app a
// mailto: click does nothing, and the reader needs something to copy.
const CHRIS_EMAIL = 'weber.chris@wausaupilotandreview.com';
const CONTACT_LISTING = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20listing`;
const CONTACT_SPONSOR = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20sponsorship`;
const CONTACT_CORRECTION = `mailto:${CHRIS_EMAIL}?subject=Happy%20Hour%20Finder%20correction`;

// Sibling reader guide, live since July 2026 — cross-promoted on Fridays only
const FISH_FRY_URL = 'https://wausaupilotandreview.com/wausau-area-fish-fry-guide/';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-07-11" → "Jul 2026" — month precision so the badge doesn't read stale by Friday
function fmtVerified(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function BarCard({ bar, specials, now, showDays }) {
  return (
    <article
      id={`bar-${bar.id}`}
      className={`card${bar.tier === 'featured' ? ' card-featured' : ''}${bar.id === INITIAL_BAR ? ' card-linked' : ''}`}
    >
      {bar.tier === 'featured' && <div className="featured-badge">Featured</div>}
      {bar.tier === 'featured' && bar.photo && (
        <img className="card-photo" src={bar.photo} alt={bar.name} loading="lazy" />
      )}
      <header className="card-head">
        <h3 className="card-name">
          {bar.website ? (
            // Every listing is paid — rel="sponsored" is the disclosure to search engines
            <a href={trackedUrl(bar.website)} target="_blank" rel="noopener noreferrer sponsored">
              {bar.name}
            </a>
          ) : (
            bar.name
          )}
        </h3>
        <p className="card-address">
          {bar.address} · {bar.city}
          {bar.tier === 'featured' && (
            <>
              {' · '}
              <a href={mapsUrl(bar)} target="_blank" rel="noopener noreferrer">
                Directions
              </a>
            </>
          )}
        </p>
      </header>
      {specials.map((s, i) => (
        <SpecialRow key={i} special={s} now={now} showDays={showDays} />
      ))}
      <p className={`card-verified mono${bar.verifiedOn ? '' : ' pending'}`}>
        {bar.verifiedOn ? `✓ Verified ${fmtVerified(bar.verifiedOn)}` : 'Details being confirmed'}
      </p>
    </article>
  );
}

/* ---------------- */
/* App              */
/* ---------------- */

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(INITIAL_VIEW); // 'now' | one of DAY_KEYS
  const [city, setCity] = useState(INITIAL_CITY);
  const [type, setType] = useState(INITIAL_TYPE); // 'all' | 'drinks' | 'food'

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
    if (window.parent === window) return; // standalone page, nothing to report
    const post = () =>
      window.parent.postMessage({ type: 'wpr-hh-height', height: document.body.scrollHeight }, '*');
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    post();
    return () => ro.disconnect();
  }, []);

  // ?bar= deep link: INITIAL_VIEW guarantees the card is in the first paint
  // (unless the link also carries a conflicting city/type — then this no-ops).
  useEffect(() => {
    if (!INITIAL_BAR) return;
    document.getElementById(`bar-${INITIAL_BAR}`)?.scrollIntoView({ block: 'start' });
  }, []);

  const typeMatch = (s) => type === 'all' || s.type === type || s.type === 'both';
  const cityBars = useMemo(
    () => DATA.bars.filter((b) => city === 'all' || b.city === city),
    [city]
  );

  // Now view: bars grouped by whether any qualifying special is active this minute
  const { pouring, laterToday, nextPour } = useMemo(() => {
    const { pouring, laterToday } = nowListings(cityBars, now, typeMatch);
    // Quiet night: tease the next upcoming pour (same filters) instead of a dead end
    const quiet = pouring.length === 0 && laterToday.length === 0;
    return { pouring, laterToday, nextPour: quiet ? findNextPour(cityBars, now, typeMatch) : null };
  }, [cityBars, now, type]);

  // Day view: every bar with a qualifying special on the chosen day
  const dayList = useMemo(
    () => (view === 'now' ? [] : dayListings(cityBars, view, typeMatch)),
    [cityBars, view, type]
  );

  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const weekday = now.toLocaleDateString([], { weekday: 'long' });

  return (
    <div className="app">
      <div className="masthead">
        <a className="masthead-brand" href="https://wausaupilotandreview.com" target="_top">
          <img className="masthead-badge" src="./wpr-typewriter-badge.png" alt="" />
          Wausau Pilot &amp; Review
        </a>
        <span className="masthead-tag">Independent. Local. Nonprofit news.</span>
      </div>
      <header className="hero">
        <p className="hero-clock mono">
          {weekday} · {clock}
        </p>
        <h1 className="hero-title">
          {view === 'now' ? (
            pouring.length > 0 ? (
              <>
                <span className="hero-count mono">{pouring.length}</span> happy hour
                {pouring.length === 1 ? ' is' : 's are'} pouring right now
              </>
            ) : laterToday.length > 0 ? (
              <>
                <span className="hero-count mono">{laterToday.length}</span> happy hour
                {laterToday.length === 1 ? '' : 's'} starting later today
              </>
            ) : (
              'Nothing pouring at the moment'
            )
          ) : (
            `${weekdayLabel(view)} happy hours`
          )}
        </h1>
        <p className="hero-sub">Happy hour specials at partner bars across the Wausau area</p>
      </header>

      <nav className="controls">
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
              className={`day-btn${view === d ? ' active' : ''}`}
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
        </div>
      </nav>

      {view === 'now' ? (
        <>
          {pouring.length > 0 && (
            <section>
              <h2 className="section-label">Pouring now</h2>
              <div className="grid">
                {pouring.map(({ bar, specials }) => (
                  <BarCard key={bar.id} bar={bar} specials={specials} now={now} showDays={false} />
                ))}
              </div>
            </section>
          )}
          {laterToday.length > 0 && (
            <section>
              <h2 className="section-label">Later today</h2>
              <div className="grid">
                {laterToday.map(({ bar, specials }) => (
                  <BarCard key={bar.id} bar={bar} specials={specials} now={now} showDays={false} />
                ))}
              </div>
            </section>
          )}
          {pouring.length === 0 && laterToday.length === 0 && (
            <p className="empty">
              Quiet out there right now.
              {nextPour
                ? ` Next happy hour: ${nextPour.offset === 1 ? 'tomorrow' : weekdayLabel(nextPour.dayKey)} at ${fmtTime(nextPour.start)}.`
                : ' Pick a day above to plan ahead.'}
            </p>
          )}
        </>
      ) : (
        <section>
          {dayList.length > 0 ? (
            <div className="grid">
              {dayList.map(({ bar, specials }) => (
                <BarCard key={bar.id} bar={bar} specials={specials} now={null} showDays={true} />
              ))}
            </div>
          ) : (
            <p className="empty">
              No specials listed for {weekdayLabel(view)} yet.{' '}
              <a href={CONTACT_LISTING}>Run one? Get it listed.</a>
            </p>
          )}
        </section>
      )}

      {(view === 'fri' || (view === 'now' && DAY_KEYS[now.getDay()] === 'fri')) && (
        <p className="cross-promo">
          Friday in Wisconsin means fish fry — see our{' '}
          <a href={FISH_FRY_URL} target="_top">Wausau-area Fish Fry Guide</a>.
        </p>
      )}

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
          A <strong>Wausau Pilot &amp; Review</strong> community tool · Partner listings are paid
          placements · Last updated <span className="mono">{DATA.updated}</span>
        </p>
        <p>
          Run a bar or restaurant? Get listed: email Chris Weber at{' '}
          <a href={CONTACT_LISTING}>{CHRIS_EMAIL}</a> · <a href={CONTACT_CORRECTION}>Spot an error? Tell us</a>
        </p>
      </footer>
    </div>
  );
}
