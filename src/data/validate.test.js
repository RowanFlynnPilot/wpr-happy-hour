// npm test — each rule in validate() gets a passing and a failing case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDate, validate } from './validate.js';

const special = (over = {}) => ({ days: ['thu'], start: '15:00', end: '18:00', type: 'drinks', items: ['$1 off taps'], ...over });
const bar = (over = {}) => ({
  id: 'test-bar',
  name: 'Test Bar',
  city: 'Wausau',
  address: '1 Main St, Wausau',
  website: '',
  tier: 'partner',
  verifiedOn: null,
  checked: { on: '2026-09-26', via: 'website' },
  tags: [],
  note: null,
  photo: null,
  logo: null,
  ad: null,
  specials: [special()],
  ...over,
});
const doc = (bars = [bar()], over = {}) => ({ updated: '2026-09-26', sponsor: null, bars, ...over });
const rejects = (json, pattern) => assert.throws(() => validate(json), pattern);

test('the real bars.json passes', async () => {
  const raw = await readFile(new URL('./bars.json', import.meta.url), 'utf8');
  assert.doesNotThrow(() => validate(JSON.parse(raw)));
});

test('a minimal document passes', () => {
  assert.doesNotThrow(() => validate(doc()));
});

test('unknown fields are rejected (contact info never goes in bars.json)', () => {
  rejects(doc([bar({ phone: '715-555-0100' })]), /unknown field\(s\) "phone"/);
  rejects(doc([bar({ specials: [special({ note: 'x' })] })]), /unknown field/);
  rejects(doc(undefined, { lastEditor: 'x' }), /top level has unknown field/);
  rejects(doc(undefined, { sponsor: { name: 'Acme', url: '', email: 'a@b.c' } }), /unknown field/);
});

test('ids must be kebab-case and unique', () => {
  rejects(doc([bar({ id: 'Red Eye' })]), /kebab-case/);
  rejects(doc([bar(), bar()]), /duplicate id/);
});

test('name, city and address must be non-empty strings', () => {
  rejects(doc([bar({ name: '  ' })]), /"name" must be a non-empty string/);
});

test('address must end with its city (cards print the address alone)', () => {
  rejects(doc([bar({ address: '1 Main St' })]), /must end with ", Wausau"/);
  rejects(doc([bar({ address: '1 Main St, Weston' })]), /must end with ", Wausau"/);
});

test('website: "" or a full http(s) URL', () => {
  assert.doesNotThrow(() => validate(doc([bar({ website: 'https://example.com/' })])));
  assert.doesNotThrow(() => validate(doc([bar({ website: 'http://example.com/' })])));
  rejects(doc([bar({ website: 'www.example.com' })]), /"website"/);
  rejects(doc([bar({ website: 'javascript:alert(1)' })]), /"website"/);
});

test('photo and logo: https or self-hosted, any tier', () => {
  rejects(doc([bar({ photo: 'http://example.com/a.jpg' })]), /"photo" must be null, a full https/);
  rejects(doc([bar({ photo: 'photos/a.gif' })]), /"photo"/);
  rejects(doc([bar({ photo: 'photosXa.jpg' })]), /"photo"/);
  assert.doesNotThrow(() => validate(doc([bar({ photo: 'https://example.com/a.jpg' })])));
  assert.doesNotThrow(() => validate(doc([bar({ photo: 'photos/test-bar.jpg', logo: 'logos/test-bar.png' })])));
  rejects(doc([bar({ logo: 'photos/test-bar.png' })]), /"logo"/);
});

test('checked: how and when a sourced listing was checked', () => {
  rejects(doc([bar({ checked: null })]), /sourced specials but no "checked"/);
  rejects(doc([bar({ checked: { on: '2026-09-26', via: 'yelp' } })]), /"checked.via"/);
  rejects(doc([bar({ checked: { on: 'soon', via: 'website' } })]), /"checked.on"/);
  assert.doesNotThrow(() => validate(doc([bar({ checked: null, specials: [special({ items: ['PLACEHOLDER — x'] })] })])));
  assert.doesNotThrow(() => validate(doc([bar({ checked: null, verifiedOn: '2026-09-01' })])));
});

test('tags and note', () => {
  assert.doesNotThrow(() => validate(doc([bar({ tags: ['patio', 'game-day'], note: 'Not during Packers games' })])));
  rejects(doc([bar({ tags: ['rooftop'] })]), /"tags"/);
  rejects(doc([bar({ tags: ['patio', 'patio'] })]), /"tags"/);
  rejects(doc([bar({ note: '' })]), /"note"/);
});

test('ad: copy with a photo and logo, within the ad sizes', () => {
  const ad = { style: 'photo', headline: 'Prime Rib', line: 'Saturdays at the bar', board: ['From 4 PM'], accent: '#c9e265' };
  const art = { photo: 'photos/test-bar.jpg', logo: 'logos/test-bar.png' };
  assert.doesNotThrow(() => validate(doc([bar({ ...art, ad })])));
  rejects(doc([bar({ ad })]), /no photo and logo/);
  rejects(doc([bar({ ...art, ad: { ...ad, headline: 'A headline far too long' } })]), /"ad.headline"/);
  rejects(doc([bar({ ...art, ad: { ...ad, board: ['1', '2', '3', '4', '5'] } })]), /"ad.board"/);
  rejects(doc([bar({ ...art, ad: { ...ad, price: '$5' } })]), /unknown field/);
  rejects(doc([bar({ ...art, ad: { ...ad, style: 'poster' } })]), /"ad.style"/);
  for (const style of ['photo', 'menu', 'neon', 'marquee']) assert.doesNotThrow(() => validate(doc([bar({ ...art, ad: { ...ad, style } })])));
});

test('ad.accent: a light #rrggbb that reads on the ad ink', () => {
  const art = { photo: 'photos/test-bar.jpg', logo: 'logos/test-bar.png' };
  const ad = (accent) => ({ style: 'menu', headline: 'Prime Rib', line: 'Saturdays at the bar', board: ['From 4 PM'], accent });
  assert.doesNotThrow(() => validate(doc([bar({ ...art, ad: ad('#fcd150') })])));
  rejects(doc([bar({ ...art, ad: ad('#3a867c') })]), /"ad.accent"/); // the finder's teal: too dark on the ink
  rejects(doc([bar({ ...art, ad: ad('#FCD150') })]), /"ad.accent"/);
  rejects(doc([bar({ ...art, ad: ad('gold') })]), /"ad.accent"/);
});

test('sponsor: null or { name, url } with url "" or http(s)', () => {
  assert.doesNotThrow(() => validate(doc(undefined, { sponsor: { name: 'Acme', url: '' } })));
  rejects(doc(undefined, { sponsor: { name: 'Acme', url: 'acme.com' } }), /"sponsor.url"/);
  rejects(doc(undefined, { sponsor: undefined }), /"sponsor" must be present/);
});

test('dates must be real calendar dates', () => {
  assert.equal(isDate('2026-02-28'), true);
  assert.equal(isDate('2026-02-31'), false);
  assert.equal(isDate('2026-9-1'), false);
  rejects(doc([bar({ verifiedOn: '2026-02-31' })]), /"verifiedOn"/);
  rejects(doc(undefined, { updated: '2026-13-01' }), /"updated"/);
});

test('specials: valid days (no repeats), 24h times, no cross-midnight', () => {
  rejects(doc([bar({ specials: [special({ days: ['thu', 'thu'] })] })]), /same day twice/);
  rejects(doc([bar({ specials: [special({ days: ['thursday'] })] })]), /invalid days/);
  rejects(doc([bar({ specials: [special({ start: '3:00' })] })]), /24h HH:MM/);
  rejects(doc([bar({ specials: [special({ start: '22:00', end: '01:00' })] })]), /cross-midnight/);
  rejects(doc([bar({ specials: [special({ items: [''] })] })]), /non-empty item/);
});

test('a verified bar cannot carry PLACEHOLDER items', () => {
  const placeholder = [special({ items: ['PLACEHOLDER — $2 off rails'] })];
  assert.doesNotThrow(() => validate(doc([bar({ specials: placeholder })])));
  rejects(doc([bar({ verifiedOn: '2026-09-01', specials: placeholder })]), /PLACEHOLDER/);
});
