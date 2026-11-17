// Table tent — a sign a partner stands on the bar: its name, "Scan for our happy
// hour", and a QR code to its listing on the finder. One Letter page, two panels
// head to head, folded on the middle line so it reads from both sides.
//   tent.html?bar=<id>     print it (card stock, 100% scale), fold, stand it up
// No specials, prices or times are printed: a sign outlives the data, and the
// listing it points to is always current. A bar that isn't verified yet prints
// with a "Sample" strip, so a tent doesn't go out before the listing is confirmed.
// The QR link carries utm_source=tent, so scans show up in the stats.
// Internal page, not linked from the app.
import React from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { validate } from './data/validate.js';
import { listingUrl } from './schedule.js';
import { qrModules } from './qr.js';
import { Seal } from './marks.jsx';
import './index.css';
import './tent.css';

const DATA = validate(data);
const id = new URLSearchParams(window.location.search).get('bar');
const bar = DATA.bars.find((b) => b.id === id);
if (!bar) throw new Error(`tent.html: pass ?bar=<id> — no bar with id "${id}"`);

// Dark modules as one path, with the four-module quiet zone scanners need
function QR({ text }) {
  const grid = qrModules(text);
  const d = grid.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + 4} ${y + 4}h1v1h-1z` : ''))).join('');
  const size = grid.length + 8;
  return (
    <svg className="tent-qr" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={`QR code to ${bar.name} on the Happy Hour Finder`}>
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function Panel() {
  return (
    <section className="tent-panel">
      {bar.verifiedOn === null && <p className="tent-sample">Sample: this listing isn’t confirmed yet</p>}
      <div className="tent-words">
        <p className="tent-bar">{bar.name}</p>
        <h1 className="tent-headline">Scan for our happy hour</h1>
        <p className="tent-sub">Today’s specials and times, on the Happy Hour Finder.</p>
        <p className="tent-from">
          <img className="tent-badge" src="./wpr-typewriter-badge.png" alt="" />
          <img className="tent-wordmark" src="./wpr-wordmark.png" alt="Wausau Pilot & Review" />
          {bar.verifiedOn !== null && <Seal />}
        </p>
      </div>
      <div className="tent-code">
        <QR text={listingUrl(bar, 'tent')} />
        <p className="tent-hint">Point your phone’s camera here</p>
      </div>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <p className="tent-how">
      Table tent for <strong>{bar.name}</strong>. Print on card stock at 100% scale (Letter, no margins), fold on the dashed
      line, and stand it up.
    </p>
    <main className="tent-sheet">
      <Panel />
      <Panel />
    </main>
  </React.StrictMode>
);
