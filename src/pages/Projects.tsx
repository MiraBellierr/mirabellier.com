import Header from "../parts/Header";
import Navigation from "../parts/Navigation";
import Footer from "../parts/Footer";
import kannaSmile from "@/assets/anime/kanna-smile.webp";
import kannaWink from "@/assets/anime/kanna-wink.webp";
import { projectCount, projectSections } from "@/lib/projects";
import { usePageSeo } from "@/lib/seo";

const allProjects = projectSections.flatMap((section) => section.projects);
const stackTags = new Set(allProjects.flatMap((project) => project.stack)).size;
const PROJECTS_DESCRIPTION = `Portfolio-style list of ${projectCount} public projects across ${stackTags} stack tags, including web apps, APIs, bots, and mobile builds by Mirabellier.`;

const Projects = () => {
  usePageSeo({
    canonical: "https://mirabellier.com/projects",
    structuredDataId: "projects-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Mirabellier Projects",
      description: PROJECTS_DESCRIPTION,
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
    },
    socialMeta: {
      title: "Projects | Mirabellier",
      description: PROJECTS_DESCRIPTION,
      url: "https://mirabellier.com/projects",
      image: "https://mirabellier.com/kanna-kobayashi-poster.webp",
      type: "website",
    },
  });

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
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <section className="card-border space-y-4 p-4">
              <header className="space-y-2">
                <h2 className="text-xl font-bold text-blue-700">
                  ꉂ(˵˃ ᗜ ˂˵) A small archive of the things I have built
                </h2>
                <p className="text-sm text-blue-600">
                  Stack tags and source links.
                </p>
              </header>

              <ul className="space-y-4">
                {allProjects.map((project) => (
                  <li key={project.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-blue-700">{project.name}</p>
                      <a
                        className=" font-semibold text-blue-600 underline hover:text-blue-800"
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        (github)
                      </a>
                    </div>

                    <p className="text-sm">{project.summary}</p>
                    <p className="text-xs text-blue-600">
                      {project.stack.join(" | ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

          </main>

          <div className="w-full lg:w-[200px] space-y-4">
            <aside className="right-side-panel w-full mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">snapshot</h2>
                <p className="text-blue-500">{projectCount} public projects</p>
                <p className="text-blue-500">{stackTags} stack tags</p>
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
