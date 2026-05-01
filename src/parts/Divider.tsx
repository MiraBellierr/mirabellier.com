import dividerImageInline from "@/assets/divider-15x-inline.webp";

type DividerProps = {
  variant?: "line" | "image";
};

const Divider = ({ variant = "image" }: DividerProps) => {
  if (variant === "line") {
    return (
      <div
        className="hidden items-center gap-3 py-1 text-blue-300 md:flex dark:text-purple-300/70"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-current/60" />
        <span className="text-xs font-mono tracking-[0.36em]">* * *</span>
        <span className="h-px flex-1 bg-current/60" />
      </div>
    );
  }

  return (
    <div className="py-2" aria-hidden="true">
      <div
        className="h-5 w-full bg-repeat-x bg-center"
        style={{
          backgroundImage: `url(${dividerImageInline})`,
          backgroundSize: "auto 100%",
        }}
      />
    </div>
  );
};

export default Divider;
