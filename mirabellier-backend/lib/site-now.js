// Validation + shaping for the /now page content. One row lives in the
// `site_now` table (id = 'current'); its body is stored as JSON so the section
// list can grow without a schema change.

const NOW_ROW_ID = "current";

const MAX_INTRO_LENGTH = 600;
const MAX_SECTIONS = 12;
const MAX_SECTION_LABEL_LENGTH = 60;
const MAX_SECTION_BODY_LENGTH = 2000;

function cleanText(value, maxLength) {
  return String(value == null ? "" : value)
    // Normalise newlines, drop other control chars, trim trailing whitespace
    // per line so the stored copy is stable.
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cc}/gu, (ch) => (ch === "\t" || ch === "\n" || ch === "\r" ? ch : ""))
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeSections(rawSections) {
  if (!Array.isArray(rawSections)) return [];

  const sections = [];
  for (const raw of rawSections) {
    if (!raw || typeof raw !== "object") continue;
    const label = cleanText(raw.label, MAX_SECTION_LABEL_LENGTH);
    const body = cleanText(raw.body, MAX_SECTION_BODY_LENGTH);
    // A section with no label AND no body is just an empty editor row, so drop it
    // rather than persisting blanks.
    if (!label && !body) continue;
    sections.push({ label, body });
    if (sections.length >= MAX_SECTIONS) break;
  }
  return sections;
}

/**
 * Turn a request body into the stored payload, or return `{ error }`.
 * `updatedAt` is always set server-side.
 */
function buildNowPayload(body) {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const intro = cleanText(body.intro, MAX_INTRO_LENGTH);
  const sections = normalizeSections(body.sections);

  if (!intro && sections.length === 0) {
    return { error: "Add an intro or at least one section" };
  }

  return {
    payload: {
      intro,
      sections,
      updatedAt: new Date().toISOString(),
    },
  };
}

function mapNowRow(row) {
  if (!row) return null;

  let parsed = null;
  try {
    parsed = row.payloadJson ? JSON.parse(row.payloadJson) : null;
  } catch {
    parsed = null;
  }

  const intro =
    parsed && typeof parsed.intro === "string" ? parsed.intro : "";
  const sections =
    parsed && Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((section) => section && typeof section === "object")
          .map((section) => ({
            label: typeof section.label === "string" ? section.label : "",
            body: typeof section.body === "string" ? section.body : "",
          }))
      : [];

  return {
    intro,
    sections,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || (parsed && parsed.updatedAt) || null,
  };
}

module.exports = {
  NOW_ROW_ID,
  MAX_INTRO_LENGTH,
  MAX_SECTIONS,
  MAX_SECTION_LABEL_LENGTH,
  MAX_SECTION_BODY_LENGTH,
  buildNowPayload,
  mapNowRow,
};
