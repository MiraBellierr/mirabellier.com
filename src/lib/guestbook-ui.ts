import type { GuestbookMood } from "@/lib/guestbook-api";

export const GUESTBOOK_NOTE_SIZE = 280;
const GUESTBOOK_BOARD_IMAGE_WIDTH = 1199;
const GUESTBOOK_BOARD_IMAGE_HEIGHT = 678;
const GUESTBOOK_BOARD_SCALE = 3;

export const GUESTBOOK_BOARD_WIDTH =
  GUESTBOOK_BOARD_IMAGE_WIDTH * GUESTBOOK_BOARD_SCALE;
export const GUESTBOOK_BOARD_HEIGHT =
  GUESTBOOK_BOARD_IMAGE_HEIGHT * GUESTBOOK_BOARD_SCALE;

export const guestbookMoodMeta: Record<
  GuestbookMood,
  {
    label: string;
    helper: string;
    noteClass: string;
    chipClass: string;
    buttonClass: string;
  }
> = {
  sparkly: {
    label: "sparkly ☆₊˚ (⁠ ꈍᴗꈍ⁠) ☆₊˚",
    helper: "tiny hello with extra glitter",
    noteClass: "board-note--pink",
    chipClass: "board-chip board-chip--pink",
    buttonClass: "guestbook-mood-button--pink",
  },
  cozy: {
    label: "cozy ( ˘͈ ᵕ ˘͈♡)",
    helper: "soft and comfy note",
    noteClass: "board-note--gold",
    chipClass: "board-chip board-chip--gold",
    buttonClass: "guestbook-mood-button--gold",
  },
  sleepy: {
    label: "sleepy ⁽⁽ʚ( つ‸◟)ɞ⁾⁾ ⚬˚｡°",
    helper: "quiet little message",
    noteClass: "board-note--blue",
    chipClass: "board-chip board-chip--blue",
    buttonClass: "guestbook-mood-button--blue",
  },
  sunny: {
    label: "sunny ⋆☀︎｡",
    helper: "bright and cheerful",
    noteClass: "board-note--mint",
    chipClass: "board-chip board-chip--mint",
    buttonClass: "guestbook-mood-button--mint",
  },
  chaotic: {
    label: "chaotic ໒( ˵ •̀ ᴗ •́˵)",
    helper: "a tiny bit unhinged",
    noteClass: "board-note--lavender",
    chipClass: "board-chip board-chip--lavender",
    buttonClass: "guestbook-mood-button--lavender",
  },
};
