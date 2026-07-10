import { useEffect, useMemo, useState } from 'react';
import data from './data/bars.json';

/* ------------------------------------------------------------------ */
/* Schema validation — fail fast at load, not silently at render time */
/* ------------------------------------------------------------------ */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const TYPES = ['drinks', 'food', 'both'];
const TIERS = ['free', 'featured'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(json) {
  if (!Array.isArray(json.bars) || json.bars.length === 0) {
    throw new Error('bars.json: "bars" must be a non-empty array');
  }
  const seen = new Set();
  for (const bar of json.bars) {
    for (const field of ['id', 'name', 'city', 'address', 'tier', 'specials']) {
      if (bar[field] === undefined) throw new Error(`bars.json: bar "${bar.id ?? bar.name}" missing "${field}"`);
    }
    if (seen.has(bar.id)) throw new Error(`bars.json: duplicate id "${bar.id}"`);
    seen.add(bar.id);
    if (!TIERS.includes(bar.tier)) throw new Error(`bars.json: bar "${bar.id}" has invalid tier "${bar.tier}"`);
    if (!Array.isArray(bar.specials) || bar.specials.length === 0) {
      throw new Error(`bars.json: bar "${bar.id}" must have at least one special`);
    }
    for (const s of bar.specials) {
      if (!Array.isArray(s.days) || s.days.length === 0 || s.days.some((d) => !DAY_KEYS.includes(d))) {
        throw new Error(`bars.json: bar "${bar.id}" has a special with invalid days`);
      }
      if (!HM.test(s.start) || !HM.test(s.end)) {
        throw new Error(`bars.json: bar "${bar.id}" has a special with invalid start/end (use 24h HH:MM)`);
      }
      if (toMinutes(s.start) >= toMinutes(s.end)) {
        throw new Error(`bars.json: bar "${bar.id}" special must end after it starts (no cross-midnight windows)`);
      }
      if (!TYPES.includes(s.type)) throw new Error(`bars.json: bar "${bar.id}" special has invalid type "${s.type}"`);
      if (!Array.isArray(s.items) || s.items.length === 0) {
        throw new Error(`bars.json: bar "${bar.id}" special must list at least one item`);
      }
    }
  }
  return json;
}

/* ---------------- */
/* Time utilities   */
/* ---------------- */

function toMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Status of one special relative to a Date: 'now' | 'later' | 'done' | null (not today)
function specialStatus(special, date) {
  const today = DAY_KEYS[date.getDay()];
  if (!special.days.includes(today)) return null;
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins < toMinutes(special.start)) return 'later';
  if (mins < toMinutes(special.end)) return 'now';
  return 'done';
}

function minutesUntil(hm, date) {
  return toMinutes(hm) - (date.getHours() * 60 + date.getMinutes());
}

/* ---------------- */
/* Data (validated) */
/* ---------------- */

const DATA = validate(data);
const CITIES = [...new Set(DATA.bars.map((b) => b.city))].sort();

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
          <span className="special-days mono">{special.days.map((d) => DAY_LABELS[d]).join(' · ')}</span>
        )}
        <span className="special-time mono">
          {fmtTime(special.start)}–{fmtTime(special.end)}
        </span>
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

function BarCard({ bar, specials, now, showDays }) {
  return (
    <article className={`card${bar.tier === 'featured' ? ' card-featured' : ''}`}>
      {bar.tier === 'featured' && <div className="featured-badge">Featured</div>}
      {bar.tier === 'featured' && bar.photo && (
        <img className="card-photo" src={bar.photo} alt={bar.name} loading="lazy" />
      )}
      <header className="card-head">
        <h3 className="card-name">
          {bar.website ? (
            <a href={bar.website} target="_blank" rel="noopener noreferrer">
              {bar.name}
            </a>
          ) : (
            bar.name
          )}
        </h3>
        <p className="card-address">
          {bar.address} · {bar.city}
        </p>
      </header>
      {specials.map((s, i) => (
        <SpecialRow key={i} special={s} now={now} showDays={showDays} />
      ))}
    </article>
  );
}

/* ---------------- */
/* App              */
/* ---------------- */

const featuredFirst = (a, b) =>
  a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === 'featured' ? -1 : 1;

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState('now'); // 'now' | one of DAY_KEYS
  const [city, setCity] = useState('all');
  const [type, setType] = useState('all'); // 'all' | 'drinks' | 'food'

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const typeMatch = (s) => type === 'all' || s.type === type || s.type === 'both';
  const cityBars = useMemo(
    () => DATA.bars.filter((b) => city === 'all' || b.city === city),
    [city]
  );

  // Now view: bars grouped by whether any qualifying special is active this minute
  const { pouring, laterToday } = useMemo(() => {
    const pouring = [];
    const laterToday = [];
    for (const bar of cityBars) {
      const qualifying = bar.specials.filter(typeMatch);
      const active = qualifying.filter((s) => specialStatus(s, now) === 'now');
      const upcoming = qualifying.filter((s) => specialStatus(s, now) === 'later');
      if (active.length > 0) pouring.push({ bar, specials: active });
      else if (upcoming.length > 0) laterToday.push({ bar, specials: upcoming });
    }
    pouring.sort((a, b) => featuredFirst(a.bar, b.bar));
    laterToday.sort(
      (a, b) =>
        featuredFirst(a.bar, b.bar) ||
        toMinutes(a.specials[0].start) - toMinutes(b.specials[0].start)
    );
    return { pouring, laterToday };
  }, [cityBars, now, type]);

  // Day view: every bar with a qualifying special on the chosen day
  const dayList = useMemo(() => {
    if (view === 'now') return [];
    return cityBars
      .map((bar) => ({
        bar,
        specials: bar.specials.filter((s) => typeMatch(s) && s.days.includes(view)),
      }))
      .filter((e) => e.specials.length > 0)
      .sort(
        (a, b) =>
          featuredFirst(a.bar, b.bar) ||
          toMinutes(a.specials[0].start) - toMinutes(b.specials[0].start)
      );
  }, [cityBars, view, type]);

  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const weekday = now.toLocaleDateString([], { weekday: 'long' });

  return (
    <div className="app">
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
            ) : (
              'Nothing pouring at the moment'
            )
          ) : (
            `${weekdayLabel(view)} happy hours`
          )}
        </h1>
        <p className="hero-sub">Verified specials at bars across the Wausau area</p>
      </header>

      <nav className="controls">
        <div className="day-picker" role="tablist" aria-label="Pick a day">
          <button
            role="tab"
            aria-selected={view === 'now'}
            className={`day-btn${view === 'now' ? ' active' : ''}`}
            onClick={() => setView('now')}
          >
            Now
          </button>
          {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={view === d}
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
            <p className="empty">Quiet out there today. Pick a day above to plan ahead.</p>
          )}
        </>
      ) : (
        <section>
          {dayList.length > 0 ? (
            <div className="grid">
              {dayList.map(({ bar, specials }) => (
                <BarCard key={bar.id} bar={bar} specials={specials} now={null} showDays={false} />
              ))}
            </div>
          ) : (
            <p className="empty">No specials listed for {weekdayLabel(view)} yet.</p>
          )}
        </section>
      )}

      <footer className="footer">
        <p className="sponsor-slot">
          Happy Hour Finder, presented by <span className="sponsor-open">your business here</span>
        </p>
        <p>
          A <strong>Wausau Pilot &amp; Review</strong> community tool · Specials verified with each bar ·
          Last updated <span className="mono">{DATA.updated}</span>
        </p>
        <p>
          Own a bar? <a href="https://wausaupilotandreview.com/contact/">Claim or update your listing</a> — basic
          listings are free.
        </p>
      </footer>
    </div>
  );
}

function weekdayLabel(key) {
  return { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }[key];
}
