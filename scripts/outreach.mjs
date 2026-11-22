// Writes the listing check links for Chris's call sheet.
//
//   npm run outreach
//
// Output: outreach/listing-check-links.csv (git-ignored: it is made fresh from
// bars.json each time), one row per bar — its "Deep-link ID" (the call sheet's own
// key, so the columns line up with a lookup or a sort), name, city, what the finder
// holds for it today, its listing check link and a ready text message. The email
// version, with a button to open it, is on the live list: confirm.html.
// No phone numbers or addresses are read or written here; Chris adds the recipient.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validate } from '../src/data/validate.js';
import { byBarName } from '../src/schedule.js';
import { confirmUrl, outreachStatus, outreachText } from '../src/outreach.js';

const { bars } = validate(JSON.parse(await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8')));
const cell = (v) => `"${String(v).replaceAll('"', '""')}"`;
const rows = [
  ['Deep-link ID', 'Bar', 'City', 'What we have', 'Listing check link', 'Text message'],
  ...[...bars].sort(byBarName).map((b) => [b.id, b.name, b.city, outreachStatus(b), confirmUrl(b), outreachText(b)]),
];
const OUT = new URL('../outreach/', import.meta.url);
await mkdir(OUT, { recursive: true });
// A byte-order mark so Excel reads the apostrophes and ampersands as UTF-8
await writeFile(new URL('listing-check-links.csv', OUT), `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`);

const count = (status) => bars.filter((b) => outreachStatus(b) === status).length;
console.log(`Wrote outreach/listing-check-links.csv — ${bars.length} bars`);
console.log(`  ${count('Our guess only')} our guess only · ${count('From their own site')} from their own site · ${count('Verified')} verified`);
