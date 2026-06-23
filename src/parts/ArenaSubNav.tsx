import { useState } from "react";
import { Link } from "react-router-dom";

import { useWebSocketEvent } from "@/hooks/use-websocket";

const LINKS = [
  { to: "/arena", label: "Arena Home" },
  { to: "/arena/fight", label: "Fight" },
  { to: "/arena/shop", label: "Shop" },
  { to: "/arena/crafting", label: "Craft" },
  { to: "/arena/inventory", label: "Inventory" },
  { to: "/arena/leaderboard", label: "Leaderboard" },
  { to: "/arena/collection", label: "Collection" },
  { to: "/arena/market", label: "Market" },
  { to: "/arena/trade", label: "Trade" },
  { to: "/arena/skill-tree", label: "Skill Tree" },
  { to: "/arena/inbox", label: "Inbox" },
];

export default function ArenaSubNav() {
  const [unreadCount, setUnreadCount] = useState(0);

  useWebSocketEvent("arena:notification:unread-count", (data) => {
    const payload = data as { count: number };
    setUnreadCount(payload.count);
  });

  return (
    <div className="flex flex-wrap justify-center gap-3 border-b border-sky-100 pb-3 dark:border-purple-400/20">
      {LINKS.map((link, i) => (
        <span key={link.to} className="contents">
          {i > 0 && <span className="font-bold">|</span>}
          <Link to={link.to} className="arena-redraw-button hover:animate-wiggle">
            {link.label === "Inbox" && unreadCount > 0
              ? `[ Inbox (${unreadCount}) ]`
              : `[ ${link.label} ]`}
          </Link>
        </span>
      ))}
    </div>
  );
}
