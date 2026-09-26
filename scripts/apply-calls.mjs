// Turns Chris's completed call-sheet rows into verified listings.
//
// The call sheet (a CSV kept off the repo — it holds phone numbers) has the
// columns "Deep-link ID", "Call date", "Outcome", "Tier sold" and
// "Verified specials (final)". Every row whose Outcome is "Verified" becomes:
// that bar's specials replaced by the confirmed ones, its tier set, and
// verifiedOn = the call date. The whole file is then run through validate()
// before anything is written. Other outcomes are reported, never acted on.
//
//   npm run calls -- "C:\path\to\call-sheet.csv"          preview (writes nothing)
//   npm run calls -- "C:\path\to\call-sheet.csv" --write  apply to bars.json
//
// "Verified specials (final)" format — one special per line (or separated by " | "):
//   Mon-Fri 3pm-6pm drinks: $2 off rails; $1 off taps
//   Fri 4-9pm food: Fish fry — cod 2 pc $12 · 3 pc $15
//   Sat, Sun 11am-2pm both: $5 Bloody Marys; $8 brunch burger
// Days: Mon..Sun, ranges (Mon-Fri, Fri-Sun), lists (Tue, Thu), Daily, Weekdays,
// Weekends. Times: 3pm, 3:30pm, 15:00, noon, midnight ("3-6pm" reads as 3pm-6pm).
// Type: drinks | food | both. Items separated by ";". "Until close" is not a
// time — ask the bar when they close.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDate, validate } from '../src/data/validate.js';
import { WEEK_ORDER } from '../src/schedule.js';

// "Mon", "Monday", "Tues", "Thurs" → 'mon' / 'tue' / 'thu'
function dayKey(word) {
  const m = word.toLowerCase().replace(/[^a-z]/g, '').match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/);
  if (!m) throw new Error(`unknown day "${word}"`);
  return m[1];
}

// "Mon-Fri", "Tue, Thu", "Fri-Sun", "Daily", "Weekdays" → ['mon', ...] in week order
export function parseDays(text) {
  const days = new Set();
  for (const raw of text.split(/,|\/|&|\band\b/i).map((s) => s.trim()).filter(Boolean)) {
    const t = raw.toLowerCase();
    if (/^(daily|every ?day|all week)$/.test(t)) WEEK_ORDER.forEach((d) => days.add(d));
    else if (t === 'weekdays') ['mon', 'tue', 'wed', 'thu', 'fri'].forEach((d) => days.add(d));
    else if (t === 'weekends') ['sat', 'sun'].forEach((d) => days.add(d));
    else if (/\s*(-|–|—|thru|through)\s*/.test(t)) {
      const [a, b] = t.split(/\s*(?:-|–|—|thru|through)\s*/);
      const i = WEEK_ORDER.indexOf(dayKey(a));
      const j = WEEK_ORDER.indexOf(dayKey(b));
      for (let k = i; ; k = (k + 1) % 7) {
        days.add(WEEK_ORDER[k]);
        if (k === j) break;
      }
    } else days.add(dayKey(t));
  }
  if (!days.size) throw new Error(`no days in "${text}"`);
  return WEEK_ORDER.filter((d) => days.has(d));
}

// "3pm" | "3:30 pm" | "15:00" | "noon" | "midnight" → "HH:MM"; bare "3" needs a meridiem hint
export function parseTime(text, meridiemHint) {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  if (t === 'noon') return '12:00';
  if (t === 'midnight') return '23:59'; // no cross-midnight windows
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new Error(`can't read time "${text}"`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = m[3] ?? meridiemHint;
  if (!mer) {
    // No am/pm anywhere: only 24-hour "15:00" style is unambiguous
    if (m[2] === undefined) throw new Error(`time "${text}" needs am/pm`);
  } else {
    if (h < 1 || h > 12) throw new Error(`time "${text}" isn't a 12-hour time`);
    if (mer === 'pm' && h !== 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
  }
  if (h > 23 || min > 59) throw new Error(`time "${text}" is out of range`);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const TIME = String.raw`(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|noon|midnight)`;
const LINE = new RegExp(String.raw`^(.+?)\s+(${TIME})\s*(?:-|–|—|to)\s*(${TIME})\s+(drinks?|food|both)\s*:\s*(.+)$`, 'i');

// One cell of "Verified specials (final)" → specials[]
export function parseSpecials(cell) {
  const lines = cell.split(/\r?\n|\s\|\s/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('"Verified specials (final)" is empty');
  const hasMeridiem = (s) => /[ap]\.?m|noon|midnight/i.test(s);
  return lines.map((line) => {
    if (/\bclose\b/i.test(line.split(':')[0])) {
      throw new Error(`"${line}": "close" isn't a time — ask the bar what time they close`);
    }
    const m = line.match(LINE);
    if (!m) throw new Error(`can't read "${line}" — expected e.g. "Mon-Fri 3pm-6pm drinks: $2 off rails; $1 off taps"`);
    const [, dayText, startText, endText, type, itemText] = m;
    if (!hasMeridiem(startText) && !hasMeridiem(endText) && Number(endText.split(':')[0]) < 13) {
      throw new Error(`"${line}": add am/pm (or use 24-hour times like 15:00-18:00)`);
    }
    const end = parseTime(endText);
    let start;
    if (hasMeridiem(startText) || !hasMeridiem(endText)) start = parseTime(startText);
    else {
      // "3-6pm" / "3:30-6pm": borrow the end's meridiem; "11-2pm" / "11-noon" fall back to am
      const tries = /p\.?m|midnight/i.test(endText) ? ['pm', 'am'] : ['am'];
      start = tries.map((mer) => parseTime(startText, mer)).find((s) => s < end) ?? parseTime(startText, tries[0]);
    }
    if (start >= end) throw new Error(`"${line}": end must be after start (no cross-midnight windows)`);
    const items = itemText.split(';').map((s) => s.trim()).filter(Boolean);
    if (!items.length) throw new Error(`"${line}": no items after the colon`);
    return { days: parseDays(dayText), start, end, type: type.toLowerCase().replace(/^drink$/, 'drinks'), items };
  });
}

// "9/28/2026" | "9/28/26" | "2026-09-28" → "2026-09-28"
export function parseCallDate(text) {
  const t = text.trim();
  let ymd = t;
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) ymd = `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  if (!isDate(ymd)) throw new Error(`call date "${text}" isn't a real date (use 9/28/2026 or 2026-09-28)`);
  return ymd;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  for (const col of ['Deep-link ID', 'Call date', 'Outcome', 'Tier sold', 'Verified specials (final)']) {
    if (!header.includes(col)) throw new Error(`call sheet is missing the "${col}" column`);
  }
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Pure: returns a new document plus a report. Throws (naming the bar) on any bad row.
export function applyCalls(doc, rows, today) {
  const next = structuredClone(doc);
  const report = { applied: [], unchanged: [], other: [] };
  for (const row of rows) {
    const id = row['Deep-link ID'];
    const outcome = row.Outcome;
    if (!outcome) continue;
    if (!/^verified$/i.test(outcome)) {
      report.other.push(`${id}: ${outcome}${row['Call date'] ? ` (${row['Call date']})` : ''}`);
      continue;
    }
    const where = `row "${id}"`;
    try {
      const bar = next.bars.find((b) => b.id === id);
      if (!bar) throw new Error('no bar with that Deep-link ID in bars.json (removed or mistyped?)');
      const tier = row['Tier sold'].toLowerCase();
      if (!['partner', 'featured'].includes(tier)) throw new Error(`"Tier sold" must be Partner or Featured, not "${row['Tier sold']}"`);
      const verifiedOn = parseCallDate(row['Call date']);
      if (verifiedOn > today) throw new Error(`call date ${verifiedOn} is in the future`);
      const specials = parseSpecials(row['Verified specials (final)']);
      const after = { ...bar, tier, verifiedOn, specials, photo: tier === 'featured' ? bar.photo : null };
      if (same(after, bar)) {
        report.unchanged.push(id);
        continue;
      }
      const notes = [];
      if (bar.tier !== tier) notes.push(`tier ${bar.tier} → ${tier}`);
      if (bar.photo && !after.photo) notes.push('photo dropped (featured perk)');
      Object.assign(bar, after);
      report.applied.push({ id, verifiedOn, tier, specials, notes });
    } catch (e) {
      throw new Error(`${where}: ${e.message}`);
    }
  }
  if (report.applied.length) next.updated = today;
  validate(next);
  return { doc: next, report };
}

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  if (!csvPath) throw new Error('usage: npm run calls -- <call-sheet.csv> [--write]');
  const write = flags.includes('--write');
  const DATA = new URL('../src/data/bars.json', import.meta.url);
  const doc = validate(JSON.parse(await readFile(DATA, 'utf8')));
  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  const today = new Date().toLocaleDateString('en-CA');
  const { doc: next, report } = applyCalls(doc, rows, today);

  const hm = (s) => `${s.days.join(',')} ${s.start}-${s.end} ${s.type}: ${s.items.join('; ')}`;
  for (const a of report.applied) {
    console.log(`\n✓ ${a.id} — ${a.tier}, verified ${a.verifiedOn}${a.notes.length ? ` (${a.notes.join(', ')})` : ''}`);
    for (const s of a.specials) console.log(`    ${hm(s)}`);
  }
  if (report.unchanged.length) console.log(`\nAlready applied: ${report.unchanged.join(', ')}`);
  if (report.other.length) console.log(`\nNot applied (outcome isn't "Verified"):\n  ${report.other.join('\n  ')}`);
  console.log(`\n${report.applied.length} listing(s) to verify, ${report.unchanged.length} already done, ${report.other.length} other outcome(s).`);

  if (!report.applied.length) return;
  if (!write) {
    console.log('Preview only — nothing written. Re-run with --write to apply.');
    return;
  }
  await writeFile(DATA, `${JSON.stringify(next, null, 2)}\n`);
  console.log('Wrote src/data/bars.json — now run npm run check, then commit and push.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`apply-calls: ${e.message}`);
    process.exit(1);
  });
}
