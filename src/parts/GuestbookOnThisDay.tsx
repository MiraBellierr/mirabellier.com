import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchGuestbookOnThisDay,
  type GuestbookEntry,
} from "@/lib/guestbook-api";
import { guestbookMoodMeta } from "@/lib/guestbook-ui";

function getYear(value: string) {
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
}

// Resurfaces guestbook notes pinned on today's date in past years. It is a
// quiet nostalgia widget: if there is nothing to show (or the fetch fails), it
// simply renders nothing rather than leaving an empty card on the page.
const GuestbookOnThisDay = () => {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetchGuestbookOnThisDay(controller.signal)
      .then((data) => setEntries(data.entries))
      .catch(() => {
        /* no memories today, or offline — stay hidden */
      });

    return () => controller.abort();
  }, []);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
      <div className="space-y-3 text-sm text-blue-600">
        <h2 className="text-center text-lg font-bold text-blue-700">
          on this day ⋆˙⟡
        </h2>
        <p className="text-[13px] text-blue-500">
          notes pinned to the board on this date in past years.
        </p>
        <ul className="space-y-2">
          {entries.map((entry) => {
            const mood = guestbookMoodMeta[entry.mood];
            const year = getYear(entry.createdAt);

            return (
              <li
                key={entry.id}
                className="rounded-lg border border-blue-200 bg-white/70 p-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-bold text-blue-700">
                    {entry.user?.username ? (
                      <Link
                        to={`/profile/${entry.user.username}`}
                        className="hover:underline"
                      >
                        {entry.author}
                      </Link>
                    ) : (
                      entry.author
                    )}
                  </span>
                  {year ? (
                    <span className="shrink-0 text-[11px] text-blue-400">
                      {year}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-3 text-[13px] text-blue-600">
                  {entry.message}
                </p>
                <span className={`${mood.chipClass} mt-1 inline-block`}>
                  {mood.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default GuestbookOnThisDay;
