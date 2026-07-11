// Schema + time primitives for bars.json — shared by the app (App.jsx throws
// at load) and CI (scripts/check-data.mjs runs before every deploy). Schema
// changes update this file in the same commit as the data; no silent fallbacks.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TYPES = ['drinks', 'food', 'both'];
const TIERS = ['partner', 'featured'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function validate(json) {
  if (typeof json.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(json.updated)) {
    throw new Error('bars.json: "updated" must be a YYYY-MM-DD date string');
  }
  if (json.sponsor === undefined) {
    throw new Error('bars.json: "sponsor" must be present — null until the slot is sold');
  }
  if (json.sponsor !== null) {
    if (typeof json.sponsor.name !== 'string' || json.sponsor.name === '' || typeof json.sponsor.url !== 'string') {
      throw new Error('bars.json: "sponsor" must be null or { "name", "url" } ("url" may be "" until known)');
    }
  }
  if (!Array.isArray(json.bars) || json.bars.length === 0) {
    throw new Error('bars.json: "bars" must be a non-empty array');
  }
  const seen = new Set();
  for (const bar of json.bars) {
    for (const field of ['id', 'name', 'city', 'address', 'website', 'tier', 'verifiedOn', 'photo', 'specials']) {
      if (bar[field] === undefined) throw new Error(`bars.json: bar "${bar.id ?? bar.name}" missing "${field}"`);
    }
    if (seen.has(bar.id)) throw new Error(`bars.json: duplicate id "${bar.id}"`);
    seen.add(bar.id);
    if (typeof bar.website !== 'string') {
      throw new Error(`bars.json: bar "${bar.id}" "website" must be a string ("" until verified)`);
    }
    if (bar.photo !== null && typeof bar.photo !== 'string') {
      throw new Error(`bars.json: bar "${bar.id}" "photo" must be a URL string or null`);
    }
    if (bar.verifiedOn !== null && !(typeof bar.verifiedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bar.verifiedOn))) {
      throw new Error(`bars.json: bar "${bar.id}" "verifiedOn" must be YYYY-MM-DD or null (null until confirmed by phone)`);
    }
    if (!TIERS.includes(bar.tier)) throw new Error(`bars.json: bar "${bar.id}" has invalid tier "${bar.tier}"`);
    if (!Array.isArray(bar.specials) || bar.specials.length === 0) {
      throw new Error(`bars.json: bar "${bar.id}" must have at least one special`);
    }
    for (const s of bar.specials) {
      if (!Array.isArray(s.days) || s.days.length === 0 || s.days.some((d) => !DAY_KEYS.includes(d))) {
        throw new Error(`bars.json: bar "${bar.id}" has a special with invalid days`);
      }
      if (!HM.test(s.start) || !HM.test(s.end)) {
        throw new Error(`bars.json: bar "${bar.id}" has a special with invalid start/end (use 24h HH:MM)`);
      }
      if (toMinutes(s.start) >= toMinutes(s.end)) {
        throw new Error(`bars.json: bar "${bar.id}" special must end after it starts (no cross-midnight windows)`);
      }
      if (!TYPES.includes(s.type)) throw new Error(`bars.json: bar "${bar.id}" special has invalid type "${s.type}"`);
      if (!Array.isArray(s.items) || s.items.length === 0) {
        throw new Error(`bars.json: bar "${bar.id}" special must list at least one item`);
      }
    }
  }
  return json;
}
