// Newsletter spotlight — the cheap placement: one partner's own ad, in WPR's
// house ad style (approved Oct 11, 2026), built at the newsletter ad unit's real
// size, 970 x 500. Its photo, logo and words come from the bar (bars.json "photo",
// "logo", "ad"); the button names its site, where the image links.
// scripts/render-digest.mjs screenshots one JPEG per verified bar with ad copy at
// deploy time; WPR books it into a newsletter ad zone for the dates sold.
//   spotlight.html?bar=<id>        the real ad (verified bars only — throws otherwise)
//   spotlight.html?preview=<id>    sales preview of a listed bar's ad before it's
//                                  verified, never sent
//   &sample (with preview)         drops the ribbon — for collateral that already
//                                  labels the image (the one-pager, the rate card)
// No sample-listing demo: an ad without the bar's own photo and logo isn't the
// product. A prospect's preview gets its "photo", "logo" and "ad" in bars.json.
// Internal page, not linked from the app.
import React from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { AD_INK, validate } from './data/validate.js';
import { spotlightFor } from './schedule.js';
import './index.css';
import './spotlight.css';

const DATA = validate(data);
const PARAMS = new URLSearchParams(window.location.search);
const MODES = ['bar', 'preview'].filter((m) => PARAMS.has(m));
if (MODES.length !== 1) throw new Error('spotlight.html: pass exactly one of ?bar=<id> or ?preview=<id>');
const MODE = MODES[0];
// A forwarded preview link must explain itself, so the ribbon stays unless the
// image is going into a page that labels it
const RIBBON = MODE === 'preview' && !PARAMS.has('sample');

function Spotlight({ bar }) {
  const ad = spotlightFor(bar, { preview: MODE === 'preview' });
  const [when, ...lines] = ad.board;
  // data-box: the render checks these stay inside the ad and clear of each other
  return (
    <div className="spotlight">
      {RIBBON && <p className="spotlight-ribbon">Sales preview</p>}
      <div className="ad" style={{ '--ink': AD_INK, '--accent': ad.accent }}>
        <img className="ad-photo" src={bar.photo} alt="" />
        <div className="ad-scrim" />
        <div className="ad-plate" data-box="logo">
          <img src={bar.logo} alt="" />
        </div>
        <h1 className="ad-headline" data-box="headline">{ad.headline}</h1>
        <p className="ad-line" data-box="line">{ad.line}</p>
        <p className="ad-cta" data-box="button">{ad.cta}</p>
        <div className="ad-board" data-box="board">
          <span className="ad-rope" />
          <span className="ad-rope" />
          <div className="ad-slate">
            <p className="ad-when">{when}</p>
            {lines.length > 0 && <hr />}
            {lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
        <p className="ad-label" data-box="label">Advertisement</p>
      </div>
    </div>
  );
}

function Page() {
  const id = PARAMS.get(MODE);
  const bar = DATA.bars.find((b) => b.id === id);
  if (!bar) throw new Error(`spotlight.html: no bar with id "${id}"`);
  return <Spotlight bar={bar} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
