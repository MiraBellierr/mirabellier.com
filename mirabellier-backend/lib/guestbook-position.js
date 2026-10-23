"use strict";

// Placement for guestbook notes.
//
// The board is a fixed-size canvas and every note is the same square, so
// placement is a grid scan: walk evenly spaced slots and take the first one
// that does not sit on a note that is already pinned. A visitor can still drag
// two notes together if they want to, but automatic placement never stacks —
// a corkboard with notes side by side is the point, and a pile in the corner
// is a bug.
//
// This lives in its own module (rather than inside routes/guestbook.js) so the
// overlap rule can be unit tested against a plain array of positions.

const NOTE_SIZE = 280;
const BOARD_IMAGE_WIDTH = 1199;
const BOARD_IMAGE_HEIGHT = 678;
const BOARD_SCALE = 3;
const BOARD_WIDTH = BOARD_IMAGE_WIDTH * BOARD_SCALE;
const BOARD_HEIGHT = BOARD_IMAGE_HEIGHT * BOARD_SCALE;
const BOARD_PADDING = 48;

// Gap between neighbouring grid slots. Wide enough that a note's rotation (up
// to ~2.1deg, which grows its bounding box by ~5px a side) cannot make two
// automatic placements touch.
const COLUMN_GAP = 32;
const ROW_GAP = 42;

const MAX_X = BOARD_WIDTH - NOTE_SIZE;
const MAX_Y = BOARD_HEIGHT - NOTE_SIZE;

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Coerce a value to a finite number, or null. `Number(null)`, `Number("")` and
 * `Number([])` are all `0`, and `0` is a real coordinate on this board, so a
 * missing value must be rejected *before* coercion or it silently becomes the
 * top-left corner.
 */
function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A usable `{ x, y }` pair, or null for anything missing/non-finite. */
function normalizePosition(value) {
  if (!value || typeof value !== "object") return null;

  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  if (x === null || y === null) return null;

  return { x, y };
}

/** True when two same-sized notes would sit on top of each other. */
function positionsOverlap(a, b) {
  return Math.abs(a.x - b.x) < NOTE_SIZE && Math.abs(a.y - b.y) < NOTE_SIZE;
}

function overlapsAny(candidate, occupied) {
  return occupied.some((position) => positionsOverlap(candidate, position));
}

/** How much area a candidate shares with one already-placed note. */
function overlapArea(a, b) {
  if (!positionsOverlap(a, b)) return 0;

  return (NOTE_SIZE - Math.abs(a.x - b.x)) * (NOTE_SIZE - Math.abs(a.y - b.y));
}

/** Every evenly spaced slot on the board, in reading order (top-left first). */
function* gridPositions() {
  for (let y = BOARD_PADDING; y <= MAX_Y; y += NOTE_SIZE + ROW_GAP) {
    for (let x = BOARD_PADDING; x <= MAX_X; x += NOTE_SIZE + COLUMN_GAP) {
      yield { x: Math.round(x), y: Math.round(y) };
    }
  }
}

/**
 * Pick a position for a new note that does not overlap any occupied one.
 *
 * Returns the first free slot, or — when every slot is taken — the slot that
 * overlaps the least, so a new note is always somewhere visible and draggable
 * rather than rejected or dumped on top of an existing note.
 */
function findOpenPosition(occupied = []) {
  const taken = occupied.map(normalizePosition).filter(Boolean);

  for (const candidate of gridPositions()) {
    if (!overlapsAny(candidate, taken)) return candidate;
  }

  let best = null;
  let bestOverlap = Infinity;

  for (const candidate of gridPositions()) {
    const overlap = taken.reduce(
      (sum, position) => sum + overlapArea(candidate, position),
      0,
    );

    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      best = candidate;
    }
  }

  return best || { x: BOARD_PADDING, y: BOARD_PADDING };
}

/**
 * Clamp a stored coordinate into the board, or null when it is unusable. A
 * null result is deliberate: the caller must not treat "no coordinate" as
 * `0`, because `(0, 0)` is a real spot on the board — exactly where notes pile
 * up when placement is not working.
 */
function sanitizeCoordinate(value, max) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return null;

  return Math.round(clampNumber(parsed, 0, max));
}

module.exports = {
  BOARD_HEIGHT,
  BOARD_PADDING,
  BOARD_WIDTH,
  NOTE_SIZE,
  findOpenPosition,
  normalizePosition,
  positionsOverlap,
  sanitizeCoordinate,
};
