import { useCallback, useEffect, useState } from "react";

import type { QuestionOfTheDayAnswer } from "@/lib/question-of-the-day-api";
import {
  buildQuestionAnswerShareUrl,
  getQuestionAnswerDisplayName,
} from "@/lib/question-of-the-day-ui";
import { useToast } from "@/states/ToastContext";

/**
 * Returns a handler that shares a single Question of the Day answer. On devices
 * with the Web Share sheet it opens that; everywhere else it copies the link,
 * which unfurls into a styled answer card when pasted into Discord.
 */
export function useShareQuestionAnswer() {
  const { showToast } = useToast();

  return useCallback(
    async (answer: QuestionOfTheDayAnswer) => {
      const url = buildQuestionAnswerShareUrl(answer.id);

      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: `${getQuestionAnswerDisplayName(answer)} — Question of the Day`,
            text: answer.answer.slice(0, 180),
            url,
          });
        } catch {
          // The visitor dismissed the share sheet, or it failed. Nothing to do.
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        showToast("Answer link copied — paste it in Discord for a preview card");
      } catch {
        showToast("Couldn't copy the answer link");
      }
    },
    [showToast],
  );
}

/**
 * Scrolls the shared answer into view and returns its id while it should be
 * visually highlighted. `ready` should flip true once the answer is in the DOM.
 */
export function useHighlightedQuestionAnswer(
  answerId: string | null,
  ready: boolean,
) {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!answerId || !ready) {
      return;
    }

    const element = document.getElementById(`qotd-answer-${answerId}`);
    if (!element) {
      return;
    }

    setHighlightId(answerId);
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = window.setTimeout(() => setHighlightId(null), 4500);
    return () => window.clearTimeout(timer);
  }, [answerId, ready]);

  return highlightId;
}
