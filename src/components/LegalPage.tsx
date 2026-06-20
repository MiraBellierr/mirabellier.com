import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalPageProps = {
  title: string;
  summary: string;
  effectiveDate: string;
  sections: LegalSection[];
  counterpart: {
    label: string;
    to: string;
  };
};

const LegalPage = ({
  title,
  summary,
  effectiveDate,
  sections,
  counterpart,
}: LegalPageProps) => {
  return (
    <div className="flex min-h-screen flex-col font-[sans-serif] text-blue-900">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <article className="card-border space-y-6 p-5 sm:p-7">
              <header className="space-y-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-500">
                  Mirabellier.com legal
                </p>
                <h2 className="text-3xl font-bold text-blue-700">{title}</h2>
                <p className="leading-7 text-blue-700">{summary}</p>
                <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-pink-200 bg-pink-50/80 px-4 py-2 text-sm font-bold text-pink-700 shadow-sm dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-100">
                  <span aria-hidden="true">✿</span>
                  Effective {effectiveDate}
                </div>
              </header>

              <nav
                aria-label={`${title} sections`}
                className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm dark:border-purple-400/30 dark:bg-purple-950/30"
              >
                <h3 className="mb-3 text-lg font-bold text-blue-700 dark:text-purple-100">
                  On this page
                </h3>
                <ol className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
                  {sections.map((section, index) => (
                    <li key={section.id}>
                      <a
                        className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-4 hover:text-pink-600 dark:text-purple-200 dark:decoration-purple-400"
                        href={`#${section.id}`}
                      >
                        {index + 1}. {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="space-y-7">
                {sections.map((section, index) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-6 space-y-3 border-t border-blue-200/80 pt-6 first:border-t-0 first:pt-0 dark:border-purple-400/20"
                  >
                    <h3 className="text-xl font-bold text-blue-700 dark:text-purple-100">
                      {index + 1}. {section.title}
                    </h3>
                    <div className="space-y-3 leading-7 text-slate-700 dark:text-purple-100">
                      {section.content}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </main>

          <aside className="right-side-panel mb-auto w-full space-y-4 lg:w-1/5">
            <div className="rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  document info
                </h2>
                <p>
                  <strong>Operator:</strong> Mira
                </p>
                <p>
                  <strong>Location:</strong> Malaysia
                </p>
                <p>
                  <strong>Contact:</strong>{" "}
                  <a
                    className="break-all underline underline-offset-4"
                    href="mailto:privacy@mirabellier.com"
                  >
                    privacy@mirabellier.com
                  </a>
                </p>
                <Link
                  className="inline-flex font-bold text-pink-600 underline underline-offset-4 hover:text-pink-700 dark:text-pink-300"
                  to={counterpart.to}
                >
                  Read the {counterpart.label}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default LegalPage;
