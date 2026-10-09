// Newsletter card — the email version of the finder. Email can't run the app
// (no iframes, no JavaScript), so scripts/render-digest.mjs screenshots this
// page into one PNG per weekday at deploy time, and the newsletter pipeline
// (wpr-newsletter repo) drops in the day's image.
//   digest.html?day=thu                 the real card: verified partners only
//   digest.html?day=thu&demo            sales preview with sample listings
//   digest.html?day=thu&demo=Bar%20Name same, with the prospect's name featured
// Internal page, not linked from the app: a bad ?day= throws.
import React from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { DAY_KEYS, validate } from './data/validate.js';
import { digestFor, digestSchedule, fmtTime, fmtWindow, groupSpecials, weekdayLabel } from './schedule.js';
import './index.css';
import './digest.css';

const DATA = validate(data);
const PARAMS = new URLSearchParams(window.location.search);
const DAY = PARAMS.get('day');
if (!DAY_KEYS.includes(DAY)) throw new Error(`digest.html: ?day= must be one of ${DAY_KEYS.join(', ')}`);
const DEMO = PARAMS.has('demo');

function Digest() {
  const bars = DEMO ? demoBars(PARAMS.get('demo')) : DATA.bars;
  // A sold slot is never overridden, even in demo mode
  const sponsor = DATA.sponsor ?? (DEMO ? DEMO_SPONSOR : null);
  const { count, featured, listed, more } = digestFor(bars, DAY);

  return (
    <div className="digest">
      {DEMO && <p className="digest-ribbon">Sales preview, with sample listings</p>}
      <header className="digest-head">
        <p className="digest-kicker">
          <img className="digest-mark" src="./favicon.svg" alt="" width="24" height="24" />
          Happy Hour Finder
        </p>
        <h1 className="digest-title">{weekdayLabel(DAY)}’s happy hours</h1>
        <p className="digest-sub">
          {count === 0
            ? 'No verified partner listings for this day yet.'
            : `${count} partner bar${count === 1 ? '' : 's'} with specials today`}
        </p>
      </header>

      {sponsor && (
        <p className="digest-sponsor">
          <span className="digest-sponsor-eyebrow">Presented by</span>
          <span className="digest-sponsor-name">{sponsor.name}</span>
        </p>
      )}

      {featured.map(({ bar, specials }) => (
        <article className="digest-featured" key={bar.id}>
          <span className="digest-badge">Featured</span>
          {bar.photo && <img className="digest-photo" src={bar.photo} alt="" />}
          <h2 className="digest-name">{bar.name}</h2>
          <p className="digest-address">{bar.address}</p>
          {groupSpecials(specials).map((g, i) => (
            <div className="digest-special" key={i}>
              <p className="digest-time mono">{fmtWindow(g)}</p>
              <ul className="digest-items">
                {g.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </article>
      ))}

      {listed.length > 0 && (
        <section className="digest-roll">
          <h3 className="digest-label">{featured.length > 0 ? 'Also today' : 'Today'}</h3>
          {digestSchedule(listed).map((slot) => (
            <div className="digest-slot" key={slot.start}>
              <p className="digest-slot-time">{fmtTime(slot.start)}</p>
              <ul className="digest-slot-bars">
                {slot.rows.map(({ bar, end, later }) => (
                  <li key={bar.id}>
                    <span className="digest-list-name">{bar.name}</span>
                    <span className="digest-list-time">
                      until <span className="mono">{fmtTime(end)}</span>
                      {later.length > 0 && (
                        <>
                          , then <span className="mono">{later.map(fmtWindow).join(', ')}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {more > 0 && <p className="digest-more">+ {more} more on the Happy Hour Finder</p>}
        </section>
      )}

      <p className="digest-fine">Every listing is a paid partner placement, confirmed with the bar by phone.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Demo mode (sales preview) — looks like dead code, is not.           */
/* ?demo fills the card with sample listings so Chris can show it to a */
/* prospect before partners sign. Sample rows only: real bars aren't   */
/* partners yet, and we never invent specials for a real business.     */
/* ------------------------------------------------------------------ */
const DEMO_SPONSOR = { name: 'Your Business Here', url: '' };
const DEMO_WINDOWS = [
  ['15:00', '17:00'], ['15:00', '18:00'], ['15:00', '18:00'], ['15:00', '18:00'], ['16:00', '18:00'],
  ['16:00', '18:00'], ['16:00', '19:00'], ['16:00', '19:00'], ['17:00', '19:00'], ['17:00', '19:00'],
  ['20:00', '22:00'], ['21:00', '23:00'],
];

function demoBars(prospect) {
  const sample = (id, name, tier, [start, end], items, address) => ({
    id, name, tier, address, city: 'Wausau', website: '', photo: null, verifiedOn: '2026-01-01',
    specials: [{ days: [DAY], start, end, type: 'both', items }],
  });
  return [
    sample('your-bar', prospect || 'Your Bar Here', 'featured', ['15:00', '18:00'],
      ['Your drink specials, with prices', 'Your food specials, with prices'], 'Your address, Wausau'),
    ...DEMO_WINDOWS.map((w, i) => sample(`partner-${i}`, 'Partner bar', 'partner', w, ['Sample'], '')),
  ];
}

// Last, after the demo constants above are initialized
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Digest />
  </React.StrictMode>
);
