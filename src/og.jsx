// The link preview image (og-image.png, 1200 x 630): what a shared finder link
// shows in a text thread or a Facebook post. The finder's evening band at golden
// hour — its name, what it does, and Friday drawn as the skyline — with no count
// or time on it: a preview can sit in a feed for months. Rendered at deploy by
// scripts/render-digest.mjs, so it follows the design and the data.
import React from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { validate } from './data/validate.js';
import { dayAtAGlance } from './schedule.js';
import { DayShape } from './marks.jsx';
import './index.css';
import './og.css';

const { shape, peakAt } = dayAtAGlance(validate(data).bars, 'fri', () => true);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div className="og" data-phase="golden">
      <p className="og-tool">
        <img src="./favicon.svg" alt="" />
        Happy Hour Finder
      </p>
      <h1 className="og-title">
        See what’s <span>pouring right now</span> in the Wausau area
      </h1>
      <DayShape counts={shape} sunAt={peakAt === null ? null : peakAt + 15} />
      <p className="og-from">Wausau Pilot &amp; Review</p>
    </div>
  </React.StrictMode>
);
