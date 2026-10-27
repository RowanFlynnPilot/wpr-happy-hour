// Newsletter spotlight — the cheap placement: one partner's own ad, built at the
// newsletter ad unit's real size, 970 x 500. Its photo, logo and words come from the
// bar (bars.json "photo", "logo", "ad"); the button names its site, where the image
// links. The look is picked per bar ("ad.style"), so ads in one newsletter don't all
// look alike: photo, menu, neon or marquee (see AD_STYLES in validate.js).
// scripts/render-digest.mjs screenshots one JPEG per verified bar with ad copy at
// deploy time; WPR books it into a newsletter ad zone for the dates sold.
//   spotlight.html?bar=<id>        the real ad (verified bars only — throws otherwise)
//   spotlight.html?preview=<id>    sales preview of a listed bar's ad before it's
//                                  verified, never sent
//   &style=<style> (with preview)  the same ad in another look, to show a prospect
//   &sample (with preview)         drops the ribbon — for collateral that already
//                                  labels the image (the one-pager, the rate card)
// No sample-listing demo: an ad without the bar's own photo and logo isn't the
// product. A prospect's preview gets its "photo", "logo" and "ad" in bars.json.
// Every part a reader must see carries data-box (kept inside the ad and clear of
// the others) or .fit (a line that must not be cut off); the render checks both.
// Internal page, not linked from the app.
import React from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { AD_INK, AD_STYLES, validate } from './data/validate.js';
import { spotlightFor } from './schedule.js';
import { Arrow } from './marks.jsx';
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
// Another look for a sales preview only: what runs is what bars.json says
const STYLE = PARAMS.get('style');
if (STYLE !== null && (MODE !== 'preview' || !AD_STYLES.includes(STYLE))) {
  throw new Error(`spotlight.html: &style= works with ?preview= only, and must be one of ${AD_STYLES.join(', ')}`);
}

// photo — the bar's photo on the right under a scrim, its logo on a cream plate,
// an Anton headline, a tilted Yellowtail line in the bar's accent, a chalkboard of
// the details hung from the top edge, and a button
function PhotoAd({ bar, ad }) {
  const [when, ...lines] = ad.board;
  return (
    <>
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
          <p className="ad-when fit">{when}</p>
          {lines.length > 0 && <hr />}
          {lines.map((l, i) => (
            <p className="fit" key={i}>{l}</p>
          ))}
        </div>
      </div>
    </>
  );
}

// menu — a supper-club menu card on a dark green wall: the logo, the headline in
// Bodoni, the line in italic, each priced line set with dotted leaders, the plate
// in an arched window beside it
function MenuAd({ bar, ad }) {
  return (
    <>
      <div className="menu-card fit-y" data-box="menu">
        <img className="menu-logo" src={bar.logo} alt="" />
        <h1 className="menu-headline fit">{ad.headline}</h1>
        <p className="menu-line fit">{ad.line}</p>
        <ul className="menu-rows">
          {ad.rows.map((r, i) =>
            r.price ? (
              <li className="menu-row" key={i}>
                <span className="menu-item fit">{r.item}</span>
                <span className="menu-leader" />
                <span className="menu-price">{r.price}</span>
              </li>
            ) : (
              <li className="menu-note fit" key={i}>
                {r.text}
              </li>
            )
          )}
        </ul>
        <p className="menu-cta fit">{ad.cta}</p>
      </div>
      <div className="menu-window">
        <img className="ad-photo" src={bar.photo} alt="" />
      </div>
    </>
  );
}

// neon — a roadside sign at night: the logo in a lit box, the line as a tube in the
// bar's accent, the headline in pink neon script with an arrow at the plate, the
// notes and the prices as amber tubes
function NeonAd({ bar, ad }) {
  const notes = ad.rows.filter((r) => !r.price).map((r) => r.text);
  const prices = ad.rows.filter((r) => r.price).map((r) => r.text);
  return (
    <>
      <img className="ad-photo" src={bar.photo} alt="" />
      <div className="neon-night" />
      <div className="neon-box" data-box="logo">
        <img src={bar.logo} alt="" />
      </div>
      <div className="neon-sign" data-box="sign">
        <p className="neon-line">{ad.line}</p>
        <h1 className="neon-headline">
          {ad.headline}
          <Arrow />
        </h1>
        {notes.length > 0 && <p className="neon-small">{notes.join(' · ')}</p>}
        {prices.length > 0 && <p className="neon-small">{prices.join(' · ')}</p>}
      </div>
      <p className="neon-cta" data-box="button">{ad.cta}</p>
    </>
  );
}

// marquee — the roadside changeable-letter board, bulbs all round, its logo on a
// topper: the headline in red letters, then the line and the details, one a row
function MarqueeAd({ bar, ad }) {
  return (
    <>
      <img className="ad-photo" src={bar.photo} alt="" />
      <div className="marquee-shade" />
      <div className="marquee-sign" data-box="sign">
        <div className="marquee-topper">
          <img src={bar.logo} alt="" />
        </div>
        <div className="marquee-frame">
          <div className="marquee-board">
            <p className="marquee-row marquee-red fit">{ad.headline}</p>
            <p className="marquee-row fit">{ad.line}</p>
            {ad.board.map((t, i) => (
              <p className="marquee-row fit" key={i}>
                {t}
              </p>
            ))}
          </div>
        </div>
      </div>
      <p className="marquee-cta" data-box="button">{ad.cta}</p>
    </>
  );
}

const LAYOUTS = { photo: PhotoAd, menu: MenuAd, neon: NeonAd, marquee: MarqueeAd };

function Spotlight({ bar }) {
  const ad = spotlightFor(bar, { preview: MODE === 'preview' });
  const style = STYLE ?? ad.style;
  const Layout = LAYOUTS[style];
  return (
    <div className="spotlight">
      {RIBBON && <p className="spotlight-ribbon">{STYLE ? `Sales preview, in the ${STYLE} style` : 'Sales preview'}</p>}
      <div className="ad" data-style={style} style={{ '--ink': AD_INK, '--accent': ad.accent }}>
        <Layout bar={bar} ad={ad} />
        <p className="ad-label" data-box="label">
          Advertisement
        </p>
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
