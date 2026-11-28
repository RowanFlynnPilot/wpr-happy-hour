// Listing check — the page a bar's owner opens to see what the finder says about
// them and send back what's right.
//   confirm.html?bar=<id>   the bar's specials, editable, and one button that opens
//                           an email to Chris with the answers. A bar we hold only
//                           guesses for is asked instead ("Tell us your happy hour"):
//                           one empty special to fill in, our guesses kept to a side
//                           note the owner can start from
//   confirm.html            the list of every bar's link, for Chris to send out:
//                           each with a text message to copy and an email to open
// It has no backend and sends nothing itself: the owner's own mail app sends the
// email. The specials in it are written in the call sheet's "Verified specials
// (final)" format (specialsToSheet), so Chris pastes them into the sheet after his
// call and `npm run calls` reads them. Nothing here changes bars.json, and nothing
// is verified until Chris has confirmed it by phone. The owner's name and best time
// to call go in the email only — contact details never go in bars.json.
// Not linked from the finder; a link that names no known bar says so plainly (it
// arrives from outside, like the finder's own deep links).
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import data from './data/bars.json';
import { TAGS, validate } from './data/validate.js';
import { CHRIS_EMAIL, DAY_LABELS, WEEK_ORDER, byBarName, claimOf, fmtDays, fmtWindow, isPlaceholder, sourcedOf, specialsToSheet } from './schedule.js';
import { outreachEmail, outreachStatus, outreachText } from './outreach.js';
import './index.css';
import './confirm.css';

const DATA = validate(data);
const id = new URLSearchParams(window.location.search).get('bar');
const bar = DATA.bars.find((b) => b.id === id);

// touched: the owner has worked on the row — only then is it told what it lacks, so
// an empty form doesn't open covered in warnings
const blank = () => ({ days: [], start: '', end: '', type: 'drinks', text: '', guess: false, touched: false });
const fromBar = (s) => ({
  touched: false,
  days: s.days,
  start: s.start,
  end: s.end,
  type: s.type,
  // a research guess is put to the owner as the plain claim to correct; one that
  // claims nothing ("specials being confirmed") leaves the box empty to fill in
  text: s.items.map(claimOf).filter(Boolean).join('\n'),
  guess: s.items.some(isPlaceholder),
});
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Some mail apps cut a mailto: link off near 2,000 characters; past this the page
// says to copy the text instead. The boxes are capped so one paste can't run away.
const MAILTO_SAFE = 1900;
const itemsOf = (row) => row.text.split('\n').map((t) => t.trim()).filter(Boolean);

// What stops a row from being sent, in the owner's words; null when it's fine
function problem(row) {
  if (row.days.length === 0) return 'Pick at least one day.';
  if (!row.start || !row.end) return 'Add a start and an end time.';
  // a browser with no time picker hands back whatever was typed
  if (!HHMM.test(row.start) || !HHMM.test(row.end)) return 'Enter the times as hours and minutes, like 15:00 or 3:00 PM.';
  // "Until close" is not a time (the call sheet's rule too): the finder states the hour
  if (row.end <= row.start) return 'The end has to be after the start. If it runs until you close, enter your closing time. If that is after midnight, enter 11:59 PM.';
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

// Nothing sourced and nothing verified: all we hold is research guesses. Asking
// "is this right?" about those puts our guess in the owner's mouth, so the page
// asks for their happy hour instead and offers each guess as a place to start.
const UNKNOWN = bar !== undefined && bar.verifiedOn === null && sourcedOf(bar.specials).length === 0;

function Check() {
  const [rows, setRows] = useState(() => (UNKNOWN ? [blank()] : bar.specials.map(fromBar)));
  const [heard, setHeard] = useState(() => (UNKNOWN ? bar.specials.map(fromBar) : [])); // our guesses, not yet taken up
  const [tags, setTags] = useState(bar.tags);
  const [note, setNote] = useState(bar.note ?? '');
  const [who, setWho] = useState('');
  const [when, setWhen] = useState('');
  const [more, setMore] = useState('');
  const [copiedBody, setCopiedBody] = useState(null); // what the clipboard holds: "Copied" is true only while it still matches
  const [notice, setNotice] = useState(''); // for screen readers
  // Where focus goes after a row is added, taken up or removed — a removed button
  // would otherwise drop it to the top of the page
  const [focusOn, setFocusOn] = useState(null); // { row: index } | { add: true }
  const addRef = useRef(null);
  useEffect(() => {
    if (focusOn === null) return;
    if (focusOn.add) addRef.current?.focus();
    else document.querySelectorAll('.check-row')[focusOn.row]?.querySelector('input')?.focus();
  }, [focusOn]);

  const edit = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, guess: false, touched: true } : r)));
  // A guess the owner takes up becomes a row (replacing a first row still empty)
  const startFrom = (g) => {
    const untouchedBlank = rows.length === 1 && !rows[0].touched && !rows[0].guess && rows[0].text === '';
    setRows(untouchedBlank ? [g] : [...rows, g]);
    setHeard(heard.filter((h) => h !== g));
    setFocusOn({ row: untouchedBlank ? 0 : rows.length });
  };
  const remove = (i) => {
    setRows(rows.filter((_, j) => j !== i));
    setNotice(`Special ${i + 1} removed`);
    setFocusOn({ add: true });
  };
  const toggleDay = (i, d) => edit(i, { days: rows[i].days.includes(d) ? rows[i].days.filter((x) => x !== d) : [...rows[i].days, d] });
  const problems = rows.map(problem);
  const ready = problems.every((p) => p === null);
  const body = ready ? emailBody(rows, Object.keys(TAGS).filter((t) => tags.includes(t)), note.trim(), who.trim(), when.trim(), more.trim()) : '';
  const subject = `Happy Hour Finder listing check: ${bar.name}`;
  const mailto = `mailto:${CHRIS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const copy = () =>
    navigator.clipboard.writeText(body).then(
      () => {
        setCopiedBody(body);
        setNotice('Text copied');
      },
      () => document.getElementById('check-text').select() // no clipboard here: the text is selected to copy by hand
    );

  return (
    <main className="check">
      <p className="check-kicker">
        <img src="./favicon.svg" alt="" width="22" height="22" /> Happy Hour Finder · Wausau Pilot &amp; Review
      </p>
      {UNKNOWN ? (
        <>
          <h1>Tell us your happy hour, {bar.name}</h1>
          <p className="check-lead">
            Our Happy Hour Finder lists you at {bar.address}, but we don’t have your specials from you yet. Add them here and
            send them to Chris Weber. He’ll call to confirm before anything changes on the finder.
          </p>
        </>
      ) : (
        <>
          <h1>Is this right, {bar.name}?</h1>
          <p className="check-lead">
            This is what our Happy Hour Finder has for you at {bar.address}. Fix anything that’s wrong or out of date, add
            what’s missing, then send it to Chris Weber. He’ll call to confirm before anything changes on the finder.
          </p>
        </>
      )}

      <h2>Your specials</h2>
      {rows.length === 0 && <p className="check-none">No specials listed. Add one below, or tell us in “Anything else” if you don’t run any.</p>}
      {rows.map((row, i) => (
        <fieldset className="check-row" key={i} aria-describedby={problems[i] && (row.touched || row.guess) ? `check-problem-${i}` : undefined}>
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
            <textarea rows={3} maxLength={400} value={row.text} onChange={(e) => edit(i, { text: e.target.value })} placeholder={'$1 off taps\n$5 old fashioneds'} />
          </label>
          {problems[i] && (row.touched || row.guess) && (
            <p className="check-problem" id={`check-problem-${i}`} role="status">
              {problems[i]}
            </p>
          )}
          <button type="button" className="link-btn" onClick={() => remove(i)}>
            Remove this special
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="check-add"
        ref={addRef}
        onClick={() => {
          setRows([...rows, blank()]);
          setFocusOn({ row: rows.length });
        }}
      >
        Add a special
      </button>
      {heard.length > 0 && (
        <aside className="check-heard">
          <p>What we’d heard, not confirmed. Use one as a start if it’s close:</p>
          <ul>
            {heard.map((g, i) => (
              <li key={i}>
                <span>
                  <span className="mono">
                    {fmtDays(g.days)} {fmtWindow(g)}
                  </span>
                  {g.text && ` · ${g.text.split('\n').join(' · ')}`}
                </span>
                <button type="button" className="link-btn" onClick={() => startFrom(g)}>
                  Start from this
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <h2 id="check-place">About your place</h2>
      <div className="check-tags" role="group" aria-labelledby="check-place">
        {Object.entries(TAGS).map(([t, label]) => (
          <label key={t}>
            <input type="checkbox" checked={tags.includes(t)} onChange={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />
            {label}
          </label>
        ))}
      </div>
      <label className="check-field">
        Anything readers should know? For example “Dine-in only” or “Not during Packers games”.
        <input type="text" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <h2>So Chris can reach you</h2>
      <div className="check-pair">
        <label className="check-field">
          Your name
          <input type="text" maxLength={80} value={who} onChange={(e) => setWho(e.target.value)} autoComplete="name" />
        </label>
        <label className="check-field">
          Best time to call
          <input type="text" maxLength={80} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Weekdays before 3" />
        </label>
      </div>
      <label className="check-field">
        Anything else
        <textarea rows={2} maxLength={400} value={more} onChange={(e) => setMore(e.target.value)} />
      </label>

      <div className="check-send">
        {ready ? (
          <>
            <a className="check-go" href={mailto}>
              Email this to Chris
            </a>
            <p>
              {mailto.length > MAILTO_SAFE
                ? 'This is long for some mail apps. If the email opens cut short or empty, copy the text and send it to '
                : 'No mail app on this device? Copy the text and send it to '}
              <strong>{CHRIS_EMAIL}</strong>.
            </p>
            <textarea id="check-text" className="check-text" readOnly aria-label="The message to send" rows={Math.min(14, body.split('\n').length + 1)} value={body} />
            <button type="button" className="check-add" onClick={copy}>
              {copiedBody === body ? 'Copied' : 'Copy the text'}
            </button>
          </>
        ) : (
          <p className={rows.some((r) => r.touched || r.guess) ? 'check-problem' : 'check-wait'} role="status">
            {rows.some((r, i) => problems[i] && (r.touched || r.guess))
              ? `Finish the special${problems.filter(Boolean).length === 1 ? '' : 's'} marked above, then you can send this.`
              : 'Add your special above, then you can send this. No happy hour? Remove the empty special and send that.'}
          </p>
        )}
        <p className="sr-only" role="status">
          {notice}
        </p>
        <p className="check-fine">
          This page sends nothing by itself: your own email does. Every listing on the finder is a paid partner placement; Chris
          can walk you through it when he calls, or reach him at 715-301-5539.
        </p>
      </div>
    </main>
  );
}

// No ?bar=: every bar's link, by name, with the message that carries it. The email
// opens with no recipient: addresses and phone numbers stay in Chris's call sheet.
function Index() {
  const [copied, setCopied] = useState(null); // the bar whose text was just copied
  const copy = (b) => navigator.clipboard.writeText(outreachText(b)).then(() => setCopied(b.id), () => setCopied(null));
  const mail = (b) => {
    const { subject, body } = outreachEmail(b);
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return (
    <main className="check check-index">
      <h1>Listing checks</h1>
      <p className="check-lead">
        Send a bar its link: open the email and add their address, or copy the text message once you’ve spoken to them (it
        reads as a follow-up, “as promised”). The owner sees what the finder has
        for them, corrects it, and emails it back in the call sheet’s format. Confirm by phone, paste the specials into the sheet,
        then run the import as usual.
      </p>
      <ul>
        {[...DATA.bars].sort(byBarName).map((b) => (
          <li key={b.id}>
            <a className="check-bar" href={`?bar=${b.id}`}>
              {b.name}
            </a>
            <span>{b.city}</span>
            <span className={b.verifiedOn ? 'ok' : ''}>{outreachStatus(b)}</span>
            <span className="check-out">
              <button type="button" className="link-btn" aria-label={`Copy text message for ${b.name}`} title="Copy text message" onClick={() => copy(b)}>
                {copied === b.id ? 'Copied' : 'Copy text'}
              </button>
              <a href={mail(b)} aria-label={`Open email for ${b.name}`}>
                Email
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status">
        {copied ? `Text message for ${DATA.bars.find((b) => b.id === copied).name} copied` : ''}
      </p>
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
