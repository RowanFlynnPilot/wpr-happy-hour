// npm test — the message that carries a bar's listing check link
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmUrl, outreachEmail, outreachStatus, outreachText } from './outreach.js';

const special = (items) => ({ days: ['thu'], start: '15:00', end: '18:00', type: 'drinks', items });
const bar = (over = {}) => ({ id: 'test-bar', name: 'Test Bar & Grill', verifiedOn: null, specials: [special(['$1 off taps'])], ...over });
const LINK = 'https://rowanflynnpilot.github.io/wpr-happy-hour/confirm.html?bar=test-bar';

test('confirmUrl: the listing check on the finder\u2019s own site', () => {
  assert.equal(confirmUrl(bar()), LINK);
});

test('outreachStatus: what the owner will find', () => {
  assert.equal(outreachStatus(bar({ verifiedOn: '2026-11-01' })), 'Verified');
  assert.equal(outreachStatus(bar()), 'From their own site');
  assert.equal(outreachStatus(bar({ specials: [special(['PLACEHOLDER \u2014 specials being confirmed'])] })), 'Our guess only');
});

test('the text and the email name the bar, carry its link, and no address', () => {
  const text = outreachText(bar());
  assert.ok(text.includes('Test Bar & Grill') && text.endsWith(LINK)); // the link last, so a phone makes it tappable
  assert.ok(!text.includes('\n'));
  const { subject, body } = outreachEmail(bar());
  assert.ok(subject.includes('Test Bar & Grill'));
  assert.ok(body.split('\n').includes(LINK)); // on a line of its own
  assert.ok(!/@/.test(text + subject + body)); // the recipient is Chris\u2019s to add
});
