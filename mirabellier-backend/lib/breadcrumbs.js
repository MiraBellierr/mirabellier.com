/**
 * Schema.org BreadcrumbList helper shared by the crawler-facing HTML routes
 * (blog posts, shrine pages). Emitting the trail as a nested `breadcrumb`
 * property keeps one JSON-LD block per page.
 */
function buildBreadcrumbList(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: (items || []).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

module.exports = { buildBreadcrumbList };
