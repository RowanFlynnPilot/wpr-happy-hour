// Schema + time primitives for bars.json — shared by the app (App.jsx throws
// at load) and CI (scripts/check-data.mjs runs before every deploy). Schema
// changes update this file in the same commit as the data; no silent fallbacks.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TYPES = ['drinks', 'food', 'both'];
const TIERS = ['partner', 'featured'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Ids are the ?bar= deep links partners print on table tents — lowercase kebab only
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Exact key sets. Unknown keys are rejected, which is what enforces "contact
// info NEVER goes in bars.json" (a "phone" key fails) and catches typos.
const TOP_KEYS = ['updated', 'sponsor', 'bars'];
const SPONSOR_KEYS = ['name', 'url'];
const BAR_KEYS = ['id', 'name', 'city', 'address', 'website', 'tier', 'verifiedOn', 'checked', 'tags', 'note', 'photo', 'logo', 'ad', 'specials'];
const SPECIAL_KEYS = ['days', 'start', 'end', 'type', 'items'];
const CHECKED_KEYS = ['on', 'via'];
const AD_KEYS = ['style', 'headline', 'line', 'board', 'accent'];
// The spotlight's looks, picked per bar so ads in one newsletter don't look alike
// (src/spotlight.jsx): photo — full-bleed photo, big headline, chalkboard; menu —
// a supper-club menu card beside the photo in an arched window; neon — a roadside
// neon sign at night; marquee — a changeable-letter board with bulbs
export const AD_STYLES = ['photo', 'menu', 'neon', 'marquee'];
// The spotlight ad's dark ink: its scrim behind white type, and the button text
// on the bar's accent color (src/spotlight.jsx sets it on the ad)
export const AD_INK = '#0f2421';

// How an unverified listing's specials were last checked against the bar's own
// advertising — shown on every row, so a reader can see how fresh it is
export const CHECKED_VIA = ['website', 'facebook', 'instagram'];
// Filterable tags. Chris collects them on the verification call; never guessed.
export const TAGS = { patio: 'Patio', 'game-day': 'Packers game day', pool: 'Pool tables', darts: 'Darts' };

export function toMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

// YYYY-MM-DD that is also a real calendar date ("2026-02-31" fails)
export function isDate(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Absolute URL with an allowed protocol — a bare "www.bar.com" would render as
// a broken link relative to the GitHub Pages site
function isUrl(value, protocols) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// A photo or logo: a full https:// URL, or a file this site serves
// (public/photos/, public/logos/) — self-hosted means a bar's site going down
// can't break the finder or stop a deploy
function isAsset(value, dir) {
  return isUrl(value, ['https:']) || new RegExp(`^${dir}/[a-z0-9-]+\\.(jpg|png|webp)$`).test(value);
}

function checkKeys(obj, allowed, where) {
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new Error(
      `bars.json: ${where} has unknown field(s) ${unknown.map((k) => `"${k}"`).join(', ')} — check for typos; contact info lives in Notion, never here`
    );
  }
}

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

// WCAG contrast ratio of two #rrggbb colors
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function validate(json) {
  checkKeys(json, TOP_KEYS, 'top level');
  if (!isDate(json.updated)) {
    throw new Error('bars.json: "updated" must be a real YYYY-MM-DD date');
  }
  if (json.sponsor === undefined) {
    throw new Error('bars.json: "sponsor" must be present — null until the slot is sold');
  }
  if (json.sponsor !== null) {
    if (typeof json.sponsor !== 'object' || !nonEmpty(json.sponsor.name) || typeof json.sponsor.url !== 'string') {
      throw new Error('bars.json: "sponsor" must be null or { "name", "url" } ("url" may be "" until known)');
    }
    checkKeys(json.sponsor, SPONSOR_KEYS, '"sponsor"');
    if (json.sponsor.url !== '' && !isUrl(json.sponsor.url, ['https:', 'http:'])) {
      throw new Error('bars.json: "sponsor.url" must be "" or a full http(s):// URL');
    }
  }
  if (!Array.isArray(json.bars) || json.bars.length === 0) {
    throw new Error('bars.json: "bars" must be a non-empty array');
  }
  const seen = new Set();
  for (const bar of json.bars) {
    for (const field of BAR_KEYS) {
      if (bar[field] === undefined) throw new Error(`bars.json: bar "${bar.id ?? bar.name}" missing "${field}"`);
    }
    checkKeys(bar, BAR_KEYS, `bar "${bar.id}"`);
    if (typeof bar.id !== 'string' || !ID.test(bar.id)) {
      throw new Error(`bars.json: bar id "${bar.id}" must be lowercase kebab-case (it's the ?bar= share link)`);
    }
    if (seen.has(bar.id)) throw new Error(`bars.json: duplicate id "${bar.id}"`);
    seen.add(bar.id);
    for (const field of ['name', 'city', 'address']) {
      if (!nonEmpty(bar[field])) throw new Error(`bars.json: bar "${bar.id}" "${field}" must be a non-empty string`);
    }
    // Cards and the newsletter print the address alone, so it must carry the town
    if (!bar.address.endsWith(`, ${bar.city}`)) {
      throw new Error(`bars.json: bar "${bar.id}" "address" must end with ", ${bar.city}" (its city)`);
    }
    // Sites that don't serve https (Sconni's, as of 2026-09) keep their http:// URL
    if (typeof bar.website !== 'string' || (bar.website !== '' && !isUrl(bar.website, ['https:', 'http:']))) {
      throw new Error(`bars.json: bar "${bar.id}" "website" must be "" (until verified) or a full http(s):// URL`);
    }
    // https only (an http image on the https page is mixed content), or self-hosted.
    // Any tier may have one — the spotlight ad uses it — but the finder shows it on
    // featured listings only (the featured perk).
    if (bar.photo !== null && !isAsset(bar.photo, 'photos')) {
      throw new Error(`bars.json: bar "${bar.id}" "photo" must be null, a full https:// URL, or photos/<name>.jpg|png|webp`);
    }
    if (bar.logo !== null && !isAsset(bar.logo, 'logos')) {
      throw new Error(`bars.json: bar "${bar.id}" "logo" must be null, a full https:// URL, or logos/<name>.png|jpg|webp`);
    }
    if (bar.checked !== null) {
      if (typeof bar.checked !== 'object') throw new Error(`bars.json: bar "${bar.id}" "checked" must be null or { "on", "via" }`);
      checkKeys(bar.checked, CHECKED_KEYS, `bar "${bar.id}" checked`);
      if (!isDate(bar.checked.on)) throw new Error(`bars.json: bar "${bar.id}" "checked.on" must be a real YYYY-MM-DD date`);
      if (!CHECKED_VIA.includes(bar.checked.via)) {
        throw new Error(`bars.json: bar "${bar.id}" "checked.via" must be one of ${CHECKED_VIA.join(', ')}`);
      }
    }
    if (!Array.isArray(bar.tags) || bar.tags.some((t) => !(t in TAGS)) || new Set(bar.tags).size !== bar.tags.length) {
      throw new Error(`bars.json: bar "${bar.id}" "tags" must be a list of distinct tags from: ${Object.keys(TAGS).join(', ')}`);
    }
    if (bar.note !== null && (!nonEmpty(bar.note) || bar.note.length > 120)) {
      throw new Error(`bars.json: bar "${bar.id}" "note" must be null or a short line (≤ 120 characters), e.g. "Not during Packers games"`);
    }
    // The spotlight ad: its look and its copy, written with the bar at the sale (every
    // word from its own advertising). Every look is built on the bar's photo and
    // logo. The lengths are a first check; the render (scripts/render-digest.mjs)
    // fails on any text that doesn't fit its style.
    if (bar.ad !== null) {
      if (typeof bar.ad !== 'object') throw new Error(`bars.json: bar "${bar.id}" "ad" must be null or { "style", "headline", "line", "board", "accent" }`);
      checkKeys(bar.ad, AD_KEYS, `bar "${bar.id}" ad`);
      if (!AD_STYLES.includes(bar.ad.style)) throw new Error(`bars.json: bar "${bar.id}" "ad.style" must be one of ${AD_STYLES.join(', ')}`);
      if (bar.photo === null || bar.logo === null) throw new Error(`bars.json: bar "${bar.id}" has an "ad" but no photo and logo — the spotlight is built on both`);
      if (!nonEmpty(bar.ad.headline) || bar.ad.headline.length > 12) throw new Error(`bars.json: bar "${bar.id}" "ad.headline" must be 1–12 characters`);
      if (!nonEmpty(bar.ad.line) || bar.ad.line.length > 26) throw new Error(`bars.json: bar "${bar.id}" "ad.line" must be 1–26 characters`);
      if (!Array.isArray(bar.ad.board) || bar.ad.board.length < 1 || bar.ad.board.length > 4 || !bar.ad.board.every((l) => nonEmpty(l) && l.length <= 18)) {
        throw new Error(`bars.json: bar "${bar.id}" "ad.board" must be 1–4 lines of at most 18 characters`);
      }
      // The bar's brand color, where a style takes one (the photo style's script line
      // and button, the neon style's second tube, the marquee's web address; the
      // menu card keeps its own brass). It must read on the ad's ink.
      if (typeof bar.ad.accent !== 'string' || !/^#[0-9a-f]{6}$/.test(bar.ad.accent) || contrast(bar.ad.accent, AD_INK) < 4.5) {
        throw new Error(`bars.json: bar "${bar.id}" "ad.accent" must be a lowercase #rrggbb color with at least 4.5:1 contrast on ${AD_INK} (a light brand color)`);
      }
    }
    if (bar.verifiedOn !== null && !isDate(bar.verifiedOn)) {
      throw new Error(`bars.json: bar "${bar.id}" "verifiedOn" must be a real YYYY-MM-DD date or null (null until confirmed by phone)`);
    }
    if (!TIERS.includes(bar.tier)) throw new Error(`bars.json: bar "${bar.id}" has invalid tier "${bar.tier}"`);
    if (!Array.isArray(bar.specials) || bar.specials.length === 0) {
      throw new Error(`bars.json: bar "${bar.id}" must have at least one special`);
    }
    for (const s of bar.specials) {
      checkKeys(s, SPECIAL_KEYS, `bar "${bar.id}" special`);
      if (!Array.isArray(s.days) || s.days.length === 0 || s.days.some((d) => !DAY_KEYS.includes(d))) {
        throw new Error(`bars.json: bar "${bar.id}" has a special with invalid days`);
      }
      if (new Set(s.days).size !== s.days.length) {
        throw new Error(`bars.json: bar "${bar.id}" has a special that lists the same day twice`);
      }
      if (!HM.test(s.start) || !HM.test(s.end)) {
        throw new Error(`bars.json: bar "${bar.id}" has a special with invalid start/end (use 24h HH:MM)`);
      }
      if (toMinutes(s.start) >= toMinutes(s.end)) {
        throw new Error(`bars.json: bar "${bar.id}" special must end after it starts (no cross-midnight windows)`);
      }
      if (!TYPES.includes(s.type)) throw new Error(`bars.json: bar "${bar.id}" special has invalid type "${s.type}"`);
      if (!Array.isArray(s.items) || s.items.length === 0 || !s.items.every(nonEmpty)) {
        throw new Error(`bars.json: bar "${bar.id}" special must list at least one non-empty item`);
      }
      // A verified card (and the newsletter, which shows verified bars only)
      // must never carry research placeholder text
      if (bar.verifiedOn !== null && s.items.some((i) => i.includes('PLACEHOLDER'))) {
        throw new Error(`bars.json: bar "${bar.id}" is verified but still has PLACEHOLDER items — replace them with the confirmed specials`);
      }
    }
    // A sourced, unconfirmed listing says where its specials came from and when
    const sourced = bar.specials.some((sp) => !sp.items.some((i) => i.includes('PLACEHOLDER')));
    if (bar.verifiedOn === null && sourced && bar.checked === null) {
      throw new Error(`bars.json: bar "${bar.id}" has sourced specials but no "checked" — say how and when they were checked`);
    }
  }
  return json;
}
