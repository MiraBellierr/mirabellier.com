import { Link, useLocation } from "react-router-dom";

import home from "../assets/icons/img1-24.webp";
import about from "../assets/icons/img2-24.webp";
import blog from "../assets/icons/img3-24.webp";
import projects from "../assets/icons/img4-24.webp";
import art from "../assets/icons/art-20.webp";
import guestbook from "../assets/icons/cats-24.webp";
import cursor from "../assets/icons/cursor-24.webp";
import ToggleCursor from "./ToggleCursor";
import SectionLabel from "./SectionLabel";
import { useCursor } from "../states/CursorContext";

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
        label: "guestbook",
        to: "/guestbook",
        icon: guestbook,
        isActive: (pathname) => pathname.startsWith("/guestbook"),
      },
    ],
  },
];

const Navigation = () => {
  const location = useLocation();
  const { isCustomCursor } = useCursor();

  return (
    <aside className="site-display mb-auto w-full rounded-xl border border-blue-300 bg-blue-100 shadow-md opacity-90">
      <nav className="mb-4 space-y-4 p-4">
        <h2 className="text-center text-lg font-bold text-blue-600">
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
        </div>
      </nav>
    </aside>
  );
};

export default Navigation;
