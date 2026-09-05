import React from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import Navigation from "./Navigation";

/**
 * The full-page "please log in / not authorized / not found" screen shared by
 * `PixieUpload`, `AdminPixies` and `Profile`: site chrome (Header / Navigation /
 * Footer) around a single centred card.
 *
 * Pass `icon` / `title` / `message` / `action` for the standard card, or
 * `children` to render a custom card body instead.
 */
export default function AuthGateShell({
  icon,
  title,
  message,
  action,
  children,
}: {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  message?: React.ReactNode;
  action?: { to: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>
          <main className="w-full lg:w-3/5 flex items-center justify-center p-4">
            <div className="card-border rounded-2xl p-8 text-center bg-white/90 dark:bg-purple-900/80">
              {children ?? (
                <>
                  {icon != null && (
                    <div className="text-4xl mb-4">{icon}</div>
                  )}
                  {title != null && (
                    <h2 className="text-2xl font-bold text-blue-700 dark:text-purple-200 mb-2">
                      {title}
                    </h2>
                  )}
                  {message != null && (
                    <p className="text-blue-500 dark:text-purple-300 mb-4">
                      {message}
                    </p>
                  )}
                  {action && (
                    <Link
                      to={action.to}
                      className="inline-flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full hover:bg-pink-600 transition-colors"
                    >
                      {action.label}
                    </Link>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
