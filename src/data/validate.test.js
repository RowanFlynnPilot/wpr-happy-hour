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
  photo: null,
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

test('photo: https only, featured tier only', () => {
  rejects(doc([bar({ tier: 'featured', photo: 'http://example.com/a.jpg' })]), /"photo" must be a full https/);
  rejects(doc([bar({ photo: 'https://example.com/a.jpg' })]), /featured-tier perk/);
  assert.doesNotThrow(() => validate(doc([bar({ tier: 'featured', photo: 'https://example.com/a.jpg' })])));
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
