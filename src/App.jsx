import { Fragment, useEffect, useMemo, useState } from 'react';
import data from './data/bars.json';
// Schema lives in validate.js — shared with scripts/check-data.mjs so CI
// rejects bad data before it can deploy. The app still throws at load.
import { DAY_KEYS, TAGS, toMinutes, validate } from './data/validate.js';
// Time + listing logic is shared with the newsletter card and unit-tested
import {
  DAY_LABELS,
  WEEK_ORDER,
  dayListings,
  endsAt,
  fmtDays,
  fmtTime,
  fmtWindow,
  groupSpecials,
  heroFinding,
  hmOf,
  icsFor,
  isPlaceholder,
  minutesUntil,
  nextPour as findNextPour,
  nowListings,
  placeholderText,
  specialStatus,
  startsAt,
  timetable,
  trackedUrl,
  unbroken,
  weekdayLabel,
} from './schedule.js';

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
  return null; // research guesses only: their Placeholder tags say so
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

/* ---------------- */
/* Components       */
/* ---------------- */

// The section and the time group already say "pouring now" / "from 8 PM", so a
// chip on every row would be noise. Only the last hour is news.
function StatusChip({ group, now }) {
  if (specialStatus(group, now) !== 'now') return null;
  const left = minutesUntil(group.end, now);
  return left <= 60 ? <span className="chip chip-now">{left} min left</span> : null;
}

// One window (days + hours) of a bar's specials; see groupSpecials(). In a day
// view every special runs that day, so its days only say something when it
// also runs on others ("Tue · Thu · Sat–Sun"), not a "Sat" on every row.
function SpecialRow({ group, now, showDays }) {
  return (
    <div className="special">
      <div className="special-meta">
        <span className={`type-icon type-${group.type}`} aria-hidden="true" />
        {showDays && group.days.length > 1 && <span className="special-days mono">{fmtDays(group.days)}</span>}
        <span className="special-time mono">{unbroken(fmtWindow(group))}</span>
        {now && <StatusChip group={group} now={now} />}
        {group.placeholder && <span className="chip chip-placeholder">Placeholder</span>}
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
const AXIS_START = 10 * 60;
const AXIS_END = 24 * 60;
const frac = (m) => (Math.min(Math.max(m, AXIS_START), AXIS_END) - AXIS_START) / (AXIS_END - AXIS_START);
const pctOf = (m) => `${(frac(m) * 100).toFixed(2)}%`;
const spanOf = (a, b) => `${((frac(b) - frac(a)) * 100).toFixed(2)}%`;
const endOf = (hm) => (hm === '23:59' ? 1440 : toMinutes(hm));

function Track({ specials, now }) {
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : null;
  const windows = [...new Map(specials.map((s) => [`${s.start}|${s.end}`, s])).values()];
  return (
    <div className="track" aria-hidden="true">
      {windows.map((s, i) => {
        const a = toMinutes(s.start);
        const b = endOf(s.end);
        const cut = nowMin === null ? a : Math.min(Math.max(nowMin, a), b);
        return (
          <Fragment key={i}>
            {cut > a && <span className="track-fill track-past" style={{ left: pctOf(a), width: spanOf(a, cut) }} />}
            {b > cut && <span className="track-fill" style={{ left: pctOf(cut), width: spanOf(cut, b) }} />}
          </Fragment>
        );
      })}
      {nowMin !== null && <span className="track-now" style={{ left: pctOf(nowMin) }} />}
    </div>
  );
}

function Axis() {
  return (
    <div className="axis" aria-hidden="true">
      {[10, 12, 15, 18, 21, 24].map((h) => (
        <span key={h} style={{ left: pctOf(h * 60) }}>
          {h === 12 ? 'noon' : h === 24 ? '12' : h > 12 ? h - 12 : h}
        </span>
      ))}
    </div>
  );
}

// A timetable row, not a pinned card. Featured keeps the evening ground and
// its photo (the featured perk) and leads every list.
function BarCard({ bar, specials, now, showDays, trackNow }) {
  const featured = bar.tier === 'featured';
  const fresh = freshness(bar, trackNow ?? new Date());
  const calendar = groupSpecials(bar.specials).some((g) => !g.placeholder);
  return (
    <article
      id={`bar-${bar.id}`}
      className={`card${featured ? ' card-featured' : ''}${featured && bar.photo ? ' has-photo' : ''}${bar.id === INITIAL_BAR ? ' card-linked' : ''}`}
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
      </header>
      <div className="card-specials">
        {groupSpecials(specials).map((g, i) => (
          <SpecialRow key={i} group={g} now={now} showDays={showDays} />
        ))}
        {bar.note && <p className="card-note">{bar.note}</p>}
        <Track specials={specials} now={trackNow} />
        <p className="card-meta">
          {fresh && <span className={`card-fresh${fresh.verified ? ' verified' : ''}${fresh.stale ? ' stale' : ''}`}>{fresh.text}{fresh.stale ? ' — may have changed' : ''}</span>}
          {calendar && (
            <button type="button" className="link-btn" onClick={() => addToCalendar(bar)}>
              Add to calendar
            </button>
          )}
          <a href={reportUrl(bar)}>Report a change</a>
        </p>
      </div>
    </article>
  );
}

// Featured partners lead every list (the rate card's promise), then the
// timetable: one big time per group, the bars beside it — the newsletter card's
// "also today" schedule, in the finder
function Timetable({ entries, by, label, now, showDays, trackNow }) {
  const featured = entries.filter((e) => e.bar.tier === 'featured');
  const rest = entries.filter((e) => e.bar.tier !== 'featured');
  return (
    <>
      {featured.map(({ bar, specials }) => (
        <BarCard key={bar.id} bar={bar} specials={specials} now={now} showDays={showDays} trackNow={trackNow} />
      ))}
      {rest.length > 0 && (
        <div className="slot slot-axis">
          <span />
          <div className="axis-row">
            <span />
            <Axis />
          </div>
        </div>
      )}
      {timetable(rest, by).map(({ minutes, entries: group }) => (
        <div className="slot" key={minutes}>
          <h3 className="slot-time">{label(unbroken(fmtTime(hmOf(minutes))))}</h3>
          <div className="slot-rows">
            {group.map(({ bar, specials }) => (
              <BarCard key={bar.id} bar={bar} specials={specials} now={now} showDays={showDays} trackNow={trackNow} />
            ))}
          </div>
        </div>
      ))}
    </>
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
  const [tag, setTag] = useState(INITIAL_TAG); // 'all' | a key of TAGS

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
  // A ?bar= deep link's report also carries its card's position (anchor), once:
  // a frame sized to its content can't scroll itself, so the parent page must.
  // Measured after the web fonts load — they reflow every card above it.
  useEffect(() => {
    if (window.parent === window) return; // standalone page, nothing to report
    let anchor = null;
    const post = () => {
      window.parent.postMessage({ type: 'wpr-hh-height', height: document.body.scrollHeight, anchor }, '*');
      anchor = null; // once — later resizes must not yank the reader back
    };
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    post();
    let live = true;
    const card = INITIAL_BAR && document.getElementById(`bar-${INITIAL_BAR}`);
    if (card) {
      document.fonts.ready.then(() => {
        if (!live) return;
        anchor = Math.round(card.getBoundingClientRect().top + window.scrollY);
        post();
      });
    }
    return () => {
      live = false;
      ro.disconnect();
    };
  }, []);

  // ?bar= deep link: INITIAL_VIEW guarantees the card is in the first paint
  // (unless the link also carries a conflicting city/type — then this no-ops).
  useEffect(() => {
    if (!INITIAL_BAR) return;
    document.getElementById(`bar-${INITIAL_BAR}`)?.scrollIntoView({ block: 'start' });
  }, []);

  const typeMatch = (s) => type === 'all' || s.type === type || s.type === 'both';
  const cityBars = useMemo(
    () => DATA.bars.filter((b) => (city === 'all' || b.city === city) && (tag === 'all' || b.tags.includes(tag))),
    [city, tag]
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

  // Screen readers hear the result of a filter or day change. Counts only move
  // when a window opens or closes — never the per-minute countdown text.
  const status =
    view === 'now'
      ? `${pouring.length} pouring now, ${laterToday.length} later today`
      : `${dayList.length} bar${dayList.length === 1 ? '' : 's'} with ${weekdayLabel(view)} specials`;

  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const weekday = now.toLocaleDateString([], { weekday: 'long' });
  const today = DAY_KEYS[now.getDay()];
  // The hero's second line states a finding (sourced times only), not a description
  const finding = view === 'now' ? heroFinding(pouring, laterToday) : '';

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
        <header className="hero">
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
          <h1 className="hero-title">
            {view === 'now' ? (
              pouring.length > 0 ? (
                <>
                  <span className="hero-count">{pouring.length}</span> happy hour
                  {pouring.length === 1 ? ' is' : 's are'} pouring right now
                </>
              ) : laterToday.length > 0 ? (
                <>
                  <span className="hero-count">{laterToday.length}</span> happy hour
                  {laterToday.length === 1 ? '' : 's'} starting later today
                </>
              ) : (
                'Nothing pouring at the moment'
              )
            ) : (
              `${weekdayLabel(view)} happy hours`
            )}
          </h1>
          <p className="hero-sub">{finding || 'Drink and food specials at partner bars across the Wausau area'}</p>
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
        <p className="sr-only" role="status">
          {status}
        </p>

        {view === 'now' ? (
          <>
            {pouring.length > 0 && (
              <section>
                <h2 className="section-label">Pouring now</h2>
                <Timetable entries={pouring} by={endsAt} label={(t) => `Until ${t}`} now={now} trackNow={now} showDays={false} />
              </section>
            )}
            {laterToday.length > 0 && (
              <section>
                <h2 className="section-label">Later today</h2>
                <Timetable entries={laterToday} by={startsAt} label={(t) => `From ${t}`} now={now} trackNow={now} showDays={false} />
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
            <h2 className="sr-only">{weekdayLabel(view)} specials</h2>
            {dayList.length > 0 ? (
              <Timetable
                entries={dayList}
                by={startsAt}
                label={(t) => `From ${t}`}
                now={null}
                trackNow={view === today ? now : null}
                showDays={true}
              />
            ) : (
              <p className="empty">
                No specials listed for {weekdayLabel(view)} yet.{' '}
                <a href={CONTACT_LISTING}>Run one? Get it listed.</a>
              </p>
            )}
          </section>
        )}

        <p className="list-note">
          Each listing says where its specials came from and when we last checked. Lines marked Placeholder are still
          being confirmed with the bar.
        </p>
        {(view === 'fri' || (view === 'now' && DAY_KEYS[now.getDay()] === 'fri')) && (
          <p className="cross-promo">
            Friday in Wisconsin means fish fry — see our{' '}
            <a href={FISH_FRY_URL} target="_top">Wausau-area Fish Fry Guide</a>.
          </p>
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
          <a href="tel:+17153015539">715-301-5539</a> · Partner listings are paid placements · Last
          updated <span className="mono">{DATA.updated}</span>
        </p>
        <p>
          Run a bar or restaurant? Get listed: email Chris Weber at{' '}
          <a href={CONTACT_LISTING}>{CHRIS_EMAIL}</a> · <a href={CONTACT_CORRECTION}>Spot an error? Tell us</a>
        </p>
      </footer>
    </div>
  );
}
