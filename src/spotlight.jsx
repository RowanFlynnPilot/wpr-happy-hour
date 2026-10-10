// Newsletter spotlight — the cheap placement: a small sponsored ad for ONE
// verified partner, built from its listing so the ad can't drift from what the
// finder shows. scripts/render-digest.mjs screenshots one PNG per verified bar
// at deploy time; WPR books it into a newsletter ad zone for the dates sold.
//   spotlight.html?bar=<id>          the real ad (verified bars only — throws otherwise)
//   spotlight.html?preview=<id>      sales preview of a listed bar's ad before it's
//                                    verified: its sourced specials only, never sent
//   spotlight.html?demo              sales preview with a sample listing
//   spotlight.html?demo=Bar%20Name   same, with the prospect's name
//   &sample (with preview or demo)   drops the ribbon — for collateral that already
//                                    labels the image (the one-pager, the rate card)
// Internal page, not linked from the app.
import React from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { validate } from './data/validate.js';
import { fmtDays, fmtWindow, spotlightFor } from './schedule.js';
import './index.css';
import './digest.css';

const DATA = validate(data);
const PARAMS = new URLSearchParams(window.location.search);
const MODES = ['bar', 'preview', 'demo'].filter((m) => PARAMS.has(m));
if (MODES.length !== 1) throw new Error('spotlight.html: pass exactly one of ?bar=<id>, ?preview=<id> or ?demo');
const MODE = MODES[0];
// A forwarded preview link must explain itself, so the ribbon stays unless the
// image is going into a page that labels it
const RIBBON = MODE !== 'bar' && !PARAMS.has('sample');

function Spotlight({ bar, cta }) {
  const { rows, more } = spotlightFor(bar, { preview: MODE === 'preview' });
  return (
    <div className="spotlight">
      {RIBBON && (
        <p className="digest-ribbon">{MODE === 'demo' ? 'Sales preview, with a sample listing' : 'Sales preview'}</p>
      )}
      <div className="spotlight-head">
        <span className="spotlight-chip">Advertisement</span>
        <span className="spotlight-kicker">
          <img className="spotlight-mark" src="./favicon.svg" alt="" width="20" height="20" />
          Happy Hour Finder
        </span>
      </div>
      <div className="spotlight-id">
        <div>
          <h1 className="spotlight-name">{bar.name}</h1>
          <p className="spotlight-address">{bar.address}</p>
        </div>
        {bar.photo && <img className="spotlight-photo" src={bar.photo} alt="" />}
      </div>
      <ul className="spotlight-rows" data-rows={rows.length}>
        {rows.map((g, i) => (
          <li key={i}>
            <p className="spotlight-when mono">
              <span className="spotlight-days">{fmtDays(g.days)}</span>
              {fmtWindow(g)}
            </p>
            <p className="spotlight-what">
              <span className={`type-icon type-${g.type}`} aria-hidden="true" /> {g.items.join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="spotlight-more">+ {more} more special{more === 1 ? '' : 's'} this week</p>}
      {cta && <p className="spotlight-cta">{cta} →</p>}
    </div>
  );
}

// The CTA names where the click goes: the bar's own site (the image links there)
const domain = (url) => new URL(url).hostname.replace(/^www\./, '');

function Page() {
  if (MODE === 'demo') return <Spotlight bar={demoBar(PARAMS.get('demo'))} cta="Your website" />;
  const id = PARAMS.get(MODE);
  const bar = DATA.bars.find((b) => b.id === id);
  if (!bar) throw new Error(`spotlight.html: no bar with id "${id}"`);
  return <Spotlight bar={bar} cta={bar.website && domain(bar.website)} />;
}

/* ------------------------------------------------------------------ */
/* Demo mode (sales preview) — looks like dead code, is not.           */
/* ?demo shows a prospect the ad with their name before they sign.     */
/* Sample rows only: we never invent specials for a real business.     */
/* ------------------------------------------------------------------ */
function demoBar(prospect) {
  return {
    id: 'your-bar', name: prospect || 'Your Bar Here', city: 'Wausau', address: 'Your address, Wausau',
    website: '', tier: 'partner', photo: null, verifiedOn: '2026-01-01',
    specials: [
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '15:00', end: '18:00', type: 'drinks', items: ['Your drink specials, with prices'] },
      { days: ['fri'], start: '16:00', end: '21:00', type: 'food', items: ['Your food special, with its price'] },
    ],
  };
}

// Last, after the demo helpers above are defined
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
