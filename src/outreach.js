// Outreach — how a bar's listing check link reaches its owner. One wording, used by
// Chris's list of links (confirm.html) and by the file for his call sheet
// (scripts/outreach.mjs). Nothing here knows a phone number or an email address:
// those stay in the call sheet, off the repo, and Chris adds the recipient himself.
import { sourcedOf } from './schedule.js';

// The listing check lives on the finder's own site, wherever the finder is embedded
const CONFIRM_BASE = 'https://rowanflynnpilot.github.io/wpr-happy-hour/confirm.html';
export const confirmUrl = (bar) => `${CONFIRM_BASE}?bar=${bar.id}`;

// What the finder holds for a bar today, so Chris knows what the owner will see:
// phone-verified, specials from the bar's own advertising, or only a research guess
export const outreachStatus = (bar) => (bar.verifiedOn ? 'Verified' : sourcedOf(bar.specials).length > 0 ? 'From their own site' : 'Our guess only');

// A text message: one paragraph, the link last so the phone makes it tappable
export const outreachText = (bar) =>
  `Hi, it’s Chris Weber at Wausau Pilot & Review. ${bar.name} is in our new Happy Hour Finder and I want to make sure we have your specials right. Can you take two minutes to check them? ${confirmUrl(bar)}`;

// An email. It promises a call, not a listing: Chris explains how listings work then.
export const outreachEmail = (bar) => ({
  subject: `Are your specials right? ${bar.name} on the Happy Hour Finder`,
  body: [
    'Hi,',
    '',
    'I’m Chris Weber with Wausau Pilot & Review, the nonprofit newsroom covering the Wausau area. We’re launching a Happy Hour Finder: a page where readers see which bars have specials on right now, and on any day of the week.',
    '',
    `${bar.name} is on our list, and I want what we show to be right. This link shows what we have for you. Fix anything that’s off, add what’s missing, and send it back. It takes about two minutes:`,
    '',
    confirmUrl(bar),
    '',
    'I’ll follow up with a call to confirm the details and walk you through how listings work.',
    '',
    'Thanks,',
    'Chris Weber',
    'Wausau Pilot & Review',
    '715-301-5539',
  ].join('\n'),
});
