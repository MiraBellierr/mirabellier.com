const shrinePages = [
  {
    slug: "",
    path: "/shrine",
    title: "Character Shrines",
    description:
      "A directory for Mirabellier character shrine pages, including Kanna and Rossina shrine rooms.",
    excerpt:
      "Browse the shrine hall for cloud-soft comfort, wolfpack poise, and future character rooms.",
    image: "/kanna1.jpg",
    imageAlt: "Character shrine hall preview",
    schemaType: "CollectionPage",
    about: [
      "character shrine page",
      "anime shrine page",
      "Kanna Kamui",
      "Rossina Wulfperl Luppino",
    ],
    keywords: ["character shrine", "Kanna shrine", "Rossina shrine"],
    priority: "0.8",
    changefreq: "monthly",
    ctaLabel: "Open shrine hall",
  },
  {
    slug: "kanna",
    path: "/shrine/kanna",
    title: "Kanna Shrine",
    description:
      "A cozy Kanna shrine page with favorite details, offerings, and a tiny ritual loop.",
    excerpt:
      "A small room built for soft clouds, dragon daughter appreciation, and snack devotion.",
    image: "/kanna3.jpg",
    imageAlt: "Kanna shrine image",
    schemaType: "CollectionPage",
    about: [
      "Kanna Kamui",
      "Miss Kobayashi's Dragon Maid",
      "anime shrine page",
    ],
    keywords: [
      "Kanna Kamui",
      "Kanna shrine",
      "Miss Kobayashi's Dragon Maid",
    ],
    priority: "0.7",
    changefreq: "monthly",
    ctaLabel: "Visit Kanna shrine",
  },
  {
    slug: "rossina",
    path: "/shrine/rossina",
    title: "Rossina Shrine",
    description:
      "A Rossina Wulfperl Luppino shrine page with Pack loyalty, shrine offerings, and wolfish future Capo energy.",
    excerpt:
      "A red-hood shrine room for Pack loyalty, disciplined danger, and Rossi's future capo presence.",
    image: "/rossi3.jpg",
    imageAlt: "Rossina shrine image",
    schemaType: "CollectionPage",
    about: [
      "Rossina Wulfperl Luppino",
      "Rossi",
      "Arknights: Endfield",
      "The Pack",
    ],
    keywords: [
      "Rossina Wulfperl Luppino",
      "Rossi shrine",
      "Arknights Endfield",
      "The Pack",
    ],
    priority: "0.7",
    changefreq: "monthly",
    ctaLabel: "Visit Rossina shrine",
  },
];

function normalizePath(pathname) {
  const value = String(pathname || "").trim();
  if (!value || value === "/") return "/";
  return value.replace(/\/+$/, "");
}

function getShrinePageByPath(pathname) {
  const normalizedPath = normalizePath(pathname);
  return shrinePages.find((page) => page.path === normalizedPath) || null;
}

function getShrinePageBySlug(slug) {
  const normalizedSlug = String(slug || "")
    .trim()
    .toLowerCase();

  return shrinePages.find((page) => page.slug === normalizedSlug) || null;
}

function getShrineSitemapRoutes() {
  return shrinePages.map(({ path, priority, changefreq }) => ({
    path,
    priority,
    changefreq,
  }));
}

module.exports = {
  getShrinePageByPath,
  getShrinePageBySlug,
  getShrineSitemapRoutes,
};
