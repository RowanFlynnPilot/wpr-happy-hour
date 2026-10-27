// Drawn marks shared by the finder (App.jsx) and the newsletter card (digest.jsx):
// the day's 10 AM–midnight axis and its skyline, the newsroom's "Verified by
// phone" seal, and the arrow. Styles in index.css.
import { useId } from 'react';
import { SHAPE_START, SHAPE_STEP } from './schedule.js';

// One axis for every drawing of a day, the rows' tracks included
export const AXIS_START = SHAPE_START;
export const AXIS_END = 24 * 60;
const frac = (m) => (Math.min(Math.max(m, AXIS_START), AXIS_END) - AXIS_START) / (AXIS_END - AXIS_START);
export const pctOf = (m) => `${(frac(m) * 100).toFixed(2)}%`;
export const spanOf = (a, b) => `${((frac(b) - frac(a)) * 100).toFixed(2)}%`;
export const onAxis = (m) => m !== null && m >= AXIS_START && m < AXIS_END;

const AXIS_LABELS = [
  [10, '10 AM'],
  [12, 'noon'],
  [15, '3'],
  [18, '6'],
  [21, '9'],
  [24, 'midnight'],
];

export function Axis({ className = 'axis' }) {
  return (
    <div className={className} aria-hidden="true">
      {AXIS_LABELS.map(([h, label]) => (
        <span key={h} className={h === 12 ? 'axis-noon' : undefined} style={{ left: pctOf(h * 60) }}>
          {label}
        </span>
      ))}
    </div>
  );
}

// The day at a glance, on that axis: how many bars have a sourced special each
// half hour (dayShape), and a sun on the horizon. The finder puts the sun at the
// clock (nowMin: the hours gone greyed, a "now" line); the newsletter card, which
// has no clock, at its busiest half hour (sunAt). It's also the key to the rows'
// tracks. Hidden from screen readers — the sentences beside it say what it shows.
export function DayShape({ counts, nowMin = null, sunAt = nowMin }) {
  const max = Math.max(...counts);
  if (max === 0) return null;
  const sun = onAxis(sunAt) ? pctOf(sunAt) : null;
  return (
    <div className="hero-day" aria-hidden="true">
      <div className={`hero-skyline${sun ? ' has-sun' : ''}`} style={sun ? { '--sun': sun } : undefined}>
        {counts.map((c, i) => (
          <span
            key={i}
            className={`bin${nowMin !== null && SHAPE_START + (i + 1) * SHAPE_STEP <= nowMin ? ' past' : ''}`}
            style={{ height: c ? `${Math.max(10, (c / max) * 100)}%` : 0 }}
          />
        ))}
        {onAxis(nowMin) && <span className="hero-now" style={{ left: pctOf(nowMin) }} />}
      </div>
      <Axis className="axis hero-axis" />
    </div>
  );
}

// The newsroom's stamp on phone-verified listings: the check a review site can't
// make. Decoration — the words beside it ("Verified by phone, Oct 2026") are the text.
export function Seal() {
  const id = useId();
  return (
    <svg className="seal" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <path id={`${id}t`} d="M 8.5 32 A 23.5 23.5 0 0 1 55.5 32" />
        <path id={`${id}b`} d="M 4.5 32 A 27.5 27.5 0 0 0 59.5 32" />
      </defs>
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="32" cy="32" r="20.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <text>
        <textPath href={`#${id}t`} startOffset="50%" textAnchor="middle">
          VERIFIED
        </textPath>
      </text>
      <text>
        <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle">
          BY PHONE
        </textPath>
      </text>
      <path d="M23.5 32.5l6 6 11-12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg className="arrow" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
