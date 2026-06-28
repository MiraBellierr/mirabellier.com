import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ArenaCard } from "@/lib/arena";
import ArenaPortraitCard from "@/parts/ArenaPortraitCard";
import cardBack from "@/assets/back-card-design.jpg";

type CardRevealState = "stacked" | "flying" | "flipping" | "revealed";

type CardSlot = {
  card: ArenaCard;
  state: CardRevealState;
  revealOrder: number;
};

const FLY_OUT_DURATION = 550;

function rarityColor(rarity: string): string {
  const map: Record<string, string> = { C: "C", R: "R", SR: "SR", SSR: "SSR", UR: "UR" };
  return map[rarity?.toUpperCase()] || "C";
}

export default function PackOpeningModal({
  cards,
  onClose,
}: {
  cards: ArenaCard[];
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<CardSlot[]>(() =>
    cards.map((card) => ({ card, state: "stacked", revealOrder: -1 })),
  );
  const animatingRef = useRef(false);
  const revealCounterRef = useRef(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const revealedCount = slots.filter((s) => s.state === "revealed").length;
  const allRevealed = revealedCount === slots.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (allRevealed) {
      closeButtonRef.current?.focus();
    }
  }, [allRevealed]);

  const handleCardClick = useCallback(
    (slotIndex: number) => {
      if (animatingRef.current) return;
      if (slots[slotIndex].state !== "stacked") return;

      animatingRef.current = true;
      setSlots((prev) =>
        prev.map((slot, i) => (i === slotIndex ? { ...slot, state: "flying" } : slot)),
      );

      setTimeout(() => {
        const order = revealCounterRef.current++;
        setSlots((prev) =>
          prev.map((slot, i) =>
            i === slotIndex ? { ...slot, state: "revealed", revealOrder: order } : slot,
          ),
        );
        animatingRef.current = false;
      }, FLY_OUT_DURATION);
    },
    [slots],
  );

  const handleSkipAll = useCallback(() => {
    let order = revealCounterRef.current;
    setSlots((prev) =>
      prev.map((slot) =>
        slot.state !== "revealed"
          ? { ...slot, state: "revealed", revealOrder: order++ }
          : slot,
      ),
    );
    revealCounterRef.current = order;
    animatingRef.current = false;
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[230000] flex flex-col items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (allRevealed) onClose();
        else e.stopPropagation();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pack-opening-title"
        className="w-full h-full flex flex-col gap-3 p-2 sm:gap-6 sm:p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-500">
            Card Pack Opening
          </p>
          <h2
            id="pack-opening-title"
            className="mt-1 text-lg sm:text-xl font-bold text-blue-700 dark:text-purple-100"
          >
            {allRevealed ? "All cards revealed!" : `${revealedCount} / ${slots.length} revealed`}
          </h2>
        </div>

        {!allRevealed ? (
          <div className="pack-opening__arena">
            <div className="pack-opening__arena-inner">
              {slots.map((slot, index) => {
                if (slot.state === "revealed") {
                  return (
                    <div
                      key={`rev-${index}`}
                      className="pack-opening__card-slot"
                      style={{
                        left: "calc(50% - var(--pack-offset-x))",
                        top: "50%",
                        zIndex: 20 + slot.revealOrder,
                        transform: "translate(-50%, -50%)",
                      } as React.CSSProperties}
                    >
                      <div className="pack-opening__card-inner" style={{ transform: "rotateY(-180deg)" }}>
                        <div className="pack-opening__card-front">
                          <ArenaPortraitCard card={slot.card} size="full" interactive />
                        </div>
                      </div>
                    </div>
                  );
                }

                const unrevealedIndex = slots.filter((s, i) => s.state !== "revealed" && i < index).length;
                const zIndex = 10 - unrevealedIndex;
                const isAnimating = slot.state === "flying";
                return (
                  <div
                    key={`pile-${index}`}
                    className={`pack-opening__card-slot${
                      isAnimating ? " pack-opening__card-slot--fly" : ""
                    }`}
                    style={{
                      "--pack-z": zIndex,
                    } as React.CSSProperties}
                    onClick={() => handleCardClick(index)}
                    role="button"
                    tabIndex={slot.state === "stacked" ? 0 : -1}
                    aria-label={`Card ${unrevealedIndex + 1} — click to reveal`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardClick(index);
                      }
                    }}
                  >
                    <div
                      className={`pack-opening__card-inner${
                        isAnimating ? " pack-opening__card-inner--flip" : ""
                      }`}
                    >
                      <div className="pack-opening__card-front">
                        <ArenaPortraitCard
                          card={slot.card}
                          size="full"
                          className="pointer-events-none"
                        />
                      </div>
                      <div className="pack-opening__card-back">
                        <img
                          className="pack-opening__card-back-img"
                          src={cardBack}
                          alt=""
                          draggable={false}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {slots.some((s) => s.state === "flying") && (
                <p className="pack-opening__stack-label" aria-live="polite">
                  Revealing...
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="pack-opening__grid">
            {slots.map((slot, index) => (
              <div
                key={index}
                className="pack-opening__sorted-card"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <ArenaPortraitCard card={slot.card} size="full" interactive />
                <div className="pack-opening__sorted-info">
                  <span className={`pack-opening__sorted-rarity pack-opening__sorted-rarity--${rarityColor(slot.card.rarity)}`}>
                    {slot.card.rarity}
                  </span>
                  IV {slot.card.iv.total}
                  {slot.card.ownedCount != null && (
                    <> &middot; Owned {slot.card.ownedCount}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {!allRevealed && (
            <button
              type="button"
              onClick={handleSkipAll}
              className="text-xs sm:text-xs font-semibold text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 py-2 sm:py-0"
            >
              skip animation
            </button>
          )}
          {allRevealed && (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="arena-redraw-button hover:animate-wiggle"
            >
              [ nice! ]
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
