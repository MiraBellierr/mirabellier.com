import { Link } from "react-router-dom";

import { useWebring } from "@/hooks/use-webring";

const Footer = () => {
  const webring = useWebring();

  return (
    <footer className="site-display grid gap-3 border-b-2 border-blue-300 bg-blue-50 p-4 text-sm font-bold text-blue-600 shadow-sm dark:border-purple-500/30 dark:bg-gradient-to-r dark:from-purple-900/40 dark:to-pink-900/30 dark:text-purple-200 sm:grid-cols-3 sm:items-center">
      <span className="tracking-tight text-left">
        Made with love ❤️ by mirabellier
      </span>

      <div className="flex flex-col items-center justify-center gap-1">
        <nav aria-label="Legal" className="flex items-center gap-3">
          <Link className="underline underline-offset-4 hover:text-pink-600" to="/privacy">
            Privacy
          </Link>
          <span aria-hidden="true">✿</span>
          <Link className="underline underline-offset-4 hover:text-pink-600" to="/terms">
            Terms
          </Link>
          <span aria-hidden="true">✿</span>
          <Link className="underline underline-offset-4 hover:text-pink-600" to="/links">
            Links
          </Link>
        </nav>

        {webring.enabled ? (
          <nav
            aria-label={webring.name || "Webring"}
            className="flex items-center gap-2 text-xs"
          >
            <a
              className="underline underline-offset-4 hover:text-pink-600"
              href={webring.prevUrl}
              rel="external"
              title={`Previous site in ${webring.name}`}
            >
              ‹ prev
            </a>
            <a
              className="hover:text-pink-600"
              href={webring.hubUrl}
              rel="external"
              title={webring.name}
            >
              {webring.name || "webring"}
            </a>
            {webring.randomUrl ? (
              <a
                className="underline underline-offset-4 hover:text-pink-600"
                href={webring.randomUrl}
                rel="external"
                title={`Random site in ${webring.name}`}
              >
                rand
              </a>
            ) : null}
            <a
              className="underline underline-offset-4 hover:text-pink-600"
              href={webring.nextUrl}
              rel="external"
              title={`Next site in ${webring.name}`}
            >
              next ›
            </a>
          </nav>
        ) : null}
      </div>

      <p className="tracking-tight text-left sm:text-right">I love ya!! ❤️</p>
    </footer>
  );
};

export default Footer;
