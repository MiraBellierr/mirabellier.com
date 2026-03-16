const RAINBOW_TAGS = new Set(["cat", "cats", "kitten", "kittens"]);

type BlogTagListProps = {
  tags: string[];
  isDark: boolean;
  limit?: number;
  className?: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function BlogTagList({
  tags,
  isDark,
  limit,
  className,
}: BlogTagListProps) {
  const visibleTags = typeof limit === "number" ? tags.slice(0, limit) : tags;
  const hiddenTagCount =
    typeof limit === "number" && tags.length > limit ? tags.length - limit : 0;

  return (
    <div className={joinClasses("blog-tag-list", className)}>
      {visibleTags.map((tag, index) => {
        const isRainbow = RAINBOW_TAGS.has(String(tag || "").toLowerCase());

        return (
          <span
            key={`${tag}-${index}`}
            className={joinClasses(
              "blog-tag",
              isDark ? "blog-tag--dark" : "blog-tag--light",
              isRainbow && "blog-tag--rainbow rainbow-tag",
            )}
          >
            {tag}
          </span>
        );
      })}

      {hiddenTagCount > 0 ? (
        <span className="blog-tag-more">+{hiddenTagCount} more</span>
      ) : null}
    </div>
  );
}
