import { useEffect } from "react";
import { Link } from "react-router-dom";

import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import kannaWink from "@/assets/anime/kanna-wink.webp";
import { projectCount, projectSections } from "@/lib/projects";

const allProjects = projectSections.flatMap((section) => section.projects);

const Projects = () => {
  useEffect(() => {
    const canonicalLink = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;

    if (canonicalLink) {
      canonicalLink.href = "https://mirabellier.com/projects";
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "projects-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Projects",
      description:
        "A portfolio-style list of website, backend, mobile, and bot projects built by Mirabellier.",
      url: "https://mirabellier.com/projects",
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: projectCount,
        itemListElement: allProjects.map((project, index) => ({
          "@type": "SoftwareSourceCode",
          position: index + 1,
          name: project.name,
          codeRepository: project.repoUrl,
          programmingLanguage: project.stack[0],
        })),
      },
    });
    document.head.appendChild(script);

    return () => {
      const nextCanonicalLink = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement | null;

      if (nextCanonicalLink) {
        nextCanonicalLink.href = "https://mirabellier.com/";
      }

      document.getElementById("projects-structured-data")?.remove();
    };
  }, []);

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

            <div className="mt-3 mb-auto hidden justify-center items-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaSmile}
                width="300"
                height="404"
                alt="project mascot"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-3 p-4">
              <h2 className="text-xl font-bold text-blue-700">
                ꉂ(˵˃ ᗜ ˂˵) A small archive of the things I have built
              </h2>
              <div className="border-1 border-b align-middle mb-2"></div>

              {projectSections.map((section) => (
                <div key={section.id} className="">
                  {section.projects.map((project) => (
                    <div key={project.id} className="mb-3">
                      <p className="font-bold">{project.name} ⊹ <Link className="font-normal text-sm underline text-blue-600 hover:cursor-pointer hover:text-blue-800" to={project.repoUrl}>(Github)</Link></p>
                      <p className="text-sm">{project.summary}</p>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            <Divider />
          </main>

          <div className="w-full lg:w-[200px] space-y-4">
            <aside className="right-side-panel w-full mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">snapshot</h2>
                <p className="text-blue-500">{projectCount} public projects</p>
                <p className="text-blue-500">
                  React, NodeJS, mobile, and bots
                </p>
                <p className="text-blue-500">
                  Built for learning, clients, and fun
                </p>
              </div>
            </aside>

            <div className="hidden justify-center lg:flex">
              <img
                className="w-full max-w-[320px] border border-blue-700 shadow-md rounded-2xl"
                src={kannaWink}
                width="300"
                height="404"
                alt="project mascot winking"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Projects;
