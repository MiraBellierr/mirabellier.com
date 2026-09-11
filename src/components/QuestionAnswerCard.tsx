import { Link } from "react-router-dom";

import { resolveAsset } from "@/lib/blog-utils";
import type { QuestionOfTheDayAnswer } from "@/lib/question-of-the-day-api";
import {
  formatQuestionAnswerTime,
  getQuestionAnswerDisplayName,
} from "@/lib/question-of-the-day-ui";
import { imageWidthSrcSet } from "@/lib/image-srcset";

type QuestionAnswerCardProps = {
  answer: QuestionOfTheDayAnswer;
  showTopBorder?: boolean;
  highlighted?: boolean;
  onShare: (answer: QuestionOfTheDayAnswer) => void;
  canModerate?: boolean;
  onDelete?: (answerId: string) => void;
  deleting?: boolean;
};

const QuestionAnswerCard = ({
  answer,
  showTopBorder = false,
  highlighted = false,
  onShare,
  canModerate = false,
  onDelete,
  deleting = false,
}: QuestionAnswerCardProps) => {
  const avatar = resolveAsset(answer.user?.avatar);
  const displayName = getQuestionAnswerDisplayName(answer);

  return (
    <article
      id={`qotd-answer-${answer.id}`}
      className={`scroll-mt-24 transition-colors ${
        showTopBorder ? "border-t border-blue-100 pt-4" : ""
      } ${
        highlighted
          ? "-mx-3 rounded-2xl bg-pink-50/70 px-3 py-3 ring-2 ring-pink-300"
          : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {avatar ? (
          <img
            src={avatar}
            srcSet={imageWidthSrcSet(avatar, [48, 96, 192]) || undefined}
            sizes="44px"
            alt={displayName}
            className="h-11 w-11 rounded-full object-cover"
            width="44"
            height="44"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xs font-bold uppercase text-blue-600 dark:bg-purple-800 dark:text-purple-100">
            {displayName.slice(0, 2)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {answer.user?.username ? (
              <Link
                to={`/profile/${answer.user.username}`}
                className="font-semibold text-blue-700 hover:underline"
              >
                {displayName}
              </Link>
            ) : (
              <span className="font-semibold text-blue-700">{displayName}</span>
            )}
          </div>

          <p className="mt-1 text-xs text-blue-400">
            {formatQuestionAnswerTime(answer.createdAt)}
          </p>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {answer.answer}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onShare(answer)}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
          >
            <span aria-hidden="true">🔗</span>
            <span>share</span>
          </button>

          {canModerate && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(answer.id)}
              disabled={deleting}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default QuestionAnswerCard;
