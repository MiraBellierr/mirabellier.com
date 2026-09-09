import { Link } from "react-router-dom";

import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Footer from "../parts/Footer";
import kannaShy from "@/assets/anime/kanna-shy.webp";
import { usePageSeo } from "@/lib/seo";

const NOT_FOUND_DESCRIPTION =
  "That page could not be found. It may have moved, been removed, or never existed.";

const SUGGESTED_LINKS: { to: string; label: string }[] = [
  { to: "/", label: "Home" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About" },
  { to: "/arena", label: "Arena" },
  { to: "/question-of-the-day", label: "Question of the Day" },
];

const NotFound = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/404",
    // A client-only SPA cannot return an HTTP 404 for a soft-404, so at least
    // keep these URLs out of the index instead of letting the generic site
    // card get indexed against every dead link.
    robots: "noindex,follow",
    socialMeta: {
      title: "Page not found | Mirabellier",
      description: NOT_FOUND_DESCRIPTION,
      url: "https://mirabellier.com/404",
      image: "https://mirabellier.com/background.jpg",
      type: "website",
    },
  });

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header title="Page not found" />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto hidden justify-center items-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaShy}
                width="300"
                height="404"
                alt="a small dragon girl looking a little lost"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4">
              <header className="space-y-2">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
                  Error 404
                </p>
                <h2 className="text-xl font-bold text-blue-700">
                  (｡•́︿•̀｡) This page wandered off
                </h2>
                <p className="text-sm text-blue-600">
                  {NOT_FOUND_DESCRIPTION} Check the address for a typo, or try one
                  of these instead:
                </p>
              </header>

              <ul className="flex flex-wrap gap-2">
                {SUGGESTED_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="inline-block rounded-lg border border-blue-300 bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="text-sm">
                <Link
                  to="/"
                  className="font-semibold text-blue-600 underline hover:text-blue-800"
                >
                  ← Back to the home page
                </Link>
              </p>
            </section>
          </main>

          <div className="w-full lg:w-[200px] space-y-4">
            <aside className="right-side-panel w-full mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">lost?</h2>
                <p className="text-blue-500">
                  The navigation on the left goes everywhere.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default NotFound;
