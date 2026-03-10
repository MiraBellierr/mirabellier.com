export type Project = {
  id: string;
  name: string;
  repoUrl: string;
  kind: string;
  summary: string;
  stack: string[];
};

export type ProjectSection = {
  id: string;
  title: string;
  description: string;
  projects: Project[];
};

export const projectSections: ProjectSection[] = [
  {
    id: "featured-work",
    title: "featured work",
    description:
      "The projects that best represent the websites, platforms, and systems I keep building on.",
    projects: [
      {
        id: "mirabellier-site",
        name: "Mirabellier.com",
        repoUrl: "https://github.com/MiraBellierr/mirabellier.com",
        kind: "Personal website",
        summary:
          "A cute React and TypeScript blog platform with a rich text editor where I share thoughts, notes, and small projects.",
        stack: ["React", "TypeScript", "Tiptap"],
      },
      {
        id: "mirabellier-backend",
        name: "Mirabellier Backend",
        repoUrl: "https://github.com/MiraBellierr/mirabellier-backend",
        kind: "REST API",
        summary:
          "An Express.js backend that handles authentication, blog management, and media uploads for the main site.",
        stack: ["Express.js", "NodeJS", "JWT"],
      },
    ],
  },
  {
    id: "apps-and-backends",
    title: "apps and backends",
    description:
      "School work, mobile apps, and service layers focused on useful workflows instead of one-off demos.",
    projects: [
      {
        id: "sakura-backend",
        name: "Sakura Backend",
        repoUrl: "https://github.com/MiraBellierr/sakura-backend",
        kind: "Backend service",
        summary:
          "A complaint and feedback management API for Sakura college with role-based access and MongoDB persistence.",
        stack: ["Express.js", "TypeScript", "MongoDB"],
      },
      {
        id: "sakura-frontend",
        name: "Sakura Frontend",
        repoUrl: "https://github.com/MiraBellierr/sakura_frontend",
        kind: "Mobile app",
        summary:
          "A Flutter mobile client for the Sakura complaint system with a clean UI and direct backend integration.",
        stack: ["Flutter", "Dart", "Mobile UI"],
      },
      {
        id: "adenia",
        name: "Adenia",
        repoUrl: "https://github.com/MiraBellierr/adenia",
        kind: "Appointment app",
        summary:
          "A final year project built with React Native, NodeJS, and Appwrite featuring auth, notifications, and scheduling.",
        stack: ["React Native", "NodeJS", "Appwrite"],
      },
      {
        id: "conference",
        name: "Conference",
        repoUrl: "https://github.com/MiraBellierr/conference",
        kind: "Client mobile app",
        summary:
          "A React Native attendance app with spreadsheet import, QR scanning, and announcements powered by Firebase.",
        stack: ["React Native", "Firebase", "QR scanning"],
      },
    ],
  },
  {
    id: "bots-and-experiments",
    title: "bots and experiments",
    description:
      "Smaller experiments where I test automation, AI features, and utility-first bot ideas.",
    projects: [
       {
        id: "jasmine",
        name: "Jasmine",
        repoUrl: "https://github.com/MiraBellierr/jasmine",
        kind: "Discord bot",
        summary:
          "A Discord bot built to keep learning NodeJS, REST APIs, RPG combat systems, economy loops, and turn-based mechanics.",
        stack: ["NodeJS", "Discord.js", "REST APIs"],
      },
      {
        id: "map-ai-bot",
        name: "MAP - AI Discord Bot",
        repoUrl: "https://github.com/MiraBellierr/map",
        kind: "AI bot",
        summary:
          "A Discord bot powered by local Ollama models with chat, image analysis, and persistent memory.",
        stack: ["JavaScript", "Discord.js", "Ollama"],
      },
      {
        id: "cocoa",
        name: "Cocoa",
        repoUrl: "https://github.com/MiraBellierr/Cocoa",
        kind: "Discord bot",
        summary:
          "A Node.js Discord bot using slash commands, button pagination, and a structured command handler.",
        stack: ["NodeJS", "Discord.js", "Slash commands"],
      },
      {
        id: "owo-bot-farm-selfbot",
        name: "OwO Bot Farm Selfbot",
        repoUrl: "https://github.com/MiraBellierr/owo-bot-farm-selfbot",
        kind: "Automation script",
        summary:
          "A JavaScript automation script for OwObot farming with user-friendly commands and repeatable actions.",
        stack: ["JavaScript", "NodeJS", "Automation"],
      },
    ],
  },
];

export const projectCount = projectSections.reduce(
  (count, section) => count + section.projects.length,
  0,
);
