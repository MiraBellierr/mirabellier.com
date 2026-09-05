import { Fragment, useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { peekResolvedUsername, resolveUsername } from "@/lib/pixies";

type Segment =
  | { type: "text"; value: string }
  | { type: "mention"; handle: string };

// "@name" preceded by start-of-string or an opening delimiter. The handle
// starts and ends on an alphanumeric/underscore so trailing sentence
// punctuation ("thanks @alice.") stays out of the link.
const MENTION_PATTERN =
  /(^|[\s([{<])@([A-Za-z0-9_](?:[A-Za-z0-9._-]{0,30}[A-Za-z0-9_])?)/g;

function tokenize(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  MENTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    const lead = match[1];
    const handle = match[2];
    const mentionStart = match.index + lead.length;
    if (mentionStart > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, mentionStart) });
    }
    segments.push({ type: "mention", handle });
    cursor = mentionStart + 1 + handle.length;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }
  return segments;
}

/**
 * Renders plain text with "@username" mentions turned into profile links,
 * but only for names that resolve to a real account. Unknown names render as
 * ordinary text. Resolution is memoised in `@/lib/pixies`.
 */
export const MentionText = ({
  text,
  className,
  mentionClassName = "font-semibold text-pink-400 hover:underline",
}: {
  text: string;
  className?: string;
  mentionClassName?: string;
}) => {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const segments = tokenize(text);

  useEffect(() => {
    let cancelled = false;
    const unresolved = segments
      .filter((segment) => segment.type === "mention")
      .map((segment) => (segment as { handle: string }).handle)
      .filter((handle) => peekResolvedUsername(handle) === undefined);
    if (unresolved.length === 0) return;
    void Promise.all(unresolved.map((handle) => resolveUsername(handle))).then(
      () => {
        if (!cancelled) bump();
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const content = segments.map((segment, index) => {
    if (segment.type === "text") {
      return <Fragment key={index}>{segment.value}</Fragment>;
    }
    if (peekResolvedUsername(segment.handle)) {
      return (
        <Link
          key={index}
          to={`/profile/${segment.handle}`}
          className={mentionClassName}
          onClick={(event) => event.stopPropagation()}
        >
          @{segment.handle}
        </Link>
      );
    }
    return <Fragment key={index}>@{segment.handle}</Fragment>;
  });

  if (className) return <span className={className}>{content}</span>;
  return <>{content}</>;
};

export default MentionText;
