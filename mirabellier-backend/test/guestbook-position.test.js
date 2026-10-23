const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  NOTE_SIZE,
  findOpenPosition,
  normalizePosition,
  positionsOverlap,
  sanitizeCoordinate,
} = require("../lib/guestbook-position");

// New guestbook notes used to be written at a hardcoded (0, 0): the sign form
// has no board on screen, so it posted `x: 0, y: 0`, which the API accepted as
// a real coordinate instead of falling through to its grid. Every new note
// landed in the top-left corner on top of the last one. Placement is now
// server-owned: a client coordinate is used only when it is valid and free,
// otherwise the note takes the first open grid slot.

test("a note occupies its own square, exactly", () => {
  assert.equal(positionsOverlap({ x: 0, y: 0 }, { x: 0, y: 0 }), true);
  // One pixel less than a full note in either axis still overlaps.
  assert.equal(positionsOverlap({ x: 0, y: 0 }, { x: NOTE_SIZE - 1, y: 0 }), true);
  assert.equal(positionsOverlap({ x: 0, y: 0 }, { x: 0, y: NOTE_SIZE - 1 }), true);
  // Exactly a note apart (or more) does not collide.
  assert.equal(positionsOverlap({ x: 0, y: 0 }, { x: NOTE_SIZE, y: 0 }), false);
  assert.equal(positionsOverlap({ x: 0, y: 0 }, { x: 0, y: NOTE_SIZE }), false);
  // Diagonal neighbours that share only a corner are fine.
  assert.equal(
    positionsOverlap({ x: 0, y: 0 }, { x: NOTE_SIZE, y: NOTE_SIZE }),
    false,
  );
});

test("normalizePosition rejects anything unusable", () => {
  assert.deepEqual(normalizePosition({ x: 1, y: 2 }), { x: 1, y: 2 });
  assert.deepEqual(normalizePosition({ x: "3", y: "4" }), { x: 3, y: 4 });
  for (const value of [null, undefined, {}, { x: 1 }, { x: NaN, y: 0 }, { x: 0, y: "abc" }, "0,0"]) {
    assert.equal(normalizePosition(value), null, JSON.stringify(value));
  }
});

// The bug in one assertion: `Number(null)` is 0, so a missing coordinate must
// not be coerced into the board's corner.
test("sanitizeCoordinate returns null (not 0) for junk", () => {
  assert.equal(sanitizeCoordinate(null, 100), null);
  assert.equal(sanitizeCoordinate(undefined, 100), null);
  assert.equal(sanitizeCoordinate("", 100), null);
  assert.equal(sanitizeCoordinate(NaN, 100), null);
  assert.equal(sanitizeCoordinate("abc", 100), null);
  assert.equal(sanitizeCoordinate({}, 100), null);
});

test("sanitizeCoordinate clamps and rounds valid values", () => {
  assert.equal(sanitizeCoordinate(0, 100), 0);
  assert.equal(sanitizeCoordinate(50.6, 100), 51);
  assert.equal(sanitizeCoordinate(-20, 100), 0);
  assert.equal(sanitizeCoordinate(500, 100), 100);
  assert.equal(sanitizeCoordinate("42", 100), 42);
});

test("findOpenPosition starts at the top-left slot on an empty board", () => {
  assert.deepEqual(findOpenPosition([]), { x: 48, y: 48 });
});

test("findOpenPosition never returns an occupied slot", () => {
  const occupied = [
    { x: 48, y: 48 },
    { x: 360, y: 48 },
    { x: 672, y: 48 },
  ];
  const position = findOpenPosition(occupied);

  assert.ok(position, "expected a position");
  assert.equal(
    occupied.some((taken) => positionsOverlap(taken, position)),
    false,
    `picked ${JSON.stringify(position)} overlaps a taken slot`,
  );
  // The first three slots are taken, so it should be the fourth.
  assert.deepEqual(position, { x: 984, y: 48 });
});

test("findOpenPosition ignores unusable entries in the occupied list", () => {
  const position = findOpenPosition([null, {}, { x: null, y: null }]);
  assert.deepEqual(position, { x: 48, y: 48 });
});

// The regression that started this: many notes at the same coordinate. Each
// call must step to a fresh slot.
test("repeated placements all get distinct, non-overlapping positions", () => {
  let occupied = [];
  const placed = [];

  for (let i = 0; i < 40; i += 1) {
    const position = findOpenPosition(occupied);
    assert.equal(
      occupied.some((taken) => positionsOverlap(taken, position)),
      false,
      `placement ${i} at ${JSON.stringify(position)} overlaps`,
    );
    occupied = [...occupied, position];
    placed.push(position);
  }

  const unique = new Set(placed.map((p) => `${p.x},${p.y}`));
  assert.equal(unique.size, placed.length, "every placement must be unique");
});

test("findOpenPosition keeps positions inside the board", () => {
  let occupied = [];
  for (let i = 0; i < 80; i += 1) {
    const position = findOpenPosition(occupied);
    assert.ok(position.x >= 0 && position.x <= BOARD_WIDTH - NOTE_SIZE);
    assert.ok(position.y >= 0 && position.y <= BOARD_HEIGHT - NOTE_SIZE);
    occupied = [...occupied, position];
  }
});

// The board holds a finite number of non-overlapping slots. When they are all
// taken the function must still answer with a usable position (a note cannot be
// rejected or dropped at the corner), accepting overlap only as a last resort.
test("beyond capacity it degrades to a valid position, not a crash", () => {
  const occupied = [];
  for (let i = 0; i < 200; i += 1) {
    occupied.push(findOpenPosition(occupied));
  }

  const capacity = new Set(occupied.map((p) => `${p.x},${p.y}`)).size;
  assert.ok(capacity >= 60, `expected a real grid, got ${capacity} slots`);

  const overflow = findOpenPosition(occupied);
  assert.ok(Number.isFinite(overflow.x) && Number.isFinite(overflow.y));
  assert.ok(overflow.x >= 0 && overflow.x <= BOARD_WIDTH - NOTE_SIZE);
  assert.ok(overflow.y >= 0 && overflow.y <= BOARD_HEIGHT - NOTE_SIZE);
});

// (0, 0) is what the broken sign form sent, and it is also a legitimate board
// slot, so it must be treated as occupied once a note is there.
test("the corner counts as occupied", () => {
  const position = findOpenPosition([{ x: 0, y: 0 }]);
  assert.equal(positionsOverlap({ x: 0, y: 0 }, position), false);
  assert.notDeepEqual(position, { x: 0, y: 0 });
});

// A note dragged to an arbitrary spot (not on the grid) must still block that
// area, or the next automatic placement could land on top of it.
test("off-grid notes still block their area", () => {
  const dragged = { x: 500, y: 700 };
  const position = findOpenPosition([dragged]);
  assert.equal(positionsOverlap(dragged, position), false);
});
