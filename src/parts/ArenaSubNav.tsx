import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useWebSocketEvent } from "@/hooks/use-websocket";

const SLUGS = [
  { slug: "", label: "Arena Home" },
  { slug: "/fight", label: "Fight" },
  { slug: "/shop", label: "Shop" },
  { slug: "/crafting", label: "Craft" },
  { slug: "/inventory", label: "Inventory" },
  { slug: "/leaderboard", label: "Leaderboard" },
  { slug: "/collection", label: "Collection" },
  { slug: "/market", label: "Market" },
  { slug: "/trade", label: "Trade" },
  { slug: "/skill-tree", label: "Skill Tree" },
  { slug: "/inbox", label: "Inbox" },
];

export default function ArenaSubNav() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { pathname } = useLocation();
  const prefix = pathname.startsWith("/ar") ? "/ar" : "/arena";

  useWebSocketEvent("arena:notification:unread-count", (data) => {
    const payload = data as { count: number };
    setUnreadCount(payload.count);
  });

  return (
    <div className="flex flex-wrap justify-center gap-3 border-b border-sky-100 pb-3 dark:border-purple-400/20">
      {SLUGS.map((link, i) => (
        <span key={link.slug} className="contents">
          {i > 0 && <span className="font-bold">|</span>}
          <Link to={`${prefix}${link.slug}`} className="arena-redraw-button hover:animate-wiggle">
            {link.label === "Inbox" && unreadCount > 0
              ? `[ Inbox (${unreadCount}) ]`
              : `[ ${link.label} ]`}
          </Link>
        </span>
      ))}
    </div>
  );
}
