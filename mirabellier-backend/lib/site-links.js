// Validation + shaping for the /links page content. One row lives in the
// `site_links` table (id = 'current'); its body is stored as JSON so the
// section / entry lists and the webring config can grow without a schema
// change — same pattern as site_now.

const { sanitizeWebsite } = require("./sanitize-website");

const LINKS_ROW_ID = "current";

const MAX_SECTIONS = 8;
const MAX_ENTRIES_PER_SECTION = 30;
const MAX_SECTION_TITLE_LENGTH = 60;
const MAX_SECTION_NOTE_LENGTH = 300;
const MAX_ENTRY_NAME_LENGTH = 80;
const MAX_ENTRY_BLURB_LENGTH = 200;
const MAX_WEBRING_NAME_LENGTH = 80;

function cleanText(value, maxLength, { singleLine = false } = {}) {
  let text = String(value == null ? "" : value)
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cc}/gu, (ch) =>
      ch === "\t" || ch === "\n" || ch === "\r" ? ch : "",
    );

  if (singleLine) {
    text = text.replace(/\s+/g, " ");
  } else {
    text = text
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n");
  }

  return text.trim().slice(0, maxLength);
}

function slugify(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function normalizeEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];

  const entries = [];
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== "object") continue;
    const name = cleanText(raw.name, MAX_ENTRY_NAME_LENGTH, { singleLine: true });
    const url = sanitizeWebsite(raw.url);
    // A link needs both a label and a valid destination; anything else is an
    // empty editor row.
    if (!name || !url) continue;
    entries.push({
      name,
      url,
      blurb: cleanText(raw.blurb, MAX_ENTRY_BLURB_LENGTH, { singleLine: true }),
      feed: sanitizeWebsite(raw.feed) || "",
    });
    if (entries.length >= MAX_ENTRIES_PER_SECTION) break;
  }
  return entries;
}

function normalizeSections(rawSections) {
  if (!Array.isArray(rawSections)) return [];

  const sections = [];
  for (let i = 0; i < rawSections.length; i += 1) {
    const raw = rawSections[i];
    if (!raw || typeof raw !== "object") continue;
    const title = cleanText(raw.title, MAX_SECTION_TITLE_LENGTH, {
      singleLine: true,
    });
    const note = cleanText(raw.note, MAX_SECTION_NOTE_LENGTH, {
      singleLine: true,
    });
    const entries = normalizeEntries(raw.entries);
    // Drop a section that has neither a title nor any usable links.
    if (!title && entries.length === 0) continue;
    sections.push({
      id: slugify(title, `section-${i + 1}`),
      title,
      note,
      entries,
    });
    if (sections.length >= MAX_SECTIONS) break;
  }
  return sections;
}

function normalizeWebring(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const name = cleanText(source.name, MAX_WEBRING_NAME_LENGTH, {
    singleLine: true,
  });
  const hubUrl = sanitizeWebsite(source.hubUrl) || "";
  const prevUrl = sanitizeWebsite(source.prevUrl) || "";
  const nextUrl = sanitizeWebsite(source.nextUrl) || "";
  const randomUrl = sanitizeWebsite(source.randomUrl) || "";

  // The footer widget is only meaningful with a hub and both neighbours, so
  // "enabled" collapses to false until those exist no matter what was sent.
  const enabled = Boolean(source.enabled) && Boolean(hubUrl && prevUrl && nextUrl);

  return { enabled, name, hubUrl, prevUrl, nextUrl, randomUrl };
}

/**
 * Turn a request body into the stored payload, or return `{ error }`.
 * `updatedAt` is always set server-side.
 */
function buildLinksPayload(body) {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const sections = normalizeSections(body.sections);
  const webring = normalizeWebring(body.webring);

  const hasLinks = sections.some((section) => section.entries.length > 0);
  if (!hasLinks && !webring.name) {
    return { error: "Add at least one link, or fill in the webring name." };
  }

  return {
    payload: {
      sections,
      webring,
      updatedAt: new Date().toISOString(),
    },
  };
}

function mapLinksRow(row) {
  if (!row) return null;

  let parsed = null;
  try {
    parsed = row.payloadJson ? JSON.parse(row.payloadJson) : null;
  } catch {
    parsed = null;
  }

  const sections =
    parsed && Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((section) => section && typeof section === "object")
          .map((section, i) => ({
            id:
              typeof section.id === "string" && section.id
                ? section.id
                : slugify(section.title, `section-${i + 1}`),
            title: typeof section.title === "string" ? section.title : "",
            note: typeof section.note === "string" ? section.note : "",
            entries: Array.isArray(section.entries)
              ? section.entries
                  .filter((entry) => entry && typeof entry === "object")
                  .map((entry) => ({
                    name: typeof entry.name === "string" ? entry.name : "",
                    url: typeof entry.url === "string" ? entry.url : "",
                    blurb: typeof entry.blurb === "string" ? entry.blurb : "",
                    feed: typeof entry.feed === "string" ? entry.feed : "",
                  }))
              : [],
          }))
      : [];

  const webring = normalizeWebring(parsed && parsed.webring);

  return {
    sections,
    webring,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || (parsed && parsed.updatedAt) || null,
  };
}

module.exports = {
  LINKS_ROW_ID,
  MAX_SECTIONS,
  MAX_ENTRIES_PER_SECTION,
  MAX_SECTION_TITLE_LENGTH,
  MAX_SECTION_NOTE_LENGTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_ENTRY_BLURB_LENGTH,
  MAX_WEBRING_NAME_LENGTH,
  buildLinksPayload,
  mapLinksRow,
};
