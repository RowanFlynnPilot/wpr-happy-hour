// npm test — the partner report's reading and arithmetic, on Plausible's export shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingActions, readCsv, renderReport, reportFor, sitePeriod } from './partner-report.mjs';

const L = 'https://rowanflynnpilot.github.io/wpr-happy-hour/?bar=';
const VISITORS = `date,visitors,pageviews,visits,views_per_visit,bounce_rate,visit_duration
2026-12-01,40,55,44,1.25,60,30
2026-12-02,35,41,36,1.14,62,28
2026-12-31,50,70,52,1.35,55,40
`;
const PROPS = `property,value,visitors,events,percentage
url,${L}palms-supper-club#website,12,15,3.1
url,${L}palms-supper-club#save,4,4,1.0
url,${L}palms-supper-club#opened-tent,9,11,2.3
url,"https://thepalmswausau.com/?utm_source=wausaupilotandreview&utm_medium=widget",12,15,3.1
url,${L}other-bar#share,2,2,0.5
url,(none),300,410,77.0
bar,palms-supper-club,20,30,5.0
`;
const palms = { id: 'palms-supper-club', name: 'The Palms Supper Club', tier: 'featured', verifiedOn: '2026-11-20', website: 'https://thepalmswausau.com/' };

test('sitePeriod: the dates covered, pageviews and visits summed', () => {
  assert.deepEqual(sitePeriod(readCsv(VISITORS)), { start: '2026-12-01', end: '2026-12-31', pageviews: 166, visits: 132 });
  assert.throws(() => sitePeriod(readCsv('date,unique_conversions,total_conversions,conversion_rate\n2026-12-01,1,1,2\n')), /no "pageviews" column/);
});

test('listingActions: per bar and action from the url rows; other urls ignored', () => {
  const a = listingActions(readCsv(PROPS));
  assert.deepEqual(a['palms-supper-club'], { website: { events: 15, visitors: 12 }, save: { events: 4, visitors: 4 }, 'opened-tent': { events: 11, visitors: 9 } });
  assert.deepEqual(Object.keys(a).sort(), ['other-bar', 'palms-supper-club']);
  const full = 'property,value,visitors,events,percentage\n' + Array.from({ length: 300 }, (_, i) => `url,https://x.example/${i},1,1,0.1`).join('\n');
  assert.throws(() => listingActions(readCsv(full)), /export limit/);
});

test('reportFor: every line present, zeros where the export has none, by tier', () => {
  const r = reportFor(palms, sitePeriod(readCsv(VISITORS)), listingActions(readCsv(PROPS)), '2027-01-04');
  assert.deepEqual(r.lines.map((l) => [l.key, l.events, l.visitors]), [
    ['website', 15, 12], ['directions', 0, 0], ['save', 4, 4], ['calendar', 0, 0], ['share', 0, 0], ['opened', 0, 0], ['opened-tent', 11, 9],
  ]);
  assert.equal(r.anyActivity, true);
  // a partner-tier bar with no website: no Directions or website line
  const plain = reportFor({ ...palms, id: 'quiet', tier: 'partner', website: '' }, sitePeriod(readCsv(VISITORS)), {}, '2027-01-04');
  assert.deepEqual(plain.lines.map((l) => l.key), ['save', 'calendar', 'share', 'opened', 'opened-tent']);
  assert.equal(plain.anyActivity, false);
});

test('renderReport: the numbers on the page are the numbers in the data', () => {
  const r = reportFor(palms, sitePeriod(readCsv(VISITORS)), listingActions(readCsv(PROPS)), '2027-01-04');
  const html = renderReport(r);
  assert.match(html, /<h1>The Palms Supper Club<\/h1>/);
  assert.match(html, /December 1, 2026 to December 31, 2026/);
  assert.match(html, /<td>Scans of your table tent<\/td><td class="num">11<\/td><td class="num">9<\/td>/);
  assert.match(html, /Happy Hour Finder pageviews in the period<\/td><td class="num">166</);
  assert.doesNotMatch(html, /other-bar/); // never another partner's numbers
});
