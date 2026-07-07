import { Link } from "react-router-dom";

import Footer from "../parts/Footer";
import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import kannaPolice from "@/assets/anime/kanna-police.webp";
import { usePageSeo } from "@/lib/seo";
import { canAccessAdminPanel } from "@/lib/user-permissions";
import { useAuth } from "@/states/AuthContext";

function AdminNotice({
  title,
  body,
  actionLabel,
  actionTo,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
          </div>

          <main className="w-full lg:w-3/5 p-4">
            <section className="card-border p-6 bg-white/55">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-blue-700">{title}</h2>
                <p className="mt-3 text-blue-500">{body}</p>
                {actionLabel && actionTo ? (
                  <Link
                    to={actionTo}
                    className="mt-5 inline-flex rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600"
                  >
                    {actionLabel}
                  </Link>
                ) : null}
              </div>
            </section>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

const adminTools = [
  {
    title: "Arena Updates",
    description:
      "Publish and remove short updates shown in the right-side panel on Arena home.",
    to: "/admin/arena-updates",
    action: "Open Arena updates",
  },
  {
    title: "Arena Metrics",
    description:
      "Review fight volume, win rate, coin movement, and balance threshold alerts.",
    to: "/admin/arena-metrics",
    action: "Open Arena metrics",
  },
  {
    title: "Question of the Day",
    description:
      "Queue upcoming prompts, moderate answers from the public pages, and check the recent archive.",
    to: "/admin/question-of-the-day",
    action: "Open question admin",
  },
  {
    title: "Shrine Pages",
    description:
      "Create and edit shrine pages from admin, including full shrine payload JSON and SEO metadata.",
    to: "/admin/shrines",
    action: "Open shrine admin",
  },
  {
    title: "User Management",
    description:
      "Add coins or cards to a user for testing — look up by username, grant currency, or draw cards.",
    to: "/admin/users",
    action: "Open user admin",
  },
];

const AdminHome = () => {
  const auth = useAuth();
  const isOwner = canAccessAdminPanel(auth.user);

  usePageSeo({
    canonical: "https://mirabellier.com/admin",
    structuredDataId: "admin-home-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Admin Home",
      description: "Owner-only admin tools for Mirabellier.",
      url: "https://mirabellier.com/admin",
    },
  });

  if (!auth.user) {
    return (
      <AdminNotice
        title="Please log in"
        body="You need to log in with the owner account before using the admin pages."
        actionLabel="Go to login"
        actionTo="/login"
      />
    );
  }

  if (!isOwner) {
    return (
      <AdminNotice
        title="Not authorized"
        body="This page is only available to the site owner account."
        actionLabel="Back to home"
        actionTo="/"
      />
    );
  }

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full gap-4">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 mb-auto hidden justify-center items-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaPolice}
                width="320"
                height="427"
                alt="kanna police"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4 bg-white/55">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-blue-700">admin</h2>
                <p className="text-sm text-blue-500">
                  Pick a tool to manage the site.
                </p>
              </div>

              <div className="space-y-4">
                {adminTools.map((tool, index) => (
                  <article
                    key={tool.to}
                    className={`${index > 0 ? "border-t border-blue-100 pt-4" : ""}`}
                  >
                    <h3 className="text-lg font-bold text-blue-700">
                      {tool.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-700">
                      {tool.description}
                    </p>
                    <Link
                      to={tool.to}
                      className="mt-3 inline-flex text-sm font-semibold text-pink-500 hover:underline"
                    >
                      {tool.action}
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          </main>

          <aside className="w-full lg:w-1/5 mb-auto space-y-4">
            <div className="right-side-panel rounded-xl border border-blue-300 bg-blue-100 p-4 opacity-90 shadow-md">
              <div className="space-y-3 text-sm text-blue-600">
                <h2 className="text-center text-lg font-bold text-blue-700">
                  admin notes
                </h2>
                <p>This page is only for the owner account.</p>
                <p>Use it as the starting point for site management tasks.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminHome;
