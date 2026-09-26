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
const BAR_KEYS = ['id', 'name', 'city', 'address', 'website', 'tier', 'verifiedOn', 'photo', 'specials'];
const SPECIAL_KEYS = ['days', 'start', 'end', 'type', 'items'];

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

function checkKeys(obj, allowed, where) {
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new Error(
      `bars.json: ${where} has unknown field(s) ${unknown.map((k) => `"${k}"`).join(', ')} — check for typos; contact info lives in Notion, never here`
    );
  }
}

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

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
    // https only: an http image on the https page is mixed content
    if (bar.photo !== null && !isUrl(bar.photo, ['https:'])) {
      throw new Error(`bars.json: bar "${bar.id}" "photo" must be a full https:// URL or null`);
    }
    if (bar.tier !== 'featured' && bar.photo !== null) {
      throw new Error(`bars.json: bar "${bar.id}" has a photo but tier "${bar.tier}" — photos are a featured-tier perk`);
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
  }
  return json;
}
