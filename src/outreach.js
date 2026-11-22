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

// Owner decisions on the wording, 2026-11-22:
//  - A bar we hold only guesses for is told we're adding it and asked for its
//    specials — never that it "is in" the finder with specials to check, when all
//    the owner would find there is our guess.
//  - The text message is a follow-up to a call or a visit ("as promised"), not a
//    first contact: a link from a number the owner doesn't know reads as spam.
//  - The email says listings are paid, so nobody fills in the form believing it's
//    free and then gets a sales call.
const guessOnly = (bar) => outreachStatus(bar) === 'Our guess only';

// A text message: one paragraph, the link last so the phone makes it tappable
export const outreachText = (bar) =>
  guessOnly(bar)
    ? `Hi, it’s Chris Weber at Wausau Pilot & Review. As promised, here’s the link to add ${bar.name}’s specials to our Happy Hour Finder. It takes about two minutes: ${confirmUrl(bar)}`
    : `Hi, it’s Chris Weber at Wausau Pilot & Review. As promised, here’s the link to check what our Happy Hour Finder has for ${bar.name}. It takes about two minutes: ${confirmUrl(bar)}`;

// An email: what the finder is, the link, that listings are paid, and a call to come
export const outreachEmail = (bar) => ({
  subject: guessOnly(bar) ? `Your specials on the Happy Hour Finder: ${bar.name}` : `Are your specials right? ${bar.name} on the Happy Hour Finder`,
  body: [
    'Hi,',
    '',
    'I’m Chris Weber with Wausau Pilot & Review, the nonprofit newsroom covering the Wausau area. We’re launching a Happy Hour Finder: a page where readers see which bars have specials on right now, and on any day of the week.',
    '',
    guessOnly(bar)
      ? `We’re adding ${bar.name}, and I want what we show to come from you. This link is where you tell us your specials. Add them and send it back. It takes about two minutes:`
      : `${bar.name} is on our list, and I want what we show to be right. This link shows what we have for you. Fix anything that’s off, add what’s missing, and send it back. It takes about two minutes:`,
    '',
    confirmUrl(bar),
    '',
    'Listings on the finder are paid placements. I’ll follow up with a call to confirm the details and go over the options.',
    '',
    'Thanks,',
    'Chris Weber',
    'Wausau Pilot & Review',
    '715-301-5539',
  ].join('\n'),
});
