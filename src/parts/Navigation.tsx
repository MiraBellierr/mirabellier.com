import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useOptionalAuth } from "@/hooks/use-optional-auth";
import { API_BASE } from "@/lib/config";
import home from "../assets/icons/img1-24.webp";
import about from "../assets/icons/img2-24.webp";
import blog from "../assets/icons/img3-24.webp";
import projects from "../assets/icons/img4-24.webp";
import art from "../assets/icons/art-20.webp";
import shrine from "../assets/icons/about-20.webp";
import guestbook from "../assets/icons/cats-24.webp";
import cursor from "../assets/icons/cursor-24.webp";
import DarkToggle from "../components/DarkToggle";
import { useCursor } from "../states/CursorContext";
import SectionLabel from "./SectionLabel";
import ToggleCursor from "./ToggleCursor";

type NavItem = {
  label: string;
  to: string;
  icon: string;
  isActive: (pathname: string) => boolean;
};

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "me",
    items: [
      {
        label: "home",
        to: "/",
        icon: home,
        isActive: (pathname) =>
          pathname === "/" || pathname === "/home" || pathname === "/spill",
      },
      {
        label: "about",
        to: "/about",
        icon: about,
        isActive: (pathname) => pathname === "/about",
      },
      {
        label: "projects",
        to: "/projects",
        icon: projects,
        isActive: (pathname) => pathname === "/projects",
      },
    ],
  },
  {
    label: "pages",
    items: [
      {
        label: "blog",
        to: "/blog",
        icon: blog,
        isActive: (pathname) => pathname.startsWith("/blog"),
      },
      {
        label: "quotes",
        to: "/quotes",
        icon: art,
        isActive: (pathname) => pathname === "/quotes",
      },
      {
        label: "shrine",
        to: "/shrine",
        icon: shrine,
        isActive: (pathname) =>
          pathname === "/shrine" || pathname.startsWith("/shrine/"),
      },
      {
        label: "guestbook",
        to: "/guestbook",
        icon: guestbook,
        isActive: (pathname) => pathname.startsWith("/guestbook"),
      },
    ],
  },
];

function getAvatarSrc(avatar?: string | null) {
  if (!avatar) {
    return null;
  }

  if (avatar.startsWith("blob:") || /^https?:\/\//.test(avatar)) {
    return avatar;
  }

  const base = API_BASE.replace(/\/$/, "");
  return `${base}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

const accountLinkClass = (active: boolean) =>
  `block rounded-full px-3 py-1 text-center text-sm font-bold transition hover:underline ${
    active
      ? "bg-white/80 text-blue-700 shadow-sm dark:bg-purple-900/60 dark:text-purple-50"
      : "text-blue-500 dark:text-purple-200"
  }`;

const Navigation = () => {
  const auth = useOptionalAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isCustomCursor } = useCursor();
  const avatarSrc = getAvatarSrc(auth?.user?.avatar);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const activeNavItem = navSections
    .flatMap((section) => section.items)
    .find((item) => item.isActive(location.pathname));

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  return (
    <aside className="site-display nav-shell mb-auto w-full overflow-hidden rounded-xl border border-blue-300 bg-blue-100 shadow-md opacity-90">
      <div className="border-b border-blue-200/80 p-3 lg:hidden dark:border-purple-300/20">
        <button
          aria-controls="site-navigation-panel"
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? "Collapse navigation" : "Expand navigation"}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/75 px-3 py-2 text-left shadow-sm transition hover:bg-white/90 dark:bg-purple-900/40 dark:hover:bg-purple-900/60"
          onClick={() => setMobileNavOpen((open) => !open)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-blue-500 dark:text-purple-200">
              site navigation
            </span>
            <span className="block truncate text-sm font-bold text-blue-700 dark:text-purple-50">
              {activeNavItem ? activeNavItem.label : "menu"}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-6 flex-shrink-0 flex-col justify-center gap-1"
          >
            <span className="block h-0.5 w-full rounded-full bg-blue-500 dark:bg-purple-200" />
            <span className="block h-0.5 w-full rounded-full bg-blue-500 dark:bg-purple-200" />
            <span className="block h-0.5 w-full rounded-full bg-blue-500 dark:bg-purple-200" />
          </span>
        </button>
      </div>

      <nav
        id="site-navigation-panel"
        className={`${mobileNavOpen ? "block" : "hidden"} mb-4 space-y-4 p-4 lg:block`}
      >
        <h2 className="hidden text-center text-lg font-bold text-blue-600 lg:block">
          site navigation
        </h2>

        <div className="space-y-4">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-2">
              <SectionLabel label={section.label} />

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = item.isActive(location.pathname);

                  return (
                    <div
                      key={item.label}
                      className="flex items-center justify-center gap-2"
                    >
                      <img
                        className="h-4 w-4"
                        src={item.icon}
                        alt={`${item.label} icon`}
                      />
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`text-center text-sm font-bold hover:animate-wiggle hover:underline ${
                          active
                            ? "text-blue-700 dark:text-purple-100"
                            : "text-blue-500 dark:text-purple-200"
                        }`}
                        to={item.to}
                      >
                        {active ? `[${item.label}]` : item.label}
                      </Link>
                      <img
                        className="h-4 w-4"
                        src={item.icon}
                        alt={`${item.label} icon`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <SectionLabel label="settings" />

            <div className="flex justify-center">
              <DarkToggle />
            </div>

            <div className="flex items-center justify-center space-x-1">
              <img
                className="h-4 w-4"
                src={cursor}
                width="16"
                height="16"
                alt="cursor icon"
              />
              <ToggleCursor />
              {!isCustomCursor && (
                <span className="ml-2 animate-pulse text-xs font-semibold text-blue-600 dark:text-purple-200">
                  click here
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel label="account" />

            {auth?.user ? (
              <>
                <button
                  aria-expanded={accountMenuOpen}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-100/50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:animate-profile-hover dark:bg-purple-900/50 dark:text-purple-100"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  type="button"
                >
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={`${auth.user.username} avatar`}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-xs uppercase text-blue-700 dark:bg-purple-800 dark:text-purple-100">
                      {auth.user.username.slice(0, 1)}
                    </div>
                  )}
                  <span className="truncate">{auth.user.username}</span>
                </button>

                {accountMenuOpen && (
                  <div className="space-y-1">
                    <Link
                      aria-current={
                        location.pathname.startsWith("/profile")
                          ? "page"
                          : undefined
                      }
                      className={accountLinkClass(
                        location.pathname.startsWith("/profile"),
                      )}
                      to="/profile"
                    >
                      {location.pathname.startsWith("/profile")
                        ? "[profile]"
                        : "profile"}
                    </Link>
                    <Link
                      aria-current={
                        location.pathname === "/settings" ? "page" : undefined
                      }
                      className={accountLinkClass(location.pathname === "/settings")}
                      to="/settings"
                    >
                      {location.pathname === "/settings"
                        ? "[settings]"
                        : "settings"}
                    </Link>
                    <button
                      onClick={() => {
                        auth.logout();
                        navigate("/");
                      }}
                      className="block w-full rounded-full px-3 py-1 text-center text-sm font-bold text-red-600 transition hover:underline dark:text-pink-300"
                      type="button"
                    >
                      logout
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                aria-current={location.pathname === "/login" ? "page" : undefined}
                className={accountLinkClass(location.pathname === "/login")}
                to="/login"
              >
                {location.pathname === "/login" ? "[login]" : "login"}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </aside>
  );
};

export default Navigation;
