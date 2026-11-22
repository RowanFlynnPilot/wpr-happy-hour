// Listing check — the page a bar's owner opens to see what the finder says about
// them and send back what's right.
//   confirm.html?bar=<id>   the bar's specials, editable, and one button that opens
//                           an email to Chris with the answers
//   confirm.html            the list of every bar's link, for Chris to send out
// It has no backend and sends nothing itself: the owner's own mail app sends the
// email. The specials in it are written in the call sheet's "Verified specials
// (final)" format (specialsToSheet), so Chris pastes them into the sheet after his
// call and `npm run calls` reads them. Nothing here changes bars.json, and nothing
// is verified until Chris has confirmed it by phone. The owner's name and best time
// to call go in the email only — contact details never go in bars.json.
// Not linked from the finder; a link that names no known bar says so plainly (it
// arrives from outside, like the finder's own deep links).
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { TAGS, validate } from './data/validate.js';
import { CHRIS_EMAIL, DAY_LABELS, WEEK_ORDER, byBarName, claimOf, isPlaceholder, specialsToSheet } from './schedule.js';
import './index.css';
import './confirm.css';

const DATA = validate(data);
const id = new URLSearchParams(window.location.search).get('bar');
const bar = DATA.bars.find((b) => b.id === id);

const blank = () => ({ days: [], start: '', end: '', type: 'drinks', text: '', guess: false });
const fromBar = (s) => ({
  days: s.days,
  start: s.start,
  end: s.end,
  type: s.type,
  // a research guess is put to the owner as the plain claim to correct; one that
  // claims nothing ("specials being confirmed") leaves the box empty to fill in
  text: s.items.map(claimOf).filter(Boolean).join('\n'),
  guess: s.items.some(isPlaceholder),
});
const itemsOf = (row) => row.text.split('\n').map((t) => t.trim()).filter(Boolean);

// What stops a row from being sent, in the owner's words; null when it's fine
function problem(row) {
  if (row.days.length === 0) return 'Pick at least one day.';
  if (!row.start || !row.end) return 'Add a start and an end time.';
  if (row.end <= row.start) return 'The end has to be after the start. For a special that runs to close, end it at 11:59 PM.';
  if (itemsOf(row).length === 0) return 'Say what the special is.';
  return null;
}

// Rows the owner sent back without touching that were only ever our guess: Chris
// asks about those on the call instead of taking them as confirmed
function emailBody(rows, tags, note, who, when, more) {
  const untouched = rows.map((r, i) => (r.guess ? i + 1 : null)).filter(Boolean);
  const specials = rows.map((r) => ({ days: WEEK_ORDER.filter((d) => r.days.includes(d)), start: r.start, end: r.end, type: r.type, items: itemsOf(r) }));
  return [
    `Listing check: ${bar.name} (${bar.id})`,
    who ? `From: ${who}` : null,
    when ? `Best time to call: ${when}` : null,
    '',
    'Specials:',
    specials.length ? specialsToSheet(specials) : 'None right now.',
    untouched.length ? `Not changed by the owner, still our guess: line ${untouched.join(', ')}` : null,
    '',
    `Tags: ${tags.length ? tags.join(', ') : 'none'}`,
    note ? `Note for the listing: ${note}` : null,
    more ? `Anything else: ${more}` : null,
    '',
    'Sent from the Happy Hour Finder listing check. Nothing changes until Chris confirms it by phone.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

function Check() {
  const [rows, setRows] = useState(() => bar.specials.map(fromBar));
  const [tags, setTags] = useState(bar.tags);
  const [note, setNote] = useState(bar.note ?? '');
  const [who, setWho] = useState('');
  const [when, setWhen] = useState('');
  const [more, setMore] = useState('');
  const [copied, setCopied] = useState(false);

  const edit = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, guess: false } : r)));
  const toggleDay = (i, d) => edit(i, { days: rows[i].days.includes(d) ? rows[i].days.filter((x) => x !== d) : [...rows[i].days, d] });
  const problems = rows.map(problem);
  const ready = problems.every((p) => p === null);
  const body = ready ? emailBody(rows, Object.keys(TAGS).filter((t) => tags.includes(t)), note.trim(), who.trim(), when.trim(), more.trim()) : '';
  const subject = `Happy Hour Finder listing check: ${bar.name}`;
  const mailto = `mailto:${CHRIS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const copy = () =>
    navigator.clipboard.writeText(body).then(
      () => setCopied(true),
      () => document.getElementById('check-text').select() // no clipboard here: the text is selected to copy by hand
    );

  return (
    <main className="check">
      <p className="check-kicker">
        <img src="./favicon.svg" alt="" width="22" height="22" /> Happy Hour Finder · Wausau Pilot &amp; Review
      </p>
      <h1>Is this right, {bar.name}?</h1>
      <p className="check-lead">
        This is what our Happy Hour Finder has for you at {bar.address}. Fix anything that’s wrong or out of date, add what’s
        missing, then send it to Chris Weber. He’ll call to confirm before anything changes on the finder.
      </p>

      <h2>Your specials</h2>
      {rows.length === 0 && <p className="check-none">No specials listed. Add one below, or tell us in “Anything else” if you don’t run any.</p>}
      {rows.map((row, i) => (
        <fieldset className="check-row" key={i}>
          <legend>Special {i + 1}</legend>
          {row.guess && <p className="check-guess">This one is our best guess. Please correct it.</p>}
          <div className="check-days" role="group" aria-label="Days">
            {WEEK_ORDER.map((d) => (
              <label key={d} className={row.days.includes(d) ? 'on' : ''}>
                <input type="checkbox" checked={row.days.includes(d)} onChange={() => toggleDay(i, d)} />
                {DAY_LABELS[d]}
              </label>
            ))}
          </div>
          <div className="check-times">
            <label>
              From
              <input type="time" value={row.start} onChange={(e) => edit(i, { start: e.target.value })} />
            </label>
            <label>
              Until
              <input type="time" value={row.end} onChange={(e) => edit(i, { end: e.target.value })} />
            </label>
            <label>
              It’s for
              <select value={row.type} onChange={(e) => edit(i, { type: e.target.value })}>
                <option value="drinks">Drinks</option>
                <option value="food">Food</option>
                <option value="both">Food and drinks</option>
              </select>
            </label>
          </div>
          <label className="check-items">
            What’s the special? One per line, with prices.
            <textarea rows={3} value={row.text} onChange={(e) => edit(i, { text: e.target.value })} placeholder={'$1 off taps\n$5 old fashioneds'} />
          </label>
          {problems[i] && <p className="check-problem">{problems[i]}</p>}
          <button type="button" className="link-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            Remove this special
          </button>
        </fieldset>
      ))}
      <button type="button" className="check-add" onClick={() => setRows([...rows, blank()])}>
        Add a special
      </button>

      <h2>About your place</h2>
      <div className="check-tags">
        {Object.entries(TAGS).map(([t, label]) => (
          <label key={t}>
            <input type="checkbox" checked={tags.includes(t)} onChange={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
            {label}
          </label>
        ))}
      </div>
      <label className="check-field">
        Anything readers should know? For example “Dine-in only” or “Not during Packers games”.
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <h2>So Chris can reach you</h2>
      <div className="check-pair">
        <label className="check-field">
          Your name
          <input type="text" value={who} onChange={(e) => setWho(e.target.value)} autoComplete="name" />
        </label>
        <label className="check-field">
          Best time to call
          <input type="text" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Weekdays before 3" />
        </label>
      </div>
      <label className="check-field">
        Anything else
        <textarea rows={2} value={more} onChange={(e) => setMore(e.target.value)} />
      </label>

      <div className="check-send">
        {ready ? (
          <>
            <a className="check-go" href={mailto}>
              Email this to Chris
            </a>
            <p>
              No mail app on this device? Copy the text and send it to <strong>{CHRIS_EMAIL}</strong>.
            </p>
            <textarea id="check-text" className="check-text" readOnly rows={Math.min(14, body.split('\n').length + 1)} value={body} />
            <button type="button" className="check-add" onClick={copy}>
              {copied ? 'Copied' : 'Copy the text'}
            </button>
          </>
        ) : (
          <p className="check-problem">Finish the special{problems.filter(Boolean).length === 1 ? '' : 's'} marked above, then you can send this.</p>
        )}
        <p className="check-fine">
          This page sends nothing by itself: your own email does. Every listing on the finder is a paid partner placement; Chris
          can walk you through it when he calls, or reach him at 715-301-5539.
        </p>
      </div>
    </main>
  );
}

// No ?bar=: every bar's link, by name, so Chris can copy the one he needs
function Index() {
  return (
    <main className="check check-index">
      <h1>Listing checks</h1>
      <p className="check-lead">
        Send a bar its link. The owner sees what the finder has for them, corrects it, and emails it back in the call sheet’s
        format. Confirm by phone, paste the specials into the sheet, then run the import as usual.
      </p>
      <ul>
        {[...DATA.bars].sort(byBarName).map((b) => (
          <li key={b.id}>
            <a href={`?bar=${b.id}`}>{b.name}</a>
            <span>{b.city}</span>
            <span className={b.verifiedOn ? 'ok' : ''}>{b.verifiedOn ? 'Verified' : 'Not yet'}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

const Missing = () => (
  <main className="check">
    <h1>We can’t find that listing</h1>
    <p className="check-lead">
      The link may have been cut off. Email Chris Weber at <a href={`mailto:${CHRIS_EMAIL}`}>{CHRIS_EMAIL}</a> or call 715-301-5539
      and he’ll send a fresh one.
    </p>
  </main>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{id === null ? <Index /> : bar ? <Check /> : <Missing />}</React.StrictMode>
);
