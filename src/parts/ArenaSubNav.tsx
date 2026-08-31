import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useWebSocketEvent } from "@/hooks/use-websocket";

type NavLink = { slug: string; label: string };
type NavGroup = { name: string; links: NavLink[] };

const HOME: NavLink = { slug: "", label: "Arena Home" };

const GROUPS: NavGroup[] = [
  {
    name: "Battle",
    links: [
      { slug: "/fight", label: "Fight" },
      { slug: "/skill-tree", label: "Skill Tree" },
      { slug: "/tcg/decks", label: "TCG Decks" },
      { slug: "/tcg/match", label: "TCG Match" },
    ],
  },
  {
    name: "Cards",
    links: [
      { slug: "/inventory", label: "Inventory" },
      { slug: "/collection", label: "Collection" },
      { slug: "/archive", label: "Archive" },
    ],
  },
  {
    name: "Market",
    links: [
      { slug: "/shop", label: "Shop" },
      { slug: "/market", label: "Market" },
      { slug: "/mint", label: "Mint" },
      { slug: "/trade", label: "Trade" },
    ],
  },
  {
    name: "Community",
    links: [
      { slug: "/hall-of-fame", label: "Hall of Fame" },
      { slug: "/leaderboard", label: "Leaderboard" },
      { slug: "/inbox", label: "Inbox" },
    ],
  },
];

function groupForPath(prefix: string, pathname: string): NavGroup | undefined {
  return GROUPS.find((group) =>
    group.links.some((link) => {
      const target = `${prefix}${link.slug}`;
      return pathname === target || pathname.startsWith(`${target}/`);
    }),
  );
}

export default function ArenaSubNav() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const prefix = pathname === "/ar" || pathname.startsWith("/ar/") ? "/ar" : "/arena";

  useWebSocketEvent("arena:notification:unread-count", (data) => {
    const payload = data as { count: number };
    setUnreadCount(payload.count);
  });

  const goToGroupFirstPage = (group: NavGroup) => {
    navigate(`${prefix}${group.links[0].slug}`);
  };

  const linkLabel = (label: string) =>
    label === "Inbox" && unreadCount > 0
      ? `[ Inbox (${unreadCount}) ]`
      : `[ ${label} ]`;

  const openGroup = groupForPath(prefix, pathname);

  return (
    <div className="space-y-2 border-b border-sky-100 pb-3 dark:border-purple-400/20">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link to={`${prefix}${HOME.slug}`} className="arena-redraw-button hover:animate-wiggle">
          {linkLabel(HOME.label)}
        </Link>
        {GROUPS.map((group) => {
          const isOpen = openGroup?.name === group.name;
          return (
            <span key={group.name} className="contents">
              <span className="font-bold">|</span>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => goToGroupFirstPage(group)}
                className={`arena-redraw-button hover:animate-wiggle${
                  isOpen ? " !text-pink-600 dark:!text-pink-300" : ""
                }`}
              >
                [ {group.name} ]
              </button>
            </span>
          );
        })}
      </div>
      {openGroup ? (
        <div
          key={openGroup.name}
          className="animate-fade-in flex flex-wrap items-center justify-center gap-3 border-t border-sky-100 pt-2 dark:border-purple-400/20"
        >
          {openGroup.links.map((link, i) => (
            <span key={link.slug} className="contents">
              {i > 0 && <span className="font-bold">|</span>}
              <Link to={`${prefix}${link.slug}`} className="arena-redraw-button hover:animate-wiggle">
                {linkLabel(link.label)}
              </Link>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
